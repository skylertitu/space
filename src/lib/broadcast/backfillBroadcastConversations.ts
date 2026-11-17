import type { Firestore } from "firebase-admin/firestore";
import { logBroadcastMessageToConversation } from "./logBroadcastToConversationAdmin";
import { ensureBroadcastTemplateBody } from "./ensureBroadcastTemplateBody";
import { syncBroadcastCampaignReplies } from "./syncBroadcastRecipientReplies";
import {
    resolveBroadcastRecipientText,
    isBroadcastTemplatePlaceholder,
} from "@/app/home/[entityId]/cmo/broadcast/list/lib/resolveBroadcastMessageText";

function resolveRecipientText(
    broadcast: Record<string, unknown>,
    recipient: Record<string, unknown>
): string {
    const sentText = recipient.sentText;
    if (typeof sentText === "string" && sentText && !isBroadcastTemplatePlaceholder(sentText)) {
        return sentText;
    }
    return resolveBroadcastRecipientText(
        { id: String(broadcast.id || ""), ...broadcast } as any,
        { id: String(recipient.id || ""), ...recipient, status: recipient.status || "sent" } as any
    );
}

/** Rewrite conversation threads with the real outbound campaign text. */
export async function backfillBroadcastConversations(params: {
    db: Firestore;
    userId: string;
    entityId: string;
    broadcastId: string;
}): Promise<{
    logged: number;
    upgraded: number;
    skipped: number;
    failed: number;
    replySync?: { synced: number; injected: number; downgraded: number };
}> {
    const { db, userId, entityId, broadcastId } = params;
    const tenantPath = `users/${userId}/entities/${entityId}`;
    const broadcastRef = db.doc(`${tenantPath}/broadcasts/${broadcastId}`);
    const broadcastSnap = await broadcastRef.get();
    if (!broadcastSnap.exists) {
        return { logged: 0, upgraded: 0, skipped: 0, failed: 0 };
    }

    let broadcast = { id: broadcastId, ...broadcastSnap.data() } as Record<string, unknown>;
    const ensured = await ensureBroadcastTemplateBody({
        db,
        tenantPath,
        broadcastId,
        broadcast,
        userId,
        entityId,
    });
    if (ensured.updated) {
        broadcast = { ...broadcast, message: ensured.message };
    }

    const message = (broadcast.message || {}) as Record<string, unknown>;
    const mediaUrl = message.mediaUrl as string | undefined;
    const mediaType = message.mediaType as string | undefined;
    const filename = message.filename as string | undefined;

    const recSnap = await db.collection(`${tenantPath}/broadcasts/${broadcastId}/recipients`).get();

    type RecipientRow = Record<string, unknown> & { id: string };

    const sentRecipients: RecipientRow[] = recSnap.docs
        .map((d): RecipientRow => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
        .filter((r) =>
            ["sent", "delivered", "read", "replied"].includes(String(r.status || ""))
        );

    let logged = 0;
    let upgraded = 0;
    let skipped = 0;
    let failed = 0;

    for (const recipient of sentRecipients) {
        const phone = String(recipient.phone || "");
        if (!phone) {
            failed++;
            continue;
        }

        const text = resolveRecipientText(broadcast, recipient);
        if (!text || isBroadcastTemplatePlaceholder(text)) {
            failed++;
            continue;
        }

        const result = await logBroadcastMessageToConversation({
            db,
            tenantPath,
            phone,
            text,
            broadcastId,
            broadcastName: broadcast.name as string | undefined,
            messageId: (recipient.messageId as string | null) || null,
            mediaUrl,
            mediaType: mediaType && message.kind === "media" ? mediaType : undefined,
            filename,
            skipIfExists: true,
        });

        if (result.logged) {
            if (result.reason === "upgraded") upgraded++;
            else logged++;
        } else if (result.reason === "already_logged") skipped++;
        else failed++;
    }

    const replySync = await syncBroadcastCampaignReplies({ db, tenantPath, broadcastId });

    return { logged, upgraded, skipped, failed, replySync };
}
