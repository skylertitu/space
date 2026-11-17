import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Facebook,
    X,
    CheckCircle2,
    ShieldCheck,
    ArrowRight,
    Lock
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, setDoc, deleteDoc, onSnapshot, serverTimestamp, collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { isIntegrationTakenByAnotherTenant } from '@/lib/integrations/checkIntegrationTaken';
import { claimIntegration } from '@/lib/integrations/claimClient';
import { metaLoginOptions } from '@/lib/integrations/metaLogin';
import { toast } from 'sonner';

interface MessengerModalProps {
    isOpen: boolean;
    onClose: () => void;
    activeEntity: any;
    currentUser: any;
}

const MessengerModal: React.FC<MessengerModalProps> = ({ isOpen, onClose, activeEntity, currentUser }) => {
    const [isConnected, setIsConnected] = useState(false);
    const [config, setConfig] = useState<any>(null);
    const [isSelectingPage, setIsSelectingPage] = useState(false);
    const [availablePages, setAvailablePages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [userToken, setUserToken] = useState<string | null>(null);

    const userId = currentUser?.uid;
    const entityId = activeEntity?.id || activeEntity;

    useEffect(() => {
        if (!userId || !entityId) return;

        const q = doc(db, `users/${userId}/entities/${entityId}/integrations/messenger`);
        const unsubscribe = onSnapshot(q, (doc) => {
            if (doc.exists()) {
                setConfig(doc.data());
                setIsConnected(true);
            } else {
                setConfig(null);
                setIsConnected(false);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [userId, entityId]);

    const handleConnectMessenger = async () => {
        const toastId = toast.loading("Conectando con Facebook...");
        try {
            // @ts-ignore
            if (!window.FB) {
                toast.error("Facebook SDK no cargado.", { id: toastId });
                return;
            }

            // @ts-ignore
            window.FB.login((response: any) => {
                if (response.authResponse) {
                    setUserToken(response.authResponse.accessToken);
                    fetchAvailablePages(response.authResponse.accessToken, toastId);
                } else {
                    toast.error("Conexión cancelada.", { id: toastId });
                }
            }, metaLoginOptions('messenger'));

        } catch (error) {
            console.error("Messenger Login Error:", error);
            toast.error("Error al conectar.", { id: toastId });
        }
    };

    const fetchAvailablePages = async (userToken: string, toastId: any) => {
        try {
            const res = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${userToken}`);
            const data = await res.json();

            if (data.data && data.data.length > 0) {
                setAvailablePages(data.data);
                setIsSelectingPage(true);
                toast.success("Selecciona una Fanpage.", { id: toastId });
            } else {
                toast.error("No se encontraron Fanpages.", { id: toastId });
            }
        } catch (error) {
            toast.error("Error al obtener páginas.", { id: toastId });
        }
    };

    const handleSelectPage = async (page: any) => {
        const toastId = toast.loading(`Vinculando ${page.name}...`);
        try {
            if (!userToken) {
                toast.error("Sesión expirada. Vuelve a iniciar sesión con Facebook.", { id: toastId });
                return;
            }

            const pageIdToCheck = page.id;
            const isAlreadyConnected = await isIntegrationTakenByAnotherTenant('pageId', pageIdToCheck, userId, entityId);

            if (isAlreadyConnected) {
                toast.error(`Esta Fanpage (${page.name}) ya está vinculada a otro usuario.`, { id: toastId });
                return;
            }

            const exchangeRes = await fetch('/api/meta/exchange-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shortLivedToken: userToken, pageId: page.id })
            });

            const exchangeData = await exchangeRes.json();

            if (!exchangeRes.ok || !exchangeData.accessToken) {
                const detail = exchangeData.details || exchangeData.error || 'Error desconocido';
                toast.error(`No se pudo obtener el token permanente: ${detail}. Verifica que META_APP_SECRET esté configurado en Vercel.`, { id: toastId });
                return;
            }

            const permanentToken = exchangeData.accessToken;

            const messengerConfig = {
                pageId: page.id,
                pageName: page.name,
                name: page.name,
                accessToken: permanentToken,
                tokenType: 'Permanente',
                status: 'Connected',
                updatedAt: serverTimestamp()
            };

            await setDoc(doc(db, `users/${userId}/entities/${entityId}/integrations/messenger`), messengerConfig);

            const claim = await claimIntegration('messenger', userId, entityId);
            if (!claim.ok) {
                await deleteDoc(doc(db, `users/${userId}/entities/${entityId}/integrations/messenger`));
                toast.error(claim.message, { id: toastId });
                return;
            }


            setConfig(messengerConfig);
            setIsConnected(true);
            setIsSelectingPage(false);
            toast.success("Messenger conectado con token permanente.", { id: toastId });
        } catch (error) {
            toast.error("Error al guardar configuración.", { id: toastId });
        }
    };

    const handleDelete = async () => {
        if (!confirm("¿Desconectar Messenger?")) return;
        
        const toastId = toast.loading("Desconectando...");
        try {
            await deleteDoc(doc(db, `users/${userId}/entities/${entityId}/integrations/messenger`));

            toast.success("Desconectado correctamente.", { id: toastId });
        } catch (error) {
            toast.error("Error al desconectar.");
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
                    
                    <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative w-full max-w-[95vw] md:max-w-4xl h-[70vh] md:min-h-[550px] md:h-auto bg-[#0A0A0A] border border-white/10 rounded-[24px] md:rounded-[40px] overflow-hidden shadow-2xl flex flex-col md:flex-row">
                        
                        {/* Left Branding Side */}
                        <div className="hidden md:flex w-[38%] bg-[#0084FF]/5 border-r border-white/5 p-12 flex flex-col justify-between relative overflow-hidden shrink-0">
                            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                                <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-[#0084FF] rounded-full blur-[100px]" />
                            </div>
                            
                            <div className="relative z-10">
                                <div className="w-16 h-16 bg-[#0084FF] rounded-2xl flex items-center justify-center mb-8 shadow-[0_0_30px_rgba(0,132,255,0.3)]">
                                    <Facebook className="w-8 h-8 text-white" />
                                </div>
                                <h2 className="text-3xl font-extralight text-white/90 tracking-tight mb-3">Messenger</h2>
                                <p className="text-sm text-white/40 leading-relaxed">Sincroniza tus conversaciones de Facebook directamente con el CRM inteligente de elizmey.</p>
                            </div>

                            <div className="relative z-10 p-6 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                    <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Estado del Nodo</span>
                                </div>
                                <p className="text-[12px] text-white/60 leading-relaxed">Sincronización autónoma de conversaciones desde páginas de Facebook.</p>
                            </div>
                        </div>

                        {/* Right Content Side */}
                        <div className="flex-1 p-5 md:p-12 flex flex-col relative overflow-y-auto no-scrollbar custom-scrollbar bg-[#0A0A0A]">
                            <button onClick={onClose} className="absolute top-6 right-6 p-2 hover:bg-white/5 rounded-full transition-colors group z-50">
                                <X className="w-5 h-5 text-white/20 group-hover:text-white" />
                            </button>

                            <div className="flex-1 flex flex-col justify-center py-2 md:py-4">
                                {!isConnected ? (
                                    <motion.div key="connect" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                                        <div className="flex items-center gap-2 mb-8 md:mb-12 shrink-0">
                                            <Lock className="w-3 h-3 text-white/20" />
                                            <span className="text-[8px] md:text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">Configuración de Nodo</span>
                                        </div>

                                        {isSelectingPage ? (
                                            <>
                                                <div className="grid gap-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                                                    {availablePages.map((page) => (
                                                        <button key={page.id} onClick={() => handleSelectPage(page)} className="group h-20 md:h-24 bg-white/5 border border-white/10 hover:border-[#0084FF]/50 rounded-[24px] md:rounded-[32px] flex items-center px-6 md:px-8 transition-all hover:bg-white/[0.07] relative overflow-hidden shrink-0">
                                                            <div className="w-10 h-10 md:w-12 md:h-12 bg-white/5 rounded-2xl flex items-center justify-center mr-4 md:mr-6 group-hover:bg-[#0084FF]/20 transition-colors">
                                                                <span className="text-base md:text-lg font-bold text-white/40 group-hover:text-[#0084FF]">FB</span>
                                                            </div>
                                                            <div className="text-left">
                                                                <p className="text-base md:text-lg font-light text-white leading-none mb-1">{page.name}</p>
                                                                <span className="text-[8px] md:text-[9px] text-white/20 uppercase tracking-widest font-mono">ID: {page.id}</span>
                                                            </div>
                                                            <ArrowRight className="w-4 h-4 md:w-5 md:h-5 text-white/10 ml-auto group-hover:text-[#0084FF] group-hover:translate-x-1 transition-all" />
                                                        </button>
                                                    ))}
                                                </div>
                                                <button onClick={() => setIsSelectingPage(false)} className="mt-6 md:mt-8 text-[9px] md:text-[10px] text-white/40 hover:text-white uppercase tracking-widest font-bold transition-colors underline underline-offset-8">Volver Atrás</button>
                                            </>
                                        ) : (
                                            <>
                                                <div className="space-y-6 md:space-y-8 mb-10 md:mb-16">
                                                    <div className="flex items-start gap-4 md:gap-6">
                                                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/5 flex items-center justify-center text-xs md:text-sm font-bold text-white/40 shrink-0">1</div>
                                                        <p className="text-[13px] md:text-[15px] text-white/70 font-normal mt-1 md:mt-2 leading-relaxed">Otorga permisos a elizmey para gestionar tus mensajes de Messenger.</p>
                                                    </div>
                                                    <div className="flex items-start gap-4 md:gap-6">
                                                        <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/5 flex items-center justify-center text-xs md:text-sm font-bold text-white/40 shrink-0">2</div>
                                                        <p className="text-[13px] md:text-[15px] text-white/70 font-normal mt-1 md:mt-2 leading-relaxed">Selecciona la Fanpage que deseas automatizar con SI.</p>
                                                    </div>
                                                </div>
        
                                                <button onClick={handleConnectMessenger} className="w-full h-14 md:h-16 bg-[#0084FF] hover:bg-[#0073e6] text-white text-[10px] md:text-xs font-bold uppercase tracking-[0.3em] rounded-full transition-all shadow-[0_0_40px_rgba(0,132,255,0.2)]">
                                                    CONTINUAR VINCULACIÓN
                                                </button>
                                            </>
                                        )}
                                    </motion.div>
                                ) : (
                                    <motion.div key="active" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center text-center">
                                        <div className="w-16 h-16 md:w-20 md:h-20 bg-green-500/10 rounded-full flex items-center justify-center mb-6 md:mb-8 relative">
                                            <div className="absolute inset-0 rounded-full border border-green-500/20 animate-pulse" />
                                            <CheckCircle2 className="w-8 h-8 md:w-10 md:h-10 text-green-500" />
                                        </div>
                                        <h3 className="text-2xl md:text-3xl font-extralight text-white tracking-tighter mb-1 italic uppercase leading-none">Canal Sincronizado</h3>
                                        <p className="text-[9px] md:text-[10px] text-white/30 uppercase tracking-[0.3em] font-bold mb-6 md:mb-8">Estado: Operativo y Estable</p>
                                        
                                        <div className="w-full space-y-3 px-2">
                                            <div className="h-20 md:h-24 bg-white/5 border border-white/10 rounded-[24px] md:rounded-[32px] flex items-center px-6 md:px-8 justify-between backdrop-blur-sm relative overflow-hidden group/card">
                                                <div className="absolute inset-0 bg-[#0084FF]/5 opacity-0 group-hover/card:opacity-100 transition-opacity" />
                                                <div className="text-left relative z-10">
                                                    <span className="text-[8px] uppercase tracking-[0.2em] text-[#0084FF] block mb-1 md:mb-2 font-black opacity-70">PÁGINA VINCULADA</span>
                                                    <p className="text-lg md:text-xl font-extralight text-white tracking-tight leading-none truncate max-w-[180px] md:max-w-[250px]">{config?.pageName || config?.name || 'Fanpage vinculada'}</p>
                                                    <span className="text-[7px] md:text-[8px] text-white/20 mt-1 md:mt-2 block font-mono uppercase tracking-widest text-left">PAGE ID: {config?.pageId}</span>
                                                </div>
                                                <div className="p-3 md:p-4 bg-green-500/5 border border-green-500/10 rounded-2xl relative z-10"><ShieldCheck className="w-5 h-5 md:w-6 md:h-6 text-green-500/40" /></div>
                                            </div>

                                            <div className="flex items-center justify-between px-2 pt-2 gap-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                                    <span className="text-[7px] md:text-[8px] text-white/40 uppercase tracking-widest font-bold">Listo para recibir mensajes</span>
                                                </div>
                                                <span className="text-[7px] md:text-[8px] text-blue-500 font-black uppercase tracking-widest">TOKEN PERMANENTE</span>
                                            </div>

                                            <div className="flex items-center gap-3 md:gap-4 pt-4 md:pt-6">
                                                <button onClick={onClose} className="flex-1 h-12 md:h-14 bg-white/5 border border-white/10 hover:bg-white/10 text-white text-[9px] md:text-[10px] font-bold uppercase tracking-[0.3em] rounded-full transition-all">TERMINAR</button>
                                                <button onClick={handleDelete} className="flex-1 h-12 md:h-14 bg-red-500/5 hover:bg-red-500/10 text-red-500/50 border border-red-500/10 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.3em] rounded-full transition-all">DESCONECTAR</button>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default MessengerModal;
