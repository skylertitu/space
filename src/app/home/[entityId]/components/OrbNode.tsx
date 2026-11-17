'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { LucideIcon, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface OrbNodeProps {
    href?: string;
    onClick?: () => void;
    icon: LucideIcon;
    title: string;
    subtitle: string;
    color: string;
    isComingSoon?: boolean;
    /** Fuera del plan de la entidad: muestra candado y lleva a mejorar el plan. */
    locked?: boolean;
    lockedHint?: string;
    onLockedClick?: () => void;
}

const shadowColors: Record<string, string> = {
    blue: 'rgba(59, 130, 246, 0.5)',
    emerald: 'rgba(16, 185, 129, 0.5)',
    purple: 'rgba(168, 85, 247, 0.5)',
    slate: 'rgba(100, 116, 139, 0.5)',
    amber: 'rgba(245, 158, 11, 0.5)',
    pink: 'rgba(236, 72, 153, 0.5)',
    rose: 'rgba(244, 63, 94, 0.5)',
    indigo: 'rgba(99, 102, 241, 0.5)',
    orange: 'rgba(249, 115, 22, 0.5)',
};

export const OrbNode = ({ href, onClick, icon: Icon, title, subtitle, color, isComingSoon = false, locked = false, lockedHint, onLockedClick }: OrbNodeProps) => {
    const { activeEntityRoute } = useAuth();
    const finalHref = href?.replace('{entity}', activeEntityRoute || '');

    const handleBlockedClick = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        toast.info(title, {
            description: 'This suite will be available soon in the enterprise environment.',
            duration: 3000,
        });
    };

    const InnerContent = (
        <>
            <motion.div
                className="flex items-center justify-center transition-all duration-500 relative"
                whileHover={!isComingSoon ? {
                    filter: `drop-shadow(0 0 28px ${shadowColors[color] || 'rgba(255,255,255,0.4)'})`,
                    scale: 1.12
                } : undefined}
            >
                <div className="relative flex items-center justify-center p-1">
                    <Icon className={`w-7 h-7 transition-colors duration-500 ${
                        isComingSoon
                            ? 'text-white/30 group-hover:text-white/45'
                            : locked
                                ? 'text-white/40 group-hover:text-white/70'
                                : 'text-white/70 group-hover:text-white'
                    }`} />

                    {locked && !isComingSoon && (
                        <div className="absolute -top-1 -right-1.5 flex items-center justify-center text-white/60 group-hover:text-white transition-colors pointer-events-none select-none z-20">
                            <Lock className="w-3 h-3" />
                        </div>
                    )}

                    {isComingSoon && (
                        <div className="absolute -top-1 -right-1.5 flex items-center justify-center text-white/40 group-hover:text-white/70 transition-colors pointer-events-none select-none z-20">
                            <Lock className="w-3 h-3" />
                        </div>
                    )}
                </div>
            </motion.div>
            <div className="text-center transition-all duration-500">
                <p className={`text-xs font-light uppercase tracking-widest whitespace-nowrap transition-opacity duration-300 ${
                    isComingSoon ? 'text-white/40' : 'text-white opacity-80 group-hover:opacity-100'
                }`}>
                    {title}
                </p>
            </div>
        </>
    );

    if (locked && !isComingSoon) {
        return (
            <button
                type="button"
                onClick={onLockedClick}
                className="group flex flex-col items-center gap-1.5 cursor-pointer outline-none bg-transparent border-none p-0 inline-flex"
                title={lockedHint || `${title}: no incluido en tu plan`}
            >
                {InnerContent}
            </button>
        );
    }

    if (isComingSoon) {
        return (
            <div
                role="button"
                tabIndex={0}
                onClick={handleBlockedClick}
                className="group flex flex-col items-center gap-1.5 cursor-not-allowed select-none outline-none"
                title={`${title}: Próximamente`}
            >
                {InnerContent}
            </div>
        );
    }

    if (finalHref && finalHref !== '#') {
        return (
            <Link href={finalHref} className="group flex flex-col items-center gap-1.5">
                {InnerContent}
            </Link>
        );
    }

    return (
        <button onClick={onClick} className="group flex flex-col items-center gap-1.5 cursor-pointer outline-none bg-transparent border-none p-0 inline-flex">
            {InnerContent}
        </button>
    );
};

