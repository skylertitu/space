import React from "react";

interface PhoneMockupProps {
    selectedTemplate: any;
    livePreviewBody: string;
    automationPrompts?: string[];
    automationCommands?: Array<{ command_name: string; command_description: string }>;
}

export default function PhoneMockup({
    selectedTemplate,
    livePreviewBody,
    automationPrompts = [],
    automationCommands = []
}: PhoneMockupProps) {
    return (
        <div className="hidden md:flex flex-col justify-start items-center sticky top-0 select-none py-2 shrink-0">
            <div className="w-[320px] h-[710px] rounded-[48px] border-[10px] border-black bg-white shadow-2xl relative flex flex-col overflow-hidden shrink-0 ring-[3px] ring-[#e1e1e1] ring-offset-0 animate-in fade-in zoom-in-95 duration-300">
                
                {/* Status Bar Wrapper */}
                <div className="h-10 bg-white flex items-center justify-between px-5 shrink-0 relative z-10 select-none">
                    {/* Time */}
                    <span className="text-[10px] font-bold text-black leading-none">10:09</span>
                    
                    {/* Centered Dynamic Island Pill with Camera Lens */}
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[80px] h-[22px] bg-black rounded-full z-20 flex items-center justify-end pr-2.5">
                        {/* Subtle blue/purple camera lens reflection on the right */}
                        <div className="w-1.5 h-1.5 rounded-full bg-[#1b263b] border border-blue-500/20 shadow-[inset_0_0_1px_rgba(255,255,255,0.8)] relative">
                            <div className="absolute top-0.5 left-0.5 w-0.5 h-0.5 bg-white/60 rounded-full" />
                        </div>
                    </div>

                    {/* Right-aligned Status Icons */}
                    <div className="flex gap-1.5 items-center leading-none">
                        {/* Cellular Signal Bars */}
                        <svg className="w-3.5 h-2.5 text-black fill-current" viewBox="0 0 100 100">
                            <rect x="5" y="70" width="16" height="30" rx="3" />
                            <rect x="29" y="50" width="16" height="50" rx="3" />
                            <rect x="53" y="30" width="16" height="70" rx="3" />
                            <rect x="77" y="10" width="16" height="90" rx="3" />
                        </svg>
                        {/* WiFi Icon SVG */}
                        <svg className="w-3 h-2.5 text-black fill-current" viewBox="0 0 24 24">
                            <path d="M12 21l-12-12c2-2 5-3 12-3s10 1 12 3l-12 12z" />
                        </svg>
                        {/* Battery Icon block */}
                        <div className="w-5 h-2.5 border border-black rounded-sm p-0.5 flex items-center relative">
                            <div className="bg-black h-full w-[80%] rounded-[1px]" />
                            <div className="w-0.5 h-1 bg-black absolute -right-0.5 top-[2px] rounded-r-xs" />
                        </div>
                    </div>
                </div>

                {/* Chat Header */}
                <div className="bg-[#f0f2f5] text-[#111b21] p-2.5 flex items-center gap-2 shrink-0 border-b border-neutral-200">
                    <div className="w-8 h-8 rounded-full bg-neutral-300 flex items-center justify-center font-bold text-xs uppercase text-neutral-600">
                        R
                    </div>
                    <div className="min-w-0">
                        <p className="text-[11px] font-semibold truncate leading-tight">Roosevelt Bot</p>
                        <p className="text-[8px] text-neutral-500 leading-none">Online</p>
                    </div>
                </div>

                {/* Chat Messages Body */}
                <div className="flex-1 bg-white p-3 overflow-y-auto space-y-3 relative flex flex-col justify-end">
                    <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:16px_16px]" />

                    {selectedTemplate ? (
                        <div className="space-y-2.5 max-w-[85%] self-start animate-fade-in z-10 w-full">
                            <div className="bg-[#e8f9f3] text-[#111b21] p-2.5 rounded-xl rounded-tl-none shadow-sm text-[10.5px] leading-relaxed relative border-l-4 border-emerald-500/50">
                                <p className="whitespace-pre-wrap">{livePreviewBody}</p>
                                <span className="text-[7.5px] text-neutral-400 float-right mt-1.5 block">09:41 AM ✓✓</span>
                                <div className="clear-both" />
                            </div>

                            {selectedTemplate.components?.find((c: any) => c.type === "BUTTONS") && (
                                <div className="space-y-1 z-10 w-full">
                                    {selectedTemplate.components
                                        .find((c: any) => c.type === "BUTTONS")
                                        .buttons?.map((btn: any, btnIdx: number) => (
                                            <div 
                                                key={btnIdx}
                                                className="w-full bg-[#f0f2f5] text-[#008069] py-1.5 rounded-lg text-[10px] text-center font-semibold shadow-sm border border-neutral-200 cursor-pointer active:bg-neutral-100 transition-colors"
                                            >
                                                {btn.text}
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-center p-4">
                            <p className="text-[10px] text-neutral-400 italic font-light">
                                Select a Meta template to preview the live mockup layout.
                            </p>
                        </div>
                    )}

                    {/* Dynamic Conversational Automation Prompts (Ice Breakers) */}
                    {automationPrompts.filter(p => p.trim() !== "").length > 0 && (
                        <div className="z-10 w-full space-y-1.5 pt-2 border-t border-neutral-100 bg-white animate-in slide-in-from-bottom-2 duration-300">
                            <p className="text-[7.5px] text-neutral-400 font-bold uppercase tracking-wider">Inicios de conversación (Ice Breakers)</p>
                            <div className="flex flex-col gap-1">
                                {automationPrompts.filter(p => p.trim() !== "").map((pText, pIdx) => (
                                    <div 
                                        key={pIdx}
                                        className="w-full bg-[#f0f2f5] text-[#008069] border border-neutral-200/50 rounded-lg px-2.5 py-1.5 text-[9px] font-semibold flex justify-between items-center hover:bg-neutral-100 transition-colors cursor-pointer"
                                    >
                                        <span>{pText}</span>
                                        <span className="text-[8px] text-neutral-300 font-mono">⚡ Touch</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Dynamic Conversational Automation Slash Commands Menu */}
                    {automationCommands.filter(c => c.command_name.trim() !== "").length > 0 && (
                        <div className="z-10 w-full bg-neutral-50 border border-neutral-200 rounded-xl p-2 animate-in slide-in-from-bottom-2 duration-300">
                            <p className="text-[8px] text-neutral-500 font-bold uppercase tracking-wider border-b border-neutral-200 pb-1 mb-1.5">Comandos (/)</p>
                            <div className="space-y-1 max-h-[80px] overflow-y-auto custom-scrollbar">
                                {automationCommands.filter(c => c.command_name.trim() !== "").map((cmd, idx) => (
                                    <div key={idx} className="flex justify-between items-center text-[9px] text-neutral-700">
                                        <span className="font-mono text-[#008069] font-semibold">/{cmd.command_name}</span>
                                        <span className="text-neutral-400 truncate max-w-[170px] text-[8.5px]">{cmd.command_description}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Bottom Home Indicator */}
                <div className="h-4 bg-white flex justify-center items-end pb-1.5 shrink-0 z-10 border-t border-neutral-50">
                    <div className="w-24 h-1 bg-black/20 rounded-full" />
                </div>
            </div>
        </div>
    );
}
