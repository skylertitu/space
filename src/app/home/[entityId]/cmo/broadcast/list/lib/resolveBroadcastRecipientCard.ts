import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    query,
    where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { normalizePhoneNumber } from "@/lib/phoneUtils";
import type { BroadcastRecipient } from "./types";

export interface ResolvedBroadcastCard {
    id: string;
    groupId?: string;
    conversationId?: string;
    contactName?: string;
    contactNumber?: string;
    contactNumberClean?: string;
    crmId?: string;
    contactId?: string;
    /** Last inbound message from the client (for preview). */
    lastUserReply?: string;
    [key: string]: unknown;
}

function phoneDigits(phone: string | undefined | null): string {
    return (phone || "").replace(/\D/g, "");
}

function phonesMatch(a: string, b: string): boolean {
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length >= 8 && b.length >= 8) {
        return a.endsWith(b) || b.endsWith(a);
    }
    return false;
}

function cardTimestamp(card: Record<string, any>): number {
    const ts = card.updatedAt || card.lastMessageAt || card.createdAt;
    if (!ts) return 0;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (ts.seconds) return ts.seconds * 1000;
    if (typeof ts === "string") return new Date(ts).getTime() || 0;
    return 0;
}

import { scoreConversation, findConversationsByPhoneClient } from "./conversationMessageMerge";
import {
    lastUserMessageAfter,
    recipientSentAtMs,
} from "./broadcastReplyUtils";

function lastUserMessage(messages: any[] | undefined): string | undefined {
    if (!Array.isArray(messages) || messages.length === 0) return undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m?.sender === "user" && m?.text) return String(m.text).trim();
    }
    return undefined;
}

function postBroadcastReplyFromMessages(
    recipient: BroadcastRecipient,
    messages: any[] | undefined
): string | undefined {
    if (recipient.replyText?.trim()) return recipient.replyText.trim();
    const sentMs = recipientSentAtMs(recipient);
    if (sentMs > 0) return lastUserMessageAfter(messages, sentMs);
    return undefined;
}

function buildCardFromConversation(
    convId: string,
    convData: Record<string, any>,
    fallback: BroadcastRecipient
): ResolvedBroadcastCard {
    const cardId = String(convData.kanbanCardId || convId);
    const groupId = convData.kanbanGroupId as string | undefined;
    return {
        id: cardId,
        groupId,
        conversationId: convId,
        contactName: (convData.contactName as string) || fallback.name,
        contactNumber: (convData.contactNumber as string) || fallback.phone,
        contactNumberClean:
            (convData.contactNumberClean as string) || phoneDigits(fallback.phone),
        crmId: (convData.crmId as string) || fallback.contactId,
        contactId: (convData.contactId as string) || fallback.contactId,
        lastUserReply: postBroadcastReplyFromMessages(fallback, convData.messages as any[]),
    };
}

function pickCardMatches(cards: any[], targetDigits: string, recipient: BroadcastRecipient): any[] {
    const matches = cards.filter((c) => {
        const cardDigits = phoneDigits(c.contactNumberClean || c.contactNumber || c.phone);
        if (cardDigits && phonesMatch(cardDigits, targetDigits)) return true;
        if (
            recipient.contactId &&
            (c.crmId === recipient.contactId ||
                c.contactId === recipient.contactId ||
                c.id === recipient.contactId)
        ) {
            return true;
        }
        return false;
    });

    if (matches.length === 0) return [];
    matches.sort((a, b) => cardTimestamp(b) - cardTimestamp(a));
    return matches;
}

async function pickBestCardAmongMatches(
    tenantPath: string,
    matches: any[]
): Promise<any | null> {
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];

    let best = matches[0];
    let bestScore = -1;

    for (const card of matches) {
        let score = scoreConversation({ messages: card.messages });
        const convId = String(card.conversationId || card.id || "");
        if (convId && card.groupId) {
            try {
                const convSnap = await getDoc(doc(db, `${tenantPath}/conversations/${convId}`));
                if (convSnap.exists()) {
                    score = Math.max(score, scoreConversation(convSnap.data()));
                }
            } catch {
                // non-fatal
            }
        }
        if (score > bestScore) {
            bestScore = score;
            best = card;
        }
    }

    return best;
}

async function findConversationByPhoneClient(
    tenantPath: string,
    cleanPhone: string
): Promise<{ id: string; data: Record<string, any> } | null> {
    const variants = [cleanPhone, `+${cleanPhone}`];
    const col = collection(db, `${tenantPath}/conversations`);

    for (const field of ["contactNumberClean", "contactNumber"] as const) {
        for (const val of variants) {
            try {
                const snap = await getDocs(query(col, where(field, "==", val), limit(1)));
                if (!snap.empty) {
                    const d = snap.docs[0];
                    return { id: d.id, data: d.data() };
                }
            } catch {
                // missing index — try next
            }
        }
    }
    return null;
}

async function findContactByPhone(
    tenantPath: string,
    phone: string
): Promise<Record<string, any> | null> {
    const digits = phoneDigits(phone);
    const normalized = normalizePhoneNumber(phone);
    const variants = Array.from(new Set([normalized, `+${digits}`, digits].filter(Boolean)));

    for (const val of variants) {
        try {
            const snap = await getDocs(
                query(collection(db, `${tenantPath}/contacts`), where("phone", "==", val), limit(1))
            );
            if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
        } catch {
            // continue
        }
    }
    return null;
}

async function loadCardFromContact(
    tenantPath: string,
    contact: Record<string, any>,
    fallback: BroadcastRecipient
): Promise<ResolvedBroadcastCard | null> {
    const groupId = contact.kanbanGroupId as string | undefined;
    const cardId = contact.kanbanCardId as string | undefined;
    const conversationId = contact.conversationId as string | undefined;

    if (groupId && cardId) {
        const cardSnap = await getDoc(
            doc(db, `${tenantPath}/kanban-groups/${groupId}/cards/${cardId}`)
        );
        if (cardSnap.exists()) {
            const data = cardSnap.data();
            const convId = (data.conversationId as string) || conversationId || cardId;
            let lastUserReply: string | undefined;
            if (convId) {
                const convSnap = await getDoc(doc(db, `${tenantPath}/conversations/${convId}`));
                if (convSnap.exists()) {
                    lastUserReply = postBroadcastReplyFromMessages(
                        fallback,
                        convSnap.data()?.messages as any[]
                    );
                }
            }
            return {
                id: cardSnap.id,
                groupId,
                conversationId: convId,
                ...data,
                contactName: (data.contactName as string) || fallback.name,
                contactNumber: (data.contactNumber as string) || fallback.phone,
                crmId: (data.crmId as string) || contact.id,
                lastUserReply,
            };
        }
    }

    if (conversationId) {
        const convSnap = await getDoc(doc(db, `${tenantPath}/conversations/${conversationId}`));
        if (convSnap.exists()) {
            return buildCardFromConversation(conversationId, convSnap.data(), fallback);
        }
    }

    return null;
}

/**
 * Resolves the real kanban/conversation card for a broadcast recipient.
 * Messages live under /conversations/{id} — temp cards show an empty chat.
 */
export async function resolveBroadcastRecipientCard(
    tenantPath: string,
    recipient: BroadcastRecipient,
    cachedCards: any[]
): Promise<ResolvedBroadcastCard> {
    const targetDigits = phoneDigits(normalizePhoneNumber(recipient.phone));

    // 1. Best match among already-loaded kanban cards (prefer thread with client replies)
    const cardMatches = pickCardMatches(cachedCards, targetDigits, recipient);
    const cached = cardMatches.length
        ? await pickBestCardAmongMatches(tenantPath, cardMatches)
        : null;
    if (cached?.id && cached?.groupId && !String(cached.id).startsWith("temp-")) {
        let conversationId = cached.conversationId as string | undefined;
        if (!conversationId) {
            try {
                const cardSnap = await getDoc(
                    doc(db, `${tenantPath}/kanban-groups/${cached.groupId}/cards/${cached.id}`)
                );
                if (cardSnap.exists()) {
                    conversationId =
                        (cardSnap.data()?.conversationId as string | undefined) || cached.id;
                }
            } catch {
                conversationId = cached.id;
            }
        }

        let lastUserReply: string | undefined;
        try {
            const convSnap = await getDoc(doc(db, `${tenantPath}/conversations/${conversationId}`));
            if (convSnap.exists()) {
                lastUserReply = postBroadcastReplyFromMessages(
                    recipient,
                    convSnap.data()?.messages as any[]
                );
            }
        } catch {
            // non-fatal
        }
        return {
            ...cached,
            conversationId,
            contactName: cached.contactName || recipient.name,
            contactNumber: cached.contactNumber || recipient.phone,
            lastUserReply,
        };
    }

    // 2. Contact index (kanbanCardId / conversationId)
    const contact = await findContactByPhone(tenantPath, recipient.phone);
    if (contact) {
        const fromContact = await loadCardFromContact(tenantPath, contact, recipient);
        if (fromContact?.groupId && fromContact.id) return fromContact;
    }

    // 3. Conversation store by phone (source of truth for messages)
    if (targetDigits) {
        const convMatches = await findConversationsByPhoneClient(tenantPath, recipient.phone);
        const conv =
            convMatches.length > 0
                ? convMatches.reduce((best, cur) =>
                      scoreConversation(cur.data) > scoreConversation(best.data) ? cur : best
                  )
                : await findConversationByPhoneClient(tenantPath, targetDigits);

        if (conv) {
            const card = buildCardFromConversation(conv.id, conv.data, recipient);
            if (card.groupId) return card;

            // Conversation exists but missing group — search cards for this conversationId
            for (const c of cachedCards) {
                if (c.conversationId === conv.id || c.id === conv.data.kanbanCardId) {
                    return {
                        ...c,
                        conversationId: conv.id,
                        lastUserReply: postBroadcastReplyFromMessages(
                            recipient,
                            conv.data.messages as any[]
                        ),
                    };
                }
            }

            // Use conversation id as card id with inbox group fallback from conv data
            const fallbackGroup = conv.data.kanbanGroupId as string | undefined;
            if (fallbackGroup) {
                return {
                    ...card,
                    groupId: fallbackGroup,
                    id: String(conv.data.kanbanCardId || conv.id),
                };
            }
        }
    }

    // 4. Cached card without groupId — dynamic search won't work in ChatArea
    if (cached?.id && !String(cached.id).startsWith("temp-")) {
        return {
            ...cached,
            contactName: cached.contactName || recipient.name,
            contactNumber: cached.contactNumber || recipient.phone,
        };
    }

    // 5. Unresolved — ChatArea cannot load history for temp ids
    return {
        id: `temp-${recipient.contactId || recipient.id}`,
        contactName: recipient.name,
        contactNumber: normalizePhoneNumber(recipient.phone),
        contactNumberClean: targetDigits,
        crmId: recipient.contactId,
    };
}
