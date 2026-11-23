'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronLeft,
    ChevronRight,
    User as UserIcon,
    Settings,
    CreditCard,
    LogOut,
    Home,
    MessageSquare,
    Share2,
    Bot,
    Megaphone,
    Users,
    BarChart3,
    LayoutGrid,
} from 'lucide-react';
import { useRouter, usePathname, useParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Las 7 opciones del menú del entorno (carrusel)
const MENU_OPTIONS = [
    {
        id: 'omnichannel',
        title: 'Chat Omnicanal',
        subtitle: 'Conversaciones',
        icon: MessageSquare,
        color: 'blue',
    },
    {
        id: 'integrations',
        title: 'Integraciones',
        subtitle: 'WhatsApp & Meta',
        icon: Share2,
        color: 'emerald',
    },
    {
        id: 'chatbots',
        title: 'Chatbots',
        subtitle: 'Automatización',
        icon: Bot,
        color: 'purple',
    },
    {
        id: 'broadcast',
        title: 'Difusiones',
        subtitle: 'Campañas Masivas',
        icon: Megaphone,
        color: 'orange',
    },
    {
        id: 'audiencias',
        title: 'Audiencias',
        subtitle: 'Contactos CRM',
        icon: Users,
        color: 'rose',
    },
    {
        id: 'metricas',
        title: 'Métricas',
        subtitle: 'Rendimiento',
        icon: BarChart3,
        color: 'amber',
    },
    {
        id: 'ajustes',
        title: 'Ajustes',
        subtitle: 'Configuración',
        icon: Settings,
        color: 'indigo',
    },
] as const;

const COLOR_STYLES: Record<string, { active: string; iconActive: string; hover: string }> = {
    blue: {
        active: 'bg-blue-500/20 border-blue-500/50 text-blue-400 shadow-[0_0_16px_rgba(59,130,246,0.35)]',
        iconActive: 'text-blue-400',
        hover: 'hover:text-blue-400 hover:bg-blue-500/10',
    },
    emerald: {
        active: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-[0_0_16px_rgba(16,185,129,0.35)]',
        iconActive: 'text-emerald-400',
        hover: 'hover:text-emerald-400 hover:bg-emerald-500/10',
    },
    purple: {
        active: 'bg-purple-500/20 border-purple-500/50 text-purple-400 shadow-[0_0_16px_rgba(168,85,247,0.35)]',
        iconActive: 'text-purple-400',
        hover: 'hover:text-purple-400 hover:bg-purple-500/10',
    },
    orange: {
        active: 'bg-orange-500/20 border-orange-500/50 text-orange-400 shadow-[0_0_16px_rgba(249,115,22,0.35)]',
        iconActive: 'text-orange-400',
        hover: 'hover:text-orange-400 hover:bg-orange-500/10',
    },
    rose: {
        active: 'bg-rose-500/20 border-rose-500/50 text-rose-400 shadow-[0_0_16px_rgba(244,63,94,0.35)]',
        iconActive: 'text-rose-400',
        hover: 'hover:text-rose-400 hover:bg-rose-500/10',
    },
    amber: {
        active: 'bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-[0_0_16px_rgba(245,158,11,0.35)]',
        iconActive: 'text-amber-400',
        hover: 'hover:text-amber-400 hover:bg-amber-500/10',
    },
    indigo: {
        active: 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400 shadow-[0_0_16px_rgba(99,102,241,0.35)]',
        iconActive: 'text-indigo-400',
        hover: 'hover:text-indigo-400 hover:bg-indigo-500/10',
    },
};

export function EntityRightFloatingBar() {
    const router = useRouter();
    const pathname = usePathname();
    const params = useParams();
    const { currentUser, activeEntity, activeEntityRoute } = useAuth();
    const [isExpanded, setIsExpanded] = useState(true);
    const [userPhoto, setUserPhoto] = useState<string | null>(null);
    const [entityData, setEntityData] = useState<{ name: string; type?: string; logoUrl?: string } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const entitySegment =
        (typeof params?.entityId === 'string' && params.entityId)
            ? params.entityId
            : (activeEntityRoute || activeEntity || 'personal');

    // Fetch user photo
    useEffect(() => {
        if (!currentUser) return;
        if (currentUser.photoURL) {
            setUserPhoto(currentUser.photoURL);
        }
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
        if (activeEntity === 'personal' || activeEntity === 'life') {
            setEntityData({
                name: 'Personal',
                type: 'persona',
                logoUrl: currentUser.photoURL || '/assets/rai-logo-circular.png',
            });
            return;
        }
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

    const handleLogout = async () => {
        try {
            await signOut(auth);
            router.push('/login');
        } catch (e) {
            toast.error('Error al cerrar sesión');
        }
    };

    const handleNavigate = (nodeId: string) => {
        const target = `/home/${entitySegment}/${nodeId}`;
        router.push(target);
    };

    const isNodeActive = (id: string) => {
        if (!pathname) return false;
        return (
            pathname.includes(`/${id}`) ||
            (id === 'omnichannel' && pathname.includes('/coo/omnichannel')) ||
            (id === 'integrations' && pathname.includes('/cto/integrations')) ||
            (id === 'chatbots' && (pathname.includes('/whatsappbots') || pathname.includes('/automation'))) ||
            (id === 'broadcast' && pathname.includes('/broadcast')) ||
            (id === 'audiencias' && (pathname.includes('/crm') || pathname.includes('/audiencias'))) ||
            (id === 'metricas' && (pathname.includes('/analytics') || pathname.includes('/metricas'))) ||
            (id === 'ajustes' && (pathname.includes('/ajustes') || pathname.includes('/configuracion')))
        );
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
                        className="flex items-center justify-center p-2.5 text-white/60 hover:text-white transition-colors cursor-pointer outline-none group bg-white/[0.04] hover:bg-white/[0.08] backdrop-blur-xl rounded-l-2xl border-l border-y border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
                        title="Abrir menú de navegación"
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
                        className="bg-black/60 hover:bg-black/75 backdrop-blur-2xl border border-white/10 rounded-full shadow-[0_16px_48px_rgba(0,0,0,0.7)] flex flex-col items-center py-2.5 px-2 gap-1.5 transition-colors max-h-[92vh] overflow-y-auto no-scrollbar"
                    >
                        {/* 1. Círculo del perfil con Dropdown */}
                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                                <button
                                    type="button"
                                    className="w-12 h-12 rounded-full flex items-center justify-center outline-none cursor-pointer hover:scale-105 active:scale-95 transition-all relative group shadow-[0_0_20px_rgba(0,0,0,0.6)] shrink-0"
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
                                            onClick={() => router.push(`/home/${entitySegment}`)}
                                            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs text-white/75 hover:text-white hover:bg-white/10 transition-colors text-left"
                                        >
                                            <LayoutGrid className="w-3.5 h-3.5 text-white/60" />
                                            <span>Menú Principal</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => router.push('/home')}
                                            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs text-white/75 hover:text-white hover:bg-white/10 transition-colors text-left"
                                        >
                                            <Home className="w-3.5 h-3.5 text-white/60" />
                                            <span>Todos los Entornos</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => router.push(isPersonal ? '/perfil' : `/home/${entitySegment}/ajustes`)}
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

                                    <div className="pt-2 border-t border-white/10 space-y-0.5">
                                        <p className="px-2.5 py-1 text-[10px] font-semibold text-white/40 uppercase tracking-wider">Módulos</p>
                                        {MENU_OPTIONS.map((item) => {
                                            const Icon = item.icon;
                                            return (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    onClick={() => handleNavigate(item.id)}
                                                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs text-white/75 hover:text-white hover:bg-white/10 transition-colors text-left"
                                                >
                                                    <Icon className="w-3.5 h-3.5 text-white/60" />
                                                    <span>{item.title}</span>
                                                </button>
                                            );
                                        })}
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

                        {/* Divisor superior */}
                        <div className="w-5 h-px bg-white/10 shrink-0 my-0.5" />

                        {/* 2. Las 7 opciones del menú con tooltip y estado activo */}
                        <div className="flex flex-col items-center gap-1.5">
                            {MENU_OPTIONS.map((item) => {
                                const active = isNodeActive(item.id);
                                const Icon = item.icon;
                                const styles = COLOR_STYLES[item.color];

                                return (
                                    <div key={item.id} className="relative group flex items-center justify-center">
                                        <button
                                            type="button"
                                            onClick={() => handleNavigate(item.id)}
                                            className={cn(
                                                "w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer outline-none relative shrink-0",
                                                active
                                                    ? cn("border", styles.active)
                                                    : cn("text-white/60", styles.hover, "hover:scale-105 active:scale-95")
                                            )}
                                            aria-label={item.title}
                                        >
                                            <Icon className={cn("w-4.5 h-4.5 transition-transform duration-200", active ? "scale-110" : "group-hover:scale-110")} />
                                        </button>

                                        {/* Tooltip flotante hacia la izquierda */}
                                        <div className="absolute right-full mr-3 pointer-events-none opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all duration-150 z-[5000] flex items-center">
                                            <div className="bg-[#121316]/95 border border-white/10 px-3 py-1.5 rounded-xl shadow-[0_12px_32px_rgba(0,0,0,0.8)] backdrop-blur-2xl whitespace-nowrap flex flex-col items-start">
                                                <span className="text-xs font-semibold text-white tracking-wide">{item.title}</span>
                                                <span className="text-[10px] text-white/50">{item.subtitle}</span>
                                            </div>
                                            <div className="w-1.5 h-1.5 bg-[#121316] border-r border-t border-white/10 rotate-45 -ml-1" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Divisor inferior */}
                        <div className="w-5 h-px bg-white/10 shrink-0 my-0.5" />

                        {/* 3. Flecha para colapsar */}
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
