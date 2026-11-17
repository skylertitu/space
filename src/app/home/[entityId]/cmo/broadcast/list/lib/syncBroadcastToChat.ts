import {
    arrayUnion,
    doc,
    getDoc,
    serverTimestamp,
    setDoc,
    updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Broadcast, BroadcastRecipient } from "./types";
import type { ResolvedBroadcastCard } from "./resolveBroadcastRecipientCard";
import {
    findConversationsByPhoneClient,
    pickBestConversationId,
    recipientSentTimestamp,
} from "./conversationMessageMerge";
import { resolveBroadcastRecipientText, isBroadcastTemplatePlaceholder } from "./resolveBroadcastMessageText";
import { mergeConversationMessages } from "@/lib/conversations/mergeMessages";

function messageAlreadyLogged(
    messages: unknown,
    broadcastId: string,
    messageId?: string | null
): boolean {
    if (!Array.isArray(messages)) return false;
    return messages.some((m) => {
        if (!m || typeof m !== "object") return false;
        const meta = (m as { metadata?: { broadcastId?: string } }).metadata;
        if (meta?.broadcastId === broadcastId) return true;
        if (messageId && (m as { whatsappMessageId?: string }).whatsappMessageId === messageId) {
            return true;
        }
        return false;
    });
}

function upgradePlaceholderBroadcastMessages(
    messages: unknown,
    broadcastId: string,
    resolvedText: string
): unknown[] | null {
    if (!Array.isArray(messages) || !resolvedText || isBroadcastTemplatePlaceholder(resolvedText)) {
        return null;
    }

    let changed = false;
    const next = messages.map((m) => {
        if (!m || typeof m !== "object") return m;
        const msg = m as Record<string, unknown>;
        const meta = msg.metadata as { broadcastId?: string; source?: string } | undefined;
        const isBroadcast =
            meta?.broadcastId === broadcastId ||
            meta?.source === "broadcast" ||
            msg.source === "broadcast" ||
            msg.isBroadcast === true;
        if (!isBroadcast) return m;

        const current = String(msg.text || "");
        if (isBroadcastTemplatePlaceholder(current) || !current.trim()) {
            changed = true;
            return { ...msg, text: resolvedText };
        }
        return m;
    });

    return changed ? next : null;
}

function buildBroadcastMessage(
    broadcast: Broadcast,
    recipient: BroadcastRecipient,
    text: string
): Record<string, unknown> {
    const message = broadcast.message;
    const payload: Record<string, unknown> = {
        sender: "agent",
        text,
        timestamp: recipientSentTimestamp(recipient),
        whatsappMessageId: recipient.messageId || null,
        platform: "whatsapp",
        status: "sent",
        source: "broadcast",
        isBroadcast: true,
        metadata: {
            source: "broadcast",
            broadcastId: broadcast.id,
            broadcastName: broadcast.name || null,
        },
    };

    if (message?.kind === "media" && message.mediaUrl) {
        payload.type = "media";
        payload.fileUrl = message.mediaUrl;
        payload.fileName = message.filename || null;
        payload.fileType =
            message.mediaType === "image"
                ? "image/*"
                : message.mediaType === "video"
                  ? "video/*"
                  : message.mediaType === "audio"
                    ? "audio/*"
                    : "application/octet-stream";
    }

    return payload;
}

export interface SyncBroadcastToChatResult {
    total: number;
    logged: number;
    skipped: number;
    failed: number;
    noConversation: number;
}

/**
 * Client-side sync — uses the logged-in user's Firestore permissions
 * (avoids Admin SDK scope errors in local/dev environments).
 */
export async function syncBroadcastMessagesToChat(params: {
    tenantPath: string;
    broadcast: Broadcast;
    recipients: BroadcastRecipient[];
    resolveCard: (recipient: BroadcastRecipient) => Promise<ResolvedBroadcastCard>;
    onProgress?: (done: number, total: number) => void;
}): Promise<SyncBroadcastToChatResult> {
    const { tenantPath, broadcast, recipients, resolveCard, onProgress } = params;

    const sentRecipients = recipients.filter((r) =>
        ["sent", "delivered", "read", "replied"].includes(r.status)
    );

    const result: SyncBroadcastToChatResult = {
        total: sentRecipients.length,
        logged: 0,
        skipped: 0,
        failed: 0,
        noConversation: 0,
    };

    for (let i = 0; i < sentRecipients.length; i++) {
        const recipient = sentRecipients[i];
        onProgress?.(i + 1, sentRecipients.length);

        try {
            const card = await resolveCard(recipient);
            if (!card?.id || card.id.startsWith("temp-")) {
                result.noConversation++;
                continue;
            }

            const phone = String(recipient.phone || card.contactNumber || "");
            const phoneMatches = phone
                ? await findConversationsByPhoneClient(tenantPath, phone)
                : [];
            const conversationId =
                pickBestConversationId(card.conversationId || card.id, phoneMatches) ||
                card.conversationId ||
                card.id;

            const convRef = doc(db, `${tenantPath}/conversations/${conversationId}`);
            const convSnap = await getDoc(convRef);

            const text = resolveBroadcastRecipientText(broadcast, recipient);
            const newMessage = buildBroadcastMessage(broadcast, recipient, text);
            const previewText = text || broadcast.message?.filename || "Campaña broadcast";
            const lastMessage =
                previewText.length > 40 ? `${previewText.substring(0, 37)}...` : previewText;

            const cleanPhone = String(recipient.phone || "").replace(/\D/g, "");

            if (!convSnap.exists()) {
                const legacyMessages = Array.isArray(card.messages) ? card.messages : [];
                const initialMessages = mergeConversationMessages(legacyMessages, [newMessage]);

                await setDoc(
                    convRef,
                    {
                        id: conversationId,
                        kanbanCardId: card.id,
                        kanbanGroupId: card.groupId,
                        contactName: card.contactName || recipient.name,
                        contactNumber: card.contactNumber || recipient.phone,
                        contactNumberClean: cleanPhone,
                        conversationId,
                        messages: initialMessages,
                        lastMessage,
                        unreadCount: 0,
                        updatedAt: serverTimestamp(),
                        createdAt: serverTimestamp(),
                    },
                    { merge: true }
                );
            } else {
                const existing = convSnap.data()?.messages;
                if (messageAlreadyLogged(existing, broadcast.id, recipient.messageId)) {
                    const upgraded = upgradePlaceholderBroadcastMessages(
                        existing,
                        broadcast.id,
                        text
                    );
                    if (upgraded) {
                        await updateDoc(convRef, {
                            messages: upgraded,
                            lastMessage,
                            unreadCount: 0,
                            updatedAt: serverTimestamp(),
                        });
                        result.logged++;
                    } else {
                        result.skipped++;
                    }
                    continue;
                }

                await updateDoc(convRef, {
                    messages: arrayUnion(newMessage),
                    lastMessage,
                    unreadCount: 0,
                    updatedAt: serverTimestamp(),
                    contactNumberClean: cleanPhone,
                    contactNumber: recipient.phone,
                    kanbanCardId: card.id,
                    kanbanGroupId: card.groupId,
                });
            }

            if (card.groupId) {
                const cardRef = doc(
                    db,
                    `${tenantPath}/kanban-groups/${card.groupId}/cards/${card.id}`
                );
                await setDoc(
                    cardRef,
                    {
                        conversationId,
                        lastMessage,
                        updatedAt: serverTimestamp(),
                        contactNumberClean: cleanPhone,
                        contactNumber: recipient.phone,
                    },
                    { merge: true }
                );
            }

            result.logged++;
        } catch (err) {
            console.warn("[Broadcast] sync to chat failed for", recipient.phone, err);
            result.failed++;
        }
    }

    return result;
}
