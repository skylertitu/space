import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, NodeProps } from 'reactflow';
import { X, Minus, Square, Maximize2, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export const WindowNode = ({ data, xPos, yPos }: NodeProps) => {
    const [isMaximized, setIsMaximized] = useState(data.initialMaximized || false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [isClosing, setIsClosing] = useState(false);

    useEffect(() => {
        setMounted(true);
        return () => setMounted(false);
    }, []);

    useEffect(() => {
        if (data.initialMaximized) {
            setIsMaximized(true);
        }
    }, [data.initialMaximized]);

    useEffect(() => {
        if (isMaximized && data.url) {
            window.history.replaceState(null, '', data.url);
        } else if (!isMaximized && mounted) {
            const pathParts = window.location.pathname.split('/');
            const entityId = pathParts[2];
            const role = new URLSearchParams(window.location.search).get('role') || 'ceo';
            const workspaceUrl = `/home/${entityId}/workspace?role=${role}`;
            window.history.replaceState(null, '', workspaceUrl);
        }
    }, [isMaximized, data.url, mounted]);

    const handleClose = () => {
        setIsClosing(true);
        if (isMaximized) {
            const pathParts = window.location.pathname.split('/');
            const entityId = pathParts[2];
            const role = new URLSearchParams(window.location.search).get('role') || 'ceo';
            const workspaceUrl = `/home/${entityId}/workspace?role=${role}`;
            window.history.replaceState(null, '', workspaceUrl);
        }
        setTimeout(() => {
            data.onClose?.();
        }, 500);
    };

    // Calcular desplazamiento desde el origen
    const originX = data.origin?.x ?? 0;
    const originY = data.origin?.y ?? 0;
    const deltaX = originX - xPos;
    const deltaY = originY - yPos;

    const content = (
        <motion.div 
            initial={{ 
                opacity: 0, 
                scale: 0.2, 
                x: deltaX, 
                y: deltaY,
                filter: 'blur(20px)'
            }}
            animate={isClosing ? { 
                opacity: 0, 
                scale: 0, 
                x: deltaX, 
                y: deltaY,
                filter: 'blur(30px)'
            } : { 
                opacity: 1, 
                scale: isMinimized ? 0.3 : 1, 
                x: 0, 
                y: 0,
                filter: 'blur(0px)'
            }}
            transition={{
                type: 'spring',
                stiffness: isClosing ? 200 : 350,
                damping: isClosing ? 25 : 28,
                restDelta: 0.001,
                opacity: { duration: 0.15 }
            }}
            className={cn(
                "bg-[#0A0A0A]/95 backdrop-blur-3xl border border-white/10 flex flex-col overflow-hidden pointer-events-auto transition-all duration-300 relative group",
                isMinimized 
                    ? "w-[240px] sm:w-[300px] h-[48px] rounded-t-2xl rounded-b-none shadow-lg" 
                    : isMaximized 
                        ? "fixed inset-0 w-screen h-screen z-[9999] rounded-none shadow-none" 
                        : "w-[95vw] sm:w-[1400px] h-[85vh] sm:h-[880px] rounded-2xl shadow-[0_30px_80px_rgba(0,0,0,0.8)] border-white/10"
            )}
            style={isMaximized ? { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100dvh' } : {}}
        >
            {/* Top Bar */}
            <div className={cn(
                "w-full h-12 border-b border-white/5 bg-[#0D0F14]/90 backdrop-blur-md flex items-center px-4 justify-between cursor-grab active:cursor-grabbing shrink-0 z-50 transition-all duration-500 relative",
                "custom-drag-handle"
            )}>
                {/* Esquina Izquierda: Botón X de cerrar en color blanco */}
                <div className="flex items-center gap-1 w-[140px] justify-start shrink-0">
                    <button 
                        onClick={(e) => { e.stopPropagation(); handleClose(); }}
                        className="p-1.5 hover:bg-white/10 rounded-lg transition-colors group"
                        title="Cerrar"
                    >
                        <X className="w-4 h-4 text-white group-hover:text-white/80 transition-colors" />
                    </button>
                </div>

                {/* Centro: Título de la lámina */}
                <div className="flex items-center justify-center flex-1">
                    <span className="text-white/90 font-light tracking-[0.2em] text-xs whitespace-nowrap uppercase">
                        {data.label ? data.label.charAt(0).toUpperCase() + data.label.slice(1).toLowerCase() : ''}
                    </span>
                </div>

                {/* Esquina Derecha: Botón de abrir en nueva pestaña */}
                <div className="flex items-center gap-1 w-[140px] justify-end shrink-0">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            window.open(data.url, '_blank');
                        }}
                        className="p-1.5 hover:bg-white/10 rounded-lg transition-colors group"
                        title="Abrir en pestaña nueva"
                    >
                        <ExternalLink className="w-4 h-4 text-white/70 group-hover:text-white transition-colors" />
                    </button>
                </div>
            </div>
            
            {/* Contenido con Scroll Independiente */}
            <div className={cn("w-full relative z-0 nodrag cursor-auto", isMinimized ? "h-0 hidden" : "flex-1 bg-black/50 overflow-hidden")}>
                {!isMinimized && (
                    <iframe src={data.url} className="w-full h-full border-none pointer-events-auto" />
                )}
            </div>

            <Handle type="target" position={Position.Left} className="opacity-0" />
        </motion.div>
    );

    if (!mounted) return null;

    return isMaximized 
        ? createPortal(content, document.body)
        : (
            <>
                {content}
                <Handle type="target" position={Position.Left} className="opacity-0" />
            </>
        );
};
