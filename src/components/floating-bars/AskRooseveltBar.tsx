'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Plus,
    ChevronUp,
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
    Check
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function AskRooseveltBar() {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [showMoreUploads, setShowMoreUploads] = useState(false);
    const [selectedModel, setSelectedModel] = useState<'Flash' | 'Pro' | 'Orchestrator'>('Flash');
    const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input when bar opens
    useEffect(() => {
        if (isExpanded) {
            setTimeout(() => inputRef.current?.focus(), 250);
        }
    }, [isExpanded]);

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

    return (
        <div 
            ref={containerRef}
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[4000] flex items-center justify-center select-none pointer-events-auto"
        >
            <AnimatePresence mode="wait">
                {/* 1. Trigger Arrow Button */}
                {!isExpanded ? (
                    <motion.button
                        key="trigger-arrow"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10, transition: { duration: 0.1 } }}
                        whileHover={{ scale: 1.15, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        onClick={() => setIsExpanded(true)}
                        className="flex items-center justify-center p-2 text-white/60 hover:text-white transition-colors cursor-pointer outline-none group"
                        title="Abrir Ask elizmey"
                    >
                        <ChevronUp className="w-4.5 h-4.5 text-white/60 group-hover:text-white transition-colors" />
                    </motion.button>
                ) : (
                    /* 2. Floating Pill Bar */
                    <motion.div
                        key="pill-bar"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20, transition: { duration: 0.12, ease: "easeIn" } }}
                        transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.8 }}
                        className="relative w-[92vw] max-w-2xl h-14 bg-white/[0.06] hover:bg-white/[0.08] backdrop-blur-2xl rounded-full shadow-[0_12px_40px_rgba(0,0,0,0.6)] flex items-center px-3.5 gap-2 transition-colors"
                    >
                        {/* Action Button (+) */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsMenuOpen(!isMenuOpen);
                                    setShowMoreUploads(false);
                                    setIsModelMenuOpen(false);
                                }}
                                className={cn(
                                    'w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all active:scale-90',
                                    isMenuOpen && 'bg-white/15 text-white'
                                )}
                                title="Opciones"
                            >
                                <Plus className={cn("w-5 h-5 transition-transform duration-200", isMenuOpen && "rotate-45")} />
                            </button>

                            {/* Popup Menu (1:1 Replica of Image 2) */}
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
                                            {/* Upload files */}
                                            <button
                                                type="button"
                                                onClick={() => setIsMenuOpen(false)}
                                                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-light text-white/80 hover:text-white hover:bg-white/10 transition-colors text-left"
                                            >
                                                <Paperclip className="w-4 h-4 text-white/70" />
                                                <span>Upload files</span>
                                            </button>

                                            {/* Add from Drive */}
                                            <button
                                                type="button"
                                                onClick={() => setIsMenuOpen(false)}
                                                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-light text-white/80 hover:text-white hover:bg-white/10 transition-colors text-left"
                                            >
                                                <FolderGit2 className="w-4 h-4 text-white/70" />
                                                <span>Add from Drive</span>
                                            </button>

                                            {/* More uploads > */}
                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowMoreUploads(!showMoreUploads)}
                                                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-light text-white/80 hover:text-white hover:bg-white/10 transition-colors text-left"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <MoreHorizontal className="w-4 h-4 text-white/70" />
                                                        <span>More uploads</span>
                                                    </div>
                                                    <ChevronRight className={cn("w-3.5 h-3.5 text-white/40 transition-transform", showMoreUploads && "rotate-90 sm:rotate-0")} />
                                                </button>

                                                {/* Submenu for More Uploads */}
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
                                                                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/85 hover:text-white hover:bg-white/10 transition-colors text-left"
                                                            >
                                                                <ImageIcon className="w-4 h-4 text-white/70" />
                                                                <span>Photos</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => { setIsMenuOpen(false); setShowMoreUploads(false); }}
                                                                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/85 hover:text-white hover:bg-white/10 transition-colors text-left"
                                                            >
                                                                <Smile className="w-4 h-4 text-white/70" />
                                                                <span>Avatar</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => { setIsMenuOpen(false); setShowMoreUploads(false); }}
                                                                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/85 hover:text-white hover:bg-white/10 transition-colors text-left"
                                                            >
                                                                <Code2 className="w-4 h-4 text-white/70" />
                                                                <span>Import code</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => { setIsMenuOpen(false); setShowMoreUploads(false); }}
                                                                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-white/85 hover:text-white hover:bg-white/10 transition-colors text-left"
                                                            >
                                                                <BookOpen className="w-4 h-4 text-white/70" />
                                                                <span>Notebooks</span>
                                                            </button>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>

                                            {/* Divider */}
                                            <div className="h-px bg-white/10 my-1" />

                                            {/* Create image (With blue dot indicator) */}
                                            <button
                                                type="button"
                                                onClick={() => setIsMenuOpen(false)}
                                                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-light text-white/80 hover:text-white hover:bg-white/10 transition-colors text-left"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <Palette className="w-4 h-4 text-white/70" />
                                                    <span>Create image</span>
                                                </div>
                                                <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
                                            </button>

                                            {/* Create video */}
                                            <button
                                                type="button"
                                                onClick={() => setIsMenuOpen(false)}
                                                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-light text-white/80 hover:text-white hover:bg-white/10 transition-colors text-left"
                                            >
                                                <Video className="w-4 h-4 text-white/70" />
                                                <span>Create video</span>
                                            </button>

                                            {/* Create music */}
                                            <button
                                                type="button"
                                                onClick={() => setIsMenuOpen(false)}
                                                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-light text-white/80 hover:text-white hover:bg-white/10 transition-colors text-left"
                                            >
                                                <Music className="w-4 h-4 text-white/70" />
                                                <span>Create music</span>
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Central Input / Placeholder ("Ask Roosevelt") */}
                        <input
                            ref={inputRef}
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Ask elizmey"
                            className="flex-1 bg-transparent border-none outline-none focus:ring-0 text-sm text-white/90 placeholder:text-white/40 font-light px-2 selection:bg-blue-600/30"
                        />

                        {/* Model Dropdown Selector ("Flash ⌵") */}
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setIsModelMenuOpen(!isModelMenuOpen)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-white/10 text-xs font-light text-white/70 hover:text-white transition-all cursor-pointer"
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
                                        className="absolute bottom-11 right-0 w-36 bg-neutral-950/45 border border-white/15 backdrop-blur-3xl rounded-2xl shadow-xl p-1.5 z-50 space-y-0.5"
                                    >
                                        {(['Flash', 'Pro', 'Orchestrator'] as const).map((m) => (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedModel(m);
                                                    setIsModelMenuOpen(false);
                                                }}
                                                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                                            >
                                                <span>{m}</span>
                                                {selectedModel === m && <Check className="w-3 h-3 text-cyan-400" />}
                                            </button>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Botón Circular: Azul sólido sin difuminado ni gradiente */}
                        <button
                            type="button"
                            className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-500 transition-all duration-200 hover:scale-105 active:scale-95 shrink-0 border-0 outline-none cursor-pointer"
                            title="elizmey"
                        />

                        {/* Botón para ocultar barra: Integrada literalmente dentro de la barra */}
                        <button
                            type="button"
                            onClick={() => {
                                setIsExpanded(false);
                                setIsMenuOpen(false);
                                setIsModelMenuOpen(false);
                            }}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all active:scale-90 cursor-pointer outline-none shrink-0 group"
                            title="Ocultar barra"
                        >
                            <ChevronDown className="w-4.5 h-4.5 text-white/50 group-hover:text-white transition-colors" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
