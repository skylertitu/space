"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Phone, Settings, Bot, Volume2, VolumeX, Trash2, Copy, CheckCircle, AlertCircle, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useEntityRoute } from "@/hooks/useEntityRoute";
import { toast } from "sonner";

interface TranscriptEntry {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    timestamp: Date;
}

// Audio waveform visualizer component
function WaveformVisualizer({ isActive }: { isActive: boolean }) {
    const bars = 24;
    return (
        <div className="flex items-center justify-center gap-[3px] h-16">
            {Array.from({ length: bars }).map((_, i) => (
                <motion.div
                    key={i}
                    className={`w-[3px] rounded-full ${isActive ? 'bg-blue-400' : 'bg-white/10'}`}
                    animate={isActive ? {
                        height: [8, Math.random() * 48 + 16, 8],
                    } : { height: 8 }}
                    transition={isActive ? {
                        duration: 0.4 + Math.random() * 0.3,
                        repeat: Infinity,
                        repeatType: "reverse",
                        ease: "easeInOut",
                        delay: i * 0.03,
                    } : { duration: 0.3 }}
                />
            ))}
        </div>
    );
}

export default function VoiceCenterPage() {
    const { currentUser } = useAuth();
    const { firestoreId: entityId } = useEntityRoute();

    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [interimTranscript, setInterimTranscript] = useState('');
    const [history, setHistory] = useState<TranscriptEntry[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSupported, setIsSupported] = useState(true);
    const [copied, setCopied] = useState<string | null>(null);

    const recognitionRef = useRef<any>(null);
    const synthRef = useRef<SpeechSynthesis | null>(null);
    const historyEndRef = useRef<HTMLDivElement>(null);

    // Check browser support
    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setIsSupported(false);
            return;
        }
        synthRef.current = window.speechSynthesis;
    }, []);

    // Auto-scroll history
    useEffect(() => {
        historyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [history]);

    const startListening = useCallback(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'es-ES';

        recognition.onresult = (event: any) => {
            let interim = '';
            let final = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const t = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    final += t;
                } else {
                    interim += t;
                }
            }
            if (final) {
                setTranscript(prev => (prev + ' ' + final).trim());
            }
            setInterimTranscript(interim);
        };

        recognition.onerror = (event: any) => {
            if (event.error !== 'aborted') {
                console.error('Speech recognition error:', event.error);
                toast.error(`Microphone error: ${event.error}`);
            }
            setIsListening(false);
        };

        recognition.onend = () => {
            // Auto-restart if still supposed to be listening
            if (recognitionRef.current) {
                try { recognition.start(); } catch (e) { /* ignore */ }
            }
        };

        recognitionRef.current = recognition;
        recognition.start();
        setIsListening(true);
    }, []);

    const stopListening = useCallback(() => {
        if (recognitionRef.current) {
            recognitionRef.current.onend = null; // prevent auto-restart
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
        setIsListening(false);
        setInterimTranscript('');
    }, []);

    const toggleListening = () => {
        if (isListening) {
            stopListening();
            // Auto-send the transcript if there's content
            if (transcript.trim()) {
                handleSendToAI(transcript.trim());
            }
        } else {
            setTranscript('');
            startListening();
        }
    };

    const speak = (text: string) => {
        if (!synthRef.current || isMuted) return;
        synthRef.current.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'es-ES';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        synthRef.current.speak(utterance);
    };

    const handleSendToAI = async (text: string) => {
        if (!text.trim() || isProcessing) return;

        const userEntry: TranscriptEntry = {
            id: Date.now().toString(),
            role: 'user',
            text: text.trim(),
            timestamp: new Date(),
        };
        setHistory(prev => [...prev, userEntry]);
        setTranscript('');
        setIsProcessing(true);

        try {
            // Use the existing web-builder SI endpoint as a fallback, or provide a simulated response
            const response = await fetch('/api/web-builder/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [
                        { role: 'system', content: 'You are Roosevelt SI, a professional business assistant. Respond concisely in the same language as the user. Keep responses under 3 sentences for voice output.' },
                        ...history.map(h => ({ role: h.role, content: h.text })),
                        { role: 'user', content: text.trim() }
                    ],
                    model: 'Gemini 2.0 Flash',
                }),
            });

            if (!response.ok) throw new Error('SI request failed');

            const data = await response.json();
            const aiText = data?.result || data?.response || data?.text || 'I received your message but couldn\'t generate a response.';

            const aiEntry: TranscriptEntry = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                text: aiText,
                timestamp: new Date(),
            };
            setHistory(prev => [...prev, aiEntry]);

            // Speak the response
            speak(aiText);
        } catch (error) {
            // Provide an offline-friendly fallback response
            const fallbackText = 'Voice SI is currently operating in offline mode. Please configure your SI API keys to enable real-time responses.';
            const aiEntry: TranscriptEntry = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                text: fallbackText,
                timestamp: new Date(),
            };
            setHistory(prev => [...prev, aiEntry]);
            speak(fallbackText);
        } finally {
            setIsProcessing(false);
        }
    };

    const copyToClipboard = (id: string, text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(id);
        setTimeout(() => setCopied(null), 2000);
    };

    const clearHistory = () => {
        setHistory([]);
        setTranscript('');
        setInterimTranscript('');
        toast.success('Conversation cleared');
    };

    if (!isSupported) {
        return (
            <div className="flex min-h-screen bg-[#0a0a0a] text-white items-center justify-center">
                <div className="text-center space-y-4 max-w-md">
                    <AlertCircle className="w-16 h-16 text-red-400 mx-auto" />
                    <h1 className="text-2xl font-medium">Browser Not Supported</h1>
                    <p className="text-neutral-400">Speech recognition requires Chrome, Edge, or Safari. Please switch to a supported browser.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-[#0a0a0a] text-white">
            <div className="flex-1 flex flex-col p-6 md:p-10 overflow-y-auto">
                {/* Header */}
                <div className="mb-8 flex flex-col md:flex-row justify-between items-start gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-blue-400 text-xs font-bold tracking-[0.2em] uppercase mb-3">
                            <Sparkles className="w-3 h-3 fill-current" />
                            <span>Voice Intelligence</span>
                        </div>
                        <h1 className="text-3xl md:text-4xl font-medium tracking-tight">Voice SI Center</h1>
                        <p className="text-neutral-500 mt-2 text-sm max-w-lg">
                            Real-time voice interaction with Roosevelt SI. Speak naturally and receive intelligent responses.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => {
                                setIsMuted(!isMuted);
                                if (!isMuted) synthRef.current?.cancel();
                            }}
                            className={`px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all border text-sm ${
                                isMuted 
                                    ? 'bg-red-500/10 border-red-500/30 text-red-400' 
                                    : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white hover:border-white/20'
                            }`}
                        >
                            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                            {isMuted ? 'Muted' : 'Audio On'}
                        </button>
                        <button
                            onClick={clearHistory}
                            className="bg-white/5 hover:bg-white/10 px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all border border-white/10 text-neutral-400 hover:text-white text-sm"
                        >
                            <Trash2 className="w-4 h-4" /> Clear
                        </button>
                    </div>
                </div>

                {/* Main content */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-y-auto">
                    {/* Voice Input Panel */}
                    <div className="lg:col-span-1 flex flex-col gap-6">
                        {/* Mic Button */}
                        <div className="flex-1 rounded-[28px] bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center p-8 relative overflow-y-auto">
                            {/* Background glow */}
                            <AnimatePresence>
                                {isListening && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.5 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.5 }}
                                        className="absolute inset-0 flex items-center justify-center pointer-events-none"
                                    >
                                        <div className="w-48 h-48 bg-blue-500/20 rounded-full blur-3xl" />
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <WaveformVisualizer isActive={isListening || isSpeaking} />

                            <button
                                onClick={toggleListening}
                                className={`relative z-10 mt-6 w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
                                    isListening
                                        ? 'bg-red-500 shadow-[0_0_40px_rgba(239,68,68,0.4)] scale-110'
                                        : 'bg-blue-600 hover:bg-blue-500 shadow-[0_0_30px_rgba(59,130,246,0.3)] hover:scale-105'
                                }`}
                            >
                                {isListening ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
                            </button>

                            <p className="mt-6 text-sm text-neutral-500 text-center">
                                {isListening ? 'Listening... Tap to stop and send' : 'Tap to start speaking'}
                            </p>

                            {/* Live transcript preview */}
                            {(transcript || interimTranscript) && (
                                <div className="mt-4 w-full p-4 rounded-xl bg-white/5 border border-white/10 text-sm">
                                    <span className="text-white">{transcript}</span>
                                    {interimTranscript && (
                                        <span className="text-blue-400/60 italic"> {interimTranscript}</span>
                                    )}
                                </div>
                            )}

                            {/* Manual send button */}
                            {transcript && !isListening && (
                                <button
                                    onClick={() => handleSendToAI(transcript)}
                                    disabled={isProcessing}
                                    className="mt-4 px-6 py-2.5 bg-white text-black rounded-xl text-sm font-medium hover:bg-white/90 transition-all disabled:opacity-50"
                                >
                                    {isProcessing ? 'Processing...' : 'Send to SI'}
                                </button>
                            )}
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { label: 'Messages', value: history.length.toString(), color: 'text-blue-400' },
                                { label: 'Language', value: 'ES-EN', color: 'text-purple-400' },
                            ].map((stat) => (
                                <div key={stat.label} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                                    <p className="text-[10px] text-neutral-600 uppercase font-medium tracking-wider">{stat.label}</p>
                                    <p className={`text-lg font-medium ${stat.color}`}>{stat.value}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Conversation History Panel */}
                    <div className="lg:col-span-2 rounded-[28px] bg-white/[0.02] border border-white/5 flex flex-col overflow-y-auto">
                        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                            <h2 className="text-sm font-medium flex items-center gap-2">
                                <Bot className="w-4 h-4 text-blue-400" />
                                Conversation
                            </h2>
                            {isProcessing && (
                                <div className="flex items-center gap-2 text-xs text-blue-400">
                                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                                    SI is thinking...
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
                            {history.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center text-neutral-600 space-y-3">
                                    <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
                                        <Mic className="w-8 h-8 text-white/10" />
                                    </div>
                                    <p className="text-sm">Start speaking to begin a conversation</p>
                                    <p className="text-xs text-neutral-700 max-w-sm">Your voice input will be transcribed and sent to Roosevelt SI for intelligent responses.</p>
                                </div>
                            ) : (
                                history.map((entry) => (
                                    <motion.div
                                        key={entry.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={`flex gap-3 ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        {entry.role === 'assistant' && (
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0 mt-1">
                                                <Bot className="w-4 h-4" />
                                            </div>
                                        )}
                                        <div className={`group max-w-[75%] relative ${
                                            entry.role === 'user'
                                                ? 'bg-blue-600/20 border border-blue-500/30 rounded-2xl rounded-tr-md'
                                                : 'bg-white/5 border border-white/5 rounded-2xl rounded-tl-md'
                                        } px-5 py-3`}>
                                            <p className="text-sm leading-relaxed">{entry.text}</p>
                                            <div className="flex items-center justify-between mt-2 gap-3">
                                                <span className="text-[10px] text-neutral-600">
                                                    {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                <button
                                                    onClick={() => copyToClipboard(entry.id, entry.text)}
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    {copied === entry.id
                                                        ? <CheckCircle className="w-3 h-3 text-green-400" />
                                                        : <Copy className="w-3 h-3 text-neutral-600 hover:text-white" />
                                                    }
                                                </button>
                                            </div>
                                        </div>
                                        {entry.role === 'user' && (
                                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-1 text-xs font-medium">
                                                {currentUser?.displayName?.[0] || 'U'}
                                            </div>
                                        )}
                                    </motion.div>
                                ))
                            )}
                            <div ref={historyEndRef} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
