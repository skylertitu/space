import {
    doc,
    runTransaction,
    updateDoc,
    arrayUnion,
    serverTimestamp,
    Firestore,
} from 'firebase/firestore';

export interface MoveKanbanCardParams {
    db: Firestore;
    tenantPath: string;
    cardId: string;
    sourceGroupId: string;
    destGroupId: string;
    historyEntry?: Record<string, unknown>;
}

/**
 * Placement-only move between kanban groups.
 * Never copies messages/botState — those live under /conversations/{id}.
 */
export async function moveKanbanCard({
    db,
    tenantPath,
    cardId,
    sourceGroupId,
    destGroupId,
    historyEntry,
}: MoveKanbanCardParams): Promise<void> {
    if (sourceGroupId === destGroupId) return;

    const sourceRef = doc(db, `${tenantPath}/kanban-groups/${sourceGroupId}/cards/${cardId}`);
    const destRef = doc(db, `${tenantPath}/kanban-groups/${destGroupId}/cards/${cardId}`);

    let contactId: string | undefined;
    let conversationId = '';

    await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(sourceRef);
        if (!snap.exists()) {
            throw new Error('CARD_NOT_FOUND');
        }

        const data = snap.data() || {};
        contactId = data.contactId || data.crmId;
        conversationId = String(data.conversationId || cardId);

        const thin: Record<string, unknown> = {
            conversationId,
            groupId: destGroupId,
            contactName: data.contactName || null,
            contactNumber: data.contactNumber || null,
            contactNumberClean: data.contactNumberClean || null,
            lastMessage: data.lastMessage || null,
            unreadCount: data.unreadCount || 0,
            status: data.status || 'open',
            source: data.source || null,
            primary_channel: data.primary_channel || null,
            platform_ids: data.platform_ids || null,
            whatsappPhoneNumberId: data.whatsappPhoneNumberId || null,
            crmId: data.crmId || null,
            contactId: data.contactId || null,
            humanTakeover: data.humanTakeover || null,
            updatedAt: serverTimestamp(),
        };

        transaction.set(destRef, thin, { merge: true });
        transaction.delete(sourceRef);
    });

    const followUps: Promise<unknown>[] = [];

    if (historyEntry) {
        followUps.push(updateDoc(destRef, { history: arrayUnion(historyEntry) }));
    }

    if (conversationId) {
        followUps.push(
            updateDoc(doc(db, `${tenantPath}/conversations/${conversationId}`), {
                kanbanGroupId: destGroupId,
                kanbanCardId: cardId,
                updatedAt: serverTimestamp(),
            }).catch(() => undefined)
        );
    }

    if (contactId) {
        const contactRef = doc(db, `${tenantPath}/contacts/${contactId}`);
        followUps.push(
            updateDoc(contactRef, {
                kanbanGroupId: destGroupId,
                kanbanCardId: cardId,
                conversationId: conversationId || null,
                updatedAt: serverTimestamp(),
            }).catch(() => undefined)
        );
    }

    await Promise.all(followUps);
}
