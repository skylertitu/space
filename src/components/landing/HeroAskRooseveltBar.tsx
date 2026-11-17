'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus,
    ChevronDown,
    Paperclip,
    FolderGit2,
    MoreHorizontal,
    ChevronRight,
    Image as ImageIcon,
    Smile,
    Code2,
    BookOpen,
    Video,
    Music,
    Palette,
    SendHorizontal
} from 'lucide-react';
import { cn } from '@/lib/utils';

const MODELS = ['Aether', 'Synapse', 'Logos', 'Chronos', 'Mentis'] as const;

export function HeroAskRooseveltBar() {
    const router = useRouter();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [showMoreUploads, setShowMoreUploads] = useState(false);
    const [selectedModel, setSelectedModel] = useState<(typeof MODELS)[number]>('Aether');
    const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');

    const containerRef = useRef<HTMLDivElement>(null);

    // Close menus when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsMenuOpen(false);
                setShowMoreUploads(false);
                setIsModelMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        router.push('/login?register=true');
    };

    return (
        <div ref={containerRef} className="relative w-full max-w-3xl">
            <form
                onSubmit={handleSubmit}
                className="relative w-full h-14 md:h-[68px] bg-white/[0.06] hover:bg-white/[0.08] backdrop-blur-2xl rounded-full shadow-[0_12px_40px_rgba(0,0,0,0.6)] flex items-center pl-3 md:pl-4 pr-2 md:pr-2.5 gap-1 md:gap-2 transition-colors border border-white/5"
            >
                {/* Action Button (+) */}
                <div className="relative shrink-0">
                    <button
                        type="button"
                        onClick={() => {
                            setIsMenuOpen(!isMenuOpen);
                            setShowMoreUploads(false);
                            setIsModelMenuOpen(false);
                        }}
                        className={cn(
                            'w-10 h-10 md:w-8 md:h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all active:scale-90 cursor-pointer',
                            isMenuOpen && 'bg-white/15 text-white'
                        )}
                        title="Opciones"
                    >
                        <Plus className={cn("w-5 h-5 transition-transform duration-200", isMenuOpen && "rotate-45")} />
                    </button>

                    {/* Popup Menu */}
                    <AnimatePresence>
                        {isMenuOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: 12, scale: 0.94, filter: 'blur(8px)' }}
                                animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                                exit={{ opacity: 0, y: 8, scale: 0.95, filter: 'blur(6px)' }}
                                transition={{ type: 'spring', damping: 25, stiffness: 380 }}
                                className="absolute bottom-12 left-0 w-60 bg-neutral-950/45 border border-white/15 backdrop-blur-3xl rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.12)] p-1.5 z-[60] overflow-visible"
                            >
                                <div className="space-y-0.5">
                                    <button
                                        type="button"
                                        onClick={() => setIsMenuOpen(false)}
                                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-light text-white/80 hover:text-white hover:bg-white/10 transition-colors text-left cursor-pointer"
                                    >
                                        <Paperclip className="w-4 h-4 text-white/70" />
                                        <span>Upload files</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setIsMenuOpen(false)}
                                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-light text-white/80 hover:text-white hover:bg-white/10 transition-colors text-left cursor-pointer"
                                    >
                                        <FolderGit2 className="w-4 h-4 text-white/70" />
                                        <span>Add from Drive</span>
                                    </button>

                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => setShowMoreUploads(!showMoreUploads)}
                                            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-light text-white/80 hover:text-white hover:bg-white/10 transition-colors text-left cursor-pointer"
                                        >
                                            <div className="flex items-center gap-3">
                                                <MoreHorizontal className="w-4 h-4 text-white/70" />
                                                <span>More uploads</span>
                                            </div>
                                            <ChevronRight className={cn("w-3.5 h-3.5 text-white/40 transition-transform", showMoreUploads && "rotate-90 sm:rotate-0")} />
                                        </button>

                                        <AnimatePresence>
                                            {showMoreUploads && (
                                                <motion.div
                                                    initial={{ opacity: 0, x: 8 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    exit={{ opacity: 0, x: 8 }}
                                                    className="sm:absolute sm:left-full sm:bottom-0 sm:ml-2 mt-1 sm:mt-0 w-48 bg-neutral-950/45 border border-white/15 backdrop-blur-3xl rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.12)] p-1.5 z-[70] space-y-0.5"
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => { setIsMenuOpen(false); setShowMoreUploads(false); }}
                                                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/85 hover:text-white hover:bg-white/10 transition-colors text-left cursor-pointer"
                                                    >
                                                        <ImageIcon className="w-4 h-4 text-white/70" />
                                                        <span>Photos</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setIsMenuOpen(false); setShowMoreUploads(false); }}
                                                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/85 hover:text-white hover:bg-white/10 transition-colors text-left cursor-pointer"
                                                    >
                                                        <Smile className="w-4 h-4 text-white/70" />
                                                        <span>Avatar</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setIsMenuOpen(false); setShowMoreUploads(false); }}
                                                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/85 hover:text-white hover:bg-white/10 transition-colors text-left cursor-pointer"
                                                    >
                                                        <Code2 className="w-4 h-4 text-white/70" />
                                                        <span>Import code</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setIsMenuOpen(false); setShowMoreUploads(false); }}
                                                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/85 hover:text-white hover:bg-white/10 transition-colors text-left cursor-pointer"
                                                    >
                                                        <BookOpen className="w-4 h-4 text-white/70" />
                                                        <span>Notebooks</span>
                                                    </button>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    <div className="h-px bg-white/10 my-1" />

                                    <button
                                        type="button"
                                        onClick={() => setIsMenuOpen(false)}
                                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-light text-white/80 hover:text-white hover:bg-white/10 transition-colors text-left cursor-pointer"
                                    >
                                        <div className="flex items-center gap-3">
                                            <Palette className="w-4 h-4 text-white/70" />
                                            <span>Create image</span>
                                        </div>
                                        <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setIsMenuOpen(false)}
                                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-light text-white/80 hover:text-white hover:bg-white/10 transition-colors text-left cursor-pointer"
                                    >
                                        <Video className="w-4 h-4 text-white/70" />
                                        <span>Create video</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setIsMenuOpen(false)}
                                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-light text-white/80 hover:text-white hover:bg-white/10 transition-colors text-left cursor-pointer"
                                    >
                                        <Music className="w-4 h-4 text-white/70" />
                                        <span>Create music</span>
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Central Input / Placeholder ("Ask elizmey") */}
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Ask elizmey"
                    className="flex-1 min-w-0 w-full bg-transparent border-none outline-none focus:ring-0 text-base text-white/90 placeholder:text-white/40 font-semibold px-2 selection:bg-blue-600/30"
                />

                {/* Model Dropdown Selector ("Flash ⌵") */}
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
                        className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 rounded-full shrink-0 hover:bg-white/10 text-xs font-semibold text-white/70 hover:text-white transition-all cursor-pointer"
                    >
                        <span>{selectedModel}</span>
                        <ChevronDown className="w-3.5 h-3.5 text-white/50" />
                    </button>

                    <AnimatePresence>
                        {isModelMenuOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                className="absolute bottom-11 right-0 w-36 bg-neutral-950/45 border border-white/15 backdrop-blur-3xl rounded-2xl shadow-xl p-1 z-50 space-y-0"
                            >
                                {MODELS.map((m) => (
                                    <button
                                        key={m}
                                        type="button"
                                        onClick={() => {
                                            setSelectedModel(m);
                                            setIsModelMenuOpen(false);
                                        }}
                                        className="w-full flex items-center justify-between px-2.5 py-1 rounded-lg text-xs text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                                    >
                                        <span>{m}</span>
                                        {selectedModel === m && <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.8)]" />}
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Botón blanco: enviar (avión de papel) */}
                <button
                    type="submit"
                    aria-label="Enviar"
                    title="Enviar"
                    className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white hover:bg-white/90 text-black flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 shrink-0 border-0 outline-none cursor-pointer"
                >
                    <SendHorizontal className="w-5 h-5 md:w-6 md:h-6" strokeWidth={2.25} />
                </button>

                {/* Botón Circular: Azul sólido (grabar) */}
                <button
                    type="button"
                    className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-blue-600 hover:bg-blue-500 transition-all duration-200 hover:scale-105 active:scale-95 shrink-0 border-0 outline-none cursor-pointer"
                    title="elizmey"
                />
            </form>
        </div>
    );
}
