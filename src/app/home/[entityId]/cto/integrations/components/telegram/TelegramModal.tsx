'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, CheckCircle2, X, Lock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { doc, setDoc, deleteDoc, onSnapshot, collectionGroup, query, where, getDocs } from 'firebase/firestore';
import { isIntegrationTakenByAnotherTenant } from '@/lib/integrations/checkIntegrationTaken';

interface TelegramModalProps {
    isOpen: boolean;
    onClose: () => void;
    activeEntity: string;
    currentUser: any;
}

export default function TelegramModal({ isOpen, onClose, activeEntity, currentUser }: TelegramModalProps) {
    const [step, setStep] = useState(1);
    const [botToken, setBotToken] = useState('');
    const [botName, setBotName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);

    useEffect(() => {
        if (!isOpen || !currentUser || !activeEntity) return;
        setInitialLoading(true);

        const configRef = doc(db, `users/${currentUser.uid}/entities/${activeEntity}/integrations/telegram`);
        
        const unsub = onSnapshot(configRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                if (data.status === 'Connected') {
                    setStep(3);
                    setBotToken(data.botToken || '');
                    setBotName(data.botName || 'Bot Conectado');
                }
            } else {
                setStep(1);
            }
            setTimeout(() => setInitialLoading(false), 500);
        });

        return () => unsub();
    }, [isOpen, currentUser, activeEntity]);

    const handleConnect = async () => {
        if (!botToken.trim()) {
            toast.error("Por favor, ingresa el Bot Token.");
            return;
        }

        if (!botToken.includes(':') || botToken.length < 20) {
            toast.error("El formato del Bot Token es inválido. Debe ser algo como '123456:ABC-DEF...'");
            return;
        }

        setIsLoading(true);
        const toastId = toast.loading("Activando Protocolo Telegram...");

        try {
            // 1. Validar que el bot no esté en uso (Agnosticismo Total - Rule 1 & 7)
            // Usamos collectionGroup para buscar en todas las bóvedas sin usar una tabla raíz
            const isUsedByAnotherTenant = await isIntegrationTakenByAnotherTenant('botToken', botToken, currentUser!.uid, activeEntity);
                                    
            if (isUsedByAnotherTenant) {
                toast.error("Este Bot ya está siendo utilizado por otra entidad.", { id: toastId });
                setIsLoading(false);
                return;
            }

            // 2. Register Webhook via Backend
            const setupRes = await fetch('/api/telegram/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    botToken,
                    userId: currentUser?.uid,
                    entityId: activeEntity,
                    domain: window.location.host
                })
            });

            const setupData = await setupRes.json();
            if (!setupData.success) {
                throw new Error(setupData.error || 'Error en el registro del webhook');
            }

            // 3. Persistencia Aislada (Rule 4: Root Isolation)
            // Solo guardamos dentro de la bóveda de la entidad activa
            const configRef = doc(db, `users/${currentUser?.uid}/entities/${activeEntity}/integrations/telegram`);

            const telegramConfig = {
                botToken,
                botName: setupData.botName || 'Telegram Bot',
                status: 'Connected',
                provider: 'telegram',
                userId: currentUser?.uid,
                entityId: activeEntity,
                updatedAt: new Date(),
            };

            await setDoc(configRef, telegramConfig, { merge: true });

            setBotName(setupData.botName || 'Telegram Bot');
            toast.success("¡Protocolo Telegram Activado!", { id: toastId });
            setStep(3);
        } catch (error: any) {
            console.error(error);
            toast.error(`Error: ${error.message}`, { id: toastId });
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("¿Desconectar Telegram de forma permanente?")) return;
        const toastId = toast.loading("Eliminando nodo...");
        try {
            await deleteDoc(doc(db, `users/${currentUser?.uid}/entities/${activeEntity}/integrations/telegram`));
            setStep(1);
            setBotToken('');
            toast.success("Telegram desconectado al 100%.", { id: toastId });
        } catch (e) {
            toast.error("Error al desconectar.", { id: toastId });
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-md" />
                
                <motion.div
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    className="relative w-full max-w-[95vw] md:max-w-4xl bg-[#0a0a0a] border border-white/5 rounded-[24px] md:rounded-[40px] shadow-2xl overflow-hidden flex flex-col md:flex-row h-[85vh] md:min-h-[550px] md:h-auto"
                >
                    {/* Left Side: Branding (The Teal/Green Sidebar) */}
                    <div className="hidden md:flex w-[38%] bg-[#0d1d1d] p-12 flex-col relative overflow-hidden shrink-0 text-left border-r border-white/5">
                        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-[#26A5E4]/10 to-transparent pointer-events-none" />
                        
                        <div className="relative z-10">
                            <div className="w-16 h-16 bg-white/[0.05] border border-white/10 rounded-2xl flex items-center justify-center mb-10 backdrop-blur-md shadow-xl">
                                <Send className="w-10 h-10 text-[#26A5E4]" />
                            </div>
                            
                            <h1 className="text-[32px] font-normal text-white tracking-tight leading-tight mb-4">
                                Telegram
                            </h1>
                            
                            <p className="text-[14px] text-white/40 font-light leading-relaxed max-w-[280px]">
                                Vincula tu bot de Telegram para gestión masiva y automatizada de audiencias a través de Roosevelt.
                            </p>
                        </div>
                    </div>

                    {/* Right Side: Deployment Content */}
                    <div className="flex-1 p-5 md:p-12 overflow-y-auto no-scrollbar flex flex-col bg-[#0a0a0a] relative">
                        <button onClick={onClose} className="absolute top-6 right-6 p-2 text-neutral-500 hover:text-white transition-colors z-50">
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex items-center gap-2 mb-8 md:mb-12 text-neutral-500 shrink-0">
                            <Lock className="w-3.5 h-3.5" />
                            <span className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em]">Configuración de Nodo</span>
                        </div>

                        <div className="flex-1 flex flex-col justify-center">
                            <AnimatePresence mode="wait">
                                {step === 1 ? (
                                    <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6 md:space-y-8">
                                        {/* Micro-Tutorial */}
                                        <div className="bg-[#26A5E4]/5 border border-[#26A5E4]/20 rounded-[20px] md:rounded-3xl p-5 md:p-8 relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-[#26A5E4] opacity-[0.03] blur-[50px] rounded-full pointer-events-none" />
                                            <h3 className="text-white text-lg md:text-xl font-medium mb-4 md:mb-6 flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-[#26A5E4] animate-pulse"></div>
                                                Paso 1: Crear tu Bot Oficial
                                            </h3>
                                            <p className="text-white/60 text-[12px] md:text-[14px] leading-relaxed mb-6 md:mb-8 max-w-sm">
                                                Para proteger tu privacidad, Roosevelt no accede a tu cuenta personal. Debes crear un "Bot" que actuará como tu asistente oficial.
                                            </p>
                                            
                                            <div className="space-y-4 md:space-y-6">
                                                <div className="flex items-start gap-3 md:gap-4">
                                                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-[#26A5E4]/10 border border-[#26A5E4]/20 flex items-center justify-center shrink-0 text-[#26A5E4] text-[9px] md:text-[10px] font-black">1</div>
                                                    <div className="text-[12px] md:text-[13px] text-white/50 pt-1 md:pt-1.5 font-light leading-relaxed">
                                                        Busca a <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-[#26A5E4] font-medium hover:underline">@BotFather</a> en Telegram.
                                                    </div>
                                                </div>
                                                <div className="flex items-start gap-3 md:gap-4">
                                                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-[#26A5E4]/10 border border-[#26A5E4]/20 flex items-center justify-center shrink-0 text-[#26A5E4] text-[9px] md:text-[10px] font-black">2</div>
                                                    <div className="text-[12px] md:text-[13px] text-white/50 pt-1 md:pt-1.5 font-light leading-relaxed">
                                                        Envía <span className="bg-white/5 px-2 py-0.5 rounded text-white/80 font-mono">/newbot</span> y sigue sus instrucciones.
                                                    </div>
                                                </div>
                                                <div className="flex items-start gap-3 md:gap-4">
                                                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-[#26A5E4]/10 border border-[#26A5E4]/20 flex items-center justify-center shrink-0 text-[#26A5E4] text-[9px] md:text-[10px] font-black">3</div>
                                                    <div className="text-[12px] md:text-[13px] text-white/50 pt-1 md:pt-1.5 font-light leading-relaxed">
                                                        Al terminar, guarda el <span className="text-white font-medium">HTTP API Token</span>.
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex gap-3 md:gap-4 pt-2">
                                            <button onClick={onClose} className="flex-1 h-12 md:h-14 bg-white/5 text-white/40 text-[9px] md:text-[10px] font-black uppercase tracking-widest rounded-xl hover:text-white transition-all">Cancelar</button>
                                            <button 
                                                onClick={() => setStep(2)}
                                                className="flex-[2] h-12 md:h-14 bg-[#26A5E4] text-white font-black uppercase tracking-widest text-[10px] md:text-[11px] rounded-xl hover:bg-[#1f88c0] hover:shadow-[0_0_30px_rgba(38,165,228,0.4)] transition-all"
                                            >
                                                Ya tengo mi Token
                                            </button>
                                        </div>
                                    </motion.div>
                                ) : step === 2 ? (
                                    <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6 md:space-y-10">
                                        <div className="space-y-3 md:space-y-4">
                                            <h3 className="text-white text-xl md:text-2xl font-light tracking-tight">Vincular Token</h3>
                                            <p className="text-white/40 text-[12px] md:text-sm font-light">Pega la llave maestra que te entregó BotFather para activar el puente.</p>
                                        </div>

                                        {/* Input Area */}
                                        <div className="space-y-2 md:space-y-3">
                                            <label className="text-[8px] md:text-[9px] text-[#26A5E4] tracking-[0.2em] uppercase font-black block pl-2">Ingresar "HTTP API Token"</label>
                                            <input 
                                                type="text"
                                                placeholder="Ejemplo: 1234567890:AAeb..."
                                                value={botToken}
                                                onChange={(e) => setBotToken(e.target.value)}
                                                className="w-full bg-white/[0.03] border border-white/10 rounded-xl md:rounded-2xl px-5 md:px-6 py-4 md:py-5 text-white font-mono text-xs md:text-sm focus:outline-none focus:border-[#26A5E4]/50 focus:bg-white/[0.05] transition-all"
                                                autoFocus
                                            />
                                        </div>

                                        <div className="flex gap-3 md:gap-4 pt-2">
                                            <button onClick={() => setStep(1)} className="flex-1 h-12 md:h-14 bg-white/5 text-white/40 text-[9px] md:text-[10px] font-black uppercase tracking-widest rounded-xl hover:text-white transition-all">Atrás</button>
                                            <button 
                                                onClick={handleConnect}
                                                disabled={isLoading}
                                                className={`flex-[2] h-12 md:h-14 font-black uppercase tracking-widest text-[10px] md:text-[11px] rounded-xl transition-all shadow-[0_0_20px_rgba(38,165,228,0.2)] ${
                                                    isLoading 
                                                    ? 'bg-gray-800 text-white/50 shadow-none' 
                                                    : 'bg-[#26A5E4] text-white hover:bg-[#1f88c0] hover:shadow-[0_0_30px_rgba(38,165,228,0.4)] hover:scale-[1.02] active:scale-[0.98]'
                                                }`}
                                            >
                                                {isLoading ? 'Vinculando...' : 'Activar Protocolo'}
                                            </button>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div key="step3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center text-center space-y-6 md:space-y-8">
                                        <div className="w-16 h-16 md:w-20 md:h-20 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/20">
                                            <CheckCircle2 className="w-8 h-8 md:w-10 md:h-10 text-green-500" />
                                        </div>
                                        <div className="space-y-2">
                                            <h3 className="text-xl md:text-2xl font-light text-white tracking-tight">Vínculo Establecido</h3>
                                            <p className="text-white/40 text-[12px] md:text-[13px] font-light max-w-xs mx-auto">El nodo de Telegram ha sido sincronizado bajo el control central de Roosevelt.</p>
                                        </div>
                                        <div className="w-full max-w-sm mt-4 md:mt-8 border border-white/5 rounded-2xl bg-black/50 p-5 md:p-6 relative overflow-hidden group">
                                            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#26A5E4]/30 to-transparent"></div>
                                            <div className="flex flex-col gap-1 items-start mb-4 md:mb-6">
                                                <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-[#26A5E4]">Bot Conectado</span>
                                                <code className="text-white font-mono text-base md:text-lg tracking-tight">{botName || 'Telegram Bot'}</code>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button onClick={onClose} className="flex-1 h-11 md:h-12 bg-white/5 hover:bg-white/10 text-white rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all">TERMINAR</button>
                                                <button onClick={handleDelete} className="flex-1 h-11 md:h-12 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all">DESCONECTAR</button>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
