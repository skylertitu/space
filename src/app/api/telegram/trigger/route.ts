import { NextResponse } from 'next/server';
import { db, admin } from '@/lib/firebase-admin';
import { processChatbotFlow } from '@/lib/chatbotEngine';
import { guardApi } from '@/lib/apiAuth';

/**
 * POST /api/telegram/trigger
 * Manually triggers the chatbot engine for a specific card with pending messages.
 * Used for debugging and recovering from stuck states.
 * 
 * Body: { userId, entityId, groupId, cardId }
 * OR query: ?u=userId&e=entityId
 *   -> will auto-find the Telegram card with pending messages
 */
export async function POST(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('u');
    const entityId = searchParams.get('e');

    if (!userId || !entityId) {
        return NextResponse.json({ error: 'Missing u (userId) or e (entityId) query params' }, { status: 400 });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const entityPath = `users/${userId}/entities/${entityId}`;

        let groupId: string | null = body.groupId || null;
        let cardId: string | null = body.cardId || null;
        let telegramChatId: string | null = body.telegramChatId || null;

        // Auto-find: scan for Telegram cards with pending messages
        if (!cardId) {
            const groupsSnap = await db.collection(`${entityPath}/kanban-groups`).get();
            for (const groupDoc of groupsSnap.docs) {
                const cardsSnap = await groupDoc.ref.collection('cards')
                    .where('channel', '==', 'telegram')
                    .get();
                for (const cardDoc of cardsSnap.docs) {
                    const data = cardDoc.data();
                    const nestedQueue = data.botState?.messageQueue || [];
                    const flatQueue = data['botState.messageQueue'] || [];
                    if (nestedQueue.length > 0 || flatQueue.length > 0) {
                        groupId = groupDoc.id;
                        cardId = cardDoc.id;
                        telegramChatId = String(data.telegramChatId || '');
                        console.log(`[Trigger] Found pending card: ${cardId} in group ${groupId} | nested: ${nestedQueue.length} | flat: ${flatQueue.length}`);
                        break;
                    }
                }
                if (cardId) break;
            }
        }

        if (!cardId || !groupId) {
            return NextResponse.json({ 
                success: false, 
                message: 'No Telegram cards with pending messages found.',
                tip: 'Send a message from Telegram first, then call this endpoint.'
            });
        }

        // Read the card to get queue info
        const cardRef = db.doc(`${entityPath}/kanban-groups/${groupId}/cards/${cardId}`);
        const cardSnap = await cardRef.get();
        const cardData = cardSnap.data() || {};
        
        const nestedQueue = cardData.botState?.messageQueue || [];
        const flatQueue = cardData['botState.messageQueue'] || [];
        const allPending = [...nestedQueue, ...flatQueue].filter((v, i, a) => 
            a.findIndex(t => t.messageId === v.messageId) === i
        );

        if (allPending.length === 0) {
            // No pending messages, but still try to trigger with a synthetic "hola" to restart flow
            console.log(`[Trigger] No pending messages in queue for ${cardId}. Triggering with current text context.`);
        }

        // First, release any stale botLock
        const lock = cardData.botLock;
        if (lock) {
            const lockTime = lock.toDate?.() || new Date(lock);
            const ageSeconds = (Date.now() - lockTime.getTime()) / 1000;
            if (ageSeconds > 30) {
                await cardRef.update({ botLock: admin.firestore.FieldValue.delete() });
                console.log(`[Trigger] Released stale botLock (age: ${ageSeconds.toFixed(0)}s)`);
            }
        }

        // Trigger the engine using the first pending message (or a synthetic trigger)
        const triggerMsg = allPending[0] || {
            text: body.text || 'hola',
            messageId: `trigger_${Date.now()}`,
            platform: 'telegram',
            from: telegramChatId || cardId.replace('tg_', ''),
            timestamp: Date.now()
        };

        console.log(`[Trigger] Firing engine for card ${cardId} | msg: "${triggerMsg.text}" [${triggerMsg.messageId}]`);

        // CRITICAL: Add the message to the Firestore queue first (engine only reads from queue)
        await cardRef.update({
            'botState.messageQueue': admin.firestore.FieldValue.arrayUnion(triggerMsg),
            lastMessage: (triggerMsg.text || '').substring(0, 50),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Fire async (don't await so the response returns quickly)
        processChatbotFlow({
            userId,
            entityId,
            groupId,
            cardId,
            platform: 'telegram',
            from: String(triggerMsg.from || telegramChatId || ''),
            text: triggerMsg.text || '',
            messageId: triggerMsg.messageId
        }).catch((err: any) => {
            console.error(`[Trigger] Engine error:`, err.message);
        });

        return NextResponse.json({
            success: true,
            triggered: true,
            cardId,
            groupId,
            pendingMessages: allPending.length,
            triggerMessage: triggerMsg.text,
            note: 'Engine fired. Check server logs for [ChatbotEngine] entries.'
        });

    } catch (error: any) {
        console.error('[Trigger Error]', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function GET(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;
    return NextResponse.json({ 
        info: 'POST to this endpoint to manually trigger the chatbot engine',
        usage: 'POST /api/telegram/trigger?u=userId&e=entityId',
        optionalBody: { groupId: 'optional', cardId: 'optional', text: 'optional' }
    });
}
