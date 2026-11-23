import { admin, db } from './firebase-admin';
import { sendMetaMessage, sendWhatsAppMessage, sendTelegramMessage, sendGmailMessage, sendInstagramCommentReply } from './sendProviders';
import {
    buildWhatsAppQuickReplyButtons,
    buildWhatsAppListSections,
    resolveDefaultNextEdge,
    resolveListMessageEdge,
    resolveQuickReplyEdge,
    sanitizeFlowButtons,
} from './flowRouting';
import { filterOutQueueMessage } from './botQueue';
import { isIsolatedBotCollection, resolveBotsCollectionName } from './automation/botStorage';
import axios from 'axios';
import { buildBotNodeGroupMap, syncCardToBotNodeAdmin, locateKanbanCard } from '@/lib/kanban/kanbanBotSyncAdmin';
import {
    conversationDoc,
    ensureConversationFromCard,
    syncThinCardPreview,
} from '@/lib/conversations/store';
import { humanizeOutboundText, shouldHumanizeOutbound } from '@/lib/chatbot/humanizeOutbound';

/** Avoid spamming the same validation prompt when the user taps quickly or the queue retries. */
const VALIDATION_DEBOUNCE_MS = 25_000;

function evaluateCondition(varValue: any, operator: string, targetValue: any, fuzzy: boolean = true): boolean {
    let v = varValue === undefined || varValue === null ? '' : String(varValue);
    let t = targetValue === undefined || targetValue === null ? '' : String(targetValue);

    if (fuzzy) {
        v = v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        t = t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    switch (operator) {
        case 'equals': return v === t;
        case 'not_equals': return v !== t;
        case 'contains': return v.includes(t);
        case 'starts_with': return v.startsWith(t);
        case 'ends_with': return v.endsWith(t);
        case 'gt': return parseFloat(v) > parseFloat(t);
        case 'lt': return parseFloat(v) < parseFloat(t);
        case 'gte': return parseFloat(v) >= parseFloat(t);
        case 'lte': return parseFloat(v) <= parseFloat(t);
        case 'is_set': return varValue !== undefined && varValue !== null && String(varValue).trim() !== '';
        case 'is_empty': return varValue === undefined || varValue === null || String(varValue).trim() === '';
        case 'regex':
            try {
                const re = new RegExp(t, 'i');
                return re.test(v);
            } catch (e) { return false; }
        default: return false;
    }
}

export interface ChatbotContext {
    userId: string;
    entityId: string;
    groupId: string;
    cardId: string;
    /** Stable conversation id (messages + botState). Kanban card is placement only. */
    conversationId?: string;
    platform: 'whatsapp' | 'messenger' | 'instagram' | 'instagram_comments' | 'facebook_comments' | 'telegram' | 'gmail' | 'x_twitter' | 'x_twitter_comments' | 'x';
    from: string;
    text: string;
    messageId?: string;
    /** Firestore subcollection for channel-isolated bots (e.g. messenger-bots). WhatsApp uses chatbots. */
    botsCollection?: string;
    /** Business account/number that received the message (WhatsApp phone_number_id) — used to reply from the same number. */
    channelAccountId?: string;
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

function dedupeQueueItems(queue: any[]): any[] {
    const seen = new Set<string>();
    return (queue || []).filter((item) => {
        const id = String(item?.messageId || '').trim();
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
    });
}

/**
 * MULTI-NUMBER: resolves the WhatsApp slot (general|support|broadcast) that owns a
 * given business phone_number_id, so the engine can run the bot bound to that number.
 * Returns null when the number isn't recognized (caller falls back to default selection).
 */
async function resolveSlotForPhoneId(
    entityPath: string,
    phoneId: string
): Promise<string | null> {
    const target = String(phoneId || '').trim();
    if (!target) return null;
    try {
        const slotsSnap = await db.collection(`${entityPath}/whatsapp_numbers`).get();
        for (const d of slotsSnap.docs) {
            const data = d.data() || {};
            const pid = String(data.phoneNumberId || data.phone_number_id || data.phoneId || '');
            if (pid && pid === target) {
                // Legacy docs used id `primary` — normalize to canonical `general`.
                return d.id === 'primary' ? 'general' : d.id;
            }
        }
        const [std, internal] = await Promise.all([
            db.doc(`${entityPath}/integrations/whatsapp`).get(),
            db.doc(`${entityPath}/integrations/whatsapp_internal`).get(),
        ]);
        for (const snap of [std, internal]) {
            const data = snap.data() || {};
            const pid = String(data.phoneNumberId || data.phone_number_id || data.phoneId || '');
            if (pid && pid === target) return 'general'; // legacy number maps to general
        }
    } catch (e) {
        console.warn('[ChatbotEngine] resolveSlotForPhoneId failed:', e);
    }
    return null;
}

async function resolveBotPhoneNumberIdFromEntity(
    entityPath: string,
    bot: { phoneNumberId?: string; numberId?: string }
): Promise<string | null> {
    const direct = String(bot.phoneNumberId || '').trim();
    if (direct) return direct;

    const slot = normalizeBotNumberSlot(bot.numberId);
    try {
        const slotSnap = await db.doc(`${entityPath}/whatsapp_numbers/${slot}`).get();
        const slotData = slotSnap.data() || {};
        const fromSlot = String(slotData.phoneNumberId || slotData.phone_number_id || '').trim();
        if (fromSlot) return fromSlot;

        if (slot === 'general') {
            const [std, internal] = await Promise.all([
                db.doc(`${entityPath}/integrations/whatsapp`).get(),
                db.doc(`${entityPath}/integrations/whatsapp_internal`).get(),
            ]);
            for (const snap of [std, internal]) {
                const data = snap.data() || {};
                const pid = String(data.phoneNumberId || data.phone_number_id || '').trim();
                if (pid) return pid;
            }
        }
    } catch (e) {
        console.warn('[ChatbotEngine] resolveBotPhoneNumberIdFromEntity failed:', e);
    }
    return null;
}

function normalizeBotNumberSlot(numberId: unknown): string {
    const v = String(numberId || '').trim().toLowerCase();
    if (v === 'support' || v === 'broadcast') return v;
    return 'general'; // null | primary | general | empty
}

/**
 * Sequential Chatbot Engine Runner
 * Implements a FIFO queue consumer pattern to prevent race conditions and duplicate responses.
 */
export async function processChatbotFlow(ctx: ChatbotContext, retryCount = 0) {
    const { userId, entityId, groupId, cardId, platform, from, text, messageId, botsCollection, channelAccountId } = ctx;
    const triggerMessageId = messageId ? String(messageId).trim() : '';
    const entityPath = `users/${userId}/entities/${entityId}`;

    // Resolve / promote stable conversation (source of truth). Kanban card is placement only.
    let conversationId = String(ctx.conversationId || '').trim();
    let placementGroupId = groupId;

    if (!conversationId) {
        const located = await locateKanbanCard(db, entityPath, cardId);
        if (located) {
            placementGroupId = located.groupId;
            const cardSnap = await located.ref.get();
            const ensured = await ensureConversationFromCard({
                db,
                tenantPath: entityPath,
                cardId,
                groupId: located.groupId,
                cardData: cardSnap.data() || {},
                cardRef: located.ref,
            });
            conversationId = ensured.conversationId;
        } else {
            const maybe = await conversationDoc(db, entityPath, cardId).get();
            if (maybe.exists) conversationId = cardId;
        }
    }

    if (!conversationId) {
        console.error(`[ChatbotEngine] ❌ No conversation for card ${cardId}`);
        return;
    }

    // Truth document — NEVER moves with kanban columns.
    const box: { ref: admin.firestore.DocumentReference } = {
        ref: conversationDoc(db, entityPath, conversationId),
    };
    const refreshCardRef = async (): Promise<boolean> => {
        const snap = await box.ref.get();
        if (!snap.exists) {
            console.error(`[ChatbotEngine] ❌ Conversation ${conversationId} missing`);
            return false;
        }
        const data = snap.data() || {};
        if (data.kanbanGroupId) placementGroupId = String(data.kanbanGroupId);
        return true;
    };

    if (!(await refreshCardRef())) return;

    console.log(`[ChatbotEngine] 🚀 RUNNER START | conv=${conversationId} | card=${cardId} | From: ${from}`);

    try {
        const earlySnap = await box.ref.get();
        const earlyData = earlySnap.exists ? earlySnap.data() || {} : null;
        if (earlyData && (earlyData.humanTakeover?.active === true || earlyData.isHandledByHuman === true)) {
            console.log(`[ChatbotEngine] 🧑‍💼 Human takeover active — skipping bot for ${conversationId}`);
            const data = earlyData || {};
            const queue = dedupeQueueItems(data.botState?.messageQueue || []);
            if (triggerMessageId && queue.some((q) => String(q.messageId) === triggerMessageId)) {
                await box.ref.update({
                    'botState.messageQueue': filterOutQueueMessage(queue, triggerMessageId),
                    'botState.lastProcessedMessageId': triggerMessageId,
                    botLock: admin.firestore.FieldValue.delete(),
                });
            }
            return;
        }

        const canExecute = await db.runTransaction(async (transaction) => {
            const snap = await transaction.get(box.ref);
            if (!snap.exists) return false;
            const data = snap.data() || {};
            const bState = data.botState || {};

            const normInput = (text || '').trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const isPriorityCommand = /^(reinici[ao]r?|reinici|reinci(ar)?|restart|reset|clear|limpiar|borrar|menu|opciones|ayuda|help|inicio|start)/i.test(normInput);

            if (isPriorityCommand && data.botLock) {
                console.log(`[ChatbotEngine] 🔓 Priority command breaking existing lock for ${conversationId}`);
            }

            if (triggerMessageId && bState.lastProcessedMessageId === triggerMessageId) return false;

            if (data.botLock && !isPriorityCommand) {
                const lockTime = data.botLock.toDate?.() || new Date(data.botLock);
                const diff = (Date.now() - lockTime.getTime()) / 1000;
                if (diff < 30) {
                    console.log(`[ChatbotEngine] 🔒 Conversation ${conversationId} is actively locked (${diff}s). Skipping parallel execution.`);
                    return false;
                }
            }

            transaction.update(box.ref, {
                botLock: admin.firestore.FieldValue.serverTimestamp(),
            });
            return true;
        });

        if (!canExecute) {
            if (retryCount < 2 && triggerMessageId) {
                await refreshCardRef();
                const blockedSnap = await box.ref.get();
                const blockedData = blockedSnap.data() || {};
                const blockedState = blockedData.botState || {};
                const stillPending = dedupeQueueItems(blockedState.messageQueue || [])
                    .some((item) => String(item?.messageId || '').trim() === triggerMessageId);
                const notYetProcessed = blockedState.lastProcessedMessageId !== triggerMessageId;

                if (stillPending && notYetProcessed && blockedData.botLock) {
                    console.log(`[ChatbotEngine] ⏳ Lock contention for ${conversationId}; retrying queue consumer (${retryCount + 1}/2)`);
                    await sleep(2000);
                    return processChatbotFlow(ctx, retryCount + 1);
                }
            }
            return;
        }

        await refreshCardRef();

        const preRunSnap = await box.ref.get();
        const preRunQueue = dedupeQueueItems(preRunSnap.data()?.botState?.messageQueue || []);
        if (preRunQueue.length > 5) {
            const trimmed = preRunQueue.slice(-5);
            await box.ref.update({ 'botState.messageQueue': trimmed });
            console.log(`[ChatbotEngine] 🧹 Trimmed message queue from ${preRunQueue.length} to ${trimmed.length}`);
        }

        const processedInRunner = new Set<string>();
        let queueHasItems = true;
        while (queueHasItems) {
            if (!(await refreshCardRef())) break;

            const snap = await box.ref.get();
            const cardData = snap.data() || {};
            const bState = cardData.botState || {};
            const queue = dedupeQueueItems(bState.messageQueue || []);

            if (queue.length === 0) {
                queueHasItems = false;
                break;
            }

            const currentMsg = queue[0];
            const msgId = String(currentMsg.messageId || '').trim();
            const msgText = String(currentMsg.text || '').trim();

            const isStaleProcessedItem = !!msgId
                && bState.lastProcessedMessageId === msgId
                && msgId !== triggerMessageId;
            if (msgId && (processedInRunner.has(msgId) || isStaleProcessedItem)) {
                console.log(`[ChatbotEngine] ⏭️ Skipping duplicate queue item [${msgId}]`);
                await db.runTransaction(async (transaction) => {
                    const fresh = await transaction.get(box.ref);
                    const q = fresh.data()?.botState?.messageQueue || [];
                    transaction.update(box.ref, {
                        'botState.messageQueue': filterOutQueueMessage(q, msgId),
                    });
                });
                continue;
            }

            if (msgId) processedInRunner.add(msgId);

            console.log(`[ChatbotEngine] 🧵 Processing Queue Item [${msgId}]: "${msgText.substring(0, 30)}"`);

            try {
                await runEngineCycle(
                    box,
                    refreshCardRef,
                    () => placementGroupId,
                    (gid: string) => { placementGroupId = gid; },
                    cardData,
                    currentMsg,
                    entityPath,
                    entityId,
                    userId,
                    cardId,
                    conversationId,
                    botsCollection,
                    channelAccountId
                );
            } catch (cycleErr: any) {
                console.error(`[ChatbotEngine] ❌ Cycle Error [${msgId}]:`, cycleErr.message);
                await refreshCardRef();
                await box.ref.update({
                    'botState.lastError': cycleErr.message || 'Unknown Cycle Error',
                    'botState.lastErrorAt': admin.firestore.FieldValue.serverTimestamp()
                }).catch(() => {});
            } finally {
                await refreshCardRef();
                await db.runTransaction(async (transaction) => {
                    const fresh = await transaction.get(box.ref);
                    if (!fresh.exists) return;
                    const q = fresh.data()?.botState?.messageQueue || [];
                    const update: Record<string, any> = {
                        'botState.messageQueue': filterOutQueueMessage(q, msgId),
                        botLock: admin.firestore.FieldValue.serverTimestamp(),
                    };
                    if (msgId) update['botState.lastProcessedMessageId'] = msgId;
                    transaction.update(box.ref, update);
                });
            }
        }
    } catch (err: any) {
        console.error(`[ChatbotEngine] 💥 Runner Crash:`, err.message);
    } finally {
        try {
            await refreshCardRef();
            const convData = (await box.ref.get()).data() || {};
            await syncThinCardPreview({
                db,
                tenantPath: entityPath,
                conversationId,
                groupId: placementGroupId,
                cardId,
                data: convData,
            }).catch(() => {});
            await box.ref.update({ botLock: admin.firestore.FieldValue.delete() });
            console.log(`[ChatbotEngine] 🏁 RUNNER FINISHED for conversation ${conversationId}`);
        } catch (e) {}
    }
}

/**
 * Single Engine Cycle: Processes ONE message through the flow.
 */
async function runEngineCycle(
    box: { ref: admin.firestore.DocumentReference },
    refreshCardRef: () => Promise<boolean>,
    getPlacementGroupId: () => string,
    setPlacementGroupId: (gid: string) => void,
    cardData: any,
    msg: any,
    entityPath: string,
    entityId: string,
    userId: string,
    cardId: string,
    conversationId: string,
    botsCollection?: string,
    channelAccountId?: string
) {
    const text = msg.text || '';
    const platform = msg.platform;
    const from = msg.from;
    const messageId = msg.messageId;

    // Populated after active bot is selected — style layer only (does not choose nodes).
    let humanizeConfig = {
        enabled: false,
        style: 'warm' as string,
        botId: '',
        openaiApiKey: null as string | null,
        geminiApiKey: null as string | null,
    };
    let lastOutboundText: string | null = null;

    const appendAgentMessage = async (message: any) => {
        await refreshCardRef();
        const resolved = { ...message };
        if (
            !message.preserveText &&
            typeof message.text === 'string' &&
            message.text.length > 0 &&
            typeof lastOutboundText === 'string' &&
            lastOutboundText.length > 0
        ) {
            resolved.text = lastOutboundText;
        }
        lastOutboundText = null;
        const snippetText = typeof resolved.text === 'string' && resolved.text.trim()
            ? resolved.text.trim()
            : typeof message.text === 'string' && message.text.trim()
            ? message.text.trim()
            : 'Mensaje del Bot';

        const truncatedSnippet = snippetText.length > 60 ? snippetText.substring(0, 57) + '...' : snippetText;

        await box.ref.update({
            lastMessage: truncatedSnippet,
            lastMessageDirection: 'outbound',
            lastMessageStatus: 'read',
            updatedAt: new Date(),
            messages: admin.firestore.FieldValue.arrayUnion({
                sender: 'agent',
                platform,
                timestamp: new Date(),
                ...resolved
            })
        });
    };

    // --- A. HELPERS (Essentials) ---
    const dispatchMessage = async (content: string, options: any = {}) => {
        const { skipHumanize, nodeId: optionNodeId, preserveText: _pt, ...sendOptions } = options || {};
        let finalContent = content;

        if (
            shouldHumanizeOutbound({
                humanizeToneEnabled: humanizeConfig.enabled,
                content,
                skipHumanize: !!skipHumanize,
                type: sendOptions.type,
            })
        ) {
            finalContent = await humanizeOutboundText({
                approvedText: content,
                tone: humanizeConfig.style,
                botId: humanizeConfig.botId,
                nodeId: optionNodeId || cardData.botState?.currentNodeId || null,
                contactName:
                    (sessionVars as any)?.nombre ||
                    (sessionVars as any)?.name ||
                    cardData.contactName ||
                    null,
                lastUserText: text,
                recentTurns: (cardData.messages || []).slice(-4),
                openaiApiKey: humanizeConfig.openaiApiKey,
                geminiApiKey: humanizeConfig.geminiApiKey,
            });
        }

        lastOutboundText = typeof finalContent === 'string' ? finalContent : content;

        const opts = {
            userId,
            entityId,
            ...(channelAccountId ? { fromPhoneNumberId: channelAccountId } : {}),
            ...sendOptions,
        };
        if (platform === 'whatsapp') {
            const isSessionMessage =
                !opts.type ||
                opts.type === 'text' ||
                (typeof opts.type === 'string' && !['template', 'location', 'contacts', 'reaction'].includes(opts.type));
            if (isSessionMessage && !opts.forceTemplate) {
                const entitySnap = await db.doc(entityPath).get();
                const { resolveWhatsAppSendGuard } = await import('@/lib/whatsapp/sessionGuard');
                const guard = resolveWhatsAppSendGuard(cardData.messages || [], finalContent, entitySnap.data());
                if (guard.blockSend) {
                    console.warn(`[ChatbotEngine] WhatsApp blocked (24h): ${guard.blockReason}`);
                    return { skipped: true, reason: guard.blockReason, sentText: finalContent };
                }
                if (guard.useTemplate && guard.templatePayload) {
                    const result = await sendWhatsAppMessage(from, finalContent, { ...opts, ...guard.templatePayload });
                    return { ...result, sentText: finalContent };
                }
            }
            const result = await sendWhatsAppMessage(from, finalContent, opts);
            return { ...result, sentText: finalContent };
        }
        if (platform === 'messenger' || platform === 'facebook_comments') {
            const result = await sendMetaMessage(from, finalContent, { ...opts, provider: 'messenger' });
            return { ...result, sentText: finalContent };
        }
        if (platform === 'instagram_comments') {
            const commentId = msg.metadata?.commentId || cardData?.botState?.lastCommentId;
            if (!commentId) {
                console.warn('[ChatbotEngine] instagram_comments reply skipped — missing commentId in queue metadata.');
                return { skipped: true, reason: 'missing_comment_id', sentText: finalContent };
            }
            const result = await sendInstagramCommentReply(commentId, finalContent, { userId, entityId });
            return { ...result, sentText: finalContent };
        }
        if (platform === 'instagram') {
            const result = await sendMetaMessage(from, finalContent, { ...opts, provider: 'instagram' });
            return { ...result, sentText: finalContent };
        }
        if (platform === 'telegram') {
            const result = await sendTelegramMessage(from, finalContent, opts);
            return { ...result, sentText: finalContent };
        }
        if (platform === 'gmail') {
            const result = await sendGmailMessage(from, finalContent, opts);
            return { ...result, sentText: finalContent };
        }
        if (platform === 'x_twitter' || platform === 'x' || platform === 'x_twitter_comments') {
            console.log(`[ChatbotEngine] X outbound (${platform}) queued in card — API send pending OAuth tokens.`);
            return { logged: true, platform, to: from, sentText: finalContent };
        }
        return { sentText: finalContent };
    };

    const normalizedInput = text.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // Command categorization (Master Engine Sync)
    // Regex expanded to catch typos like 'reinciar', 'reiniciar', 'restart', etc.
    const isExplicitReset = /^(reinici[ao]r?|reinici|reinci(ar)?|reset|restart|clear|limpiar|borrar)/i.test(normalizedInput);
    
    // TIMEOUT LOGIC: If waiting for input for >= 15 days, auto-reset
    let isTimeoutReset = false;
    if (cardData.botState?.waitingForInput && cardData.botState?.lastWaitStartedAt) {
        const lastWait = cardData.botState.lastWaitStartedAt.toDate?.() || new Date(cardData.botState.lastWaitStartedAt);
        const daysPassed = (Date.now() - lastWait.getTime()) / (1000 * 60 * 60 * 24);
        if (daysPassed >= 15) {
            console.log(`[ChatbotEngine] ⏳ 15-day timeout reached for card ${box.ref.id}. Forcing reset.`);
            isTimeoutReset = true;
        }
    }
    
    const isReset = isExplicitReset || isTimeoutReset;
    const isMenu = /^(menu|opciones|ayuda|help)/i.test(normalizedInput);
    const isStop = /^(detener|stop|salir|chau|adios)/i.test(normalizedInput);

    // Classic greetings (kept for mid-flow re-entry without waiting).
    // Includes "buenos dias" (not only "buenas") and common typos/variants.
    const isGreeting =
        /^(hola+|holi+|oli+|hi+|hello+|hey+|ey+|wenas?|wematos?|saludos?|inicio|start|que\s*tal|como\s*estas?|buen[oa]s?\s*(dias?|tardes?|noches?)|buenas)\b/i.test(
            normalizedInput
        );

    // If the bot is waiting for an answer, greetings are part of the reply — not a new session.
    const wasWaitingForInput = !!cardData.botState?.waitingForInput;
    const statusForWake = cardData.botState?.status;
    const hasCurrentNode = !!cardData.botState?.currentNodeId;
    const lastStepForWake = cardData.botState?.lastStep;
    const isRecoverableCapture =
        lastStepForWake === 'captureInputNode' || lastStepForWake === 'textMessageNode';
    // Stuck active (no node, not waiting) — e.g. after switching bots/numbers. Any message restarts.
    const isStuckWithoutNode =
        statusForWake === 'active' &&
        !wasWaitingForInput &&
        !hasCurrentNode &&
        !isRecoverableCapture;
    const isTrulyIdle =
        statusForWake === 'completed' ||
        statusForWake === 'inactive' ||
        !statusForWake ||
        isStuckWithoutNode;
    const hasAnyUserContent = String(text || '').trim().length > 0;

    // Wake rules:
    //  - Truly idle → ANY message starts the flow (hola, buenos dias, ".", etc.).
    //  - Mid-flow but not waiting → only an explicit greeting restarts.
    //  - Actively waiting → never restart (answer the current question).
    const isStartTrigger =
        !wasWaitingForInput && ((isTrulyIdle && hasAnyUserContent) || isGreeting);
    const shouldApplyStartTrigger = isStartTrigger;
    
    const isCommand = isReset || isMenu || isStop;

    if (isTrulyIdle && hasAnyUserContent) {
        console.log(`[ChatbotEngine] 👋 Idle wake-up with input "${String(text).slice(0, 40)}" — starting flow`);
    }

    const sessionVars = {
        nombre: (isReset || shouldApplyStartTrigger) ? 'Usuario' : (cardData.contactName || 'Usuario'),
        name: (isReset || shouldApplyStartTrigger) ? 'Usuario' : (cardData.contactName || 'Usuario'),
        first_name: ((isReset || shouldApplyStartTrigger) ? 'Usuario' : (cardData.contactName || 'Usuario')).split(' ')[0],
        ...(cardData.customFields || {}),
        ...(cardData.variables || {})
    };

    const cleanInput = (raw: string, varName: string): string => {
        const val = raw.trim();
        if (varName.toLowerCase().includes('mail') || varName.toLowerCase().includes('correo')) {
            const matches = val.match(/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*/g);
            return matches ? matches[0] : val;
        }
        if (/nombre|name|cli/i.test(varName)) {
            let cleaned = val;
            const patterns = [
                /me llamo\s+/i, /mi nombre es\s+/i, /soy\s+/i, /mucho gusto\s+/i, 
                /hola\s+/i, /encantado\s+/i, /un placer\s+/i, /saludos\s+/i,
                /que tal\s+/i, /buenas\s+/i, /buenos dias\s+/i, /buenas tardes\s+/i,
                /buenas noches\s+/i, /por aqui\s+/i, /llaman\s+/i
            ];
            patterns.forEach(p => cleaned = cleaned.replace(new RegExp(p, 'gi'), ''));
            return cleaned.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ').trim();
        }
        return val;
    };

    // --- B. MASTER BYPASS (Reset/Trigger Override) ---
    // Never treat greetings as a restart while waiting for user input (prevents question loops).
    if (isReset || isMenu || shouldApplyStartTrigger) {
        console.log(`[ChatbotEngine] 🧹 Master Bypass [${isReset ? 'RESET' : isMenu ? 'MENU' : 'START'}] for card ${box.ref.id}`);
        
        // Atomic wipe + Status reset (Rule 4: Root Isolation)
        const resetPayload: any = {
            'botState.status': 'active',
            'botState.waitingForInput': false,
            'botState.currentNodeId': null,
        };

        // Only wipe captured variables on explicit hard reset — not on "hola" to start.
        if (isReset) {
            resetPayload['botState.messageQueue'] = [];
            resetPayload['botState.lastProcessedMessageId'] = null;
        }

        await box.ref.update(resetPayload);
        
        // Sync local cardData for current cycle execution
        cardData.botState = { ...(cardData.botState || {}), status: 'active', waitingForInput: false, currentNodeId: null };
        
        if (isReset) {
            if (isExplicitReset) {
                const resetText = "🔄 Reinicio completado. Por favor, envíanos un mensaje para empezar de nuevo.";
                await dispatchMessage(resetText);
                await appendAgentMessage({ text: resetText, type: 'text', messageId: `bot_sys_${Date.now()}` });
                
                // Detenemos la ejecución aquí para que el bot ESPERE un nuevo mensaje
                // antes de iniciar el flujo principal nuevamente.
                return;
            } else {
                const timeoutText = "⏳ Por inactividad prolongada, hemos reiniciado la conversación.";
                await dispatchMessage(timeoutText);
                await appendAgentMessage({ text: timeoutText, type: 'text', messageId: `bot_sys_${Date.now()}` });
                // No retornamos. Dejamos que el motor inicie el flujo principal automáticamente con este nuevo mensaje.
            }
        }

        if (isMenu || (isReset && !isStartTrigger)) {
            // If it's a menu or a reset (without a specific greeting like 'hola'), 
            // we ensure the engine restarts by setting shouldRestart to true below.
        } else if (!isStartTrigger && !isReset) {
            // If it's not a restart trigger, we might want to stop here (e.g. for simple commands)
            // But for elizmey, we usually want the flow to start.
        }
    }

    // cardData.botState is the live source of truth (updated by Master Bypass above if needed)


    // --- C. FLOW RESOLUTION (Rule 4: Root Isolation) ---
    const collectionName = resolveBotsCollectionName(platform, botsCollection);
    const botsRef = db.collection(`${entityPath}/${collectionName}`);
    const botsSnapshot = await botsRef.where('isActive', 'in', [true, 'true']).get();
    const allActiveBots = botsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

    if (allActiveBots.length === 0) {
        console.log(`[ChatbotEngine] ⚠️ No active bots in ${collectionName} for entity ${entityId}`);
        return;
    }

    const isolatedChannel = isIsolatedBotCollection(collectionName);

    // Filter and score bots by platform relevance (isolated collections skip cross-channel scoring)
    const platformBots = allActiveBots.map(bot => {
        const targets = (bot.targetPlatforms || []).map((t: string) => t.toLowerCase().trim());
        let score = 0;
        
        // Match platform case-insensitive and trimmed
        const currentPlatform = platform.toLowerCase().trim();
        
        // Robust matching for common abbreviations
        const aliases: Record<string, string[]> = {
            'whatsapp': ['wa', 'wpp', 'whatsapp cloud'],
            'instagram': ['ig', 'insta'],
            'instagram_comments': ['ig', 'insta', 'instagram_comments'],
            'messenger': ['fb', 'facebook', 'msg'],
            'telegram': ['tg', 'tele'],
            'x_twitter': ['x', 'twitter'],
            'x_twitter_comments': ['x', 'twitter', 'x_comments'],
            'x': ['x_twitter', 'twitter'],
        };

        const currentAliases = aliases[currentPlatform] || [];
        const hasMatch = targets.some((t: string) => t === currentPlatform || currentAliases.includes(t));

        if (isolatedChannel) {
            score = 10;
        } else if (hasMatch) {
            score = 10; // Explicit match (High Priority)
        } else if (currentPlatform === 'gmail') {
            score = 0; // STRICT MATCH REQUIRED: Gmail should never be targeted by a global/wildcard bot
        } else if (targets.length === 0 || targets.includes('*') || targets.includes('all')) {
            score = 5;  // Global Match (Medium Priority) for other platforms
        } else {
            score = 1; // Fallback
        }
        
        return { ...bot, _score: score };
    }).filter(bot => bot._score > 0);

    if (platformBots.length === 0) {
        console.log(`[ChatbotEngine] ⚠️ No matching bots found for platform ${platform} on entity ${entityId}. Active targets:`, allActiveBots.map(b => b.targetPlatforms));
        return;
    }

    // --- MULTI-NUMBER ROUTING ---
    // Always prefer the bot bound to the SAME slot that received the message.
    // Never fall back across slots when a phone maps to a known slot — that is how
    // one number steals another number's bot (esp. after broadcast activation).
    let selectedBots = platformBots;
    if (platform === 'whatsapp' && channelAccountId) {
        const incomingId = String(channelAccountId).trim();
        const phoneMatches: typeof platformBots = [];
        for (const bot of platformBots) {
            const botPhone = await resolveBotPhoneNumberIdFromEntity(entityPath, bot);
            if (botPhone === incomingId) phoneMatches.push(bot);
        }
        if (phoneMatches.length > 0) {
            selectedBots = phoneMatches;
            console.log(
                `[ChatbotEngine] 📍 Routing to phone ${incomingId} (${phoneMatches.length} bot[s])`
            );
        } else {
            console.log(
                `[ChatbotEngine] ⛔ No bot bound to phone ${incomingId} — skipping.`
            );
            return;
        }
    }

    // Sort by: 1. Score (Specificity) | 2. Recency
    selectedBots.sort((a, b) => {
        if (b._score !== a._score) return b._score - a._score;
        return (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0);
    });

    const botData = selectedBots[0];
    const activePhoneNumberId =
        (platform === 'whatsapp' && channelAccountId
            ? String(channelAccountId).trim()
            : '') ||
        (await resolveBotPhoneNumberIdFromEntity(entityPath, botData)) ||
        '';
    let forceFlowRestart = false;
    const prevBotId = String(cardData.botState?.activeBotId || '').trim();
    const prevPhone = String(cardData.botState?.activePhoneNumberId || '').trim();
    const botContextChanged =
        (prevBotId && prevBotId !== String(botData.id)) ||
        (prevPhone && activePhoneNumberId && prevPhone !== activePhoneNumberId);
    if (botContextChanged && !wasWaitingForInput) {
        console.log(
            `[ChatbotEngine] 🔀 Bot/phone context changed (${prevBotId || '?'}→${botData.id}, ${prevPhone || '?'}→${activePhoneNumberId}) — resetting flow`
        );
        forceFlowRestart = true;
        await box.ref.update({
            'botState.status': 'active',
            'botState.waitingForInput': false,
            'botState.currentNodeId': null,
            'botState.lastStep': admin.firestore.FieldValue.delete(),
            'botState.activeBotId': String(botData.id),
            'botState.activePhoneNumberId': activePhoneNumberId,
        });
        cardData.botState = {
            ...(cardData.botState || {}),
            status: 'active',
            waitingForInput: false,
            currentNodeId: null,
            activeBotId: String(botData.id),
            activePhoneNumberId,
        };
    } else if (!prevBotId || !prevPhone) {
        await box.ref
            .update({
                'botState.activeBotId': String(botData.id),
                'botState.activePhoneNumberId': activePhoneNumberId,
            })
            .catch(() => {});
        cardData.botState = {
            ...(cardData.botState || {}),
            activeBotId: String(botData.id),
            activePhoneNumberId,
        };
    }
    console.log(`[ChatbotEngine] 🤖 Selected Bot: "${botData.name}" (Score: ${botData._score}) for ${platform}`);
    humanizeConfig = {
        enabled: !!botData.humanizeTone,
        style: String(botData.humanizeStyle || 'warm'),
        botId: String(botData.id || ''),
        openaiApiKey: null,
        geminiApiKey: null,
    };
    if (humanizeConfig.enabled) {
        console.log(`[ChatbotEngine] 🗣️ Humanize tone ON (style=${humanizeConfig.style}) for bot ${humanizeConfig.botId}`);
        try {
            const [openaiSnap, geminiSnap] = await Promise.all([
                db.doc(`${entityPath}/integrations/openai`).get().catch(() => null),
                db.doc(`${entityPath}/integrations/gemini`).get().catch(() => null),
            ]);
            if (openaiSnap?.exists) {
                humanizeConfig.openaiApiKey = String(openaiSnap.data()?.apiKey || '').trim() || null;
            }
            if (geminiSnap?.exists) {
                humanizeConfig.geminiApiKey = String(geminiSnap.data()?.apiKey || '').trim() || null;
            }
        } catch (err: any) {
            console.warn(`[ChatbotEngine] Humanize key lookup skipped: ${err?.message || err}`);
        }
    }
    const flow = botData.flow || { nodes: [], edges: [] };

    let nodeGroupMap: Map<string, string> | undefined;
    try {
        nodeGroupMap = await buildBotNodeGroupMap(db, entityPath, botData.id);
    } catch (err: any) {
        console.warn(`[ChatbotEngine] Kanban group map unavailable: ${err?.message || err}`);
    }
    let currentKanbanGroupId: string =
        getPlacementGroupId() || cardData.kanbanGroupId || cardData.groupId || '';
    const syncKanbanToNode = async (nodeId: string | null | undefined) => {
        if (!nodeId || !cardId || !currentKanbanGroupId) return;
        try {
            const newGroupId = await syncCardToBotNodeAdmin({
                db,
                tenantPath: entityPath,
                cardId,
                currentGroupId: currentKanbanGroupId,
                botId: botData.id,
                nodeId: String(nodeId),
                nodeGroupMap,
            });
            if (newGroupId && newGroupId !== currentKanbanGroupId) {
                currentKanbanGroupId = newGroupId;
                setPlacementGroupId(newGroupId);
                // Conversation truth stays put — only update placement pointers + thin card.
                await box.ref.set(
                    {
                        kanbanGroupId: newGroupId,
                        kanbanCardId: cardId,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    },
                    { merge: true }
                );
                const convData = (await box.ref.get()).data() || {};
                await syncThinCardPreview({
                    db,
                    tenantPath: entityPath,
                    conversationId,
                    groupId: newGroupId,
                    cardId,
                    data: convData,
                });
            }
        } catch (err: any) {
            console.warn(`[ChatbotEngine] Kanban auto-move failed: ${err?.message || err}`);
        }
    };

    const replaceVars = (val: string, overlay: any = {}) => {
        if (!val) return '';
        const context: any = { ...sessionVars, ...overlay };
        return val.replace(/\{\{?(\w+)\}?}/g, (match, key) => {
            return context[key] !== undefined ? String(context[key]) : match;
        });
    };

    const isValidationDebounced = () => {
        const raw = cardData.botState?.lastValidationAt;
        if (!raw) return false;
        const lastAt = raw.toDate?.() || (typeof raw === 'number' ? new Date(raw) : new Date(raw));
        if (Number.isNaN(lastAt.getTime())) return false;
        return Date.now() - lastAt.getTime() < VALIDATION_DEBOUNCE_MS;
    };

    /** Re-send the interactive prompt for the node we are actually waiting on (keeps WhatsApp UI in sync). */
    const resendWaitNodePrompt = async (waitNode: any) => {
        if (!waitNode) return;

        if (waitNode.type === 'listMessageNode') {
            const body = replaceVars(waitNode.data?.body || waitNode.data?.text || 'Selecciona una opción:');
            const sections = buildWhatsAppListSections(waitNode.data?.sections || []);
            await dispatchMessage(body, {
                type: 'list',
                button: waitNode.data?.buttonText || 'Ver opciones',
                sections,
                nodeId: waitNode.id,
            });
            await appendAgentMessage({
                text: body,
                type: 'list',
                messageId: `bot_list_retry_${Date.now()}`,
                metadata: {
                    buttonText: waitNode.data?.buttonText || 'Ver opciones',
                    sections,
                    resentAfterInvalid: true,
                },
            });
            return;
        }

        if (waitNode.type === 'pollNode') {
            const question = replaceVars(waitNode.data?.question || 'Selecciona una opción:');
            const sections = [{
                title: 'Opciones',
                rows: (waitNode.data?.options || []).map((o: any) => ({
                    id: o.id,
                    title: String(o.text || o.title || '').substring(0, 24),
                    description: '',
                })),
            }];
            const waSections = buildWhatsAppListSections(sections);
            await dispatchMessage(question, { type: 'list', button: 'Ver opciones', sections: waSections });
            await appendAgentMessage({
                text: question,
                type: 'list',
                messageId: `bot_poll_retry_${Date.now()}`,
                metadata: { resentAfterInvalid: true },
            });
            return;
        }

        if (waitNode.type === 'quickReplyNode') {
            const content = replaceVars(waitNode.data?.content || waitNode.data?.text || waitNode.data?.bodyText || '');
            const buttons = buildWhatsAppQuickReplyButtons(waitNode.data?.buttons || []);
            const prompt = content.trim() || 'Selecciona una opción:';
            if (buttons.length > 0) {
                await dispatchMessage(prompt, { type: 'quick_reply', buttons });
            } else {
                await dispatchMessage(prompt, {});
            }
            await appendAgentMessage({
                text: prompt,
                type: buttons.length > 0 ? 'buttons' : 'text',
                messageId: `bot_wait_retry_${Date.now()}`,
                ...(buttons.length > 0
                    ? {
                        metadata: {
                            buttons: buttons.map((button: any) => ({
                                text: button.reply?.title || '',
                                id: button.reply?.id || '',
                            })),
                            resentAfterInvalid: true,
                        },
                    }
                    : { metadata: { resentAfterInvalid: true } }),
            });
        }
    };

    /**
     * Invalid menu reply: keep waiting on the SAME node, debounce spam, and re-send the real menu
     * instead of only a hardcoded text the user never put in the flow.
     */
    const handleInvalidMenuSelection = async (waitNode: any, rawInput: string) => {
        console.log(
            `[ChatbotEngine] ⚠️ Invalid selection for ${waitNode?.type} ${waitNode?.id}: "${String(rawInput).slice(0, 80)}"`
        );

        const debounced = isValidationDebounced();
        await box.ref.update({
            'botState.waitingForInput': true,
            'botState.currentNodeId': waitNode?.id || null,
            'botState.lastValidationAt': admin.firestore.FieldValue.serverTimestamp(),
            'botState.lastValidationInput': String(rawInput || '').slice(0, 120),
        });

        if (debounced) {
            console.log(`[ChatbotEngine] ⏳ Validation debounce active — not re-sending prompt`);
            return;
        }

        await resendWaitNodePrompt(waitNode);
        await box.ref.update({
            'botState.waitingForInput': true,
            'botState.currentNodeId': waitNode?.id || null,
            'botState.lastStep': waitNode?.type || null,
            'botState.lastWaitStartedAt': admin.firestore.FieldValue.serverTimestamp(),
        });
    };

    // --- INNER EXECUTION LOOP ---
    // CRITICAL: Read bState AFTER Master Bypass updates cardData.botState in memory
    // so that waitingForInput reflects the current state of this execution cycle.
    let currentNodeId: string | null = cardData.botState?.currentNodeId || null;
    let waitingForInput = cardData.botState?.waitingForInput || false;

    // SELF-HEAL interrupted runs (e.g. serverless timeout mid-flow):
    // If the bot is parked on a wait node (captureInput/quickReply/list/poll) but the
    // `waitingForInput` flag desynced to false, a previous run was killed after advancing to the
    // node. Two sub-cases:
    //   (a) The prompt was already sent (lastStep === node type) → treat as WAITING so the reply
    //       is CAPTURED (don't re-ask).
    //   (b) The prompt was never sent (lastStep is a previous node) → leave waiting=false so the
    //       forward loop re-executes the node and finally SENDS the pending question.
    // Without this, replies land on a parked-but-not-waiting node and are silently dropped.
    if (!waitingForInput && currentNodeId && !isReset && !shouldApplyStartTrigger) {
        const parkedNode = flow.nodes.find((n: any) => String(n.id) === String(currentNodeId));
        const parkedIsWait = ['captureInputNode', 'quickReplyNode', 'listMessageNode', 'pollNode']
            .includes(parkedNode?.type || '');
        const promptAlreadySent = cardData.botState?.lastStep === parkedNode?.type;
        if (parkedIsWait && promptAlreadySent) {
            console.log(`[ChatbotEngine] 🩹 Self-heal: re-syncing waitingForInput=true on parked ${parkedNode?.type} (${currentNodeId})`);
            waitingForInput = true;
        }
    }

    // Recover lost park after kanban card move / failed writes: status still "active" and we
    // were asking for text (greeting→name), but currentNodeId was wiped. Capture this reply
    // instead of no-op or restarting the whole greeting.
    if (
        !waitingForInput &&
        !currentNodeId &&
        !isReset &&
        !shouldApplyStartTrigger &&
        cardData.botState?.status === 'active'
    ) {
        const lastStep = cardData.botState?.lastStep;
        if (lastStep === 'textMessageNode' || lastStep === 'captureInputNode') {
            const capture = flow.nodes.find((n: any) => n.type === 'captureInputNode');
            if (capture) {
                console.log(`[ChatbotEngine] 🩹 Recovering capture park on ${capture.id} after lost state`);
                currentNodeId = capture.id;
                waitingForInput = true;
                await box.ref.update({
                    'botState.currentNodeId': capture.id,
                    'botState.waitingForInput': true,
                    'botState.lastStep': 'captureInputNode',
                }).catch(() => {});
            }
        }
    }

    // Re-engagement rule (balanced to avoid double replies / flow mixing):
    //  - If the bot is actively waiting for an answer on a valid node → CONTINUE (capture input),
    //    even if the customer replies days later. Never restart here.
    //  - If the bot is genuinely idle (no current node, completed, or inactive) → RESTART the flow
    //    from the beginning, so the customer can always re-enter the funnel.
    //  - If the bot is mid-flow but not waiting (transient/resume state) → RESUME from the current
    //    node instead of restarting, so we don't replay the start on top of the running flow.
    const status = cardData.botState?.status;
    const isActivelyWaiting = waitingForInput && !!currentNodeId;
    // Do not treat a missing currentNodeId alone as idle — that causes full restarts mid-funnel
    // after state is lost (e.g. card move), replaying the greeting when the user types their name.
    const botIsIdle = status === 'completed' || status === 'inactive' || !status;
    const shouldRestart = (isReset || isMenu || shouldApplyStartTrigger || forceFlowRestart)
        ? true
        : (!isActivelyWaiting && botIsIdle);

    // Handle incoming input for current node
    if (waitingForInput && currentNodeId) {
        // AGNOSTIC RULE: Do not allow the same message that triggered the start/reset to be captured as an input
        // This prevents capturing "Reiniciar" or "Hola" as answers to questions.
        // MOD: Solo bloqueamos si es un Reset explícito o si NO estamos esperando entrada (flujo inicial).
        // Si estamos esperando entrada (waitingForInput), permitimos que pase para que el 'cleanInput' haga su trabajo.
        if (isReset || shouldApplyStartTrigger) {
            console.log(`[ChatbotEngine] 🛡️ Trigger message [${isReset?'RESET':'START'}] blocked from captureInputNode to prevent auto-fill.`);
        } else {
            const node = flow.nodes.find((n: any) => n.id === currentNodeId);
            if (node?.type === 'captureInputNode') {
                const varName = node.data?.variableName || 'input';
                const inputType = node.data?.inputType || 'text';
                const validationRegex = node.data?.validationRegex;
                const errorMessage = node.data?.errorMessage || 'Formato inválido. Por favor intenta de nuevo.';
                
                // 1. ROBUST TYPE DETECTION
                let extracted = text.trim();
                const isEmail = inputType === 'email' || /email|mail|correo|direcc/i.test(varName);
                const isName = (inputType === 'text' || !inputType) && /nombre|name|cli/i.test(varName);

                if (isEmail) {
                    extracted = cleanInput(text, 'email');
                } else if (isName) {
                    extracted = cleanInput(text, 'nombre');
                }

                // 2. VALIDATION (Omnichannel Robust)
                let isValid = !!extracted;

                // SPECIAL RULE: If it's an email type, ensure it looks like an email at minimum
                if (isEmail && isValid) {
                    const basicEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!basicEmailRegex.test(extracted)) {
                        console.log(`[ChatbotEngine] ⚠️ Basic Email validation failed for: ${extracted}`);
                        isValid = false;
                    }
                }

                // RULE: Regex Validation (if defined in node)
                if (isValid && validationRegex) {
                    try {
                        const regex = new RegExp(validationRegex, 'i');
                        isValid = regex.test(extracted);
                    } catch (e) {
                        console.error(`[ChatbotEngine] ❌ Invalid Regex in node ${node.id}:`, validationRegex);
                    }
                }

                if (!isValid) {
                    console.log(`[ChatbotEngine] ⚠️ Validation failed for ${varName}: "${extracted}"`);
                    const errorContent = replaceVars(errorMessage);
                    await dispatchMessage(errorContent, { skipHumanize: true });
                    await appendAgentMessage({
                        text: errorContent,
                        type: 'text',
                        messageId: `bot_validation_${Date.now()}`,
                        preserveText: true,
                    });
                    return;
                }

                // 3. SUCCESS HANDLING
                console.log(`[ChatbotEngine] ✅ Captured & Validated ${varName}: ${extracted}`);
                
                if (isName) {
                    sessionVars.nombre = extracted;
                    sessionVars.name = extracted;
                }
                sessionVars[varName] = extracted;

                // Find next node (Universal Connector)
                const next = resolveDefaultNextEdge(flow.edges, node.id);
                const nextId = next?.target || null;

                const updatePayload: any = {
                    [`customFields.${varName}`]: extracted,
                    'botState.waitingForInput': false,
                    'botState.currentNodeId': nextId,
                };
                await box.ref.update(updatePayload);

                currentNodeId = nextId;
                await syncKanbanToNode(nextId);
            } else if (node?.type === 'quickReplyNode') {
                const buttons = sanitizeFlowButtons(node.data?.buttons || []);
                const resolution = resolveQuickReplyEdge(flow.edges, node.id, buttons, text);

                if (resolution.invalid) {
                    await handleInvalidMenuSelection(node, text);
                    return;
                }

                if (resolution.missingEdge) {
                    console.error(`[ChatbotEngine] ⚠️ No edge matched for quick-reply on node ${node.id} (input: "${text}"). Trying default exit.`);
                    const fallback = resolveDefaultNextEdge(flow.edges, node.id);
                    if (!fallback) {
                        await handleInvalidMenuSelection(node, text);
                        return;
                    }
                    currentNodeId = fallback.target;
                } else {
                    currentNodeId = resolution.edge?.target || null;
                }
                // Persist next node immediately so a crash mid-send cannot leave us parked on the old QR.
                await box.ref.update({
                    'botState.waitingForInput': false,
                    'botState.currentNodeId': currentNodeId,
                });
            } else if (node?.type === 'listMessageNode' || node?.type === 'pollNode') {
                const sections =
                    node.type === 'pollNode'
                        ? [{
                            title: 'Opciones',
                            rows: (node.data?.options || []).map((o: any) => ({
                                id: o.id,
                                title: o.text,
                                description: '',
                            })),
                        }]
                        : (node.data?.sections || []);
                const resolution = resolveListMessageEdge(flow.edges, node.id, sections, text);

                if (resolution.invalid) {
                    await handleInvalidMenuSelection(node, text);
                    return;
                }

                if (resolution.missingEdge) {
                    console.error(`[ChatbotEngine] ⚠️ No edge matched for list on node ${node.id} (input: "${text}"). Trying default exit.`);
                    const fallback = resolveDefaultNextEdge(flow.edges, node.id);
                    if (!fallback) {
                        await handleInvalidMenuSelection(node, text);
                        return;
                    }
                    currentNodeId = fallback.target;
                } else {
                    currentNodeId = resolution.edge?.target || null;
                }
                await box.ref.update({
                    'botState.waitingForInput': false,
                    'botState.currentNodeId': currentNodeId,
                });
            } else {
                const edge = resolveDefaultNextEdge(flow.edges, node?.id || '');
                currentNodeId = edge ? edge.target : null;
                await box.ref.update({
                    'botState.waitingForInput': false,
                    'botState.currentNodeId': currentNodeId,
                });
            }
        }
    } else {
        // Start from beginning if not active or if stuck
        if (shouldRestart) {
             const start = flow.nodes.find((n: any) => n.type === 'start' || n.type === 'startNode');
             currentNodeId = start ? start.id : null;
             console.log(`[ChatbotEngine] 🆕 Starting/Restarting flow at node ${currentNodeId}`);
             if (currentNodeId) await syncKanbanToNode(currentNodeId);
        }
    }

    // If we're already waiting on a prompt node, do NOT re-send it in the forward loop.
    const preLoopSnap = await box.ref.get();
    const preLoopState = preLoopSnap.data()?.botState || {};
    if (preLoopState.waitingForInput && preLoopState.currentNodeId) {
        const waitingNode = flow.nodes.find((n: any) => n.id === preLoopState.currentNodeId);
        const isWaitNode = ['captureInputNode', 'quickReplyNode', 'listMessageNode', 'pollNode'].includes(waitingNode?.type || '');
        if (isWaitNode && String(preLoopState.currentNodeId) === String(currentNodeId)) {
            console.log(`[ChatbotEngine] 🛑 Already waiting on node ${currentNodeId} — skipping duplicate prompt send.`);
            return;
        }
    }

    // Node-by-Node Forward Execution
    let executionCount = 0;
    let welcomeSentThisCycle = false;
    while (currentNodeId && executionCount < 15) {
        executionCount++;
        const node = flow.nodes.find((n: any) => n.id === currentNodeId);
        if (!node) {
            console.log(`[ChatbotEngine] 🛑 Node not found: ${currentNodeId}. Attempting default edge recovery.`);
            const orphanEdge = resolveDefaultNextEdge(flow.edges, currentNodeId);
            currentNodeId = orphanEdge?.target || null;
            if (!currentNodeId) break;
            continue;
        }

        console.log(`[ChatbotEngine] ⚙️ Executing Node Type: ${node.type} (${node.id})`);
        
        // Skip start nodes in the middle of execution
        if (node.type === 'start' || node.type === 'startNode') {
            if (shouldRestart && !welcomeSentThisCycle) {
                const welcome = String(
                    node.data?.welcomeMessage || node.data?.greeting || ''
                ).trim();
                if (welcome) {
                    const content = replaceVars(welcome);
                    const sent = await dispatchMessage(content, { nodeId: node.id });
                    const outbound = (sent as any)?.sentText || content;
                    if (String(outbound).trim()) {
                        await appendAgentMessage({
                            text: outbound,
                            type: 'text',
                            messageId: `bot_welcome_${Date.now()}`,
                            preserveText: true,
                        });
                    }
                    welcomeSentThisCycle = true;
                }
            }
            const edge = resolveDefaultNextEdge(flow.edges, node.id);
            currentNodeId = edge ? edge.target : null;
            continue;
        }

        const isWaitPromptNode = ['captureInputNode', 'quickReplyNode', 'listMessageNode', 'pollNode']
            .includes(node.type);
        // For wait nodes, do NOT stamp lastStep until AFTER Meta confirms the prompt —
        // otherwise self-heal wrongly treats a half-sent node as "already waiting".
        await box.ref.update(
            isWaitPromptNode
                ? { 'botState.currentNodeId': node.id }
                : { 'botState.currentNodeId': node.id, 'botState.lastStep': `${node.type}` }
        );
        await syncKanbanToNode(node.id);

        // 1. TEXT MESSAGE
        if (node.type === 'textMessageNode') {
            const content = replaceVars(node.data?.content || node.data?.text || 'Hola');
            const sent = await dispatchMessage(content, { nodeId: node.id });
            const outbound = (sent as any)?.sentText || content;
            if (outbound.trim()) {
                await appendAgentMessage({
                    text: outbound,
                    type: 'text',
                    messageId: `bot_${Date.now()}`,
                    preserveText: true,
                });
            }
            const edge = resolveDefaultNextEdge(flow.edges, node.id);
            currentNodeId = edge ? edge.target : null;
            continue;
        }

        // 2. MEDIA MESSAGE
        console.log(`[ChatbotEngine] 🎯 Checking Node: ${node.id} | Type: ${node.type}`);
        if (node.type === 'mediaMessageNode' || (node.type as string) === 'multimedia') {
            const rawUrl = node.data?.url || node.data?.attachment || node.data?.link || node.data?.content || '';
            const url = replaceVars(rawUrl);
            
            let rawCaption = node.data?.caption || node.data?.body || node.data?.text || '';
            if (!rawCaption && node.data?.content && node.data?.content !== rawUrl) {
                rawCaption = node.data.content;
            }
            const caption = replaceVars(rawCaption);
            const filename = node.data?.filename || 'archivo';

            const { detectWhatsAppMediaType } = await import('@/lib/whatsapp/mediaUtils');
            const mediaType = detectWhatsAppMediaType({
                explicit: node.data?.mediaType,
                url,
                filename,
                mimeType: node.data?.mimeType,
            });

            console.log(`[ChatbotEngine] 🖼️ Media Node: type=${mediaType} URL=${url.substring(0, 40)}...`);
            
            if (url && url.startsWith('http')) {
                const sendResult = await dispatchMessage(caption, { 
                    type: mediaType,
                    mediaType,
                    url,
                    filename,
                    mimeType: node.data?.mimeType,
                    mediaId: node.data?.metaMediaId,
                    preferMediaId: node.data?.preferMediaId !== false,
                });
                console.log(`[ChatbotEngine] 📦 Dispatch Result:`, JSON.stringify(sendResult));

                await appendAgentMessage({
                    text: caption || '',
                    messageId: `bot_media_${Date.now()}`,
                    type: 'media',
                    fileUrl: url,
                    fileType:
                        mediaType === 'image' ? 'image/*' :
                        mediaType === 'video' ? 'video/*' :
                        mediaType === 'audio' ? 'audio/*' :
                        'application/octet-stream',
                    fileName: filename,
                    metadata: { url, filename, mediaType },
                });

                await sleep(mediaType === 'video' ? 3000 : 2000);
            } else if (caption) {
                // FALLBACK: If URL is missing or invalid but we have text, send text so the flow doesn't look dead
                console.warn(`[ChatbotEngine] ⚠️ Media URL missing or invalid "${url}". Sending caption as text fallback.`);
                await dispatchMessage(caption);
                await appendAgentMessage({
                    text: caption,
                    type: 'text',
                    messageId: `bot_fallback_${Date.now()}`
                });
            }

            const edge = resolveDefaultNextEdge(flow.edges, node.id);
            currentNodeId = edge ? edge.target : null;
            continue;
        }

        // 3. LIST MESSAGE — park on this node in Firestore BEFORE Meta send so a crash
        // after delivery still self-heals onto the list (not the previous QR).
        if (node.type === 'listMessageNode') {
            const body = replaceVars(node.data?.body || node.data?.text || 'Selecciona una opción:');
            const sections = buildWhatsAppListSections(node.data?.sections || []);

            await box.ref.update({
                'botState.status': 'active',
                'botState.currentNodeId': node.id,
                'botState.waitingForInput': false,
            });

            await dispatchMessage(body, {
                type: 'list',
                button: node.data?.buttonText || 'Ver opciones',
                sections,
                nodeId: node.id,
            });
            const listOutbound = lastOutboundText || body;
            lastOutboundText = null;

            await box.ref.update({
                'botState.waitingForInput': true,
                'botState.lastStep': 'listMessageNode',
                'botState.lastWaitStartedAt': admin.firestore.FieldValue.serverTimestamp(),
                messages: admin.firestore.FieldValue.arrayUnion({
                    sender: 'agent',
                    text: listOutbound,
                    platform,
                    timestamp: new Date(),
                    messageId: `bot_list_${Date.now()}`,
                    type: 'list',
                    metadata: {
                        buttonText: node.data?.buttonText || 'Ver opciones',
                        sections
                    }
                })
            });
            await syncKanbanToNode(node.id);
            return;
        }

        // 4. CAPTURE / QUICK REPLY (Wait nodes)
        if (node.type === 'captureInputNode' || node.type === 'quickReplyNode') {
            const content = replaceVars(node.data?.content || node.data?.text || node.data?.bodyText || '');
            const buttons = buildWhatsAppQuickReplyButtons(node.data?.buttons || []);
            const isQuickReply = node.type === 'quickReplyNode';

            // Park on this node before sending so mid-send failures self-heal onto THIS wait node.
            await box.ref.update({
                'botState.status': 'active',
                'botState.currentNodeId': node.id,
                'botState.waitingForInput': false,
                'botState.variableName': node.data?.variableName || 'input',
            });

            if (isQuickReply && buttons.length > 0) {
                const prompt = content.trim() || 'Selecciona una opción:';
                await dispatchMessage(prompt, { type: 'quick_reply', buttons, nodeId: node.id });
            } else if (content.trim()) {
                await dispatchMessage(content, { nodeId: node.id });
            } else if (node.type === 'captureInputNode') {
                const prompt = 'Por favor, escribe tu respuesta:';
                await dispatchMessage(prompt, { nodeId: node.id });
            }

            const agentTextRaw = isQuickReply && buttons.length > 0
                ? (content.trim() || 'Selecciona una opción:')
                : (content.trim() || (node.type === 'captureInputNode' ? 'Por favor, escribe tu respuesta:' : ''));
            const agentText = (agentTextRaw && lastOutboundText) ? lastOutboundText : agentTextRaw;
            lastOutboundText = null;

            const updatePayload: any = {
                'botState.waitingForInput': true,
                'botState.lastStep': node.type,
                'botState.lastWaitStartedAt': admin.firestore.FieldValue.serverTimestamp()
            };
            
            if (agentText) {
                updatePayload.messages = admin.firestore.FieldValue.arrayUnion({
                    sender: 'agent', 
                    text: agentText, 
                    platform, 
                    timestamp: new Date(), 
                    messageId: `bot_wait_${Date.now()}`,
                    type: isQuickReply ? 'buttons' : 'text',
                    ...(isQuickReply ? {
                        metadata: {
                            buttons: buttons.map((button: any) => ({
                                text: button.reply?.title || '',
                                id: button.reply?.id || ''
                            }))
                        }
                    } : {})
                });
            }
            
            await box.ref.update(updatePayload);
            await syncKanbanToNode(node.id);
            return; // EXIT loop, wait for user
        }

        // 4. LOGIC NODES (Set Variable, Webhook, etc.)
        if (node.type === 'conditionNode') {
            const snap = await box.ref.get();
            const fresh = snap.data() || {};
            const conditionData = node.data || {};
            const routes = conditionData.routes || [];
            let matchedRouteId: string | null = null;

            for (const route of routes) {
                const matchType = route.matchType || 'AND';
                const routeConditions = route.conditions || [];

                if (routeConditions.length === 0) continue;

                let routeMatches = matchType === 'AND'; // Start true for AND, false for OR

                for (const cond of routeConditions) {
                    const varName = (cond.variable || '').replace(/[\{\}]/g, '').trim();
                    const varValue = fresh.customFields?.[varName] || fresh[varName];

                    const isMatch = evaluateCondition(varValue, cond.operator, cond.value, conditionData.fuzzyMatch !== false);

                    if (matchType === 'AND') {
                        routeMatches = routeMatches && isMatch;
                        if (!routeMatches) break;
                    } else {
                        routeMatches = routeMatches || isMatch;
                        if (routeMatches) break;
                    }
                }

                if (routeMatches) {
                    matchedRouteId = route.id;
                    break;
                }
            }

            if (matchedRouteId) {
                const matchedEdge = flow.edges.find((e: any) => String(e.source) === String(node.id) && String(e.sourceHandle) === String(matchedRouteId));
                currentNodeId = matchedEdge ? matchedEdge.target : resolveDefaultNextEdge(flow.edges, node.id)?.target || null;
            } else {
                const elseEdge = flow.edges.find((e: any) => String(e.source) === String(node.id) && e.sourceHandle === 'else');
                currentNodeId = elseEdge ? elseEdge.target : resolveDefaultNextEdge(flow.edges, node.id)?.target || null;
            }
            continue;
        }

        if (node.type === 'setVariableNode') {
            const snap = await box.ref.get();
            const fresh = snap.data() || {};
            const setVarData = node.data || {};
            const varToSet = (setVarData.variableName || '').replace(/[\{\}]/g, '').trim();
            const opCat = setVarData.operationCategory || 'set';
            const op = setVarData.operation || 'set';
            let valueToUse = replaceVars(setVarData.value || '', fresh);

            if (varToSet) {
                let currentVal = fresh.customFields?.[varToSet] ?? fresh[varToSet] ?? '';
                let newVal: any = valueToUse;

                if (opCat === 'math') {
                    const numCurrent = parseFloat(currentVal) || 0;
                    const numInput = parseFloat(valueToUse) || 0;
                    if (op === 'add') newVal = numCurrent + numInput;
                    else if (op === 'subtract') newVal = numCurrent - numInput;
                    else if (op === 'multiply') newVal = numCurrent * numInput;
                } else if (opCat === 'list') {
                    let list = Array.isArray(currentVal) ? currentVal : [];
                    if (op === 'push') {
                        list.push(valueToUse);
                        newVal = list;
                    }
                }

                await box.ref.update({
                    [`customFields.${varToSet}`]: newVal
                });
                
                // Update local context for the remainder of this cycle
                sessionVars[varToSet] = newVal;
            }

            const edge = resolveDefaultNextEdge(flow.edges, node.id);
            currentNodeId = edge ? edge.target : null;
            continue;
        }

        if (node.type === 'delayNode') {
            const delayData = node.data || {};
            let delayMs = 2000;

            if (delayData.mode === 'random') {
                const min = parseFloat(delayData.minSeconds || 1);
                const max = parseFloat(delayData.maxSeconds || 3);
                delayMs = (Math.random() * (max - min) + min) * 1000;
            } else {
                const seconds = parseFloat(delayData.durationSeconds || delayData.duration || 2);
                delayMs = seconds * 1000;
            }

            console.log(`[ChatbotEngine] Executing delay: ${delayMs}ms`);
            await sleep(delayMs);
            const edge = resolveDefaultNextEdge(flow.edges, node.id);
            currentNodeId = edge ? edge.target : null;
            continue;
        }

        if (node.type === 'webhookNode') {
            const snap = await box.ref.get();
            const fresh = snap.data() || {};
            const webhookData = node.data || {};
            const url = replaceVars(webhookData.url || '');
            const method = (webhookData.method || 'POST').toUpperCase();
            const saveTo = (webhookData.saveResponseTo || '').replace(/[\{\}]/g, '').trim();

            if (url) {
                try {
                    console.log(`[ChatbotEngine] Executing Webhook: ${method} ${url}`);
                    const response = await axios({
                        method,
                        url,
                        timeout: 10000,
                    });

                    if (saveTo) {
                        await box.ref.update({
                            [`customFields.${saveTo}`]: response.data
                        });
                        sessionVars[saveTo] = response.data;
                    }

                    const successEdge = flow.edges.find((e: any) => String(e.source) === String(node.id) && e.sourceHandle === 'success');
                    currentNodeId = successEdge ? successEdge.target : resolveDefaultNextEdge(flow.edges, node.id)?.target || null;
                } catch (error: any) {
                    console.error(`[ChatbotEngine] Webhook Error:`, error.message);
                    const failureEdge = flow.edges.find((e: any) => String(e.source) === String(node.id) && e.sourceHandle === 'failure');
                    currentNodeId = failureEdge ? failureEdge.target : resolveDefaultNextEdge(flow.edges, node.id)?.target || null;
                }
            } else {
                const edge = resolveDefaultNextEdge(flow.edges, node.id);
                currentNodeId = edge ? edge.target : null;
            }
            continue;
        }

        if (node.type === 'generativeAINode') {
            const snap = await box.ref.get();
            const fresh = snap.data() || {};
            const aiData = node.data || {};
            const systemPrompt = replaceVars(aiData.systemPrompt || 'Eres un asistente útil.');
            const userMsg = fresh.lastMessage || '';
            const model = aiData.model || 'gpt-4o';
            const temperature = aiData.temperature ?? 0.7;
            const outputVar = (aiData.outputVariable || '').replace(/[\{\}]/g, '').trim();

            let apiKey = process.env.OPENAI_API_KEY;
            try {
                const aiIntegration = await db.doc(`${entityPath}/integrations/openai`).get();
                if (aiIntegration.exists) {
                    apiKey = aiIntegration.data()?.apiKey || apiKey;
                }
            } catch (err) {}

            if (apiKey) {
                try {
                    console.log(`[ChatbotEngine] Calling AI Model: ${model}`);
                    const aiResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
                        model: model.startsWith('gpt') ? model : 'gpt-4o',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: userMsg }
                        ],
                        temperature: temperature
                    }, {
                        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                        timeout: 30000
                    });

                    const aiText = aiResponse.data.choices[0].message.content;

                    if (outputVar) {
                        await box.ref.update({
                            [`customFields.${outputVar}`]: aiText
                        });
                        sessionVars[outputVar] = aiText;
                    } else {
                        await dispatchMessage(aiText, { skipHumanize: true });
                        await appendAgentMessage({
                            text: aiText,
                            type: 'text',
                            messageId: `bot_ai_${Date.now()}`,
                            preserveText: true,
                        });
                    }
                } catch (error: any) {
                    console.error(`[ChatbotEngine] AI Error:`, error.response?.data || error.message);
                    const errorMsg = "Lo siento, tuve un problema procesando tu solicitud con IA.";
                    await dispatchMessage(errorMsg, { skipHumanize: true });
                    await appendAgentMessage({
                        text: errorMsg,
                        type: 'text',
                        messageId: `bot_ai_err_${Date.now()}`,
                        preserveText: true,
                    });
                }
            } else {
                console.warn("[ChatbotEngine] Missing OpenAI API Key");
                const errorMsg = "El nodo de IA no está configurado (falta API Key).";
                await dispatchMessage(errorMsg, { skipHumanize: true });
                await appendAgentMessage({
                    text: errorMsg,
                    type: 'text',
                    messageId: `bot_ai_err_${Date.now()}`,
                    preserveText: true,
                });
            }
            const edge = resolveDefaultNextEdge(flow.edges, node.id);
            currentNodeId = edge ? edge.target : null;
            continue;
        }

        if (node.type === 'templateNode') {
            const tpl = node.data || {};
            const components: any[] = [];
            if (tpl.variables?.length) {
                components.push({
                    type: 'body',
                    parameters: tpl.variables.map((v: any) => ({
                        type: 'text',
                        text: replaceVars(v.value || ''),
                    })),
                });
            }
            if (tpl.headerUrl) {
                components.unshift({
                    type: 'header',
                    parameters: [{ type: 'image', image: { link: tpl.headerUrl } }],
                });
            }
            await dispatchMessage('', {
                type: 'template',
                forceTemplate: true,
                template: {
                    name: tpl.templateName,
                    language: { code: tpl.language || 'es' },
                    components,
                },
            });
            await appendAgentMessage({
                text: `Plantilla: ${tpl.templateName || 'template'}`,
                type: 'template',
                messageId: `bot_tpl_${Date.now()}`,
            });
            const edge = resolveDefaultNextEdge(flow.edges, node.id);
            currentNodeId = edge ? edge.target : null;
            continue;
        }

        if (node.type === 'locationNode') {
            const lat = parseFloat(replaceVars(String(node.data?.latitude || '')));
            const lng = parseFloat(replaceVars(String(node.data?.longitude || '')));
            if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
                await dispatchMessage('', {
                    type: 'location',
                    location: {
                        latitude: lat,
                        longitude: lng,
                        name: replaceVars(node.data?.name || ''),
                        address: replaceVars(node.data?.address || ''),
                    },
                });
                await appendAgentMessage({
                    text: replaceVars(node.data?.name || node.data?.address || 'Ubicación'),
                    type: 'location',
                    messageId: `bot_loc_${Date.now()}`,
                    metadata: { latitude: lat, longitude: lng },
                });
            }
            const edge = resolveDefaultNextEdge(flow.edges, node.id);
            currentNodeId = edge ? edge.target : null;
            continue;
        }

        if (node.type === 'contactNode') {
            const d = node.data || {};
            const phones = (d.phones || [])
                .filter((p: any) => p.number)
                .map((p: any) => ({
                    phone: p.number,
                    type: (p.type || 'CELL').toLowerCase(),
                    ...(p.wa_id ? { wa_id: p.number.replace(/\D/g, '') } : {}),
                }));
            const contactPayload = {
                name: {
                    formatted_name: d.formattedName || `${d.firstName || ''} ${d.lastName || ''}`.trim() || 'Contacto',
                    first_name: d.firstName || '',
                    last_name: d.lastName || '',
                },
                org: d.organization ? { company: d.organization } : undefined,
                emails: d.email ? [{ email: d.email, type: 'WORK' }] : undefined,
                urls: d.website ? [{ url: d.website, type: 'WORK' }] : undefined,
                phones,
            };
            await dispatchMessage('', { type: 'contacts', contacts: [contactPayload] });
            await appendAgentMessage({
                text: contactPayload.name.formatted_name,
                type: 'contacts',
                messageId: `bot_contact_${Date.now()}`,
            });
            const edge = resolveDefaultNextEdge(flow.edges, node.id);
            currentNodeId = edge ? edge.target : null;
            continue;
        }

        if (node.type === 'pollNode') {
            const question = replaceVars(node.data?.question || 'Selecciona una opción:');
            const sections = buildWhatsAppListSections([{
                title: 'Opciones',
                rows: (node.data?.options || []).map((o: any) => ({
                    id: o.id,
                    title: o.text,
                    description: '',
                })),
            }]);
            await dispatchMessage(question, { type: 'list', button: 'Ver opciones', sections });
            await box.ref.update({
                'botState.status': 'active',
                'botState.waitingForInput': true,
                'botState.currentNodeId': node.id,
                'botState.lastStep': 'pollNode',
                'botState.lastWaitStartedAt': admin.firestore.FieldValue.serverTimestamp(),
                messages: admin.firestore.FieldValue.arrayUnion({
                    sender: 'agent',
                    text: question,
                    platform,
                    timestamp: new Date(),
                    messageId: `bot_poll_${Date.now()}`,
                    type: 'list',
                    metadata: { buttonText: 'Ver opciones', sections },
                }),
            });
            await syncKanbanToNode(node.id);
            return;
        }

        if (node.type === 'transcriptionNode') {
            const snap = await box.ref.get();
            const fresh = snap.data() || {};
            const messages = fresh.messages || [];
            const lastAudio = [...messages].reverse().find(
                (m: any) => m.sender === 'user' && (m.fileType?.startsWith('audio/') || m.metadata?.mediaKind === 'audio')
            );
            const outputVar = (node.data?.outputVariable || 'transcripcion').replace(/[\{\}]/g, '').trim();
            let transcript = '';

            if (lastAudio?.fileUrl) {
                let apiKey = process.env.OPENAI_API_KEY;
                try {
                    const aiIntegration = await db.doc(`${entityPath}/integrations/openai`).get();
                    if (aiIntegration.exists) apiKey = aiIntegration.data()?.apiKey || apiKey;
                } catch {}
                if (apiKey) {
                    try {
                        const audioRes = await axios.get(lastAudio.fileUrl, { responseType: 'arraybuffer', timeout: 60_000 });
                        const formData = new FormData();
                        formData.append('file', new Blob([Buffer.from(audioRes.data)], { type: 'audio/ogg' }), 'audio.ogg');
                        formData.append('model', 'whisper-1');
                        if (node.data?.language && node.data.language !== 'auto') {
                            formData.append('language', node.data.language);
                        }
                        const whisperRes = await axios.post('https://api.openai.com/v1/audio/transcriptions', formData, {
                            headers: { Authorization: `Bearer ${apiKey}` },
                            timeout: 120_000,
                        });
                        transcript = whisperRes.data?.text || '';
                    } catch (err: any) {
                        console.error('[ChatbotEngine] Transcription error:', err?.message);
                        transcript = node.data?.fallbackMessage || '';
                    }
                }
            }

            if (outputVar) {
                await box.ref.update({ [`customFields.${outputVar}`]: transcript });
                sessionVars[outputVar] = transcript;
            } else if (transcript) {
                await dispatchMessage(transcript);
                await appendAgentMessage({ text: transcript, type: 'text', messageId: `bot_transcript_${Date.now()}` });
            }
            const edge = resolveDefaultNextEdge(flow.edges, node.id);
            currentNodeId = edge ? edge.target : null;
            continue;
        }

        if (node.type === 'sentimentAnalysisNode') {
            const snap = await box.ref.get();
            const fresh = snap.data() || {};
            const inputVar = (node.data?.inputVariable || '{{last_message}}').replace(/[\{\}]/g, '').trim();
            let textToAnalyze = fresh.lastMessage || text || '';
            if (inputVar && inputVar !== 'last_message') {
                textToAnalyze = fresh.customFields?.[inputVar] ?? fresh[inputVar] ?? textToAnalyze;
            }

            let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
            let apiKey = process.env.OPENAI_API_KEY;
            try {
                const aiIntegration = await db.doc(`${entityPath}/integrations/openai`).get();
                if (aiIntegration.exists) apiKey = aiIntegration.data()?.apiKey || apiKey;
            } catch {}

            if (apiKey && textToAnalyze) {
                try {
                    const aiRes = await axios.post('https://api.openai.com/v1/chat/completions', {
                        model: 'gpt-4o-mini',
                        messages: [
                            {
                                role: 'system',
                                content: `Clasifica el sentimiento como positive, negative o neutral. Contexto: ${node.data?.domainContext || 'atención al cliente'}. Responde solo una palabra.`,
                            },
                            { role: 'user', content: textToAnalyze },
                        ],
                        temperature: 0,
                    }, {
                        headers: { Authorization: `Bearer ${apiKey}` },
                        timeout: 30_000,
                    });
                    const raw = (aiRes.data.choices[0].message.content || '').toLowerCase();
                    if (raw.includes('positive')) sentiment = 'positive';
                    else if (raw.includes('negative')) sentiment = 'negative';
                } catch (err: any) {
                    console.error('[ChatbotEngine] Sentiment error:', err?.message);
                }
            }

            await box.ref.update({ 'customFields.last_sentiment': sentiment });
            const routeEdge = flow.edges.find(
                (e: any) => String(e.source) === String(node.id) && e.sourceHandle === sentiment
            );
            currentNodeId = routeEdge?.target || resolveDefaultNextEdge(flow.edges, node.id)?.target || null;
            continue;
        }

        if (node.type === 'humanHandoffNode') {
            console.log(`[ChatbotEngine] Human Handoff initiated`);
            const handoffState = () => ({
                active: true,
                activatedAt: admin.firestore.FieldValue.serverTimestamp(),
                activatedBy: null,
                activatedByName: null,
            });
            await box.ref.update({
                isHandledByHuman: true,
                botActive: false,
                assignedTo: null,
                assignedToUid: null,
                humanTakeover: handoffState(),
                'botState.status': 'completed',
                'botState.waitingForInput': false
            });
            const currentPlacementGroupId = getPlacementGroupId();
            if (currentPlacementGroupId && cardId) {
                await db.doc(`${entityPath}/kanban-groups/${currentPlacementGroupId}/cards/${cardId}`).set({
                    conversationId,
                    assignedTo: null,
                    assignedToUid: null,
                    isHandledByHuman: true,
                    botActive: false,
                    humanTakeover: handoffState(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            }
            const handoffMsg = "Te estoy transfiriendo con un agente humano. Por favor, espera un momento.";
            await dispatchMessage(handoffMsg);
            await appendAgentMessage({
                text: handoffMsg,
                type: 'text',
                messageId: `bot_handoff_${Date.now()}`
            });
            return;
        }

        if (node.type === 'endNode') {
            const endData = node.data || {};
            console.log(`[ChatbotEngine] End Node reached. Outcome: ${endData.outcome || 'neutral'}`);

            if (endData.clearVariables) {
                const varsToClear = endData.clearVariables.split(',').map((v: string) => v.trim()).filter((v: string) => v !== '');
                if (varsToClear.length > 0) {
                    const updateObj: any = {};
                    varsToClear.forEach((v: string) => {
                        updateObj[`customFields.${v}`] = admin.firestore.FieldValue.delete();
                    });
                    await box.ref.update(updateObj);
                }
            }

            const botOutcome = {
                outcome: endData.outcome || 'neutral',
                label: endData.outcomeLabel || (endData.outcome === 'success' ? 'Éxito' : 'Cierre'),
                finishedAt: new Date()
            };
            await box.ref.update({ 
                botOutcome,
                'botState.status': 'completed', 
                'botState.waitingForInput': false 
            });
            return;
        }

        // DEFAULT: Just follow the edge if node is unhandled
        console.log(`[ChatbotEngine] ⏩ Skipping logic/unknown node type: ${node.type}`);
        const edge = resolveDefaultNextEdge(flow.edges, node.id);
        currentNodeId = edge ? edge.target : null;
        if (!edge) break;
    }

    try {
        const { ensureCardKanbanPlacement } = await import('@/lib/kanban/kanbanBotSyncAdmin');
        await ensureCardKanbanPlacement({
            db,
            tenantPath: entityPath,
            cardId,
            botId: botData.id,
            preferredGroupId: currentKanbanGroupId,
        });
    } catch (err: any) {
        console.warn(`[ChatbotEngine] Final kanban placement failed: ${err?.message || err}`);
    }
}
