import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, ChevronDown, ChevronUp, Sparkles, Loader2, Circle, CheckCircle2 } from 'lucide-react';
import { ChatStep } from '../types';

interface ReasoningBlockProps {
    content: string;
    steps?: ChatStep[];
    thinkingTime?: number;
    isGenerating?: boolean;
    msgId?: string;
    approved?: boolean;
}

export const ReasoningBlock = ({ content, steps = [], thinkingTime, isGenerating, msgId, approved }: ReasoningBlockProps) => {
    // Helper to strip <think> tags from content
    const cleanContent = (text: string) => {
        return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    };

    const hasOtherContent = cleanContent(content).length > 0;
    const [isExpanded, setIsExpanded] = useState(!hasOtherContent);

    const isError = content.includes("🚨") || content.includes("⚠️") || content.includes("⏳") || content.startsWith("Error:");

    // Extract content inside <think> tags
    const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/);
    const reasoningText = thinkMatch ? thinkMatch[1].trim() : "";

    if (!reasoningText && (!steps || steps.length === 0) && !isGenerating) return null;

    const laboralSteps = steps.filter(s => s.type === 'laboral' || !s.type);
    const proximoSteps = steps.filter(s => s.type === 'proximo');

    return (
        <div className="mb-4 w-full">
            {/* Thinking Time & Header */}
            <div 
                className="flex items-center justify-between gap-2 mb-2 px-1 cursor-pointer group"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className={`flex items-center gap-2 ${isError ? 'text-red-500' : 'text-blue-400/80'}`}>
                    {isGenerating ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                    ) : isError ? (
                        <Circle className="w-3 h-3 fill-current animate-pulse" />
                    ) : (
                        <Brain className="w-3 h-3" />
                    )}
                    <span className="text-[10px] font-bold tracking-widest uppercase opacity-70">
                        {isGenerating 
                            ? "Arquitecto SI Pensando..." 
                            : isError 
                                ? "Fallo en el Proceso de Análisis" 
                                : `Análisis Completado (${thinkingTime || 0}s)`}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {steps.length > 0 && (
                        <div className="flex -space-x-1">
                            {steps.slice(0, 3).map((s, i) => (
                                <div key={i} className={`w-1.5 h-1.5 rounded-full border border-black ${s.status === 'done' ? 'bg-green-500' : s.status === 'current' ? 'bg-blue-500 animate-pulse' : 'bg-gray-700'}`} />
                            ))}
                        </div>
                    )}
                    {isExpanded ? <ChevronUp className="w-3 h-3 text-gray-600" /> : <ChevronDown className="w-3 h-3 text-gray-600" />}
                </div>
            </div>

            <AnimatePresence>
                {(isExpanded || isGenerating) && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="p-3 bg-[#0c0c0e] border border-[#1a1a1a] rounded-xl space-y-3 mb-2 shadow-inner">
                            {/* Steps List */}
                            {steps.length > 0 && (
                                <div className="space-y-2">
                                    {steps.map((step, idx) => (
                                        <div key={idx} className="flex items-center gap-3 group/step">
                                            <div className="relative flex items-center justify-center">
                                                {step.status === 'done' ? (
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                                                ) : step.status === 'current' ? (
                                                    <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />
                                                ) : (
                                                    <Circle className="w-3.5 h-3.5 text-gray-800" />
                                                )}
                                            </div>
                                            <span className={`text-[11px] font-medium transition-colors ${step.status === 'done' ? 'text-gray-400' : step.status === 'current' ? 'text-blue-400' : 'text-gray-600'}`}>
                                                {step.label}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Reasoning Text */}
                            {reasoningText && (
                                <div className="pt-2 border-t border-[#1a1a1a]">
                                    <p className="text-[10px] text-gray-500 leading-relaxed italic font-serif">
                                        "{reasoningText.length > 150 && !isExpanded ? reasoningText.substring(0, 150) + '...' : reasoningText}"
                                    </p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

