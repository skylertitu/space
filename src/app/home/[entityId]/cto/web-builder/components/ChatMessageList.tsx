import React, { useRef, useEffect } from "react";
import { ChatMessage, ChatStep } from "../types";
import { Check, CheckCircle2, ChevronRight, Loader2, Sparkles, Copy, RotateCcw } from "lucide-react";
import { PlanCard } from "./PlanCard";
import { ReasoningBlock } from "./ReasoningBlock";
import { CloudSetupCard } from "./CloudSetupCard";
import { toast } from "sonner";

interface ChatMessageListProps {
    messages: ChatMessage[];
    isGenerating: boolean;
    statusMessage?: string;
}

export const ChatMessageList = ({ messages, isGenerating, statusMessage }: ChatMessageListProps) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isGenerating]);

    // Helper to strip <think> tags from content
    const cleanContent = (content: string) => {
        return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    };

    return (
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar scroll-smooth">
            {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6 opacity-30 select-none grayscale">
                    <div className="w-16 h-16 bg-[#111] rounded-[2rem] flex items-center justify-center mb-6 border border-[#222]">
                        <Sparkles className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-sm font-bold text-white mb-2 uppercase tracking-widest">Web Builder SI</h3>
                    <p className="text-[11px] text-gray-400 leading-relaxed max-w-[200px]">Empieza una conversación para generar el código de tu sitio web.</p>
                </div>
            ) : (
                messages.map((msg, idx) => (
                    <div key={msg.id} className={`group flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                        <div className="relative max-w-[100%]">
                            <div className={`rounded-2xl ${msg.role === 'user'
                                ? 'bg-blue-600 text-white rounded-tr-none p-3 shadow-sm'
                                : 'bg-transparent text-gray-200'
                                }`}>

                                {/* Reasoning Block - Only show if it's a complex task or has thinking content */}
                                {msg.role === 'ai' && (msg.plan || msg.content.includes("<think>")) && (
                                    <ReasoningBlock
                                        content={msg.content}
                                        steps={msg.steps}
                                        thinkingTime={msg.thinkingTime}
                                        isGenerating={isGenerating && idx === messages.length - 1}
                                        msgId={msg.id}
                                        approved={msg.approved}
                                    />
                                )}

                                {/* Message Content */}
                                <div className={msg.role === 'ai' && msg.steps?.some(s => s.status === 'current') ? 'opacity-50 blur-[0.5px]' : ''}>
                                    {(() => {
                                        if (msg.plan && !msg.approved) return null;

                                        const cleaned = msg.role === 'ai' ? cleanContent(msg.content) : msg.content.trim();
                                        
                                        if (cleaned === "" && (!msg.images || msg.images.length === 0)) {
                                            return null;
                                        }

                                        const isError = cleaned.includes("🚨") || cleaned.includes("⚠️") || cleaned.includes("⏳") || cleaned.startsWith("Error:");

                                        return (
                                            <div className={isError ? "p-3 bg-red-500/10 border border-red-500/20 rounded-xl my-2" : ""}>
                                                {cleaned.split('\n').map((line, i) => (
                                                    <p key={i} className={`text-xs mb-1.5 last:mb-0 leading-relaxed min-h-[1em] ${isError ? 'text-red-200' : ''}`}>
                                                        {line}
                                                    </p>
                                                ))}
                                            </div>
                                        );
                                    })()}

                                    {/* Images Grid */}
                                    {msg.images && msg.images.length > 0 && (
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {msg.images.map((url, i) => (
                                                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-white/10 shadow-lg group/img">
                                                    <img
                                                        src={url}
                                                        className="w-full h-full object-cover transition-transform group-hover/img:scale-110 cursor-pointer"
                                                        alt="user-upload"
                                                        onClick={() => window.open(url, '_blank')}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* PLAN CARD */}
                                    {msg.plan && !msg.approved && (
                                        <PlanCard
                                            plan={msg.plan}
                                            onApprove={() => window.dispatchEvent(new CustomEvent('approve-plan', { detail: { msgId: msg.id } }))}
                                            onReject={() => window.dispatchEvent(new CustomEvent('reject-plan', { detail: { msgId: msg.id } }))}
                                        />
                                    )}

                                    {/* CLOUD SETUP CARD */}
                                    {msg.showCloudSetup && (
                                        <CloudSetupCard
                                            onApprove={(config) => window.dispatchEvent(new CustomEvent('approve-cloud', { detail: { msgId: msg.id, config } }))}
                                            onCancel={() => window.dispatchEvent(new CustomEvent('reject-cloud', { detail: { msgId: msg.id } }))}
                                        />
                                    )}

                                </div>
                            </div>

                            {/* HOVER ACTIONS (Copy / Resend) */}
                            <div className={`absolute -bottom-6 ${msg.role === 'user' ? 'right-0' : 'left-0'} flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10 pt-1`}>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(msg.content);
                                        toast.success("Mensaje copiado");
                                    }}
                                    className="p-1.5 bg-[#0a0a0c] border border-[#1a1a1a] rounded-lg hover:bg-[#151518] hover:border-blue-500/50 transition-all group/btn shadow-xl"
                                    title="Copiar mensaje"
                                >
                                    <Copy className="w-3 h-3 text-gray-500 group-hover/btn:text-blue-400 transition-colors" />
                                </button>

                                {(msg.role === 'ai' && (msg.content.toLowerCase().includes('error') || msg.content.toLowerCase().includes('failure') || msg.content.toLowerCase().includes('fallo'))) && (
                                    <button
                                        onClick={() => window.dispatchEvent(new CustomEvent('resend-message', { detail: { msgId: msg.id } }))}
                                        className="p-1.5 bg-[#0a0a0c] border border-[#1a1a1a] rounded-lg hover:bg-[#151518] hover:border-red-500/50 transition-all group/resend shadow-xl"
                                        title="Reintentar generación"
                                    >
                                        <RotateCcw className="w-3 h-3 text-gray-500 group-hover/resend:text-red-400 transition-colors" />
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-1.5 mt-1 mx-1 opacity-40 select-none">
                            <span className="text-[9px] text-gray-400 font-mono uppercase tracking-tighter">
                                {msg.role === 'user' ? 'Tú' : 'SI Assistant'}
                            </span>
                            <span className="text-[8px] text-gray-500 font-mono">
                                • {new Date(msg.timestamp || Date.now()).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })}
                            </span>
                        </div>
                    </div>
                ))
            )}
        </div>
    );
};

