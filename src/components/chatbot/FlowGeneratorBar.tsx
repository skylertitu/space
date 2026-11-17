'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Edge, Node } from 'reactflow';
import { ArrowUp, Loader2, Mic, MicOff } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { detectFlowEditMode, type FlowEditMode } from '@/lib/chatbot/flowGraphOps';

interface FlowGeneratorBarProps {
    userId: string;
    entityId: string;
    nodes: Node[];
    edges: Edge[];
    selectedNode: Node | null;
    onFlowGenerated: (nodes: Node[], edges: Edge[], mode: FlowEditMode) => void;
    disabled?: boolean;
}

type SpeechRecognitionLike = {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((event: any) => void) | null;
    onerror: ((event: any) => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
    if (typeof window === 'undefined') return null;
    const w = window as any;
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export default function FlowGeneratorBar({
    userId,
    entityId,
    nodes,
    edges,
    selectedNode,
    onFlowGenerated,
    disabled = false,
}: FlowGeneratorBarProps) {
    const [mounted, setMounted] = useState(false);
    const [script, setScript] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [geminiConnected, setGeminiConnected] = useState<boolean | null>(null);
    const [isListening, setIsListening] = useState(false);
    const [speechSupported, setSpeechSupported] = useState(true);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

    useEffect(() => {
        setMounted(true);
        setSpeechSupported(!!getSpeechRecognition());
    }, []);

    useEffect(() => {
        if (!mounted || !userId || !entityId) return;

        const configRef = doc(db, `users/${userId}/entities/${entityId}/integrations/gemini`);
        const unsub = onSnapshot(configRef, (snap) => {
            setGeminiConnected(snap.exists() && snap.data()?.status === 'Connected');
        });

        return () => unsub();
    }, [mounted, userId, entityId]);

    const resizeTextarea = useCallback(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, []);

    useEffect(() => {
        resizeTextarea();
    }, [script, resizeTextarea]);

    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.onend = null;
                recognitionRef.current.stop();
                recognitionRef.current = null;
            }
        };
    }, []);

    const stopListening = useCallback(() => {
        if (recognitionRef.current) {
            recognitionRef.current.onend = null;
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
        setIsListening(false);
    }, []);

    const startListening = useCallback(() => {
        const SR = getSpeechRecognition();
        if (!SR) {
            toast.error('Tu navegador no soporta dictado por voz.');
            return;
        }

        const recognition = new SR();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'es-ES';

        recognition.onresult = (event: any) => {
            let final = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    final += event.results[i][0].transcript;
                }
            }
            if (final.trim()) {
                setScript((prev) => (prev ? `${prev.trimEnd()} ${final.trim()}` : final.trim()));
            }
        };

        recognition.onerror = (event: any) => {
            if (event.error !== 'aborted') {
                toast.error('No se pudo usar el micrófono.');
            }
            stopListening();
        };

        recognition.onend = () => {
            if (recognitionRef.current) {
                try {
                    recognition.start();
                } catch {
                    stopListening();
                }
            }
        };

        recognitionRef.current = recognition;
        recognition.start();
        setIsListening(true);
    }, [stopListening]);

    const toggleListening = () => {
        if (isListening) stopListening();
        else startListening();
    };

    const inferredMode = detectFlowEditMode(script, !!selectedNode);
    const canSend =
        script.trim().length >= 8 &&
        !isGenerating &&
        !disabled &&
        geminiConnected !== false;

    const handleGenerate = useCallback(async () => {
        const text = script.trim();
        if (text.length < 8) {
            toast.error('Escribe o dicta una instrucción más clara.');
            return;
        }

        if (geminiConnected === false) {
            toast.error('Conecta Gemini en Integraciones para usar el creador de flujos.');
            return;
        }

        if (isListening) stopListening();

        const mode = detectFlowEditMode(text, !!selectedNode);
        setIsGenerating(true);

        const modeLabel =
            mode === 'replace_forward'
                ? 'Reemplazando desde el nodo seleccionado…'
                : mode === 'extend'
                  ? 'Extendiendo desde el nodo seleccionado…'
                  : 'Generando flujo completo…';

        const toastId = toast.loading(modeLabel);

        try {
            const res = await fetch('/api/chatbots/generate-flow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    entityId,
                    script: text,
                    mode,
                    currentNodes: nodes,
                    currentEdges: edges,
                    selectedNodeId: selectedNode?.id || null,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                if (data.code === 'GEMINI_NOT_CONNECTED') {
                    toast.error('Conecta Gemini en Integraciones → Gemini.', { id: toastId });
                } else {
                    toast.error(data.error || 'No se pudo generar el flujo.', { id: toastId });
                }
                return;
            }

            onFlowGenerated(data.flow.nodes, data.flow.edges, data.mode);
            const doneLabel =
                data.mode === 'extend'
                    ? `Rama extendida · ${data.nodeCount} nodos`
                    : data.mode === 'replace_forward'
                      ? `Rama reemplazada · ${data.nodeCount} nodos`
                      : `Flujo generado · ${data.nodeCount} nodos`;
            toast.success(doneLabel, { id: toastId });
            setScript('');
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error de red';
            toast.error(msg, { id: toastId });
        } finally {
            setIsGenerating(false);
        }
    }, [
        script,
        geminiConnected,
        userId,
        entityId,
        onFlowGenerated,
        isListening,
        stopListening,
        nodes,
        edges,
        selectedNode,
    ]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (canSend) handleGenerate();
        }
    };

    if (!mounted) return null;

    const selectedLabel =
        selectedNode?.data?.label ||
        selectedNode?.data?.content ||
        selectedNode?.type ||
        null;

    const placeholder = selectedNode
        ? 'Desde el nodo seleccionado crea… (o: elimina lo siguiente y pon…)'
        : 'Describe el flujo completo del bot…';

    return (
        <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none flex justify-center px-4 pb-5 md:px-6 md:pb-6">
            <div
                className={cn(
                    'pointer-events-auto w-full max-w-2xl rounded-[28px]',
                    'bg-[#1a1a1a] border border-white/[0.08]',
                    'shadow-[0_8px_32px_rgba(0,0,0,0.45)]',
                    'transition-shadow duration-300 focus-within:border-white/[0.14]',
                    'focus-within:shadow-[0_12px_40px_rgba(0,0,0,0.55)]'
                )}
            >
                {selectedNode && (
                    <div className="flex items-center gap-2 px-4 pt-3 pb-0">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-[10px] text-emerald-300 max-w-full truncate">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                            <span className="truncate">
                                Ancla: {String(selectedLabel).slice(0, 48)}
                            </span>
                        </span>
                        <span className="text-[10px] text-zinc-600 truncate">
                            {inferredMode === 'replace_forward' ? 'Reemplazar adelante' : 'Extender'}
                        </span>
                    </div>
                )}

                <div className="px-4 pt-3 pb-2">
                    <textarea
                        ref={textareaRef}
                        value={script}
                        onChange={(e) => setScript(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isGenerating || disabled}
                        rows={1}
                        placeholder={placeholder}
                        className={cn(
                            'w-full resize-none bg-transparent text-[15px] leading-relaxed text-white',
                            'placeholder:text-zinc-500 focus:outline-none',
                            'min-h-[28px] max-h-[160px] disabled:opacity-50'
                        )}
                    />
                </div>

                <div className="flex items-center justify-between px-3 pb-3 pt-1">
                    <div className="flex items-center gap-1 min-w-0">
                        {speechSupported && (
                            <button
                                type="button"
                                onClick={toggleListening}
                                disabled={isGenerating || disabled}
                                title={isListening ? 'Detener dictado' : 'Dictar'}
                                className={cn(
                                    'flex h-9 w-9 items-center justify-center rounded-full transition-all shrink-0',
                                    'text-zinc-400 hover:text-white hover:bg-white/[0.06]',
                                    'disabled:opacity-40 disabled:pointer-events-none',
                                    isListening &&
                                        'text-red-400 bg-red-500/10 hover:bg-red-500/15 hover:text-red-300'
                                )}
                            >
                                {isListening ? (
                                    <MicOff className="h-[18px] w-[18px]" />
                                ) : (
                                    <Mic className="h-[18px] w-[18px]" />
                                )}
                            </button>
                        )}
                        {geminiConnected === false && (
                            <span className="ml-2 text-[10px] text-amber-500/90 truncate">
                                Gemini no conectado
                            </span>
                        )}
                        {!selectedNode && geminiConnected !== false && (
                            <span className="ml-2 text-[10px] text-zinc-600 truncate hidden sm:inline">
                                Sin selección → flujo completo
                            </span>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={!canSend}
                        title="Generar"
                        className={cn(
                            'flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 shrink-0',
                            'disabled:cursor-not-allowed',
                            canSend
                                ? 'bg-white text-black shadow-md hover:scale-105 hover:shadow-lg active:scale-95'
                                : 'bg-zinc-700 text-zinc-500'
                        )}
                    >
                        {isGenerating ? (
                            <Loader2 className="h-[18px] w-[18px] animate-spin" />
                        ) : (
                            <ArrowUp className="h-[18px] w-[18px] stroke-[2.5]" />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
