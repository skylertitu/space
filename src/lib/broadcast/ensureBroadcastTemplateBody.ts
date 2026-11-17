import type { Firestore } from "firebase-admin/firestore";
import type { BroadcastMessage } from "@/app/home/[entityId]/cmo/broadcast/list/lib/types";
import { fetchMetaTemplateBody } from "./fetchMetaTemplateBody";

/**
 * Guarantee template BODY text is persisted on the broadcast document.
 * Used at send/backfill time — not at omnichannel display time.
 */
export async function ensureBroadcastTemplateBody(params: {
    db: Firestore;
    tenantPath: string;
    broadcastId: string;
    broadcast: Record<string, unknown>;
    userId: string;
    entityId: string;
}): Promise<{ message: BroadcastMessage; updated: boolean }> {
    const { db, tenantPath, broadcastId, broadcast, userId, entityId } = params;
    const message = (broadcast.message || {}) as BroadcastMessage;

    if (message.kind !== "template") {
        return { message, updated: false };
    }

    if (String(message.templateBody || "").trim()) {
        return { message, updated: false };
    }

    const templateBody = await fetchMetaTemplateBody(userId, entityId, message.templateName);
    if (!templateBody) {
        return { message, updated: false };
    }

    const nextMessage: BroadcastMessage = { ...message, templateBody };
    await db.doc(`${tenantPath}/broadcasts/${broadcastId}`).update({ message: nextMessage });

    return { message: nextMessage, updated: true };
}
