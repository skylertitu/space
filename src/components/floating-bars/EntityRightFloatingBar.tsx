'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, User as UserIcon, Settings, CreditCard, LogOut, Home, X, Camera } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { toast } from 'sonner';

export function EntityRightFloatingBar() {
    const router = useRouter();
    const { currentUser, activeEntity } = useAuth();
    const [isExpanded, setIsExpanded] = useState(false);
    const [userPhoto, setUserPhoto] = useState<string | null>(null);
    const [entityData, setEntityData] = useState<{ name: string; type?: string; logoUrl?: string } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Fetch user photo
    useEffect(() => {
        if (!currentUser) return;
        if (currentUser.uid.startsWith('demo')) {
            setUserPhoto('/assets/rai-logo-circular.png');
            return;
        }
        const fetchUser = async () => {
            try {
                const userSnap = await getDoc(doc(db, `users/${currentUser.uid}`));
                if (userSnap.exists()) {
                    const d = userSnap.data();
                    if (d?.photoURL) setUserPhoto(d.photoURL);
                }
            } catch (err) {
                // Silencioso en modo standalone
            }
        };
        fetchUser();
    }, [currentUser]);

    // Fetch entity data
    useEffect(() => {
        if (!currentUser || !activeEntity) return;
        if (currentUser.uid.startsWith('demo') || activeEntity === 'mensajeria') {
            setEntityData({
                name: 'Plataforma de Mensajería Automática',
                type: 'empresa',
                logoUrl: '/assets/rai-logo-circular.png',
            });
            return;
        }
        const fetchEntity = async () => {
            try {
                const entSnap = await getDoc(doc(db, `users/${currentUser.uid}/entities/${activeEntity}`));
                if (entSnap.exists()) {
                    const d = entSnap.data();
                    setEntityData({
                        name: d.name || 'Environment',
                        type: d.type,
                        logoUrl: d.logoUrl || d.customPhotoURL,
                    });
                }
            } catch (err) {
                // Silencioso en modo standalone
            }
        };
        fetchEntity();
    }, [currentUser, activeEntity]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsExpanded(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            router.push('/login');
        } catch (e) {
            toast.error('Error al cerrar sesión');
        }
    };

    const isPersonal = entityData?.type === 'persona';
    const photo = isPersonal
        ? (entityData?.logoUrl || userPhoto || currentUser?.photoURL || '')
        : (entityData?.logoUrl || '');

    return (
        <div
            ref={containerRef}
            className="fixed right-5 top-1/2 -translate-y-1/2 z-[4000] flex items-center justify-center select-none pointer-events-auto"
        >
            <AnimatePresence mode="wait">
                {!isExpanded ? (
                    <motion.button
                        key="entity-right-trigger"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10, transition: { duration: 0.1 } }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        whileHover={{ scale: 1.15, x: -2 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsExpanded(true)}
                        className="flex items-center justify-center p-2.5 text-white/60 hover:text-white transition-colors cursor-pointer outline-none group"
                        title="Abrir perfil"
                    >
                        <ChevronLeft className="w-5 h-5 text-white/60 group-hover:text-white transition-colors" />
                    </motion.button>
                ) : (
                    <motion.div
                        key="entity-right-pill"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20, transition: { duration: 0.12, ease: "easeIn" } }}
                        transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.8 }}
                        className="bg-white/[0.06] hover:bg-white/[0.08] backdrop-blur-2xl rounded-full shadow-[0_12px_40px_rgba(0,0,0,0.6)] flex flex-col items-center py-3 px-2.5 gap-2.5 transition-colors"
                    >
                        {/* 1. Círculo del perfil creado (Más grande y prominente) */}
                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                                <button
                                    type="button"
                                    className="w-14 h-14 rounded-full flex items-center justify-center outline-none cursor-pointer hover:scale-105 active:scale-95 transition-all relative group shadow-[0_0_25px_rgba(0,0,0,0.6)]"
                                    title={entityData?.name || "Perfil de la entidad"}
                                >
                                    <Avatar className="w-full h-full shadow-md">
                                        {photo && <AvatarImage src={photo} alt={entityData?.name || ''} className="object-cover" referrerPolicy="no-referrer" />}
                                        <AvatarFallback className={`text-white font-medium text-base ${isPersonal ? 'bg-gradient-to-tr from-emerald-800 to-teal-700' : 'bg-gradient-to-tr from-blue-800 to-indigo-700'}`}>
                                            {entityData?.name?.[0]?.toUpperCase() || (isPersonal ? (currentUser?.displayName?.[0] || 'P') : 'E')}
                                        </AvatarFallback>
                                    </Avatar>
                                </button>
                            </DropdownMenu.Trigger>

                            <DropdownMenu.Portal>
                                <DropdownMenu.Content
                                    align="end"
                                    side="left"
                                    sideOffset={14}
                                    className="w-72 bg-[#121316]/95 border border-white/10 rounded-2xl shadow-[0_24px_48px_rgba(0,0,0,0.7)] backdrop-blur-3xl p-3 z-[5000] text-white space-y-3"
                                >
                                    <div className="flex items-center gap-3 pb-2 border-b border-white/10">
                                        <Avatar className="w-10 h-10 border border-white/15">
                                            {photo && <AvatarImage src={photo} referrerPolicy="no-referrer" />}
                                            <AvatarFallback className={`text-white text-xs ${isPersonal ? 'bg-emerald-700' : 'bg-blue-700'}`}>
                                                {entityData?.name?.[0]?.toUpperCase() || 'E'}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-medium text-white truncate">
                                                {entityData?.name || (isPersonal ? 'Personal' : 'Environment')}
                                            </h4>
                                            <p className="text-[11px] text-white/50 truncate">
                                                {isPersonal ? currentUser?.email : (entityData?.type === 'creador' ? 'Creator' : 'Business')}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <button
                                            type="button"
                                            onClick={() => router.push('/home')}
                                            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs text-white/75 hover:text-white hover:bg-white/10 transition-colors text-left"
                                        >
                                            <Home className="w-3.5 h-3.5 text-white/60" />
                                            <span>Home</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => router.push(isPersonal ? '/perfil' : '/configuracion')}
                                            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs text-white/75 hover:text-white hover:bg-white/10 transition-colors text-left"
                                        >
                                            <UserIcon className="w-3.5 h-3.5 text-white/60" />
                                            <span>{isPersonal ? 'Perfil' : 'Configuración'}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => router.push(activeEntity ? `/subscriptions?entityId=${activeEntity}` : '/subscriptions')}
                                            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs text-white/75 hover:text-white hover:bg-white/10 transition-colors text-left"
                                        >
                                            <CreditCard className="w-3.5 h-3.5 text-white/60" />
                                            <span>Suscripción</span>
                                        </button>
                                    </div>

                                    <div className="pt-2 border-t border-white/10">
                                        <button
                                            type="button"
                                            onClick={handleLogout}
                                            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs text-white/60 hover:text-red-400 hover:bg-red-500/10 transition-colors text-left"
                                        >
                                            <LogOut className="w-3.5 h-3.5" />
                                            <span>Cerrar sesión</span>
                                        </button>
                                    </div>
                                </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                        </DropdownMenu.Root>

                        {/* 2. Flecha para colapsar */}
                        <button
                            type="button"
                            onClick={() => setIsExpanded(false)}
                            className="w-9 h-9 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all active:scale-95 cursor-pointer outline-none group shrink-0"
                            title="Ocultar barra"
                        >
                            <ChevronRight className="w-5 h-5 text-white/50 group-hover:text-white transition-colors" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
