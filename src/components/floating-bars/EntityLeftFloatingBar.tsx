'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Home } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { filterRealEntities, getEntityRouteSegment, EntitySlugRecord } from '@/lib/entitySlug';
import { cn } from '@/lib/utils';

interface EntityItem extends EntitySlugRecord {
    type?: string;
    status?: 'active' | 'archived';
    photoURL?: string;
    logoUrl?: string;
}

export function EntityLeftFloatingBar() {
    const router = useRouter();
    const { currentUser, activeEntity } = useAuth();
    const [isExpanded, setIsExpanded] = useState(false);
    const [entities, setEntities] = useState<EntityItem[]>([]);
    const [userDocPhoto, setUserDocPhoto] = useState<string | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Fetch user photo in real time (omitido en demo)
    useEffect(() => {
        if (!currentUser || currentUser.uid.startsWith('demo')) return;
        try {
            const unsub = onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
                if (snap.exists()) {
                    const data = snap.data();
                    setUserDocPhoto(data.photoURL || data.avatarUrl || null);
                }
            }, () => {});
            return () => unsub();
        } catch {}
    }, [currentUser]);

    // Fetch entities in real time
    useEffect(() => {
        if (!currentUser) return;
        if (currentUser.uid.startsWith('demo')) {
            setEntities([{ id: 'mensajeria', name: 'Plataforma de Mensajería Automática', type: 'empresa' }]);
            return;
        }
        const q = collection(db, `users/${currentUser.uid}/entities`);
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const ents = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as EntityItem));
            setEntities(ents);
        }, () => {
            setEntities([{ id: 'mensajeria', name: 'Plataforma de Mensajería Automática', type: 'empresa' }]);
        });
        return () => unsubscribe();
    }, [currentUser]);

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

    const realEntities = filterRealEntities(entities).filter((e) => e.status !== 'archived');

    const resolveEntityPhoto = (entity: EntityItem) => {
        if (entity.photoURL) return entity.photoURL;
        if (entity.logoUrl) return entity.logoUrl;
        if (entity.type === 'persona') {
            return userDocPhoto || currentUser?.photoURL || '';
        }
        return '';
    };

    const handleSwitchEntity = (entity: EntityItem) => {
        const routeSegment = getEntityRouteSegment(entity);
        router.push(`/home/${routeSegment}`);
    };

    return (
        <div
            ref={containerRef}
            className="fixed left-5 top-1/2 -translate-y-1/2 z-[4000] flex items-center justify-center select-none pointer-events-auto"
        >
            <AnimatePresence mode="wait">
                {!isExpanded ? (
                    <motion.button
                        key="entity-left-trigger"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10, transition: { duration: 0.1 } }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        whileHover={{ scale: 1.15, x: 2 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsExpanded(true)}
                        className="flex items-center justify-center p-2.5 text-white/60 hover:text-white transition-colors cursor-pointer outline-none group"
                        title="Cambiar de entorno / Navegación"
                    >
                        <ChevronRight className="w-5 h-5 text-white/60 group-hover:text-white transition-colors" />
                    </motion.button>
                ) : (
                    <motion.div
                        key="entity-left-pill"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20, transition: { duration: 0.12, ease: "easeIn" } }}
                        transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.8 }}
                        className="bg-white/[0.06] hover:bg-white/[0.08] backdrop-blur-2xl rounded-full shadow-[0_12px_40px_rgba(0,0,0,0.6)] flex flex-col items-center py-3.5 px-3.5 gap-3 transition-colors max-h-[85vh] overflow-y-auto no-scrollbar"
                    >
                        {/* 1. Volver a Home */}
                        <button
                            type="button"
                            onClick={() => router.push('/home')}
                            className="w-12 h-12 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all active:scale-95 cursor-pointer outline-none shrink-0"
                            title="Todos los entornos (Home)"
                        >
                            <Home className="w-5.5 h-5.5" />
                        </button>

                        {/* 2. Lista de entidades para cambio rápido */}
                        <div className="flex flex-col items-center gap-3 overflow-y-auto no-scrollbar py-1 px-1.5 w-full">
                            {realEntities.map((ent) => {
                                const photo = resolveEntityPhoto(ent);
                                const isPersonal = ent.type === 'persona';
                                const isCurrent = ent.id === activeEntity;

                                return (
                                    <button
                                        key={ent.id}
                                        type="button"
                                        onClick={() => handleSwitchEntity(ent)}
                                        className={cn(
                                            "w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer outline-none relative group/item shrink-0",
                                            isCurrent
                                                ? "ring-2 ring-blue-500 shadow-[0_0_16px_rgba(59,130,246,0.6)]"
                                                : "opacity-75 hover:opacity-100 hover:scale-105"
                                        )}
                                        title={ent.name || (isPersonal ? 'Entorno Personal' : 'Entorno')}
                                    >
                                        <Avatar className="w-full h-full">
                                            {photo && <AvatarImage src={photo} alt={ent.name || ''} className="object-cover" referrerPolicy="no-referrer" />}
                                            <AvatarFallback className={`text-white text-sm font-medium ${isPersonal ? 'bg-gradient-to-tr from-emerald-800 to-teal-700' : 'bg-gradient-to-tr from-blue-800 to-indigo-700'}`}>
                                                {ent.name ? ent.name[0].toUpperCase() : '•'}
                                            </AvatarFallback>
                                        </Avatar>
                                    </button>
                                );
                            })}
                        </div>

                        {/* 3. Flecha para colapsar */}
                        <button
                            type="button"
                            onClick={() => setIsExpanded(false)}
                            className="w-9 h-9 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all active:scale-95 cursor-pointer outline-none group shrink-0"
                            title="Ocultar barra"
                        >
                            <ChevronLeft className="w-5 h-5 text-white/50 group-hover:text-white transition-colors" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
