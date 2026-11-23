import type { BotQueueItem } from '@/lib/botQueue';
import { appendInboundToConversation, type AdminDb } from '@/lib/conversations/store';

/**
 * If this thread was already promoted to /conversations, the new inbound
 * must land there. The kanban card is only the preview.
 */
export async function deliverInboundToOpenConversation(params: {
    db: AdminDb;
    tenantPath: string;
    cardId: string;
    cardData?: Record<string, any> | null;
    newMessage: Record<string, unknown>;
    queueItem: BotQueueItem;
    alreadyQueued: boolean;
    displayText: string;
    fields?: Record<string, unknown>;
}): Promise<boolean> {
    const linkedId = String(params.cardData?.conversationId || '').trim();
    const candidateId = linkedId || params.cardId;
    const ref = params.db.doc(`${params.tenantPath}/conversations/${candidateId}`);
    const snap = await ref.get();
    if (!snap.exists) return false;

    await appendInboundToConversation({
        db: params.db,
        tenantPath: params.tenantPath,
        conversationRef: ref,
        newMessage: params.newMessage,
        queueItem: params.queueItem,
        alreadyQueued: params.alreadyQueued,
        displayPrefText: params.displayText,
    });

    if (params.fields && Object.keys(params.fields).length > 0) {
        await ref.set(params.fields, { merge: true });
    }

    return true;
}
