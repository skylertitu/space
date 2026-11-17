'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ChevronLeft,
    ChevronRight,
    Square,
    Grid3X3,
    ZoomIn,
    ZoomOut,
    Navigation,
    Maximize2,
    Compass,
    Sun,
    Moon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface WorkspaceRightFloatingBarProps {
    gridType: 'none' | 'dots' | 'lines';
    setGridType: (type: 'none' | 'dots' | 'lines') => void;
    canvasTheme: 'dark' | 'light';
    setCanvasTheme: (theme: 'dark' | 'light' | ((prev: 'dark' | 'light') => 'dark' | 'light')) => void;
    showCartesianPlane: boolean;
    setShowCartesianPlane: (val: boolean | ((prev: boolean) => boolean)) => void;
    zoomIn: () => void;
    zoomOut: () => void;
    setCenter: (x: number, y: number, options?: any) => void;
    fitView: (options?: any) => void;
    isMicActive: boolean;
    setIsMicActive: (val: boolean | ((prev: boolean) => boolean)) => void;
}

export function WorkspaceRightFloatingBar({
    gridType,
    setGridType,
    canvasTheme,
    setCanvasTheme,
    showCartesianPlane,
    setShowCartesianPlane,
    zoomIn,
    zoomOut,
    setCenter,
    fitView,
    isMicActive,
    setIsMicActive
}: WorkspaceRightFloatingBarProps) {
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

    const isLight = canvasTheme === 'light';

    return (
        <div
            ref={containerRef}
            className="fixed right-5 top-1/2 -translate-y-1/2 z-[4000] flex items-center justify-center select-none pointer-events-auto"
        >
            <AnimatePresence mode="wait">
                {!isExpanded ? (
                    <motion.button
                        key="ws-right-trigger"
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10, transition: { duration: 0.1 } }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        whileHover={{ scale: 1.15, x: -2 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsExpanded(true)}
                        className={cn(
                            "flex items-center justify-center p-2 transition-colors cursor-pointer outline-none group",
                            isLight ? "text-black/60 hover:text-black" : "text-white/60 hover:text-white"
                        )}
                        title="Abrir herramientas de lienzo"
                    >
                        <ChevronLeft className="w-4.5 h-4.5 transition-colors" />
                    </motion.button>
                ) : (
                    <motion.div
                        key="ws-right-pill"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20, transition: { duration: 0.12, ease: "easeIn" } }}
                        transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.8 }}
                        className={cn(
                            "backdrop-blur-2xl rounded-full shadow-[0_12px_40px_rgba(0,0,0,0.6)] flex flex-col items-center py-2 px-1.5 gap-1.5 transition-colors",
                            isLight
                                ? "bg-black/[0.06] hover:bg-black/[0.08] text-black"
                                : "bg-white/[0.06] hover:bg-white/[0.08] text-white"
                        )}
                    >
                        {/* 1. Grid Options */}
                        <button
                            type="button"
                            onClick={() => {
                                const nextGrid = gridType === 'none' ? 'dots' : gridType === 'dots' ? 'lines' : 'none';
                                setGridType(nextGrid);
                                toast.info(`Cuadrícula: ${nextGrid === 'none' ? 'Desactivada' : nextGrid === 'dots' ? 'Puntos' : 'Líneas'}`);
                            }}
                            className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer outline-none",
                                isLight
                                    ? (gridType !== 'none' ? "bg-black/15 text-black" : "text-black/60 hover:text-black hover:bg-black/10")
                                    : (gridType !== 'none' ? "bg-white/20 text-white" : "text-white/60 hover:text-white hover:bg-white/10")
                            )}
                            title={`Cuadrícula: ${gridType}`}
                        >
                            {gridType === 'lines' ? <Grid3X3 className="w-4 h-4" /> : gridType === 'dots' ? <div className="font-bold text-base leading-none">·</div> : <Square className="w-4 h-4" />}
                        </button>

                        {/* 2. Zoom In */}
                        <button
                            type="button"
                            onClick={() => zoomIn()}
                            className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer outline-none",
                                isLight ? "text-black/60 hover:text-black hover:bg-black/10" : "text-white/60 hover:text-white hover:bg-white/10"
                            )}
                            title="Acercar (+)"
                        >
                            <ZoomIn className="w-4 h-4" />
                        </button>

                        {/* 3. Zoom Out */}
                        <button
                            type="button"
                            onClick={() => zoomOut()}
                            className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer outline-none",
                                isLight ? "text-black/60 hover:text-black hover:bg-black/10" : "text-white/60 hover:text-white hover:bg-white/10"
                            )}
                            title="Alejar (-)"
                        >
                            <ZoomOut className="w-4 h-4" />
                        </button>

                        {/* 4. Fit View */}
                        <button
                            type="button"
                            onClick={() => fitView({ duration: 800 })}
                            className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer outline-none",
                                isLight ? "text-black/60 hover:text-black hover:bg-black/10" : "text-white/60 hover:text-white hover:bg-white/10"
                            )}
                            title="Ajustar vista"
                        >
                            <Maximize2 className="w-4 h-4" />
                        </button>

                        {/* 5. Center (0,0) */}
                        <button
                            type="button"
                            onClick={() => setCenter(0, 0, { zoom: 1, duration: 800 })}
                            className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer outline-none",
                                isLight ? "text-black/60 hover:text-black hover:bg-black/10" : "text-white/60 hover:text-white hover:bg-white/10"
                            )}
                            title="Ir al origen (0,0)"
                        >
                            <Navigation className="w-4 h-4 -rotate-45" />
                        </button>

                        {/* 6. Cartesian Plane Toggle */}
                        <button
                            type="button"
                            onClick={() => setShowCartesianPlane(prev => !prev)}
                            className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer outline-none",
                                isLight
                                    ? (showCartesianPlane ? "bg-black/15 text-black" : "text-black/60 hover:text-black hover:bg-black/10")
                                    : (showCartesianPlane ? "bg-white/20 text-white" : "text-white/60 hover:text-white hover:bg-white/10")
                            )}
                            title={showCartesianPlane ? "Ocultar Plano Cartesiano" : "Mostrar Plano Cartesiano"}
                        >
                            <Compass className="w-4 h-4" />
                        </button>

                        {/* 7. Theme Mode (Dark/Light) */}
                        <button
                            type="button"
                            onClick={() => setCanvasTheme(prev => prev === 'dark' ? 'light' : 'dark')}
                            className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer outline-none",
                                isLight ? "text-black/60 hover:text-black hover:bg-black/10" : "text-white/60 hover:text-white hover:bg-white/10"
                            )}
                            title={isLight ? "Cambiar a modo Oscuro" : "Cambiar a modo Claro"}
                        >
                            {isLight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                        </button>

                        {/* 8. Voice Button (Solid Blue) */}
                        <button
                            type="button"
                            onClick={() => {
                                setIsMicActive(prev => !prev);
                                toast.info(!isMicActive ? "Modo de voz activado" : "Modo de voz desactivado");
                            }}
                            className={cn(
                                "w-7 h-7 rounded-full bg-blue-600 hover:bg-blue-500 transition-all hover:scale-105 active:scale-95 cursor-pointer outline-none shrink-0",
                                isMicActive && "ring-2 ring-blue-400 animate-pulse shadow-[0_0_15px_rgba(59,130,246,0.8)]"
                            )}
                            title={isMicActive ? "Desactivar voz" : "Activar voz"}
                        />

                        {/* 9. Collapse Arrow */}
                        <button
                            type="button"
                            onClick={() => setIsExpanded(false)}
                            className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer outline-none group",
                                isLight ? "text-black/40 hover:text-black hover:bg-black/10" : "text-white/40 hover:text-white hover:bg-white/10"
                            )}
                            title="Ocultar barra"
                        >
                            <ChevronRight className="w-4.5 h-4.5 transition-colors" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
