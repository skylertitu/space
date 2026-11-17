import { admin } from '@/lib/firebase-admin';
import {
    ensureConversationFromCard,
    findConversationByPhone,
    ensureConversationByPhone,
    syncThinCardPreview,
} from '@/lib/conversations/store';
import { phoneSearchVariants } from '@/lib/phoneUtils';
import { isBroadcastTemplatePlaceholder } from '@/app/home/[entityId]/cmo/broadcast/list/lib/resolveBroadcastMessageText';

type AdminDb = FirebaseFirestore.Firestore;

export interface LogBroadcastMessageParams {
    db: AdminDb;
    tenantPath: string;
    userId?: string;
    entityId?: string;
    phone: string;
    text: string;
    broadcastId: string;
    broadcastName?: string;
    messageId?: string | null;
    mediaUrl?: string;
    mediaType?: string;
    filename?: string;
    /** Skip write when this broadcast message is already in the thread. */
    skipIfExists?: boolean;
}

function cleanPhone(phone: string): string {
    return String(phone || '').replace(/\D/g, '');
}

function phoneVariants(phone: string, clean: string): string[] {
    return phoneSearchVariants(phone || clean);
}

export function buildBroadcastConversationMessage(params: {
    text: string;
    broadcastId: string;
    broadcastName?: string;
    messageId?: string | null;
    mediaUrl?: string;
    mediaType?: string;
    filename?: string;
}): Record<string, unknown> {
    const { text, broadcastId, broadcastName, messageId, mediaUrl, mediaType, filename } = params;

    const newMessage: Record<string, unknown> = {
        sender: 'agent',
        text: text || '',
        timestamp: admin.firestore.Timestamp.now(),
        whatsappMessageId: messageId || null,
        platform: 'whatsapp',
        status: 'sent',
        source: 'broadcast',
        isBroadcast: true,
        metadata: {
            source: 'broadcast',
            broadcastId,
            broadcastName: broadcastName || null,
        },
    };

    if (mediaUrl) {
        newMessage.type = 'media';
        newMessage.fileUrl = mediaUrl;
        newMessage.fileName = filename || null;
        newMessage.fileType =
            mediaType === 'image'
                ? 'image/*'
                : mediaType === 'video'
                  ? 'video/*'
                  : mediaType === 'audio'
                    ? 'audio/*'
                    : 'application/octet-stream';
    }

    return newMessage;
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
        if (!m || typeof m !== 'object') return m;
        const msg = m as Record<string, unknown>;
        const meta = msg.metadata as { broadcastId?: string; source?: string } | undefined;
        const isBroadcast =
            meta?.broadcastId === broadcastId ||
            meta?.source === 'broadcast' ||
            msg.source === 'broadcast' ||
            msg.isBroadcast === true;

        const current = String(msg.text || '');
        if (isBroadcastTemplatePlaceholder(current) || (isBroadcast && !current.trim())) {
            changed = true;
            return { ...msg, text: resolvedText };
        }
        return m;
    });

    return changed ? next : null;
}

function messageAlreadyLogged(
    messages: unknown,
    broadcastId: string,
    messageId?: string | null
): boolean {
    if (!Array.isArray(messages)) return false;
    return messages.some((m) => {
        if (!m || typeof m !== 'object') return false;
        const meta = (m as { metadata?: { broadcastId?: string } }).metadata;
        if (meta?.broadcastId === broadcastId) return true;
        if (messageId && (m as { whatsappMessageId?: string }).whatsappMessageId === messageId) {
            return true;
        }
        return false;
    });
}

async function resolveCardByPhone(
    db: AdminDb,
    tenantPath: string,
    phone: string,
    cleanTo: string
): Promise<{ cardId: string; groupId: string; cardData: Record<string, unknown> } | null> {
    const variants = phoneVariants(phone, cleanTo);

    const groupsSnap = await db.collection(`${tenantPath}/kanban-groups`).get();
    for (const groupDoc of groupsSnap.docs) {
        const cardsRef = groupDoc.ref.collection('cards');

        for (const field of ['contactNumberClean', 'contactNumber'] as const) {
            for (const val of variants) {
                const snap = await cardsRef.where(field, '==', val).limit(3).get();
                if (!snap.empty) {
                    const sorted = snap.docs.sort((a, b) => {
                        const tA = (a.data().updatedAt?.toDate?.() || new Date(0)).getTime();
                        const tB = (b.data().updatedAt?.toDate?.() || new Date(0)).getTime();
                        return tB - tA;
                    });
                    return {
                        cardId: sorted[0].id,
                        groupId: groupDoc.id,
                        cardData: sorted[0].data() || {},
                    };
                }
            }
        }
    }

    for (const val of variants) {
        const contactSnaps = await db
            .collection(`${tenantPath}/contacts`)
            .where('phone', '==', val)
            .limit(1)
            .get()
            .catch(() => null);

        if (contactSnaps && !contactSnaps.empty) {
            const contact = contactSnaps.docs[0].data();
            const cardId = contact.kanbanCardId as string | undefined;
            const groupId = contact.kanbanGroupId as string | undefined;
            if (cardId && groupId) {
                const cardSnap = await db
                    .doc(`${tenantPath}/kanban-groups/${groupId}/cards/${cardId}`)
                    .get();
                return {
                    cardId,
                    groupId,
                    cardData: cardSnap.exists ? cardSnap.data() || {} : {},
                };
            }
        }
    }

    return null;
}

/**
 * Persist an outbound broadcast message into the stable conversation store
 * so it appears in omnichannel / broadcast result chats.
 */
export async function logBroadcastMessageToConversation(
    params: LogBroadcastMessageParams
): Promise<{ logged: boolean; reason?: string }> {
    const {
        db,
        tenantPath,
        phone,
        text,
        broadcastId,
        broadcastName,
        messageId,
        mediaUrl,
        mediaType,
        filename,
        skipIfExists = true,
    } = params;

    const cleanTo = cleanPhone(phone);
    if (!cleanTo || cleanTo.length < 8) {
        return { logged: false, reason: 'invalid_phone' };
    }

    if (isBroadcastTemplatePlaceholder(text)) {
        return { logged: false, reason: 'placeholder_text' };
    }

    const newMessage = buildBroadcastConversationMessage({
        text,
        broadcastId,
        broadcastName,
        messageId,
        mediaUrl,
        mediaType,
        filename,
    });

    const previewText = text || filename || 'Campaña broadcast';
    const lastMessage =
        previewText.length > 40 ? `${previewText.substring(0, 37)}...` : previewText;

    const cardMatch = await resolveCardByPhone(db, tenantPath, phone, cleanTo);

    if (cardMatch) {
        const { cardId, groupId, cardData } = cardMatch;
        const cardRef = db.doc(`${tenantPath}/kanban-groups/${groupId}/cards/${cardId}`);

        const ensured = await ensureConversationFromCard({
            db,
            tenantPath,
            cardId,
            groupId,
            cardData: { ...cardData, contactNumberClean: cleanTo, contactNumber: phone },
            cardRef,
        });

        const convSnap = await ensured.ref.get();
        const existingMessages = convSnap.data()?.messages;
        if (skipIfExists && messageAlreadyLogged(existingMessages, broadcastId, messageId)) {
            const upgraded = upgradePlaceholderBroadcastMessages(existingMessages, broadcastId, text);
            if (upgraded) {
                await ensured.ref.update({
                    lastMessage,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    messages: upgraded,
                    unreadCount: 0,
                    contactNumberClean: cleanTo,
                    contactNumber: phone,
                });
                await syncThinCardPreview({
                    db,
                    tenantPath,
                    conversationId: ensured.conversationId,
                    groupId,
                    cardId,
                    data: { lastMessage, updatedAt: new Date(), unreadCount: 0, contactNumberClean: cleanTo, contactNumber: phone },
                });
                return { logged: true, reason: 'upgraded' };
            }
            return { logged: false, reason: 'already_logged' };
        }

        await ensured.ref.update({
            lastMessage,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            messages: admin.firestore.FieldValue.arrayUnion(newMessage),
            unreadCount: 0,
            contactNumberClean: cleanTo,
            contactNumber: phone,
        });

        await syncThinCardPreview({
            db,
            tenantPath,
            conversationId: ensured.conversationId,
            groupId,
            cardId,
            data: {
                lastMessage,
                updatedAt: new Date(),
                unreadCount: 0,
                contactNumberClean: cleanTo,
                contactNumber: phone,
            },
        });

        return { logged: true };
    }

    // Fallback: conversation exists by phone but card lookup failed.
    const byPhone = await findConversationByPhone(db, tenantPath, cleanTo);
    if (byPhone) {
        if (skipIfExists && messageAlreadyLogged(byPhone.data.messages, broadcastId, messageId)) {
            const upgraded = upgradePlaceholderBroadcastMessages(byPhone.data.messages, broadcastId, text);
            if (upgraded) {
                await byPhone.ref.update({
                    lastMessage,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    messages: upgraded,
                    unreadCount: 0,
                    contactNumberClean: cleanTo,
                    contactNumber: phone,
                });
                const groupId = byPhone.data.kanbanGroupId as string | undefined;
                const cardId = byPhone.data.kanbanCardId as string | undefined;
                if (groupId && cardId) {
                    await syncThinCardPreview({
                        db,
                        tenantPath,
                        conversationId: byPhone.id,
                        groupId,
                        cardId,
                        data: { lastMessage, updatedAt: new Date(), unreadCount: 0, contactNumberClean: cleanTo, contactNumber: phone },
                    });
                }
                return { logged: true, reason: 'upgraded' };
            }
            return { logged: false, reason: 'already_logged' };
        }

        await byPhone.ref.update({
            lastMessage,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            messages: admin.firestore.FieldValue.arrayUnion(newMessage),
            unreadCount: 0,
            contactNumberClean: cleanTo,
            contactNumber: phone,
        });

        const groupId = byPhone.data.kanbanGroupId as string | undefined;
        const cardId = byPhone.data.kanbanCardId as string | undefined;
        if (groupId && cardId) {
            await syncThinCardPreview({
                db,
                tenantPath,
                conversationId: byPhone.id,
                groupId,
                cardId,
                data: {
                    lastMessage,
                    updatedAt: new Date(),
                    unreadCount: 0,
                    contactNumberClean: cleanTo,
                    contactNumber: phone,
                },
            });
        }

        return { logged: true };
    }

    // Last resort: create conversation in omnicanal inbox so the message is never lost.
    const ensured = await ensureConversationByPhone({
        db,
        tenantPath,
        phone,
        cleanPhone: cleanTo,
    });

    await ensured.ref.update({
        lastMessage,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        messages: admin.firestore.FieldValue.arrayUnion(newMessage),
        unreadCount: 0,
        contactNumberClean: cleanTo,
        contactNumber: phone,
    });

    await syncThinCardPreview({
        db,
        tenantPath,
        conversationId: ensured.id,
        groupId: ensured.groupId,
        cardId: ensured.cardId,
        data: {
            lastMessage,
            updatedAt: new Date(),
            unreadCount: 0,
            contactNumberClean: cleanTo,
            contactNumber: phone,
        },
    });

    return { logged: true, reason: ensured.created ? 'created' : 'ensured' };
}
