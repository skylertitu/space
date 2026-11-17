import { messageTimeMs } from "@/lib/conversations/mergeMessages";
import type { BroadcastRecipient } from "./types";

export function recipientSentAtMs(recipient: BroadcastRecipient): number {
    const ts = recipient.sentAt;
    if (!ts) return 0;
    if (typeof (ts as { toDate?: () => Date }).toDate === "function") {
        return (ts as { toDate: () => Date }).toDate().getTime();
    }
    if (typeof (ts as { seconds?: number }).seconds === "number") {
        return (ts as { seconds: number }).seconds * 1000;
    }
    const d = new Date(ts as string | number);
    return isNaN(d.getTime()) ? 0 : d.getTime();
}

export function recipientRepliedAtMs(recipient: BroadcastRecipient): number {
    const ts = recipient.repliedAt;
    if (!ts) return 0;
    if (typeof (ts as { toDate?: () => Date }).toDate === "function") {
        return (ts as { toDate: () => Date }).toDate().getTime();
    }
    if (typeof (ts as { seconds?: number }).seconds === "number") {
        return (ts as { seconds: number }).seconds * 1000;
    }
    const d = new Date(ts as string | number);
    return isNaN(d.getTime()) ? 0 : d.getTime();
}

/** Last inbound client message strictly after the campaign was sent. */
export function lastUserMessageAfter(
    messages: unknown[] | undefined,
    afterMs: number
): string | undefined {
    if (!Array.isArray(messages) || afterMs <= 0) return undefined;

    let best: { text: string; ts: number } | undefined;
    for (const m of messages) {
        if (!m || typeof m !== "object") continue;
        const msg = m as { sender?: string; text?: string };
        if (msg.sender !== "user" || !msg.text) continue;
        const ts = messageTimeMs(m);
        if (ts > afterMs && (!best || ts > best.ts)) {
            best = { text: String(msg.text).trim(), ts };
        }
    }
    return best?.text;
}

/** All inbound client messages strictly after the campaign was sent. */
export function userMessagesAfter(
    messages: unknown[] | undefined,
    afterMs: number
): Array<{ text: string; ts: number; whatsappMessageId?: string }> {
    if (!Array.isArray(messages) || afterMs <= 0) return [];

    const out: Array<{ text: string; ts: number; whatsappMessageId?: string }> = [];
    for (const m of messages) {
        if (!m || typeof m !== "object") continue;
        const msg = m as { sender?: string; text?: string; whatsappMessageId?: string };
        if (msg.sender !== "user" || !msg.text) continue;
        const ts = messageTimeMs(m);
        if (ts > afterMs) {
            out.push({
                text: String(msg.text).trim(),
                ts,
                whatsappMessageId: msg.whatsappMessageId,
            });
        }
    }
    return out.sort((a, b) => a.ts - b.ts);
}

export function hasUserMessageAfter(
    messages: unknown[] | undefined,
    afterMs: number
): boolean {
    return !!lastUserMessageAfter(messages, afterMs);
}

/** Prefer webhook-stored reply, then post-broadcast thread message. */
export function resolvePostBroadcastReply(
    recipient: BroadcastRecipient,
    messages: unknown[] | undefined
): string | undefined {
    if (recipient.replyText?.trim()) {
        return recipient.replyText.trim();
    }
    const sentMs = recipientSentAtMs(recipient);
    if (sentMs > 0) {
        return lastUserMessageAfter(messages, sentMs);
    }
    return undefined;
}

/**
 * True when this recipient genuinely replied to the campaign.
 * Used for the "Respondió" filter — never counts pre-campaign messages.
 */
export function recipientQualifiesAsReplied(
    recipient: BroadcastRecipient,
    messages?: unknown[] | undefined
): boolean {
    if (recipient.status !== "replied") return false;

    if (recipient.replyText?.trim()) return true;

    const sentMs = recipientSentAtMs(recipient);
    if (sentMs > 0 && messages) {
        return hasUserMessageAfter(messages, sentMs);
    }

    // Webhook confirmed with Meta message id but replyText not yet synced.
    if (recipient.replyMessageId && recipient.repliedAt) return true;

    return false;
}
