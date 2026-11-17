'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, X, Lock, Sparkles, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

interface GeminiModalProps {
    isOpen: boolean;
    onClose: () => void;
    activeEntity: string;
    currentUser: any;
}

export default function GeminiModal({ isOpen, onClose, activeEntity, currentUser }: GeminiModalProps) {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [apiKey, setApiKey] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);

    useEffect(() => {
        if (!isOpen || !currentUser || !activeEntity) return;
        setInitialLoading(true);

        const configRef = doc(
            db,
            `users/${currentUser.uid}/entities/${activeEntity}/integrations/gemini`
        );

        const unsub = onSnapshot(configRef, (snap) => {
            if (snap.exists() && snap.data()?.status === 'Connected') {
                setStep(3);
                setApiKey(String(snap.data()?.apiKey || ''));
            } else {
                setStep(1);
                setApiKey('');
            }
            setTimeout(() => setInitialLoading(false), 300);
        });

        return () => unsub();
    }, [isOpen, currentUser, activeEntity]);

    const handleConnect = async () => {
        const key = apiKey.trim();
        if (!key || key.length < 20) {
            toast.error('Ingresa una API key válida de Google AI Studio.');
            return;
        }

        setIsLoading(true);
        const toastId = toast.loading('Guardando Gemini en tu entidad…');

        try {
            const configRef = doc(
                db,
                `users/${currentUser?.uid}/entities/${activeEntity}/integrations/gemini`
            );

            await setDoc(
                configRef,
                {
                    apiKey: key,
                    status: 'Connected',
                    provider: 'gemini',
                    userId: currentUser?.uid,
                    entityId: activeEntity,
                    updatedAt: new Date(),
                },
                { merge: true }
            );

            toast.success('Gemini conectado. Humanizar y nodos SI usarán esta key.', {
                id: toastId,
            });
            setStep(3);
        } catch (error: any) {
            console.error(error);
            toast.error(`Error: ${error.message}`, { id: toastId });
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm('¿Desconectar Gemini de esta entidad?')) return;
        const toastId = toast.loading('Desconectando…');
        try {
            await deleteDoc(
                doc(db, `users/${currentUser?.uid}/entities/${activeEntity}/integrations/gemini`)
            );
            setStep(1);
            setApiKey('');
            toast.success('Gemini desconectado.', { id: toastId });
        } catch {
            toast.error('Error al desconectar.', { id: toastId });
        }
    };

    const maskedKey =
        apiKey.length > 12
            ? `${apiKey.slice(0, 6)}…${apiKey.slice(-4)}`
            : apiKey
              ? '••••••••'
              : '';

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/60 backdrop-blur-md"
                    />

                    <motion.div
                        initial={{ scale: 0.95, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 20 }}
                        className="relative w-full max-w-[95vw] md:max-w-3xl bg-[#0a0a0a] border border-white/5 rounded-[24px] md:rounded-[40px] shadow-2xl overflow-hidden flex flex-col md:flex-row h-auto max-h-[85vh]"
                    >
                        <div className="hidden md:flex w-[38%] bg-[#101518] p-12 flex-col relative overflow-hidden shrink-0 border-r border-white/5">
                            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-[#4285F4]/15 to-transparent pointer-events-none" />
                            <div className="relative z-10">
                                <div className="w-16 h-16 bg-white/[0.05] border border-white/10 rounded-2xl flex items-center justify-center mb-10">
                                    <Sparkles className="w-8 h-8 text-[#4285F4]" />
                                </div>
                                <h1 className="text-[32px] font-normal text-white tracking-tight leading-tight mb-4">
                                    Google Gemini
                                </h1>
                                <p className="text-[14px] text-white/40 font-light leading-relaxed max-w-[280px]">
                                    Conecta tu API key de Google AI Studio por entidad. Se usa para
                                    Humanizar flujos y otras capacidades de SI del tenant — sin
                                    mezclar keys entre clientes.
                                </p>
                            </div>
                        </div>

                        <div className="flex-1 p-5 md:p-12 overflow-y-auto flex flex-col bg-[#0a0a0a] relative">
                            <button
                                onClick={onClose}
                                className="absolute top-6 right-6 p-2 text-neutral-500 hover:text-white transition-colors z-50"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <div className="flex items-center gap-2 mb-8 text-neutral-500 shrink-0">
                                <Lock className="w-3.5 h-3.5" />
                                <span className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em]">
                                    Integración por entidad
                                </span>
                            </div>

                            {initialLoading ? (
                                <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm">
                                    Cargando…
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col justify-center">
                                    <AnimatePresence mode="wait">
                                        {step === 1 && (
                                            <motion.div
                                                key="s1"
                                                initial={{ opacity: 0, x: 16 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -16 }}
                                                className="space-y-6"
                                            >
                                                <div className="bg-[#4285F4]/5 border border-[#4285F4]/20 rounded-3xl p-6">
                                                    <h3 className="text-white text-lg font-medium mb-3 flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full bg-[#4285F4] animate-pulse" />
                                                        Obtener tu API key
                                                    </h3>
                                                    <ol className="space-y-3 text-[13px] text-white/50 list-decimal list-inside">
                                                        <li>
                                                            Abre{' '}
                                                            <a
                                                                href="https://aistudio.google.com/apikey"
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="text-[#4285F4] hover:underline"
                                                            >
                                                                Google AI Studio
                                                            </a>
                                                        </li>
                                                        <li>Crea o copia una API key del proyecto.</li>
                                                        <li>
                                                            Asegúrate de tener créditos / cuota activa.
                                                        </li>
                                                    </ol>
                                                </div>
                                                <div className="flex gap-3">
                                                    <button
                                                        onClick={onClose}
                                                        className="flex-1 h-12 bg-white/5 text-white/40 text-[10px] font-black uppercase tracking-widest rounded-xl hover:text-white"
                                                    >
                                                        Cancelar
                                                    </button>
                                                    <button
                                                        onClick={() => setStep(2)}
                                                        className="flex-[2] h-12 bg-[#4285F4] text-white font-black uppercase tracking-widest text-[11px] rounded-xl hover:bg-[#3367d6]"
                                                    >
                                                        Continuar
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )}

                                        {step === 2 && (
                                            <motion.div
                                                key="s2"
                                                initial={{ opacity: 0, x: 16 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -16 }}
                                                className="space-y-6"
                                            >
                                                <div>
                                                    <label className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-neutral-500 mb-3">
                                                        <KeyRound className="w-3.5 h-3.5" />
                                                        API Key de Gemini
                                                    </label>
                                                    <input
                                                        type="password"
                                                        autoComplete="off"
                                                        value={apiKey}
                                                        onChange={(e) => setApiKey(e.target.value)}
                                                        placeholder="Pega tu API key aquí"
                                                        className="w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-[#4285F4]/50"
                                                    />
                                                    <p className="mt-2 text-[11px] text-neutral-600">
                                                        Se guarda solo en{' '}
                                                        <span className="text-neutral-400">
                                                            integrations/gemini
                                                        </span>{' '}
                                                        de esta entidad.
                                                    </p>
                                                </div>
                                                <div className="flex gap-3">
                                                    <button
                                                        onClick={() => setStep(1)}
                                                        className="flex-1 h-12 bg-white/5 text-white/40 text-[10px] font-black uppercase tracking-widest rounded-xl"
                                                    >
                                                        Atrás
                                                    </button>
                                                    <button
                                                        onClick={handleConnect}
                                                        disabled={isLoading}
                                                        className="flex-[2] h-12 bg-[#4285F4] text-white font-black uppercase tracking-widest text-[11px] rounded-xl disabled:opacity-50"
                                                    >
                                                        {isLoading ? 'Guardando…' : 'Conectar Gemini'}
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )}

                                        {step === 3 && (
                                            <motion.div
                                                key="s3"
                                                initial={{ opacity: 0, x: 16 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -16 }}
                                                className="space-y-6 text-center"
                                            >
                                                <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                                                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                                                </div>
                                                <div>
                                                    <h3 className="text-xl text-white font-medium mb-2">
                                                        Gemini activo
                                                    </h3>
                                                    <p className="text-sm text-white/40 mb-1">
                                                        Key vinculada a esta entidad
                                                    </p>
                                                    <p className="font-mono text-xs text-neutral-500">
                                                        {maskedKey}
                                                    </p>
                                                </div>
                                                <div className="flex flex-col sm:flex-row gap-3">
                                                    <button
                                                        onClick={() => setStep(2)}
                                                        className="flex-1 h-12 bg-white/5 text-white text-[10px] font-black uppercase tracking-widest rounded-xl"
                                                    >
                                                        Actualizar key
                                                    </button>
                                                    <button
                                                        onClick={handleDelete}
                                                        className="flex-1 h-12 bg-red-500/10 text-red-400 text-[10px] font-black uppercase tracking-widest rounded-xl border border-red-500/20"
                                                    >
                                                        Desconectar
                                                    </button>
                                                    <button
                                                        onClick={onClose}
                                                        className="flex-1 h-12 bg-[#4285F4] text-white text-[10px] font-black uppercase tracking-widest rounded-xl"
                                                    >
                                                        Listo
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
