'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Home, ChevronRight, LayoutGrid } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface MobileHeaderProps {
    title: string;
    layers: any[];
    onLayerClick: (layer: any) => void;
    onHomeClick: () => void;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({ title, layers, onLayerClick, onHomeClick }) => {
    const [isOpen, setIsOpen] = useState(false);
    const router = useRouter();

    return (
        <div className="md:hidden fixed top-0 left-0 right-0 z-[100] px-3 py-4 pointer-events-none">
            {/* Main Pill Header - Refined according to reference image */}
            <div className="flex items-center justify-between pointer-events-auto bg-[#050505]/95 backdrop-blur-3xl border border-white/10 rounded-xl h-14 px-4 shadow-[0_10px_40px_rgba(0,0,0,0.8)]">
                <button 
                    onClick={() => setIsOpen(true)}
                    className="p-2 -ml-1 text-white/70 hover:text-white transition-colors active:scale-95"
                >
                    <Menu size={22} strokeWidth={1.5} />
                </button>
                
                <h2 className="text-[10px] font-bold tracking-[0.3em] uppercase text-white text-center flex-1 truncate px-2">
                    {title}
                </h2>

                <button 
                    onClick={onHomeClick}
                    className="p-2 -mr-1 text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-all active:scale-95"
                >
                    <Home size={20} strokeWidth={1.5} />
                </button>
            </div>

            {/* Sidebar Menu - Premium Glass Style */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsOpen(false)}
                            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[110] pointer-events-auto"
                        />
                        <motion.div 
                            initial={{ x: '-100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '-100%' }}
                            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                            className="fixed top-0 left-0 bottom-0 w-[85vw] bg-[#050505] border-r border-white/5 z-[120] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] flex flex-col pointer-events-auto shadow-[30px_0_60px_rgba(0,0,0,0.7)]"
                        >
                            <div className="flex items-center justify-between mb-12">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 bg-cyan-500/10 border border-cyan-500/30 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.1)]">
                                        <LayoutGrid size={20} className="text-cyan-400" strokeWidth={1.5} />
                                    </div>
                                    <span className="text-xl font-light tracking-[0.2em] text-white">ELIZMEY</span>
                                </div>
                                <button 
                                    onClick={() => setIsOpen(false)}
                                    className="p-2 text-white/30 hover:text-white transition-colors"
                                >
                                    <X size={24} strokeWidth={1.5} />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar -mx-2 px-2">
                                <div className="space-y-1">
                                    <p className="text-[9px] font-bold text-white/20 uppercase tracking-[0.3em] mb-4 ml-3">Navigation</p>
                                    <button 
                                        onClick={() => {
                                            onHomeClick();
                                            setIsOpen(false);
                                        }}
                                        className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 transition-all group"
                                    >
                                        <div className="p-2.5 rounded-xl bg-white/5 text-white/40 group-hover:bg-cyan-500 group-hover:text-black transition-all">
                                            <Home size={20} strokeWidth={1.5} />
                                        </div>
                                        <span className="text-sm font-medium text-white/60 group-hover:text-white transition-colors">Go to Core</span>
                                        <ChevronRight size={16} className="ml-auto opacity-0 group-hover:opacity-100 text-cyan-400" />
                                    </button>
                                </div>

                                <div className="mt-10 space-y-1">
                                    <p className="text-[9px] font-bold text-white/20 uppercase tracking-[0.3em] mb-4 ml-3">Active Modules</p>
                                    {layers.map((layer) => (
                                        <button 
                                            key={layer.id}
                                            onClick={() => {
                                                onLayerClick(layer);
                                                setIsOpen(false);
                                            }}
                                            className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 transition-all group"
                                        >
                                            <div className="p-2.5 rounded-xl bg-white/5 text-white/30 group-hover:bg-white/10 group-hover:text-cyan-400 transition-all border border-transparent group-hover:border-white/10">
                                                {React.createElement(layer.icon, { size: 20, strokeWidth: 1.5 })}
                                            </div>
                                            <span className="text-sm font-medium text-white/60 group-hover:text-white transition-colors text-left">{layer.label}</span>
                                            <ChevronRight size={16} className="ml-auto opacity-0 group-hover:opacity-100 text-cyan-400" />
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-auto pt-6 border-t border-white/5">
                                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                                    <div>
                                        <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest mb-0.5">elizmey</p>
                                        <p className="text-[10px] text-cyan-500/70 font-medium">System v2.4.1 Active</p>
                                    </div>
                                    <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};
