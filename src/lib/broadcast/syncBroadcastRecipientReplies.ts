import { admin } from "@/lib/firebase-admin";
import {
    findConversationByPhone,
    syncThinCardPreview,
} from "@/lib/conversations/store";
import { phoneSearchVariants } from "@/lib/phoneUtils";
import { messageTimeMs } from "@/lib/conversations/mergeMessages";
import type { BroadcastRecipient } from "@/app/home/[entityId]/cmo/broadcast/list/lib/types";
import {
    hasUserMessageAfter,
    recipientSentAtMs,
    userMessagesAfter,
} from "@/app/home/[entityId]/cmo/broadcast/list/lib/broadcastReplyUtils";

type AdminDb = FirebaseFirestore.Firestore;

function recipientSentAtTimestamp(recipient: Record<string, unknown>): FirebaseFirestore.Timestamp | null {
    const ts = recipient.sentAt;
    if (!ts) return null;
    if (typeof (ts as { toDate?: () => Date }).toDate === "function") {
        return admin.firestore.Timestamp.fromDate((ts as { toDate: () => Date }).toDate());
    }
    if (typeof (ts as { seconds?: number }).seconds === "number") {
        return new admin.firestore.Timestamp(
            (ts as { seconds: number }).seconds,
            (ts as { nanoseconds?: number }).nanoseconds || 0
        );
    }
    return admin.firestore.Timestamp.now();
}

function messageExists(
    messages: unknown[],
    opts: { text?: string; whatsappMessageId?: string; afterMs: number }
): boolean {
    for (const m of messages) {
        if (!m || typeof m !== "object") continue;
        const msg = m as {
            sender?: string;
            text?: string;
            whatsappMessageId?: string;
        };
        if (msg.sender !== "user") continue;
        const ts = messageTimeMs(m);
        if (opts.afterMs > 0 && ts <= opts.afterMs) continue;
        if (opts.whatsappMessageId && msg.whatsappMessageId === opts.whatsappMessageId) {
            return true;
        }
        if (opts.text && String(msg.text || "").trim() === opts.text.trim()) {
            return true;
        }
    }
    return false;
}

/** Ensure replyText on recipient matches conversation; inject missing inbound messages. */
export async function syncBroadcastRecipientReply(params: {
    db: AdminDb;
    tenantPath: string;
    recipient: Record<string, unknown> & { id: string };
    recipientRef?: FirebaseFirestore.DocumentReference;
}): Promise<{ synced: boolean; injected: boolean; downgraded: boolean }> {
    const { db, tenantPath, recipient, recipientRef } = params;
    const phone = String(recipient.phone || "");
    if (!phone) return { synced: false, injected: false, downgraded: false };

    const cleanPhone = phone.replace(/\D/g, "");
    const conv = await findConversationByPhone(db, tenantPath, cleanPhone);
    if (!conv) {
        return { synced: false, injected: false, downgraded: false };
    }

    const messages = Array.isArray(conv.data.messages) ? conv.data.messages : [];
    const sentMs = recipientSentAtMs(recipient as unknown as BroadcastRecipient);
    const replyText = String(recipient.replyText || "").trim();
    const replyMessageId = String(recipient.replyMessageId || "");
    const status = String(recipient.status || "");

    let injected = false;
    let synced = false;
    let downgraded = false;

    const postReplies = sentMs > 0 ? userMessagesAfter(messages, sentMs) : [];
    const bestPostReply = postReplies[postReplies.length - 1];

    // Backfill replyText from conversation when webhook missed it.
    if (!replyText && bestPostReply?.text && recipientRef) {
        await recipientRef.update({
            status: "replied",
            replyText: bestPostReply.text.slice(0, 2000),
            ...(bestPostReply.whatsappMessageId
                ? { replyMessageId: bestPostReply.whatsappMessageId }
                : {}),
            ...(!recipient.repliedAt
                ? { repliedAt: admin.firestore.FieldValue.serverTimestamp() }
                : {}),
        });
        synced = true;
    }

    // Inject stored reply into conversation when missing from thread.
    const textToInject = replyText || bestPostReply?.text || "";
    if (
        textToInject &&
        sentMs > 0 &&
        !messageExists(messages, {
            text: textToInject,
            whatsappMessageId: replyMessageId || undefined,
            afterMs: sentMs,
        })
    ) {
        const inbound = {
            sender: "user",
            text: textToInject,
            timestamp: recipient.repliedAt
                ? recipientSentAtTimestamp(recipient) || admin.firestore.Timestamp.now()
                : admin.firestore.Timestamp.now(),
            whatsappMessageId: replyMessageId || null,
            platform: "whatsapp",
            metadata: { source: "broadcast_reply_sync" },
        };

        const preview =
            textToInject.length > 50 ? `${textToInject.substring(0, 47)}...` : textToInject;

        await conv.ref.update({
            messages: admin.firestore.FieldValue.arrayUnion(inbound),
            lastMessage: preview,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            unreadCount: admin.firestore.FieldValue.increment(1),
        });

        const groupId = String(conv.data.kanbanGroupId || "");
        const cardId = String(conv.data.kanbanCardId || conv.id);
        if (groupId && cardId) {
            await syncThinCardPreview({
                db,
                tenantPath,
                conversationId: conv.id,
                groupId,
                cardId,
                data: {
                    lastMessage: preview,
                    updatedAt: new Date(),
                    unreadCount: (Number(conv.data.unreadCount) || 0) + 1,
                },
            });
        }
        injected = true;
    }

    // Demote false "replied" when there is no post-campaign evidence.
    const effectiveReply = textToInject || bestPostReply?.text || "";
    const hasEvidence =
        !!effectiveReply ||
        (sentMs > 0 && hasUserMessageAfter(messages, sentMs)) ||
        !!replyMessageId;

    if (status === "replied" && !hasEvidence && recipientRef) {
        await recipientRef.update({
            status: "read",
            replyText: admin.firestore.FieldValue.delete(),
            replyMessageId: admin.firestore.FieldValue.delete(),
        });
        downgraded = true;
    }

    return { synced, injected, downgraded };
}

/** Reconcile all replied recipients for one campaign. */
export async function syncBroadcastCampaignReplies(params: {
    db: AdminDb;
    tenantPath: string;
    broadcastId: string;
}): Promise<{ synced: number; injected: number; downgraded: number }> {
    const { db, tenantPath, broadcastId } = params;
    const recSnap = await db
        .collection(`${tenantPath}/broadcasts/${broadcastId}/recipients`)
        .get();

    let synced = 0;
    let injected = 0;
    let downgraded = 0;

    for (const doc of recSnap.docs) {
        const recipient: Record<string, unknown> & { id: string } = {
            id: doc.id,
            ...(doc.data() as Record<string, unknown>),
        };
        const status = String(recipient.status || "");
        if (!["replied", "read", "delivered", "sent"].includes(status)) continue;

        const result = await syncBroadcastRecipientReply({
            db,
            tenantPath,
            recipient,
            recipientRef: doc.ref,
        });
        if (result.synced) synced++;
        if (result.injected) injected++;
        if (result.downgraded) downgraded++;
    }

    return { synced, injected, downgraded };
}

/** Pick conversation that already has this broadcast outbound message. */
export async function findConversationForBroadcastReply(
    db: AdminDb,
    tenantPath: string,
    cleanFrom: string,
    broadcastId?: string
): Promise<{ id: string; ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> } | null> {
    const variants = phoneSearchVariants(cleanFrom);
    const col = db.collection(`${tenantPath}/conversations`);
    const matches: Array<{
        id: string;
        ref: FirebaseFirestore.DocumentReference;
        data: Record<string, unknown>;
        score: number;
    }> = [];

    for (const field of ["contactNumberClean", "contactNumber"] as const) {
        for (const val of variants) {
            try {
                const snap = await col.where(field, "==", val).limit(5).get();
                snap.docs.forEach((d) => {
                    const data = d.data() || {};
                    let score = Array.isArray(data.messages) ? data.messages.length : 0;
                    if (broadcastId && Array.isArray(data.messages)) {
                        const hasBroadcast = data.messages.some((m) => {
                            if (!m || typeof m !== "object") return false;
                            const meta = (m as { metadata?: { broadcastId?: string } }).metadata;
                            return meta?.broadcastId === broadcastId;
                        });
                        if (hasBroadcast) score += 1000;
                    }
                    matches.push({ id: d.id, ref: d.ref, data, score });
                });
            } catch {
                // continue
            }
        }
    }

    if (matches.length === 0) {
        const fallback = await findConversationByPhone(db, tenantPath, cleanFrom);
        return fallback;
    }

    matches.sort((a, b) => b.score - a.score);
    const best = matches[0];
    return { id: best.id, ref: best.ref, data: best.data };
}
