/**
 * Stable conversation store — source of truth for messages + bot session.
 * Kanban cards are thin placement pointers only (groupId / preview).
 */
import type { firestore } from 'firebase-admin';
import { admin } from '@/lib/firebase-admin';
import { createQueuedBotState, type BotQueueItem } from '@/lib/botQueue';
import { phoneSearchVariants } from '@/lib/phoneUtils';
import { SYSTEM_INBOX_GROUP_FIELDS, SYSTEM_INBOX_GROUP_ID } from '@/lib/kanban/botNodeGroups';

export type AdminDb = firestore.Firestore;

export const CONVERSATION_PREVIEW_FIELDS = [
    'contactName',
    'contactNumber',
    'contactNumberClean',
    'lastMessage',
    'unreadCount',
    'status',
    'source',
    'primary_channel',
    'platform_ids',
    'whatsappPhoneNumberId',
    'crmId',
    'contactId',
    'humanTakeover',
] as const;

/** Fields that must NEVER live as source of truth on a kanban card. */
export const CONVERSATION_TRUTH_FIELDS = ['messages', 'botState'] as const;

export function conversationsCollectionPath(tenantPath: string): string {
    return `${tenantPath}/conversations`;
}

export function conversationDoc(
    db: AdminDb,
    tenantPath: string,
    conversationId: string
): firestore.DocumentReference {
    return db.doc(`${tenantPath}/conversations/${conversationId}`);
}

export function buildThinCardPayload(params: {
    conversationId: string;
    groupId: string;
    data: Record<string, any>;
}): Record<string, any> {
    const { conversationId, groupId, data } = params;
    const thin: Record<string, any> = {
        conversationId,
        groupId,
        updatedAt: data.updatedAt || admin.firestore.FieldValue.serverTimestamp(),
    };
    for (const key of CONVERSATION_PREVIEW_FIELDS) {
        if (data[key] !== undefined) thin[key] = data[key];
    }
    // Explicitly omit messages / botState from card writes.
    return thin;
}

export async function getConversation(
    db: AdminDb,
    tenantPath: string,
    conversationId: string
): Promise<{ id: string; ref: firestore.DocumentReference; data: Record<string, any> } | null> {
    const ref = conversationDoc(db, tenantPath, conversationId);
    const snap = await ref.get();
    if (!snap.exists) return null;
    return { id: snap.id, ref, data: snap.data() || {} };
}

/**
 * Promote a legacy kanban card (messages+botState on the card) into a stable conversation.
 * Idempotent when conversationId already exists.
 */
export async function ensureConversationFromCard(params: {
    db: AdminDb;
    tenantPath: string;
    cardId: string;
    groupId: string;
    cardData: Record<string, any>;
    cardRef?: firestore.DocumentReference;
}): Promise<{ conversationId: string; ref: firestore.DocumentReference; created: boolean }> {
    const { db, tenantPath, cardId, groupId, cardData } = params;
    const existingId = String(cardData.conversationId || '').trim();

    if (existingId) {
        const existing = await getConversation(db, tenantPath, existingId);
        if (existing) {
            return { conversationId: existingId, ref: existing.ref, created: false };
        }
    }

    // Prefer stable id = cardId so UI pointers stay simple during migration.
    const conversationId = existingId || cardId;
    const ref = conversationDoc(db, tenantPath, conversationId);
    const snap = await ref.get();

    if (!snap.exists) {
        const payload: Record<string, any> = {
            ...cardData,
            id: conversationId,
            kanbanCardId: cardId,
            kanbanGroupId: groupId,
            createdAt: cardData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        // Avoid nesting conversationId recursively oddly
        payload.conversationId = conversationId;
        await ref.set(payload, { merge: true });
    }

    const cardRef =
        params.cardRef ||
        db.doc(`${tenantPath}/kanban-groups/${groupId}/cards/${cardId}`);

    // Point the thin card at the conversation; strip truth fields from the card.
    const thin = buildThinCardPayload({
        conversationId,
        groupId,
        data: { ...cardData, conversationId },
    });
    await cardRef.set(
        {
            ...thin,
            messages: admin.firestore.FieldValue.delete(),
            botState: admin.firestore.FieldValue.delete(),
        },
        { merge: true }
    );

    return { conversationId, ref, created: !snap.exists };
}

export async function findConversationByPhone(
    db: AdminDb,
    tenantPath: string,
    cleanPhone: string
): Promise<{ id: string; ref: firestore.DocumentReference; data: Record<string, any> } | null> {
    const variants = phoneSearchVariants(cleanPhone);
    for (const field of ['contactNumberClean', 'contactNumber'] as const) {
        for (const val of variants) {
            try {
                const snap = await db
                    .collection(conversationsCollectionPath(tenantPath))
                    .where(field, '==', val)
                    .limit(1)
                    .get();
                if (!snap.empty) {
                    const d = snap.docs[0];
                    return { id: d.id, ref: d.ref, data: d.data() || {} };
                }
            } catch {
                // Missing index / rules — fall through
            }
        }
    }
    return null;
}

/**
 * Omnicanal source of truth: find or create /conversations/{id} for a phone number.
 * Used when outbound (broadcast) or inbound must land in the inbox.
 */
export async function ensureConversationByPhone(params: {
    db: AdminDb;
    tenantPath: string;
    phone: string;
    cleanPhone: string;
    contactName?: string;
}): Promise<{
    id: string;
    ref: firestore.DocumentReference;
    groupId: string;
    cardId: string;
    created: boolean;
}> {
    const { db, tenantPath, phone, cleanPhone, contactName } = params;

    const existing = await findConversationByPhone(db, tenantPath, cleanPhone);
    if (existing) {
        return {
            id: existing.id,
            ref: existing.ref,
            groupId: String(existing.data.kanbanGroupId || SYSTEM_INBOX_GROUP_ID),
            cardId: String(existing.data.kanbanCardId || existing.id),
            created: false,
        };
    }

    const groupsSnap = await db.collection(`${tenantPath}/kanban-groups`).get();
    let groupId =
        groupsSnap.docs.find((g) => g.id === SYSTEM_INBOX_GROUP_ID)?.id ||
        groupsSnap.docs[0]?.id ||
        SYSTEM_INBOX_GROUP_ID;

    if (!groupsSnap.docs.some((g) => g.id === groupId)) {
        await db
            .doc(`${tenantPath}/kanban-groups/${SYSTEM_INBOX_GROUP_ID}`)
            .set(
                {
                    ...SYSTEM_INBOX_GROUP_FIELDS,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                },
                { merge: true }
            );
        groupId = SYSTEM_INBOX_GROUP_ID;
    }

    const convRef = db.collection(conversationsCollectionPath(tenantPath)).doc();
    const conversationId = convRef.id;
    const cardId = conversationId;
    const displayName = contactName || phone || `+${cleanPhone}`;

    const base: Record<string, unknown> = {
        id: conversationId,
        conversationId,
        contactName: displayName,
        contactNumber: phone,
        contactNumberClean: cleanPhone,
        messages: [],
        unreadCount: 0,
        status: 'open',
        source: 'WHATSAPP',
        primary_channel: 'whatsapp',
        platform_ids: { whatsapp: phone },
        kanbanCardId: cardId,
        kanbanGroupId: groupId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await convRef.set(base);
    await db.doc(`${tenantPath}/kanban-groups/${groupId}/cards/${cardId}`).set(
        buildThinCardPayload({
            conversationId,
            groupId,
            data: base,
        })
    );

    return { id: conversationId, ref: convRef, groupId, cardId, created: true };
}

export async function syncThinCardPreview(params: {
    db: AdminDb;
    tenantPath: string;
    conversationId: string;
    groupId: string;
    cardId: string;
    data: Record<string, any>;
}): Promise<void> {
    const { db, tenantPath, conversationId, groupId, cardId, data } = params;
    const cardRef = db.doc(`${tenantPath}/kanban-groups/${groupId}/cards/${cardId}`);
    const thin = buildThinCardPayload({ conversationId, groupId, data });
    await cardRef.set(thin, { merge: true });
}

/**
 * Placement-only move: never copy messages/botState onto the destination card.
 * Truth stays on conversations/{id}.
 */
export async function moveThinKanbanCard(params: {
    db: AdminDb;
    tenantPath: string;
    cardId: string;
    sourceGroupId: string;
    destGroupId: string;
    conversationId?: string | null;
}): Promise<void> {
    const { db, tenantPath, cardId, sourceGroupId, destGroupId } = params;
    if (!sourceGroupId || !destGroupId || sourceGroupId === destGroupId) return;

    const sourceRef = db.doc(`${tenantPath}/kanban-groups/${sourceGroupId}/cards/${cardId}`);
    const destRef = db.doc(`${tenantPath}/kanban-groups/${destGroupId}/cards/${cardId}`);

    let contactId: string | undefined;
    let conversationId = params.conversationId || '';

    await db.runTransaction(async (tx) => {
        const snap = await tx.get(sourceRef);
        if (!snap.exists) return;
        const data = snap.data() || {};
        contactId = (data.contactId || data.crmId) as string | undefined;
        conversationId = String(data.conversationId || conversationId || cardId);

        const thin = buildThinCardPayload({
            conversationId,
            groupId: destGroupId,
            data: {
                ...data,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
        });

        tx.set(destRef, thin, { merge: true });
        tx.delete(sourceRef);
    });

    // Keep conversation placement pointers in sync
    if (conversationId) {
        await conversationDoc(db, tenantPath, conversationId)
            .set(
                {
                    kanbanGroupId: destGroupId,
                    kanbanCardId: cardId,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                },
                { merge: true }
            )
            .catch(() => undefined);
    }

    if (contactId) {
        await db
            .doc(`${tenantPath}/contacts/${contactId}`)
            .set(
                {
                    kanbanGroupId: destGroupId,
                    kanbanCardId: cardId,
                    conversationId: conversationId || null,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                },
                { merge: true }
            )
            .catch(() => undefined);
    }
}

export async function appendInboundToConversation(params: {
    db: AdminDb;
    tenantPath: string;
    conversationRef: firestore.DocumentReference;
    newMessage: Record<string, unknown>;
    queueItem?: BotQueueItem | null;
    alreadyQueued?: boolean;
    displayPrefText: string;
    recipientPhoneNumberId?: string | null;
}): Promise<void> {
    const {
        conversationRef,
        newMessage,
        queueItem,
        alreadyQueued,
        displayPrefText,
        recipientPhoneNumberId,
    } = params;

    const update: Record<string, any> = {
        lastMessage:
            displayPrefText.length > 50
                ? displayPrefText.substring(0, 47) + '...'
                : displayPrefText,
        updatedAt: new Date(),
        unreadCount: admin.firestore.FieldValue.increment(1),
        messages: admin.firestore.FieldValue.arrayUnion(newMessage),
        'botState.engine': 'queue',
        status: 'open',
    };

    if (recipientPhoneNumberId) {
        update.whatsappPhoneNumberId = String(recipientPhoneNumberId);
    }
    if (queueItem && !alreadyQueued) {
        update['botState.messageQueue'] = admin.firestore.FieldValue.arrayUnion(queueItem);
    }

    await conversationRef.update(update);
}

export async function createConversationWithThinCard(params: {
    db: AdminDb;
    tenantPath: string;
    groupId: string;
    newMessage: Record<string, unknown>;
    queueItem: BotQueueItem;
    profile: {
        contactName: string;
        contactNumber: string;
        contactNumberClean: string;
        crmId: string;
        recipientPhoneNumberId?: string | null;
    };
}): Promise<{ conversationId: string; cardId: string; groupId: string }> {
    const { db, tenantPath, groupId, newMessage, queueItem, profile } = params;
    const convRef = db.collection(conversationsCollectionPath(tenantPath)).doc();
    const conversationId = convRef.id;
    const cardRef = db.doc(`${tenantPath}/kanban-groups/${groupId}/cards/${conversationId}`);

    const base = {
        id: conversationId,
        conversationId,
        crmId: profile.crmId,
        contactName: profile.contactName,
        contactNumber: profile.contactNumber,
        contactNumberClean: profile.contactNumberClean,
        lastMessage:
            String(newMessage.text || '').length > 50
                ? String(newMessage.text).substring(0, 47) + '...'
                : newMessage.text || '',
        updatedAt: new Date(),
        createdAt: new Date(),
        messages: [newMessage],
        botState: createQueuedBotState(queueItem),
        unreadCount: 1,
        status: 'open',
        source: 'WHATSAPP',
        primary_channel: 'whatsapp',
        platform_ids: { whatsapp: profile.contactNumber },
        kanbanCardId: conversationId,
        kanbanGroupId: groupId,
        ...(profile.recipientPhoneNumberId
            ? { whatsappPhoneNumberId: String(profile.recipientPhoneNumberId) }
            : {}),
    };

    await convRef.set(base);
    await cardRef.set(
        buildThinCardPayload({
            conversationId,
            groupId,
            data: base,
        })
    );

    return { conversationId, cardId: conversationId, groupId };
}
