"use client";

import React from "react";
import { X, Send, Loader2, AlertTriangle, Users, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Broadcast } from "../lib/types";

interface LaunchConfirmModalProps {
    broadcast: Broadcast;
    launching: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

export default function LaunchConfirmModal({
    broadcast,
    launching,
    onCancel,
    onConfirm,
}: LaunchConfirmModalProps) {
    const count = broadcast.recipients || broadcast.stats?.total || 0;
    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-md bg-[#0c0d12] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                <div className="p-5 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                            <AlertTriangle className="w-4 h-4 text-amber-400" />
                        </div>
                        <h2 className="text-sm font-normal text-white">Iniciar campaña</h2>
                    </div>
                    <button
                        onClick={onCancel}
                        disabled={launching}
                        className="p-1.5 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <p className="text-xs text-neutral-300 leading-relaxed">
                        Estás a punto de enviar la campaña{" "}
                        <b className="text-white">"{broadcast.name}"</b>. Los mensajes se enviarán de
                        inmediato a los destinatarios reales por WhatsApp. Esta acción no se puede deshacer.
                    </p>

                    <div className="space-y-2">
                        <div className="flex items-center gap-2 p-2.5 bg-[#13151a] border border-white/5 rounded-lg">
                            <Users className="w-4 h-4 text-blue-400 shrink-0" />
                            <span className="text-xs text-neutral-300">
                                <b className="text-white">{count}</b> destinatarios recibirán el mensaje
                            </span>
                        </div>
                        {broadcast.botName && (
                            <div className="flex items-center gap-2 p-2.5 bg-[#13151a] border border-white/5 rounded-lg">
                                <Bot className="w-4 h-4 text-emerald-400 shrink-0" />
                                <span className="text-xs text-neutral-300">
                                    El bot <b className="text-white">{broadcast.botName}</b> se activará para
                                    responder automáticamente a quienes contesten
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 border-t border-white/5 flex items-center justify-end gap-2">
                    <Button
                        variant="ghost"
                        onClick={onCancel}
                        disabled={launching}
                        className="bg-transparent hover:bg-white/5 text-neutral-400 hover:text-white text-xs px-4 py-1.5 rounded-lg"
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={onConfirm}
                        disabled={launching || count === 0}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs px-5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-lg active:scale-95 transition-all disabled:opacity-50"
                    >
                        {launching ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando...
                            </>
                        ) : (
                            <>
                                <Send className="w-3.5 h-3.5" /> Iniciar envío
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
