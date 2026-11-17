"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Loader2, MessageSquare, AlertCircle } from "lucide-react";
import ChatArea from "@/app/home/[entityId]/coo/omnichannel/components/ChatArea";
import type { Broadcast, BroadcastRecipient } from "../lib/types";
import type { ResolvedBroadcastCard } from "../lib/resolveBroadcastRecipientCard";
import { resolveBroadcastRecipientCard } from "../lib/resolveBroadcastRecipientCard";
import { useBroadcastConversationMessages } from "../lib/useBroadcastConversationMessages";
import { enrichBroadcastMessagesForRecipient } from "../lib/resolveBroadcastMessageText";

interface BroadcastRecipientChatProps {
    broadcast: Broadcast;
    recipient: BroadcastRecipient | null;
    card: ResolvedBroadcastCard | null;
    groups: any[];
    allConversations: any[];
    groupName: string;
    tenantPath?: string;
    loading?: boolean;
}

/**
 * Read-only view of the omnichannel conversation for a broadcast recipient.
 * Data comes from /conversations — same source as omnicanal.
 */
export default function BroadcastRecipientChat({
    broadcast,
    recipient,
    card,
    groups,
    allConversations,
    groupName,
    tenantPath,
    loading,
}: BroadcastRecipientChatProps) {
    const [retryCard, setRetryCard] = useState<ResolvedBroadcastCard | null>(null);
    const [retrying, setRetrying] = useState(false);

    const activeCard = retryCard || card;
    const isTemp = activeCard?.id?.startsWith("temp-");
    const canLoadChat =
        !!activeCard &&
        !isTemp &&
        (!!activeCard.groupId || !!activeCard.conversationId);

    const { conversationData, mergedMessages, loading: convLoading } =
        useBroadcastConversationMessages(
            tenantPath,
            canLoadChat ? activeCard : null,
            [],
            allConversations
        );

    const messagesOverride = useMemo(() => {
        const base =
            mergedMessages.length > 0
                ? mergedMessages
                : Array.isArray(activeCard?.messages)
                  ? activeCard.messages
                  : [];

        if (recipient && base.length > 0) {
            return enrichBroadcastMessagesForRecipient(base, broadcast, recipient);
        }
        return base;
    }, [mergedMessages, activeCard?.messages, broadcast, recipient]);

    const chatCard = useMemo(() => {
        if (!activeCard) return null;
        return {
            ...activeCard,
            ...(conversationData || {}),
            id: activeCard.id,
            groupId: activeCard.groupId,
            conversationId:
                (conversationData?.conversationId as string) ||
                activeCard.conversationId ||
                activeCard.id,
            messages: messagesOverride,
        };
    }, [activeCard, conversationData, messagesOverride]);

    useEffect(() => {
        setRetryCard(null);
        if (!recipient || !tenantPath || !card?.id?.startsWith("temp-")) return;

        let cancelled = false;
        setRetrying(true);
        resolveBroadcastRecipientCard(tenantPath, recipient, allConversations)
            .then((resolved) => {
                if (!cancelled && resolved.id && !resolved.id.startsWith("temp-")) {
                    setRetryCard(resolved);
                }
            })
            .finally(() => {
                if (!cancelled) setRetrying(false);
            });

        return () => {
            cancelled = true;
        };
    }, [recipient, card?.id, tenantPath, allConversations]);

    if (!recipient) {
        return (
            <div className="flex flex-1 min-h-0 flex-col items-center justify-center text-center px-8 bg-[#09090b]">
                <MessageSquare className="w-8 h-8 text-neutral-700 mb-3" />
                <p className="text-sm text-neutral-400">Selecciona un contacto</p>
                <p className="text-[11px] text-neutral-600 mt-1 max-w-[240px]">
                    Elige un destinatario para ver su conversación de omnicanal.
                </p>
            </div>
        );
    }

    if (loading || retrying || convLoading) {
        return (
            <div className="flex flex-1 min-h-0 flex-col items-center justify-center bg-[#09090b]">
                <Loader2 className="w-5 h-5 animate-spin text-neutral-500 mb-2" />
                <p className="text-[11px] text-neutral-600">Cargando historial de omnicanal...</p>
            </div>
        );
    }

    if (!activeCard || isTemp || !canLoadChat) {
        return (
            <div className="flex flex-1 min-h-0 flex-col items-center justify-center text-center px-8 bg-[#09090b]">
                <AlertCircle className="w-8 h-8 text-neutral-600 mb-3" />
                <p className="text-sm text-neutral-300">No hay conversación en omnicanal</p>
                <p className="text-[11px] text-neutral-600 mt-2 max-w-[280px]">
                    Este contacto aún no tiene un hilo guardado. Cuando escriba por WhatsApp,
                    aparecerá aquí y en omnicanal automáticamente.
                </p>
                <p className="text-[10px] text-neutral-700 mt-3 font-mono">{recipient.phone}</p>
            </div>
        );
    }

    return (
        <div className="flex flex-1 min-h-0 flex flex-col overflow-hidden bg-[#111111]">
            <div className="shrink-0 flex items-center gap-3 px-3 py-2 border-b border-white/[0.06] bg-[#0d0d0f]">
                <span className="text-[10px] text-neutral-500">Leyenda:</span>
                <span className="flex items-center gap-1.5 text-[10px] text-neutral-400">
                    <span className="w-2 h-2 rounded-full bg-violet-600" />
                    Campaña
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-neutral-400">
                    <span className="w-2 h-2 rounded-full bg-blue-600" />
                    Tú
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-neutral-400">
                    <span className="w-2 h-2 rounded-full bg-white border border-white/20" />
                    Cliente
                </span>
                {messagesOverride.length > 0 && (
                    <span className="ml-auto text-[9px] text-neutral-600 tabular-nums">
                        {messagesOverride.length} mensajes · omnicanal
                    </span>
                )}
            </div>
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <ChatArea
                    card={chatCard}
                    groups={groups}
                    groupName={groupName}
                    allConversations={allConversations}
                    messageColorMode="broadcast"
                    tenantPath={tenantPath}
                    messagesOverride={messagesOverride}
                />
            </div>
        </div>
    );
}
