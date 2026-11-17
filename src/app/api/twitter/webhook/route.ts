import { NextResponse } from 'next/server';
import { db, admin } from '@/lib/firebase-admin';
import { processChatbotFlow } from '@/lib/chatbotEngine';
import { buildBotQueueItem, createQueuedBotState, isDuplicateQueueMessage } from '@/lib/botQueue';
import { isXCommentInteraction, resolveXBotRouting } from '@/lib/automation/xBotRouting';
import { resolveTwitterTenant } from '@/lib/xWebhookHelpers';
import crypto from 'crypto';
import { checkTwitterSignature } from '@/lib/webhookSignature';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Give the chatbot engine room to finish a full flow step (see whatsapp/webhook for details).
export const maxDuration = 300;

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const crc_token = searchParams.get('crc_token');

    if (crc_token) {
        const consumer_secret = process.env.TWITTER_CONSUMER_SECRET || '';
        const hmac = crypto.createHmac('sha256', consumer_secret).update(crc_token).digest('base64');
        return NextResponse.json({ response_token: `sha256=${hmac}` });
    }

    return new Response('Twitter Webhook Active', { status: 200 });
}

async function ingestXMessage(params: {
    tenant: Awaited<ReturnType<typeof resolveTwitterTenant>>;
    senderId: string;
    text: string;
    messageId: string;
    resolvedName: string;
    routing: ReturnType<typeof resolveXBotRouting>;
    tweetId?: string;
    inReplyToTweetId?: string;
}) {
    const { tenant, senderId, text, messageId, resolvedName, routing, tweetId, inReplyToTweetId } = params;
    if (!tenant) return null;

    const { userId, entityId, entityPath } = tenant;

    const dedupRef = db.doc(`${entityPath}/processed_messages/${messageId}`);
    const dedupSnap = await dedupRef.get();
    if (dedupSnap.exists) return { duplicate: true as const };

    await dedupRef.set({
        timestamp: Date.now(),
        senderId,
        type: routing.interactionType === 'comment' ? 'x_comment' : 'x_dm',
    });

    let targetCardDoc: admin.firestore.QueryDocumentSnapshot | null = null;
    let targetGroupId: string | null = null;

    const cardsSnap = await db.collectionGroup('cards')
        .where('platform_ids.x_twitter', '==', senderId)
        .get();

    const entityCard = cardsSnap.docs.find((d) => d.ref.path.startsWith(entityPath));
    if (entityCard) {
        targetCardDoc = entityCard;
        const cardPathParts = entityCard.ref.path.split('/');
        targetGroupId = cardPathParts[cardPathParts.indexOf('kanban-groups') + 1];
    }

    const platformLabel = routing.interactionType === 'comment' ? 'x_twitter' : 'x_twitter';
    const sourceLabel = routing.interactionType === 'comment' ? 'X_COMMENT' : 'TWITTER';

    const newMessage = {
        sender: 'user' as const,
        text,
        timestamp: admin.firestore.Timestamp.now(),
        messageId,
        platform: platformLabel,
        ...(tweetId ? { metadata: { tweetId, inReplyToTweetId } } : {}),
    };

    const queueItem = {
        ...buildBotQueueItem({
            text,
            messageId: messageId || `x_${Date.now()}`,
            platform: routing.platform,
            from: senderId,
        }),
        ...(tweetId ? { tweetId, inReplyToTweetId } : {}),
    };

    let cardId: string;
    let groupId: string;

    if (targetCardDoc && targetGroupId) {
        const alreadyQueued = isDuplicateQueueMessage(targetCardDoc.data(), messageId);
        const cardUpdate: Record<string, any> = {
            contactName: resolvedName,
            lastMessage: text.length > 50 ? `${text.substring(0, 47)}...` : text,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            unreadCount: admin.firestore.FieldValue.increment(1),
            messages: admin.firestore.FieldValue.arrayUnion(newMessage),
            'botState.engine': 'queue',
            status: 'open',
            source: sourceLabel,
            channel: 'twitter',
            primary_channel: routing.interactionType === 'comment' ? 'x_twitter_comments' : 'x_twitter',
            ...(tweetId ? {
                'customFields.lastTweetId': tweetId,
                'customFields.inReplyToTweetId': inReplyToTweetId || null,
            } : {}),
        };
        if (!alreadyQueued) {
            cardUpdate['botState.messageQueue'] = admin.firestore.FieldValue.arrayUnion(queueItem);
        }
        await targetCardDoc.ref.update(cardUpdate);
        cardId = targetCardDoc.id;
        groupId = targetGroupId;
    } else {
        const groupsRef = db.collection(`${entityPath}/kanban-groups`);
        const groupsSnap = await groupsRef.get();
        const inboxGroup = groupsSnap.docs.find(
            (g) => (g.data().name || '').toLowerCase().includes('inbox') ||
                (g.data().name || '').toLowerCase().includes('entrada')
        );
        groupId = inboxGroup ? inboxGroup.id : (groupsSnap.empty ? 'default_inbox' : groupsSnap.docs[0].id);

        if (!inboxGroup && groupsSnap.empty) {
            await groupsRef.doc('default_inbox').set({
                name: 'Inbox',
                order: 0,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        const newCardRef = db.collection(`${entityPath}/kanban-groups/${groupId}/cards`).doc();
        await newCardRef.set({
            id: newCardRef.id,
            contactName: resolvedName,
            contactNumber: senderId,
            lastMessage: text.length > 50 ? `${text.substring(0, 47)}...` : text,
            updatedAt: admin.firestore.Timestamp.now(),
            createdAt: admin.firestore.Timestamp.now(),
            messages: [newMessage],
            botState: createQueuedBotState(queueItem),
            unreadCount: 1,
            status: 'open',
            source: sourceLabel,
            channel: 'twitter',
            primary_channel: routing.interactionType === 'comment' ? 'x_twitter_comments' : 'x_twitter',
            platform_ids: { x_twitter: senderId },
            ...(tweetId ? {
                customFields: { lastTweetId: tweetId, inReplyToTweetId: inReplyToTweetId || null },
            } : {}),
        });
        cardId = newCardRef.id;
    }

    await processChatbotFlow({
        userId,
        entityId,
        groupId,
        cardId,
        platform: routing.platform as 'x_twitter',
        from: senderId,
        text,
        messageId,
        botsCollection: routing.botsCollection,
    });

    return { success: true as const };
}

export async function POST(req: Request) {
    console.log('[Twitter Webhook] INCOMING EVENT');

    try {
        const rawBody = await req.text();
        const sigDenied = checkTwitterSignature(req, rawBody);
        if (sigDenied) return sigDenied;
        const body = JSON.parse(rawBody);
        const tenant = await resolveTwitterTenant(body);

        if (!tenant) {
            console.error('[Twitter Webhook] No tenant found for X User ID:', body.for_user_id);
            return NextResponse.json({ success: false, error: 'Tenant not mapped' });
        }

        // --- PUBLIC: replies, @mentions, quotes → X Comentarios Bots ---
        if (body.tweet_create_events?.length) {
            let processed = 0;
            for (const tweet of body.tweet_create_events) {
                if (!isXCommentInteraction(tweet, tenant.ourUserId)) continue;

                const senderId = tweet.user?.id_str || tweet.user?.id;
                const text = tweet.text || '';
                const messageId = tweet.id_str || tweet.id;
                if (!senderId || !text || !messageId) continue;

                const resolvedName = tweet.user?.name || tweet.user?.screen_name || `X User ${String(senderId).slice(-4)}`;
                const routing = resolveXBotRouting('comment');

                const result = await ingestXMessage({
                    tenant,
                    senderId: String(senderId),
                    text,
                    messageId: String(messageId),
                    resolvedName,
                    routing,
                    tweetId: String(messageId),
                    inReplyToTweetId: tweet.in_reply_to_status_id_str || undefined,
                });

                if (result && !('duplicate' in result)) processed++;
            }
            return NextResponse.json({ success: true, processed_comments: processed });
        }

        // --- DM events → X DM Bots (unchanged flow) ---
        if (!body.direct_message_events?.length) {
            return NextResponse.json({ success: true, ignored: 'no_supported_events' });
        }

        const event = body.direct_message_events[0];
        if (event.type !== 'message_create') {
            return NextResponse.json({ success: true, ignored: 'not_message_create' });
        }

        const messageData = event.message_create;
        const senderId = messageData.sender_id;

        if (senderId === body.for_user_id) {
            return NextResponse.json({ success: true, ignored: 'echo' });
        }

        const text = messageData.message_data.text;
        const messageId = event.id;
        const resolvedName = body.users?.[senderId]?.name || `X User ${String(senderId).slice(-4)}`;
        const routing = resolveXBotRouting('dm');

        await ingestXMessage({
            tenant,
            senderId,
            text,
            messageId,
            resolvedName,
            routing,
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[Twitter Webhook] Error:', error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
