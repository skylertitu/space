import { NextResponse } from 'next/server';
import { checkMetaSignature } from '@/lib/webhookSignature';
import { db, admin } from '@/lib/firebase-admin';
import fs from 'fs';
import path from 'path';
import { processChatbotFlow } from '@/lib/chatbotEngine';
import { buildBotQueueItem, isDuplicateQueueMessage } from '@/lib/botQueue';
import { extractWhatsAppInboundPayload } from '@/lib/whatsappInbound';
import { buildInboundWhatsAppUserMessage } from '@/lib/whatsapp/inboundMessageBuilder';
import {
    cleanWhatsAppSenderId,
    resolveWhatsAppTenant,
} from '@/lib/whatsappTenant';
import { isInboxGroup, SYSTEM_INBOX_GROUP_ID, SYSTEM_INBOX_GROUP_FIELDS } from '@/lib/kanban/botNodeGroups';
import { phoneReplyIndexKeys, phoneSearchVariants } from '@/lib/phoneUtils';
import {
    appendInboundToConversation,
    createConversationWithThinCard,
    ensureConversationFromCard,
    findConversationByPhone,
    syncThinCardPreview,
} from '@/lib/conversations/store';
import {
    findConversationForBroadcastReply,
    syncBroadcastRecipientReply,
} from '@/lib/broadcast/syncBroadcastRecipientReplies'; // BROADCAST ONLY

const DEBUG_FILE = '/tmp/webhook.log';

function debugLog(msg: string) {
    const time = new Date().toISOString();
    const logMsg = `[${time}] [Webhook Debug] ${msg}\n`;
    console.log(logMsg.trim());
    try { fs.appendFileSync(DEBUG_FILE, logMsg); } catch (e) {
        console.error("Failed to write to debug file:", e);
    }
}

// Meta Webhook Verification (Handshake)
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// CRITICAL: the chatbot engine runs synchronously inside this webhook (sending several
// WhatsApp messages, Firestore transactions and kanban syncs per inbound message). Without
// an explicit limit the function is killed at the platform default (~10-15s), which leaves the
// flow half-executed: the queue item is never drained and the next question is never sent, so
// the customer's replies pile up unanswered. Give the engine room to finish a full flow step.
export const maxDuration = 300;

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    const userId = searchParams.get('u');
    const entityId = searchParams.get('e');
    const incomingToken = (token || '').trim();
    let expectedToken = (
        process.env.kamban_VERIFY_TOKEN ||
        process.env.WHATSAPP_VERIFY_TOKEN ||
        'vg37e'
    ).trim();

    const hasValidTenantParams =
        !!userId &&
        !!entityId &&
        !userId.includes('TU_UID') &&
        userId.length >= 10;

    // MULTI-TENANT VERIFICATION: If IDs are in URL, we check the tenant's specific token
    if (hasValidTenantParams) {
        try {
            const [publicSnap, internalSnap] = await Promise.all([
                db.doc(`users/${userId}/entities/${entityId}/integrations/whatsapp`).get(),
                db.doc(`users/${userId}/entities/${entityId}/integrations/whatsapp_internal`).get()
            ]);

            const tenantToken = (publicSnap.data()?.verifyToken || internalSnap.data()?.verifyToken || '').trim();
            if (tenantToken) expectedToken = tenantToken;
        } catch (err) {
            debugLog(`[GET] Error loading tenant token: ${err}`);
        }
    }

    if (mode === 'subscribe' && incomingToken === expectedToken) {
        debugLog(`Verification successful (GET) | Tenant: ${entityId || 'Global'}`);
        return new Response(challenge, { status: 200 });
    }
    debugLog(`Verification failed (GET) | Expected: ${expectedToken}, Got: ${incomingToken} | TenantParams: ${hasValidTenantParams}`);
    return new Response('Forbidden', { status: 403 });
}

// POST: Handle incoming messages
export async function POST(req: Request) {
    debugLog('--- [Master Webhook] INCOMING HIT ---');

    try {
        const { searchParams } = new URL(req.url);
        let body;
        try {
            const rawBody = await req.text();
            const sigDenied = checkMetaSignature(req, rawBody, 'whatsapp');
            if (sigDenied) return sigDenied;
            debugLog(`[POST] Raw Body Length: ${rawBody.length}`);
            body = JSON.parse(rawBody);
        } catch (parseError: any) {
            debugLog(`[POST] ❌ JSON Parse Error: ${parseError.message}`);
            return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
        }

        const entry = body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const metadata = value?.metadata;
        const recipientPhoneNumberId = metadata?.phone_number_id;

        // 1. TENANT IDENTIFICATION (Optimized O(1) Indexed Lookup)
        debugLog(`[POST] Searching tenant for Phone ID: ${recipientPhoneNumberId}`);

        const tenant = await resolveWhatsAppTenant(
            recipientPhoneNumberId,
            searchParams.get('u'),
            searchParams.get('e')
        );

        if (!tenant) {
            debugLog(`[POST] ❌ ABORT: Could not resolve tenant for Phone ID ${recipientPhoneNumberId}`);
            // DIAGNOSTIC: leave a visible trace so unmapped numbers can be identified.
            // Without this, dropped inbound messages are completely invisible.
            try {
                const inboundFrom = value?.messages?.[0]?.from || value?.statuses?.[0]?.recipient_id || 'unknown';
                await db.doc(`webhook_diagnostics/unmapped_${recipientPhoneNumberId || 'unknown'}`).set({
                    phoneNumberId: recipientPhoneNumberId || 'unknown',
                    lastFrom: inboundFrom,
                    payloadType: value?.messages ? 'message' : (value?.statuses ? 'status' : 'other'),
                    displayPhoneNumber: metadata?.display_phone_number || null,
                    lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
                    hits: admin.firestore.FieldValue.increment(1),
                }, { merge: true });
            } catch (e) {}
            return NextResponse.json({ success: true, ignored: 'tenant_not_mapped' });
        }

        const userId = tenant.userId;
        const entityId = tenant.entityId;
        debugLog(`[POST] Tenant Discovery Success: User=${userId}, Entity=${entityId}`);

        try {
            await db.collection(`users/${userId}/entities/${entityId}/system_logs`).add({
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                type: 'whatsapp_webhook',
                phoneId: recipientPhoneNumberId || 'unknown',
                payload_type: value?.messages ? 'message' : (value?.statuses ? 'status' : 'other'),
                raw: JSON.stringify(body).substring(0, 1500)
            });
        } catch (e) {}

        // Base path for this specific tenant's entity
        const entityPath = `users/${userId}/entities/${entityId}`;

        // 2. STATUS UPDATES (Read receipts, delivery, etc.)
        if (value?.statuses && value.statuses.length > 0) {
            const statusUpdate = value.statuses[0];
            const status = statusUpdate.status;
            const messageId = statusUpdate.id;
            const recipientId = statusUpdate.recipient_id;

            debugLog(`[POST] Status Update [${status}] for message ${messageId} in tenant ${entityId}`);

            // Find card containing this message in the tenant's context
            const cardsRef = db.collection(`${entityPath}/kanban-groups`);
            const groupsSnapshot = await cardsRef.get();

            // OPTIMIZED: Search in parallel instead of sequentially blocking
            const updatePromises = groupsSnapshot.docs.map(async (group) => {
                const cardSnapshot = await group.ref.collection('cards')
                    .where('platform_ids.whatsapp', '==', recipientId)
                    .get();

                if (!cardSnapshot.empty) {
                    const cardDoc = cardSnapshot.docs[0];
                    const messages = cardDoc.data().messages || [];
                    let changed = false;

                    const updatedMessages = messages.map((m: any) => {
                        if (m.whatsappMessageId === messageId || m.kambanMessageId === messageId) {
                            changed = true;
                            return { ...m, status: status };
                        }
                        return m;
                    });

                    if (changed) {
                        await cardDoc.ref.update({ messages: updatedMessages });
                        debugLog(`[POST] Status synced to card ${cardDoc.id}`);
                    }
                }
            });

            await Promise.all(updatePromises);

            // --- Broadcast delivery/read tracking (best-effort, fully isolated) ---
            try {
                if (messageId && (status === 'delivered' || status === 'read')) {
                    const idxSnap = await db.doc(`${entityPath}/broadcast_msg_index/${messageId}`).get();
                    if (idxSnap.exists) {
                        const { broadcastId, recipientId } = idxSnap.data() as any;
                        const recRef = db.doc(`${entityPath}/broadcasts/${broadcastId}/recipients/${recipientId}`);
                        const recSnap = await recRef.get();
                        if (recSnap.exists) {
                            const cur = recSnap.data() as any;
                            const rank: Record<string, number> = { sent: 1, delivered: 2, read: 3 };
                            if (cur.status !== 'replied' && (rank[status] || 0) > (rank[cur.status] || 0)) {
                                await recRef.update({ status });
                                const field = status === 'delivered' ? 'stats.delivered' : 'stats.read';
                                await db.doc(`${entityPath}/broadcasts/${broadcastId}`).update({
                                    [field]: admin.firestore.FieldValue.increment(1),
                                });
                            }
                        }
                    }
                }
            } catch (e) {
                debugLog('[POST] Broadcast status tracking skipped (non-fatal).');
            }

            return NextResponse.json({ success: true });
        }

        // 3. INCOMING MESSAGE HANDLING
        const message = value?.messages?.[0];
        if (message) {
            // Drop bot echoes and invalid messages entirely to prevent empty duplicate cards
            if (message.from === recipientPhoneNumberId || message.is_echo || value?.statuses) {
                return NextResponse.json({ success: true, ignored: 'echo_or_status' });
            }

            const from = message.from;
            const { text, shouldProcess } = extractWhatsAppInboundPayload(message);
            let displayPrefText = text;
            if (message.type === 'interactive') {
                displayPrefText = message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || text;
            } else if (message.type === 'button') {
                displayPrefText = message.button?.text || text;
            }

            const messageId = message.id;
            debugLog(`[POST] Message from ${from}: "${text}" (Tenant: ${entityId})`);

            if (from && shouldProcess) {
                const cleanFrom = cleanWhatsAppSenderId(from);
                
                // Strict Validation: Prevent blank/ghost records if Meta API hallucinates
                if (!cleanFrom || cleanFrom.length < 5) {
                    debugLog('[POST] Ignoring message: Missing or invalid phone number from Meta.');
                    return NextResponse.json({ success: true, ignored: 'invalid_sender_format' });
                }

                // ─── BROADCAST ONLY: reply tracking (aislado; no afecta bots) ───
                let broadcastReplyMatch: {
                    broadcastId: string;
                    recipientId: string;
                    recipientRef: FirebaseFirestore.DocumentReference;
                } | null = null;

                try {
                    const replyKeys = phoneReplyIndexKeys(cleanFrom);
                    let replyIdxSnap: admin.firestore.DocumentSnapshot | null = null;
                    let matchedReplyKey = '';

                    for (const replyKey of replyKeys) {
                        const snap = await db.doc(`${entityPath}/broadcast_reply_index/${replyKey}`).get();
                        if (snap.exists) {
                            replyIdxSnap = snap;
                            matchedReplyKey = replyKey;
                            break;
                        }
                    }

                    if (replyIdxSnap?.exists) {
                        const { broadcastId, recipientId } = replyIdxSnap.data() as any;
                        const recRef = db.doc(`${entityPath}/broadcasts/${broadcastId}/recipients/${recipientId}`);
                        const recSnap = await recRef.get();
                        if (recSnap.exists) {
                            const cur = recSnap.data() as any;
                            const replyBody = String(displayPrefText || text || '').trim();
                            broadcastReplyMatch = { broadcastId, recipientId, recipientRef: recRef };

                            if (cur.status !== 'replied') {
                                await recRef.update({
                                    status: 'replied',
                                    repliedAt: admin.firestore.FieldValue.serverTimestamp(),
                                    ...(replyBody ? { replyText: replyBody.slice(0, 2000) } : {}),
                                    ...(messageId ? { replyMessageId: messageId } : {}),
                                });
                                await db.doc(`${entityPath}/broadcasts/${broadcastId}`).update({
                                    'stats.replied': admin.firestore.FieldValue.increment(1),
                                });
                            } else if (replyBody && !cur.replyText) {
                                await recRef.update({
                                    replyText: replyBody.slice(0, 2000),
                                    ...(messageId ? { replyMessageId: messageId } : {}),
                                });
                            }
                        }
                        // Consume all variant keys so subsequent messages aren't recounted.
                        await Promise.all(
                            replyKeys.map((key) =>
                                db.doc(`${entityPath}/broadcast_reply_index/${key}`).delete().catch(() => {})
                            )
                        );
                        if (matchedReplyKey) {
                            debugLog(`[POST] Broadcast reply tracked via key ${matchedReplyKey}`);
                        }
                    }
                } catch (e) {
                    debugLog('[POST] Broadcast reply tracking skipped (non-fatal).');
                }
                // ─── FIN BROADCAST ONLY (tracking) ───

                // OPTIMIZED O(1) Search: Find group and card via indexed Contacts context
                let targetCardDoc: any = null;
                let targetGroupId: string | null = null;
                let existingContactId: string | null = null;
                let existingContactName: string | null = null;

                let contactDoc: { id: string; data: () => Record<string, any> } | null = null;
                for (const phoneVariant of phoneSearchVariants(cleanFrom)) {
                    const snap = await db.collection(`${entityPath}/contacts`)
                        .where('phone', '==', phoneVariant)
                        .limit(1)
                        .get();
                    if (!snap.empty) {
                        contactDoc = snap.docs[0];
                        break;
                    }
                }

                if (contactDoc) {
                    const contactData = contactDoc.data() || {};
                    existingContactId = contactDoc.id;
                    existingContactName = contactData.name || contactData.contactName || contactData.firstName || null;
                    targetGroupId = contactData.kanbanGroupId;
                    const contactCardId = contactData.kanbanCardId;

                    if (targetGroupId && contactCardId) {
                        const cardRef = db.doc(`${entityPath}/kanban-groups/${targetGroupId}/cards/${contactCardId}`);
                        const cardGet = await cardRef.get();
                        if (cardGet.exists) {
                            targetCardDoc = cardGet;
                        } else {
                            // 👻 TARJETA FANTASMA: Borrar referencia para permitir re-creación
                            console.log(`[Webhook] 👻 Ghost card detected (${contactCardId}). Clearing reference.`);
                            await db.doc(`${entityPath}/contacts/${existingContactId}`).update({
                                kanbanCardId: admin.firestore.FieldValue.delete(),
                                kanbanGroupId: admin.firestore.FieldValue.delete()
                            }).catch(() => {});
                            targetGroupId = null;
                        }
                    }
                }

                // Fallback search across all groups - only if we haven't found a card yet
                if (!targetCardDoc) {
                    debugLog(`[POST] No card found via contact ${existingContactId}. Searching all groups...`);
                    const allMatches: any[] = [];
                    const groupsRef = db.collection(`${entityPath}/kanban-groups`);
                    const groupsSnapshot = await groupsRef.get();

                    for (const groupDoc of groupsSnapshot.docs) {
                        try {
                            for (const phoneVariant of phoneSearchVariants(cleanFrom)) {
                                const cardsSnapshot = await groupDoc.ref.collection('cards')
                                    .where('contactNumberClean', '==', phoneVariant)
                                    .limit(5)
                                    .get();

                                cardsSnapshot.forEach(doc => {
                                    allMatches.push({ doc, groupId: groupDoc.id });
                                });
                                if (allMatches.length > 0) break;
                            }
                        } catch (searchErr: any) {
                            debugLog(`[POST] Card search skipped in group ${groupDoc.id}: ${searchErr.message}`);
                        }
                    }

                    if (allMatches.length > 0) {
                        allMatches.sort((a, b) => {
                            const tA = (a.doc.data().updatedAt?.toDate?.() || new Date(0)).getTime();
                            const tB = (b.doc.data().updatedAt?.toDate?.() || new Date(0)).getTime();
                            return tB - tA;
                        });
                        targetCardDoc = allMatches[0].doc;
                        targetGroupId = allMatches[0].groupId;
                    }
                }

                // Reference used below for default group in card creation
                const groupsRef = db.collection(`${entityPath}/kanban-groups`);
                const groupsSnapshot = await groupsRef.get();

                const newMessage = await buildInboundWhatsAppUserMessage({
                    message,
                    userId,
                    entityId,
                    displayText: displayPrefText,
                    messageId,
                });

                const queueItem = buildBotQueueItem({
                    text: text || '',
                    messageId: messageId || `wa_${Date.now()}`,
                    platform: 'whatsapp',
                    from: from,
                });

                // Stable conversation store = source of truth for messages + botState.
                let conversationId: string | null =
                    (contactDoc?.data?.()?.conversationId as string) || null;
                let cardId = targetCardDoc?.id as string | undefined;
                let groupId = targetGroupId as string | null;
                let preferredConvRef: FirebaseFirestore.DocumentReference | null = null;

                // ─── BROADCAST ONLY: preferir hilo con burbuja morada de esta campaña ───
                if (broadcastReplyMatch) {
                    const broadcastConv = await findConversationForBroadcastReply(
                        db,
                        entityPath,
                        cleanFrom,
                        broadcastReplyMatch.broadcastId
                    );
                    if (broadcastConv) {
                        conversationId = broadcastConv.id;
                        preferredConvRef = broadcastConv.ref;
                        cardId = String(broadcastConv.data.kanbanCardId || cardId || broadcastConv.id);
                        groupId = String(broadcastConv.data.kanbanGroupId || groupId || '');
                    }
                }
                // ─── FIN BROADCAST ONLY (conversación preferida) ───

                if (!conversationId) {
                    const byPhone = await findConversationByPhone(db, entityPath, cleanFrom);
                    if (byPhone) conversationId = byPhone.id;
                }

                if (!conversationId && targetCardDoc && targetGroupId) {
                    const promoted = await ensureConversationFromCard({
                        db,
                        tenantPath: entityPath,
                        cardId: targetCardDoc.id,
                        groupId: targetGroupId,
                        cardData: targetCardDoc.data() || {},
                        cardRef: targetCardDoc.ref,
                    });
                    conversationId = promoted.conversationId;
                    cardId = targetCardDoc.id;
                    groupId = targetGroupId;
                }

                if (conversationId) {
                    let convRef = preferredConvRef || db.doc(`${entityPath}/conversations/${conversationId}`);
                    let convSnap = await convRef.get();
                    let convData = convSnap.exists ? convSnap.data() || {} : {};

                    // Stale conversationId on contact — promote from card or find by phone.
                    if (!convSnap.exists) {
                        debugLog(`[POST] Stale conversationId ${conversationId} — recovering thread.`);
                        if (targetCardDoc && targetGroupId) {
                            const promoted = await ensureConversationFromCard({
                                db,
                                tenantPath: entityPath,
                                cardId: targetCardDoc.id,
                                groupId: targetGroupId,
                                cardData: targetCardDoc.data() || {},
                                cardRef: targetCardDoc.ref,
                            });
                            conversationId = promoted.conversationId;
                            convRef = promoted.ref;
                            convSnap = await convRef.get();
                            convData = convSnap.exists ? convSnap.data() || {} : {};
                        } else {
                            const byPhone = await findConversationByPhone(db, entityPath, cleanFrom);
                            if (byPhone) {
                                conversationId = byPhone.id;
                                convRef = byPhone.ref;
                                convSnap = await convRef.get();
                                convData = convSnap.exists ? convSnap.data() || {} : {};
                            } else {
                                conversationId = null;
                            }
                        }
                    }

                    const alreadyQueued = isDuplicateQueueMessage(convData, messageId);

                    if (conversationId && convSnap.exists) {
                        await appendInboundToConversation({
                            db,
                            tenantPath: entityPath,
                            conversationRef: convRef,
                            newMessage,
                            queueItem,
                            alreadyQueued,
                            displayPrefText,
                            recipientPhoneNumberId,
                        });

                        // ─── BROADCAST ONLY: asegurar replyText en recipient + conversación ───
                        if (broadcastReplyMatch) {
                            try {
                                const recSnap = await broadcastReplyMatch.recipientRef.get();
                                if (recSnap.exists) {
                                    await syncBroadcastRecipientReply({
                                        db,
                                        tenantPath: entityPath,
                                        recipient: {
                                            id: broadcastReplyMatch.recipientId,
                                            ...(recSnap.data() as Record<string, unknown>),
                                        },
                                        recipientRef: broadcastReplyMatch.recipientRef,
                                    });
                                }
                            } catch {
                                debugLog('[POST] Broadcast reply conversation sync skipped (non-fatal).');
                            }
                        }
                        // ─── FIN BROADCAST ONLY (sync post-inbound) ───

                        cardId = String(convData.kanbanCardId || cardId || conversationId);
                        groupId = String(convData.kanbanGroupId || groupId || '');

                        if (!groupId) {
                            const groupsSnapshot2 = await db.collection(`${entityPath}/kanban-groups`).get();
                            const inboxDoc =
                                groupsSnapshot2.docs.find((g) => g.id === SYSTEM_INBOX_GROUP_ID) ||
                                groupsSnapshot2.docs.find((g) => isInboxGroup({ id: g.id, ...g.data() })) ||
                                groupsSnapshot2.docs[0];
                            groupId = inboxDoc?.id || SYSTEM_INBOX_GROUP_ID;
                        }

                        const freshConv = (await convRef.get()).data() || {};
                        await syncThinCardPreview({
                            db,
                            tenantPath: entityPath,
                            conversationId,
                            groupId,
                            cardId,
                            data: freshConv,
                        });

                        if (existingContactId) {
                            await db.collection(`${entityPath}/contacts`).doc(existingContactId).set({
                                conversationId,
                                kanbanGroupId: groupId,
                                kanbanCardId: cardId,
                                updatedAt: new Date().toISOString(),
                            }, { merge: true }).catch(() => {});
                        }
                    } else {
                        conversationId = null;
                    }
                }

                if (!conversationId) {
                    let destinationGroupId = targetGroupId;
                    if (!destinationGroupId) {
                        const inboxDoc =
                            groupsSnapshot.docs.find(g => g.id === SYSTEM_INBOX_GROUP_ID) ||
                            groupsSnapshot.docs.find(g => isInboxGroup({ id: g.id, ...g.data() })) ||
                            groupsSnapshot.docs[0];
                        if (inboxDoc) {
                            destinationGroupId = inboxDoc.id;
                        } else {
                            const newGroupRef = db.collection(`${entityPath}/kanban-groups`).doc(SYSTEM_INBOX_GROUP_ID);
                            await newGroupRef.set({
                                ...SYSTEM_INBOX_GROUP_FIELDS,
                                createdAt: admin.firestore.FieldValue.serverTimestamp()
                            }, { merge: true });
                            destinationGroupId = SYSTEM_INBOX_GROUP_ID;
                        }
                    }

                    let numericId = existingContactId;
                    if (!numericId) {
                        numericId = String(Date.now()).slice(-10);
                        try {
                            const counterRef = db.collection(`${entityPath}/system_metadata`).doc('counters');
                            await db.runTransaction(async (tx) => {
                                const snap = await tx.get(counterRef);
                                const next = (snap.exists ? (snap.data()?.crmIdCount || 0) : 0) + 1;
                                tx.set(counterRef, { crmIdCount: next }, { merge: true });
                                numericId = String(next).padStart(10, '0');
                            });
                        } catch (err) {
                            debugLog(`[POST] Error generating CRM ID: ${err}`);
                        }
                    }

                    const finalContactName = value.contacts?.[0]?.profile?.name || existingContactName || from;
                    const created = await createConversationWithThinCard({
                        db,
                        tenantPath: entityPath,
                        groupId: destinationGroupId!,
                        newMessage,
                        queueItem,
                        profile: {
                            contactName: finalContactName,
                            contactNumber: from,
                            contactNumberClean: cleanFrom,
                            crmId: String(numericId),
                            recipientPhoneNumberId,
                        },
                    });
                    conversationId = created.conversationId;
                    cardId = created.cardId;
                    groupId = created.groupId;

                    if (existingContactId) {
                        await db.collection(`${entityPath}/contacts`).doc(existingContactId).update({
                            conversationId,
                            kanbanGroupId: groupId,
                            kanbanCardId: cardId,
                            updatedAt: new Date().toISOString()
                        });
                    } else {
                        const newContactId = Date.now().toString() + Math.floor(Math.random() * 1000).toString();
                        await db.collection(`${entityPath}/contacts`).doc(newContactId).set({
                            crmId: newContactId,
                            name: finalContactName || cleanFrom,
                            contactName: finalContactName || cleanFrom,
                            phone: `+${cleanFrom}`,
                            contactNumber: from,
                            conversationId,
                            kanbanGroupId: groupId,
                            kanbanCardId: cardId,
                            updatedAt: new Date().toISOString(),
                            createdAt: new Date().toISOString()
                        });
                    }
                }

                if (groupId && cardId && conversationId) {
                    debugLog(`[POST] Triggering chatbot for conversation ${conversationId} (card ${cardId})...`);
                    // Bots: sin cambios — se ejecuta después de guardar el mensaje entrante.
                    await processChatbotFlow({
                        userId, entityId, groupId, cardId, conversationId,
                        platform: 'whatsapp', from: from, text: text,
                        messageId: messageId,
                        channelAccountId: recipientPhoneNumberId
                    }).catch(botError => {
                        debugLog(`[POST] Chatbot Async Error: ${botError?.message || String(botError)}`);
                    });
                }

            }
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        debugLog(`[POST CRASH] ${error.stack || error.message}`);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}



