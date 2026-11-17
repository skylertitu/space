import { NextResponse } from 'next/server';
import { db, admin } from '@/lib/firebase-admin';
import axios from 'axios';
import { checkPubSubPush } from '@/lib/webhookSignature';
import { getGmailAccessTokenForEmail } from '@/lib/googleAuth';
import { processChatbotFlow } from '@/lib/chatbotEngine';
import { buildBotQueueItem, createQueuedBotState, isDuplicateQueueMessage } from '@/lib/botQueue';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Give the chatbot engine room to finish a full flow step (see whatsapp/webhook for details).
export const maxDuration = 300;

function extractHeader(headers: any[] = [], name: string) {
    return headers.find((header: any) => String(header?.name || '').toLowerCase() === name.toLowerCase())?.value || '';
}

function extractEmailAddress(headerValue: string) {
    const normalized = String(headerValue || '').trim();
    if (!normalized) return '';
    const match = normalized.match(/<([^>]+)>/);
    return (match?.[1] || normalized).trim().toLowerCase();
}

function getMessageText(msgData: any) {
    const snippet = String(msgData?.snippet || '').trim();
    if (snippet) return snippet;

    const decodePart = (data?: string) => {
        if (!data) return '';
        try {
            return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8').trim();
        } catch {
            return '';
        }
    };

    const payload = msgData?.payload;
    const directBody = decodePart(payload?.body?.data);
    if (directBody) return directBody;

    const queue = [...(payload?.parts || [])];
    while (queue.length > 0) {
        const part = queue.shift();
        const body = decodePart(part?.body?.data);
        if (body) return body;
        if (Array.isArray(part?.parts)) queue.push(...part.parts);
    }

    return '';
}

export async function POST(req: Request) {
    try {
        const sigDenied = await checkPubSubPush(req);
        if (sigDenied) return sigDenied;
        const body = await req.json();
        const message = body.message;

        if (!message || !message.data) {
            return NextResponse.json({ success: true, ignored: 'no_data' });
        }

        // 1. Decode Pub/Sub Data
        const decodedData = JSON.parse(Buffer.from(message.data, 'base64').toString());
        const emailAddress = decodedData.emailAddress;
        const notificationHistoryId = decodedData.historyId ? String(decodedData.historyId) : null;
        
        console.log(`[Gmail Webhook] Notification for ${emailAddress}`);

        // 2. Identify Tenant
        // Anti-secuestro: si el mismo correo está registrado por usuarios DISTINTOS, no se entrega a nadie.
        let tenantSnap = await db.collectionGroup('accounts').where('gmailAddress', '==', emailAddress).limit(5).get();
        if (tenantSnap.empty) tenantSnap = await db.collectionGroup('accounts').where('email', '==', emailAddress).limit(5).get();
        if (tenantSnap.empty) tenantSnap = await db.collectionGroup('integrations').where('gmailAddress', '==', emailAddress).limit(5).get();
        if (tenantSnap.empty) tenantSnap = await db.collectionGroup('integrations').where('email', '==', emailAddress).limit(5).get();

        if (tenantSnap.empty) return NextResponse.json({ success: false, error: 'Tenant not found' });

        const claimingUsers = new Set(tenantSnap.docs.map((d) => d.ref.path.split('/')[1]));
        if (claimingUsers.size > 1) {
            console.error(`[Gmail Webhook] CONFLICTO: ${emailAddress} reclamado por varios usuarios; no se entrega.`);
            return NextResponse.json({ success: true, ignored: 'ambiguous_tenant' });
        }

        const tenantDoc = tenantSnap.docs[0];
        const tenantData = tenantDoc.data() || {};
        const pathParts = tenantDoc.ref.path.split('/');

        let userId = tenantData.userId || (pathParts[0] === 'users' ? pathParts[1] : null);
        let entityId = tenantData.entityId || (pathParts[0] === 'users' ? pathParts[3] : null);

        if (!userId || !entityId) {
            throw new Error(`Invalid Gmail tenant mapping for ${emailAddress} at ${tenantDoc.ref.path}`);
        }

        const entityPath = `users/${userId}/entities/${entityId}`;

        // 3. Fetch Latest Email
        const { toGmailAccountId, gmailAccountSecretPath } = await import('@/lib/gmail/accounts');
        const accessToken = await getGmailAccessTokenForEmail(userId, entityId, emailAddress);
        const accountId = toGmailAccountId(emailAddress);
        let internalIntegrationRef = db.doc(gmailAccountSecretPath(userId, entityId, accountId));
        let internalIntegrationSnap = await internalIntegrationRef.get();
        if (!internalIntegrationSnap.exists) {
            internalIntegrationRef = db.doc(`${entityPath}/integrations/gmail_internal`);
            internalIntegrationSnap = await internalIntegrationRef.get();
        }
        const previousHistoryId = internalIntegrationSnap.data()?.lastHistoryId
            ? String(internalIntegrationSnap.data()?.lastHistoryId)
            : null;

        const messageIds: string[] = [];

        if (previousHistoryId) {
            try {
                const historyRes = await axios.get('https://gmail.googleapis.com/gmail/v1/users/me/history', {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    params: {
                        startHistoryId: previousHistoryId,
                        historyTypes: 'messageAdded'
                    }
                });

                const historyItems = historyRes.data?.history || [];
                for (const item of historyItems) {
                    const addedMessages = item?.messagesAdded || [];
                    for (const added of addedMessages) {
                        const addedMessageId = added?.message?.id;
                        if (addedMessageId) {
                            messageIds.push(String(addedMessageId));
                        }
                    }
                }
            } catch (historyError: any) {
                const status = historyError?.response?.status;
                if (status !== 404) {
                    throw historyError;
                }
                console.warn(`[Gmail Webhook] History cursor expired for ${emailAddress}. Falling back to unread scan.`);
            }
        }

        if (messageIds.length === 0) {
            const listRes = await axios.get('https://gmail.googleapis.com/gmail/v1/users/me/messages', {
                headers: { Authorization: `Bearer ${accessToken}` },
                params: {
                    maxResults: 10,
                    labelIds: 'INBOX',
                    q: 'is:unread -category:promotions -category:social -in:drafts'
                }
            });

            const fallbackIds = (listRes.data.messages || []).map((msg: any) => String(msg.id));
            messageIds.push(...fallbackIds);
        }

        if (messageIds.length === 0) {
            await internalIntegrationRef.set({
                lastHistoryId: notificationHistoryId || previousHistoryId || null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return NextResponse.json({ success: true });
        }

        const uniqueMessageIds = Array.from(new Set(messageIds));
        let msgId: string | null = null;
        let msgData: any = null;

        for (const candidateId of uniqueMessageIds) {
            const candidateRes = await axios.get(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${candidateId}`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            const candidate = candidateRes.data;
            const headers = candidate.payload?.headers || [];
            const labelIds = candidate.labelIds || [];
            const fromEmail = extractEmailAddress(extractHeader(headers, 'From'));
            
            // --- INTELLIGENT FILTERING (Agnostic Rule 4: Anti-Spam/Automation) ---
            const listUnsubscribe = extractHeader(headers, 'List-Unsubscribe');
            const autoSubmitted = extractHeader(headers, 'Auto-Submitted');
            const precedence = extractHeader(headers, 'Precedence');
            const subject = extractHeader(headers, 'Subject').toLowerCase();

            const isAutomation = 
                !!listUnsubscribe || 
                (autoSubmitted && autoSubmitted !== 'no') || 
                ['bulk', 'list', 'junk'].includes(precedence.toLowerCase()) ||
                /no-reply|noreply|notifications|newsletter|alerts|support@/i.test(fromEmail) ||
                /confirmacion|boletin|actualizacion|subscription|welcome/i.test(subject);

            if (isAutomation) {
                console.log(`[Gmail Filter] 🛡️ Ignored automated email from ${fromEmail}: "${subject.substring(0, 30)}..."`);
                continue;
            }

            if (fromEmail && fromEmail !== String(emailAddress).toLowerCase() && !labelIds.includes('SENT') && !labelIds.includes('DRAFT')) {
                msgId = candidateId;
                msgData = candidate;
                break;
            }
        }

        if (!msgId || !msgData) {
            await internalIntegrationRef.set({
                lastHistoryId: notificationHistoryId || previousHistoryId || null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            return NextResponse.json({ success: true, ignored: 'no_human_messages' });
        }

        const fromHeader = extractHeader(msgData.payload?.headers || [], 'From');
        const subject = extractHeader(msgData.payload?.headers || [], 'Subject');
        const bodySnippet = getMessageText(msgData);

        // Extract clean email from "Name <email@gmail.com>"
        const fromEmail = extractEmailAddress(fromHeader);

        if (!fromEmail) return NextResponse.json({ success: true });

        // 4. CRM Integration (Find or Create Card)
        const threadId = msgData.threadId;
        const fromName = fromHeader.split('<')[0].trim() || 'Remitente Gmail';

        const newMessage = {
            sender: 'user',
            text: bodySnippet,
            timestamp: new Date(),
            messageId: `gm_${msgId}`,
            platform: 'gmail',
            subject: subject
        };

        let targetCardDoc: any = null;
        let targetGroupId: string | null = null;
        let existingContactId: string | null = null;

        // Try to find if user exists by email in Contacts
        const contactSnap = await db.collection(`${entityPath}/contacts`)
            .where('email', '==', fromEmail)
            .get();

        if (!contactSnap.empty) {
            // Sort by updatedAt to ensure we pick the most recent/active one
            const sortedDocs = contactSnap.docs.sort((a, b) => {
                const tA = new Date(a.data().updatedAt || 0).getTime();
                const tB = new Date(b.data().updatedAt || 0).getTime();
                return tB - tA;
            });

            const contactDoc = sortedDocs[0];
            const contactData = contactDoc.data();
            existingContactId = contactDoc.id;
            targetGroupId = contactData.kanbanGroupId;
            const contactCardId = contactData.kanbanCardId;

            if (targetGroupId && contactCardId) {
                const cardRef = db.doc(`${entityPath}/kanban-groups/${targetGroupId}/cards/${contactCardId}`);
                const cardGet = await cardRef.get();
                if (cardGet.exists) {
                    targetCardDoc = cardGet;
                }
            }
        }

        // FALLBACK SEARCH: Deep scan across all groups for threadId
        if (!targetCardDoc) {
             console.log(`[Gmail] No card found via contact. Deep searching threadId: ${threadId}...`);
             const allMatches: any[] = [];
             const groupsRef = db.collection(`${entityPath}/kanban-groups`);
             const groupsSnapshot = await groupsRef.get();

             for (const groupDoc of groupsSnapshot.docs) {
                 const cardsSnapshot = await groupDoc.ref.collection('cards')
                     .where('platform_ids.gmail', '==', threadId)
                     .orderBy('updatedAt', 'desc')
                     .limit(1)
                     .get();

                 cardsSnapshot.forEach(doc => {
                     allMatches.push({ doc, groupId: groupDoc.id });
                 });
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

        let cardId: string | null = targetCardDoc?.id || null;
        let groupId: string | null = targetGroupId || null;

        const queueItem = buildBotQueueItem({
            text: bodySnippet || '',
            messageId: `gm_${msgId}`,
            platform: 'gmail',
            from: fromEmail,
        });

        if (targetCardDoc && groupId) {
            const cardRef = targetCardDoc.ref;
            const alreadyQueued = isDuplicateQueueMessage(targetCardDoc.data(), `gm_${msgId}`);
            const cardUpdate: Record<string, any> = {
                lastMessage: bodySnippet.substring(0, 50),
                updatedAt: new Date(),
                unreadCount: admin.firestore.FieldValue.increment(1),
                messages: admin.firestore.FieldValue.arrayUnion(newMessage),
                'botState.engine': 'queue',
                status: 'open',
                source: 'GMAIL'
            };
            if (!alreadyQueued) {
                cardUpdate['botState.messageQueue'] = admin.firestore.FieldValue.arrayUnion(queueItem);
            }
            await cardRef.update(cardUpdate);
        } else {
            // Create New Contact & Card
            const finalContactId = existingContactId || String(Date.now()).slice(-10);
            const groupsRef = db.collection(`${entityPath}/kanban-groups`);
            const groupsSnapshot = await groupsRef.get();
            
            const fallbackGroup = groupsSnapshot.docs.find(g => (g.data().name || '').toLowerCase().includes('inbox')) || groupsSnapshot.docs[0];
            const destinationGroupId = fallbackGroup ? fallbackGroup.id : 'default_inbox';

            if (destinationGroupId === 'default_inbox' && !fallbackGroup) {
                await db.collection(`${entityPath}/kanban-groups`).doc('default_inbox').set({
                    name: 'Inbox', order: 0, color: '#3B82F6', createdAt: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }

            const newCardRef = db.collection(`${entityPath}/kanban-groups/${destinationGroupId}/cards`).doc();
            
            await newCardRef.set({
                crmId: finalContactId,
                contactName: fromName,
                email: fromEmail,
                gmailThreadId: threadId,
                lastMessage: bodySnippet.substring(0, 50),
                updatedAt: new Date(),
                createdAt: new Date(),
                messages: [newMessage],
                botState: createQueuedBotState(queueItem),
                unreadCount: 1,
                status: 'open',
                source: 'GMAIL',
                primary_channel: 'gmail',
                platform_ids: { gmail: threadId }
            });

            await db.collection(`${entityPath}/contacts`).doc(finalContactId).set({
                crmId: finalContactId,
                name: fromName,
                email: fromEmail,
                kanbanGroupId: destinationGroupId,
                kanbanCardId: newCardRef.id,
                source: 'GMAIL',
                updatedAt: new Date().toISOString(),
                createdAt: new Date().toISOString()
            }, { merge: true });

            cardId = newCardRef.id;
            groupId = destinationGroupId;
        }

        await internalIntegrationRef.set({
            lastHistoryId: notificationHistoryId || String(msgData.historyId || previousHistoryId || ''),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        // 5. TRIGGER UNIVERSAL CHATBOT
        if (groupId && cardId) {
            processChatbotFlow({
                userId, 
                entityId, 
                groupId, 
                cardId, 
                platform: 'gmail', 
                from: fromEmail, 
                text: bodySnippet,
                messageId: `gm_${msgId}`,
                botsCollection: 'gmail-bots',
            }).catch(error => {
                 console.error(`[Gmail Chatbot Error] ${error}`);
            });
        }

        return NextResponse.json({ success: true });

    } catch (err: any) {
        console.error('[Gmail Webhook Error]', err.message);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
