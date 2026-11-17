'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, Lock, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { doc, setDoc, deleteDoc, onSnapshot, collectionGroup, query, where, getDocs } from 'firebase/firestore';
import { isIntegrationTakenByAnotherTenant } from '@/lib/integrations/checkIntegrationTaken';

interface TwitterModalProps {
    isOpen: boolean;
    onClose: () => void;
    activeEntity: string;
    currentUser: any;
}

export default function TwitterModal({ isOpen, onClose, activeEntity, currentUser }: TwitterModalProps) {
    const [step, setStep] = useState(1);
    const [twitterHandle, setTwitterHandle] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);

    useEffect(() => {
        if (!isOpen || !currentUser || !activeEntity) return;
        setInitialLoading(true);

        const configRef = doc(db, `users/${currentUser.uid}/entities/${activeEntity}/integrations/x_twitter`);
        
        const unsub = onSnapshot(configRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                if (data.status === 'Connected') {
                    setStep(3);
                    setTwitterHandle(data.twitterHandle || '');
                }
            } else {
                setStep(1);
            }
            setTimeout(() => setInitialLoading(false), 500);
        });

        return () => unsub();
    }, [isOpen, currentUser, activeEntity]);

    const handleConnect = async () => {
        const handle = window.prompt("Simulación OAuth: Ingresa el @usuario de X a vincular:");
        if (!handle) return;
        
        const cleanHandle = handle.replace('@', '').toLowerCase();

        setIsLoading(true);
        const toastId = toast.loading("Verificando credenciales de X...");

        try {
            const isUsedByAnotherTenant = await isIntegrationTakenByAnotherTenant('twitterHandle', cleanHandle, currentUser!.uid, activeEntity);
                                    
            if (isUsedByAnotherTenant) {
                toast.error("Esta cuenta de X ya está administrada por otro cliente de Roosevelt.", { id: toastId });
                setIsLoading(false);
                return;
            }

            const configRef = doc(db, `users/${currentUser?.uid}/entities/${activeEntity}/integrations/x_twitter`);
            await setDoc(configRef, {
                twitterHandle: cleanHandle,
                status: 'Connected',
                provider: 'x_twitter',
                updatedAt: new Date(),
            }, { merge: true });

            toast.success("¡X (Twitter) vinculado correctamente!", { id: toastId });
            setStep(3);
        } catch (error) {
            console.error(error);
            toast.error("Fallo al conectar con X.", { id: toastId });
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm("¿Desconectar X (Twitter) de forma permanente?")) return;
        const toastId = toast.loading("Revocando accesos OAuth...");
        try {
            await deleteDoc(doc(db, `users/${currentUser?.uid}/entities/${activeEntity}/integrations/x_twitter`));
            setStep(1);
            setTwitterHandle('');
            toast.success("X desconectado al 100%.", { id: toastId });
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
                    className="relative w-full max-w-[95vw] md:max-w-4xl h-[85vh] md:min-h-[550px] md:h-auto bg-[#0a0a0a] border border-white/5 rounded-[24px] md:rounded-[40px] shadow-2xl overflow-hidden flex flex-col md:flex-row"
                >
                    {/* Left Side: Branding (The Teal/Green Sidebar) */}
                    <div className="hidden md:flex w-[38%] bg-[#0d1d1d] p-12 flex-col relative overflow-hidden shrink-0 text-left border-r border-white/5">
                        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
                        
                        <div className="relative z-10">
                            <div className="w-16 h-16 bg-white/[0.05] border border-white/10 rounded-2xl flex items-center justify-center mb-10 backdrop-blur-md shadow-xl">
                                <svg viewBox="0 0 24 24" className="w-10 h-10 fill-white" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932 6.064-6.932zm-1.292 19.497h2.039L6.486 3.24H4.298l13.311 17.41z" />
                                </svg>
                            </div>
                            
                            <h1 className="text-[32px] font-normal text-white tracking-tight leading-tight mb-4">
                                Twitter / X
                            </h1>
                            
                            <p className="text-[14px] text-white/40 font-light leading-relaxed max-w-[280px]">
                                Integra tus DMs y menciones de X para una gestión omnicanal unificada a través de Roosevelt.
                            </p>
                        </div>
                    </div>

                    {/* Right Side: Deployment Content */}
                    <div className="flex-1 p-5 md:p-12 flex flex-col bg-[#0a0a0a] relative overflow-y-auto no-scrollbar">
                        <button onClick={onClose} className="absolute top-6 right-6 p-2 text-neutral-500 hover:text-white transition-colors z-50">
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex items-center gap-2 mb-8 md:mb-12 text-neutral-500 shrink-0">
                            <Lock className="w-3.5 h-3.5" />
                            <span className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em]">Pasarela de Acceso</span>
                        </div>

                        <div className="flex-1 flex flex-col justify-center">
                            <AnimatePresence mode="wait">
                                {step === 1 ? (
                                    <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8 md:space-y-12">
                                        <div className="space-y-6 md:space-y-8">
                                            {[
                                                { id: 1, text: <>Inicia sesión en tu cuenta de <span className="text-white font-medium">X (Twitter)</span> mediante OAuth 2.0.</> },
                                                { id: 2, text: <>Vindula tu perfil con la <span className="text-white font-medium">consola de Roosevelt</span>.</> },
                                                { id: 3, text: <>Gestiona hilos de forma <span className="text-[#3b82f6] underline underline-offset-4">autónoma</span> desde el CRM central.</> }
                                            ].map((step) => (
                                                <div key={step.id} className="flex items-start gap-4 md:gap-5 group">
                                                    <div className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center text-[10px] md:text-[11px] font-black shrink-0 transition-all duration-500 ${
                                                        step.id === 3 
                                                        ? 'bg-[#1e293b] border border-[#3b82f6]/50 text-[#3b82f6] shadow-[0_0_15px_rgba(59,130,246,0.3)]' 
                                                        : 'bg-black border border-white/10 text-white/40'
                                                    }`}>
                                                        {step.id}
                                                    </div>
                                                    <p className={`text-[12px] md:text-[13px] leading-relaxed transition-colors duration-500 ${step.id === 3 ? 'text-white' : 'text-neutral-400'}`}>
                                                        {step.text}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                        
                                        <div className="space-y-4">
                                            <button 
                                                onClick={handleConnect}
                                                disabled={isLoading}
                                                className="w-full h-14 md:h-16 bg-white text-black text-[10px] md:text-[11px] font-black uppercase tracking-[0.4em] rounded-xl md:rounded-2xl transition-all shadow-xl flex items-center justify-center gap-4 hover:scale-[1.01] active:scale-[0.98]"
                                            >
                                                {isLoading ? 'VINCULANDO...' : 'VINCULAR CON X'}
                                            </button>
                                            <p className="text-[9px] md:text-[10px] text-white/20 text-center uppercase tracking-widest italic">Handshake seguro vía X Dev Portal</p>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div key="step3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center text-center space-y-6 md:space-y-8">
                                        <div className="w-16 h-16 md:w-20 md:h-20 bg-white/10 rounded-full flex items-center justify-center border border-white/20">
                                            <CheckCircle2 className="w-8 h-8 md:w-10 md:h-10 text-white" />
                                        </div>
                                        <div className="space-y-2">
                                            <h3 className="text-xl md:text-2xl font-light text-white tracking-tight">Vínculo Establecido</h3>
                                            <p className="text-white/40 text-[12px] md:text-[13px] font-light max-w-xs mx-auto">La cuenta de X ha sido sincronizada bajo el control de Roosevelt.</p>
                                        </div>
                                        <div className="w-full max-w-sm mt-4 md:mt-8 border border-white/5 rounded-2xl bg-black/50 p-5 md:p-6 relative overflow-hidden group">
                                            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent"></div>
                                            <div className="flex flex-col gap-1 items-start mb-4 md:mb-6">
                                                <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-[#1DA1F2]">Cuenta de X Activa</span>
                                                <code className="text-white font-mono text-[13px] tracking-tight">@{twitterHandle}</code>
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
