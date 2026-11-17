'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Edit2, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LeftFloatingBarProps {
    managementMode: boolean;
    onToggleManagement: () => void;
    onLogout: () => void;
}

export function LeftFloatingBar({
    managementMode,
    onToggleManagement,
    onLogout
}: LeftFloatingBarProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

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

    return (
        <div
            ref={containerRef}
            className="fixed left-5 top-1/2 -translate-y-1/2 z-[4000] flex items-center justify-center select-none pointer-events-auto"
        >
            <AnimatePresence mode="wait">
                {!isExpanded ? (
                    <motion.button
                        key="left-trigger"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10, transition: { duration: 0.1 } }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        whileHover={{ scale: 1.15, x: 2 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsExpanded(true)}
                        className="flex items-center justify-center p-2 text-white/60 hover:text-white transition-colors cursor-pointer outline-none group"
                        title="Abrir opciones"
                    >
                        <ChevronRight className="w-4.5 h-4.5 text-white/60 group-hover:text-white transition-colors" />
                    </motion.button>
                ) : (
                    <motion.div
                        key="left-pill"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20, transition: { duration: 0.12, ease: "easeIn" } }}
                        transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.8 }}
                        className="bg-white/[0.06] hover:bg-white/[0.08] backdrop-blur-2xl rounded-full shadow-[0_12px_40px_rgba(0,0,0,0.6)] flex flex-col items-center py-2 px-1.5 gap-1.5 transition-colors"
                    >
                        {/* 1. Editar los perfiles creados */}
                        <button
                            type="button"
                            onClick={onToggleManagement}
                            className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all active:scale-95 cursor-pointer outline-none",
                                managementMode && "bg-white/20 text-white"
                            )}
                            title={managementMode ? "Salir de edición de perfiles" : "Editar perfiles creados"}
                        >
                            <Edit2 className="w-4 h-4" />
                        </button>

                        {/* Sign out Icon */}
                        <button
                            type="button"
                            onClick={onLogout}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all active:scale-95 cursor-pointer outline-none"
                            title="Cerrar sesión"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>

                        {/* Collapse Arrow */}
                        <button
                            type="button"
                            onClick={() => setIsExpanded(false)}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all active:scale-95 cursor-pointer outline-none group"
                            title="Ocultar barra"
                        >
                            <ChevronLeft className="w-4.5 h-4.5 text-white/50 group-hover:text-white transition-colors" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
