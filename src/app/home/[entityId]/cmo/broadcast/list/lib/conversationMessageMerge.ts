import {
    collection,
    getDocs,
    limit,
    query,
    where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Timestamp } from "firebase/firestore";
import { mergeConversationMessages } from "@/lib/conversations/mergeMessages";
import type { BroadcastRecipient } from "./types";

export { mergeConversationMessages, messageTimeMs } from "@/lib/conversations/mergeMessages";

export function phoneDigits(phone: string | undefined | null): string {
    return String(phone || "").replace(/\D/g, "");
}

export function recipientSentTimestamp(recipient: BroadcastRecipient): Timestamp {
    const ts = recipient.sentAt;
    if (!ts) return Timestamp.now();
    if (typeof (ts as { toDate?: () => Date }).toDate === "function") {
        return ts as Timestamp;
    }
    if (typeof (ts as { seconds?: number }).seconds === "number") {
        const s = ts as { seconds: number; nanoseconds?: number };
        return new Timestamp(s.seconds, s.nanoseconds || 0);
    }
    const d = new Date(ts as string | number);
    if (!isNaN(d.getTime())) return Timestamp.fromDate(d);
    return Timestamp.now();
}

export async function findConversationsByPhoneClient(
    tenantPath: string,
    phone: string
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
    const digits = phoneDigits(phone);
    if (!digits || digits.length < 8) return [];

    const variants = Array.from(new Set([digits, `+${digits}`, phone].filter(Boolean)));
    const col = collection(db, `${tenantPath}/conversations`);
    const byId = new Map<string, Record<string, unknown>>();

    for (const field of ["contactNumberClean", "contactNumber"] as const) {
        for (const val of variants) {
            try {
                const snap = await getDocs(query(col, where(field, "==", val), limit(8)));
                snap.docs.forEach((d) => byId.set(d.id, d.data()));
            } catch {
                // missing index
            }
        }
    }

    return Array.from(byId.entries()).map(([id, data]) => ({ id, data }));
}

export function scoreConversation(data: Record<string, unknown> | null | undefined): number {
    const messages = Array.isArray(data?.messages) ? (data!.messages as unknown[]) : [];
    let userCount = 0;
    let agentCount = 0;
    messages.forEach((m) => {
        if (!m || typeof m !== "object") return;
        const sender = (m as { sender?: string }).sender;
        if (sender === "user") userCount++;
        else if (sender === "agent") agentCount++;
    });
    // Strongly prefer threads that contain client replies.
    return userCount * 1000 + agentCount * 10 + messages.length;
}

export function conversationIdsFromCards(cards: any[], phone: string): string[] {
    const digits = phoneDigits(phone);
    if (!digits) return [];

    const ids = new Set<string>();
    cards.forEach((card) => {
        const cardDigits = phoneDigits(card.contactNumberClean || card.contactNumber || card.phone);
        if (!cardDigits) return;
        if (cardDigits === digits || cardDigits.endsWith(digits) || digits.endsWith(cardDigits)) {
            if (card.conversationId) ids.add(String(card.conversationId));
            if (card.id) ids.add(String(card.id));
        }
    });
    return Array.from(ids);
}

export function pickBestConversationId(
    primaryId: string | undefined,
    phoneMatches: Array<{ id: string; data: Record<string, unknown> }>
): string | undefined {
    const candidates = new Map<string, Record<string, unknown>>();

    if (primaryId) {
        const primary = phoneMatches.find((c) => c.id === primaryId);
        candidates.set(primaryId, primary?.data || {});
    }

    phoneMatches.forEach((c) => candidates.set(c.id, c.data));

    let bestId: string | undefined;
    let bestScore = -1;

    candidates.forEach((data, id) => {
        const score = scoreConversation(data);
        if (score > bestScore) {
            bestScore = score;
            bestId = id;
        }
    });

    return bestId || primaryId;
}

export function formatBroadcastTemplateLabel(templateName?: string | null): string {
    const name = String(templateName || "plantilla").trim();
    return `📢 Plantilla de campaña: ${name}`;
}

export function collectCardMessagesByPhone(cards: any[], phone: string): unknown[] {
    const digits = phoneDigits(phone);
    if (!digits) return [];

    const lists: unknown[][] = [];
    cards.forEach((card) => {
        const cardDigits = phoneDigits(card.contactNumberClean || card.contactNumber || card.phone);
        if (!cardDigits) return;
        if (cardDigits === digits || cardDigits.endsWith(digits) || digits.endsWith(cardDigits)) {
            if (Array.isArray(card.messages) && card.messages.length > 0) {
                lists.push(card.messages);
            }
        }
    });

    return mergeConversationMessages(...lists);
}
