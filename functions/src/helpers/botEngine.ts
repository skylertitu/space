import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import axios from 'axios';
import { getMessagingAdapter } from './platforms/factory';
import {
    resolveDefaultNextEdge,
    resolveListMessageEdge,
    resolveQuickReplyEdge,
    sanitizeFlowButtons,
} from './flowRouting';
import { buildBotNodeGroupMap, syncCardToBotNodeAdmin } from './kanbanBotSync';

// Delay helper
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// --- LOCK SYSTEM: Prevents duplicate processing when user sends multiple messages quickly ---
const LOCK_TIMEOUT_MS = 30000; // 30 seconds max lock duration

async function logBotTrace(
    userId: string, 
    entityId: string, 
    data: { 
        step: string, 
        status: 'info' | 'error' | 'success', 
        details?: string, 
        platform?: string, 
        externalId?: string 
    }
) {
    try {
        const db = admin.firestore();
        await db.collection(`users/${userId}/entities/${entityId}/system_logs`).add({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            type: 'bot_trace',
            ...data
        });
    } catch (e) {
        functions.logger.warn(`[logBotTrace] Failed to write trace: ${e}`);
    }
}

async function acquireBotLock(cardRef: FirebaseFirestore.DocumentReference): Promise<boolean> {
    const db = admin.firestore();
    try {
        return await db.runTransaction(async (tx) => {
            const snap = await tx.get(cardRef);
            if (!snap.exists) return false;
            const data = snap.data();
            const existingLock = data?.botLock;
            const now = Date.now();
            // If there's an active lock that hasn't expired, another instance is processing
            // AGNOSTIC FIX: Support both legacy number locks and serverTimestamp locks
            const lockMillis = typeof existingLock === 'number' ? existingLock : (existingLock?.toMillis?.() || existingLock?.seconds * 1000 || 0);
            
            // PRIORITY OVERRIDE: Commands like 'reset' should NOT be blocked by concurrency locks
            // This is passed via a global context or we checked it before calling acquireBotLock
            if (existingLock && (now - lockMillis) < LOCK_TIMEOUT_MS) {
                functions.logger.warn(`[BotLock] Lock active for ${cardRef.id}, skipping (age: ${now - lockMillis}ms)`);
                return false;
            }
            tx.update(cardRef, { botLock: now });
            return true;
        });
    } catch (err: any) {
        functions.logger.error(`[BotLock] Failed to acquire lock: ${err.message}`);
        return false;
    }
}

async function releaseBotLock(cardRef: FirebaseFirestore.DocumentReference): Promise<void> {
    try {
        await cardRef.update({ botLock: admin.firestore.FieldValue.delete() });
    } catch (err: any) {
        functions.logger.warn(`[BotLock] Failed to release lock: ${err.message}`);
    }
}

// --- Search by platform_ids (Simple Approach) ---
export async function resolveCardRef(
    userId: string,
    entityId: string,
    contactNumber: string,
    platform: string = 'whatsapp'
): Promise<FirebaseFirestore.DocumentReference | null> {
    const db = admin.firestore();
    const vaultPath = `users/${userId}/entities/${entityId}/kanban-groups`;

    // Strategy A: By platform_ids.{platform}
    try {
        const snap = await db.collectionGroup('cards')
            .where(`platform_ids.${platform}`, '==', contactNumber)
            .get();
        const tenantDoc = snap.docs.find(d => d.ref.path.startsWith(vaultPath + '/'));
        if (tenantDoc) {
            functions.logger.info(`[resolveCardRef] ✅ Found via exact platform_id: ${tenantDoc.ref.path}`);
            return tenantDoc.ref;
        }

        // Fallback A.1: Try without '+' if it has one, or with '+' if it doesn't (WhatsApp only)
        if (platform === 'whatsapp') {
            const altNumber = contactNumber.startsWith('+') ? contactNumber.slice(1) : '+' + contactNumber;
            const altSnap = await db.collectionGroup('cards')
                .where(`platform_ids.${platform}`, '==', altNumber)
                .get();
            const altDoc = altSnap.docs.find(d => d.ref.path.startsWith(vaultPath + '/'));
            if (altDoc) {
                functions.logger.info(`[resolveCardRef] ✅ Found via alt platform_id (${altNumber}): ${altDoc.ref.path}`);
                return altDoc.ref;
            }
        }
    } catch (e: any) {
        functions.logger.warn(`[resolveCardRef] ⚠️ Strategy A failed: ${e.message}`);
    }

    // Strategy B: Legacy contactNumber match (WhatsApp only)
    if (platform === 'whatsapp') {
        try {
            const cleanNumber = contactNumber.replace(/\+/g, '');
            const snap = await db.collectionGroup('cards')
                .where('contactNumber', '==', contactNumber)
                .get();
            const tenantDoc = snap.docs.find(d => d.ref.path.startsWith(vaultPath + '/'));
            if (tenantDoc) return tenantDoc.ref;

            const snap2 = await db.collectionGroup('cards')
                .where('contactNumber', '==', cleanNumber)
                .get();
            const tenantDoc2 = snap2.docs.find(d => d.ref.path.startsWith(vaultPath + '/'));
            if (tenantDoc2) return tenantDoc2.ref;
        } catch (e) { }
    }

    // Strategy C: ⚡ DIRECT SCAN
    try {
        functions.logger.info(`[resolveCardRef] 🔍 Strategy C: Scanning groups for platform_ids.${platform}...`);
        const groupsSnap = await db.collection(vaultPath).get();
        for (const groupDoc of groupsSnap.docs) {
            const cardsRef = groupDoc.ref.collection('cards');
            const snap = await cardsRef.where(`platform_ids.${platform}`, '==', contactNumber).limit(1).get();
            if (!snap.empty) {
                functions.logger.info(`[resolveCardRef] ✅ Strategy C SUCCESS: Found in group ${groupDoc.id}`);
                return snap.docs[0].ref;
            }
            
            if (platform === 'whatsapp') {
                const altNumber = contactNumber.startsWith('+') ? contactNumber.slice(1) : '+' + contactNumber;
                const altSnap = await cardsRef.where(`platform_ids.${platform}`, '==', altNumber).limit(1).get();
                if (!altSnap.empty) {
                    functions.logger.info(`[resolveCardRef] ✅ Strategy C SUCCESS (AltNumber): Found in group ${groupDoc.id}`);
                    return altSnap.docs[0].ref;
                }
            }
        }
    } catch (e: any) {
        functions.logger.error(`[resolveCardRef] ❌ ALL strategies failed for ${platform}:${contactNumber}: ${e.message}`);
    }
    
    functions.logger.warn(`[resolveCardRef] ❌ Could NOT resolve card for ${platform}:${contactNumber}`);
    return null;
}

export async function getActiveBot(userId: string, entityId: string, platform?: string): Promise<any | null> {
    const db = admin.firestore();
    const botsRef = db.collection(`users/${userId}/entities/${entityId}/chatbots`);
    
    let allBots: any[] = [];
    
    try {
        // Preferred: Index-based query
        const botsSnapshot = await botsRef
            .where('isActive', 'in', [true, 'true'])
            .get();
        allBots = botsSnapshot.docs.map(d => ({ id: d.id, ...d.data() as any }));
    } catch (e: any) {
        functions.logger.warn(`[getActiveBot] ⚠️ Index-based query failed, falling back to in-memory filter: ${e.message}`);
        try {
            // Fallback: Read all and filter in memory (Rule 4 isolation preserved)
            const snap = await botsRef.get();
            allBots = snap.docs
                .map(d => ({ id: d.id, ...d.data() as any }))
                .filter(b => b.isActive === true || b.isActive === 'true');
        } catch (innerE: any) {
            functions.logger.error(`[getActiveBot] ❌ Critical failure reading bots: ${innerE.message}`);
            return null;
        }
    }

    if (allBots.length === 0) return null;

    // Filter by platform: Bot must either have no specific platforms (Global) 
    // or include the current message platform (Case-Insensitive Robustness).
    const platformBots = platform 
        ? allBots.filter(bot => {
            const targets = (bot.targetPlatforms || []).map((t: string) => t.toLowerCase());
            return targets.length === 0 || targets.includes(platform.toLowerCase());
          })
        : allBots;

    if (platformBots.length === 0) return null;

    // Sort in memory to avoid mandatory composite index
    platformBots.sort((a, b) => {
        const timeA = a.updatedAt?.toDate?.()?.getTime() || a.createdAt?.toDate?.()?.getTime() || 0;
        const timeB = b.updatedAt?.toDate?.()?.getTime() || b.createdAt?.toDate?.()?.getTime() || 0;
        return timeB - timeA;
    });

    const botData = platformBots[0];
    if (!botData.flow || !botData.flow.nodes || !botData.flow.edges) {
        functions.logger.warn(`[getActiveBot] Bot ${botData.id} for entity ${entityId} has no flow. Skipping.`);
        return null;
    }
    return botData;
}

function replaceVariables(text: string, cardData: any): string {
    if (!text) return '';
    let processedText = text;
    const variables = {
        name: cardData.contactName || 'estimado/a cliente',
        nombre: cardData.contactName || 'estimado/a cliente',
        phone: cardData.contactNumber || '',
        ...(cardData.customFields || {})
    };
    for (const [key, value] of Object.entries(variables)) {
        // Matches {key}, {{key}}, etc.
        const regex = new RegExp(`\\{+\\s*${key}\\s*\\}+`, 'gi');
        processedText = processedText.replace(regex, String(value || ''));
    }
    return processedText;
}

// Calcula el tiempo de "escritura humana" en MS
function calculateTypingDelay(text: string): number {
    const charsPerSecond = 50; // Faster typing speed (was 25)
    const baseDelay = 100;    // Minimize base latency (was 1000)
    let typingTime = (text.length / charsPerSecond) * 1000;

    if (typingTime < 500) typingTime = 500;   // Min 0.5s (was 1.5s)
    if (typingTime > 2000) typingTime = 2000; // Max 2s (was 6s)

    return baseDelay + typingTime;
}

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

function sanitizeListData(data: any): any[] {
    const cleanSections: any[] = [];
    if (Array.isArray(data.sections) && data.sections.length > 0) {
        for (const sec of data.sections) {
            const rows = sec.rows || [];
            const options = sec.options || [];
            const validRows: any[] = [];
            if (Array.isArray(rows)) {
                rows.forEach((r: any) => {
                    if (r && r.title && r.title.trim() !== '') {
                        const cleanRow: any = {
                            id: String(r.id || r.payload || r.title || '').trim(),
                            title: String(r.title).trim()
                        };
                        if (r.description) {
                            cleanRow.description = String(r.description).trim();
                        }
                        validRows.push(cleanRow);
                    }
                });
            }
            if (Array.isArray(options)) {
                options.forEach((opt: any, idx: number) => {
                    if (typeof opt === 'string' && opt.trim() !== '') {
                        validRows.push({ id: `opt_${Date.now()}_${idx}`, title: opt, description: '' });
                    }
                });
            }
            if (validRows.length > 0) cleanSections.push({ title: sec.title || 'Opciones', rows: validRows });
        }
    }
    if (cleanSections.length === 0 && Array.isArray(data.options)) {
        const validRows = data.options.filter((opt: any) => typeof opt === 'string' && opt.trim() !== '')
            .map((opt: string, idx: number) => ({ id: `legacy_${idx}`, title: opt, description: '' }));
        if (validRows.length > 0) cleanSections.push({ title: 'Opciones', rows: validRows });
    }
    return cleanSections;
}

function sanitizeButtonsData(buttons: any[]): any[] {
    if (!Array.isArray(buttons)) return [];
    return buttons.filter(b => b && b.title && b.title !== 'undefined' && b.title.trim() !== '');
}

/**
 * Unified Bot Trigger Logic
 * Handles checking for active bots, session lifecycle, and command overrides.
 */
export async function tryTriggerBot(
    userId: string,
    entityId: string,
    platform: string,
    externalId: string,
    messageText: string,
    messageId?: string,
    metadata?: any
): Promise<void> {
    functions.logger.info(`[Bot Engine] 📥 Incoming message from ${externalId} on ${platform} for tenant ${userId}/${entityId}`);
    await logBotTrace(userId, entityId, { 
        step: 'incoming_webhook', status: 'info', platform, externalId, 
        details: `Message received: "${messageText.substring(0, 50)}..."` 
    });

    const activeBot = await getActiveBot(userId, entityId, platform);
    if (!activeBot) {
        const msg = `No active bot found for ${platform}`;
        functions.logger.info(`[Bot Engine] 🔇 ${msg} in entity ${entityId}. Skipping execution.`);
        await logBotTrace(userId, entityId, { step: 'bot_lookup', status: 'info', platform, externalId, details: msg });
        return;
    }

    functions.logger.info(`[Bot Engine] 🤖 Found active bot: ${activeBot.name} (ID: ${activeBot.id})`);
    await logBotTrace(userId, entityId, { step: 'bot_lookup', status: 'success', platform, externalId, details: `Active bot: ${activeBot.name}` });

    const cardRef = await resolveCardRef(userId, entityId, externalId, platform);
    if (!cardRef) {
        const errMsg = `Could not resolve card for ${externalId} on ${platform}`;
        functions.logger.error(`[Bot Engine] ${errMsg} for tenant ${userId}/${entityId}`);
        await logBotTrace(userId, entityId, { step: 'card_resolution', status: 'error', platform, externalId, details: errMsg });
        return;
    }

    functions.logger.info(`[Bot Engine] ✅ Resolved card: ${cardRef.id}`);
    await logBotTrace(userId, entityId, { step: 'card_resolution', status: 'success', platform, externalId, details: `Resolved card path: ${cardRef.path}` });


    const cardSnap = await cardRef.get();
    const cardData = { id: cardRef.id, ...cardSnap.data() } as any;

    if (cardData.humanTakeover?.active === true) {
        functions.logger.info(`[Bot Engine] Human takeover active — skipping bot for ${externalId}`);
        await logBotTrace(userId, entityId, {
            step: 'human_takeover', status: 'info', platform, externalId,
            details: 'Human agent has control; bot execution skipped.',
        });
        return;
    }

    // Next.js queue engine owns bot execution for this card — avoid duplicate WhatsApp replies.
    if (cardData.botState?.engine === 'queue') {
        functions.logger.info(`[Bot Engine] Skipping legacy engine for ${externalId} — queue engine active.`);
        await logBotTrace(userId, entityId, {
            step: 'engine_skip', status: 'info', platform, externalId,
            details: 'Queue engine active on card; legacy botEngine skipped to prevent duplicate prompts.'
        });
        return;
    }

    if (messageId && cardData.botState?.lastProcessedMessageId === messageId) {
        functions.logger.info(`[Bot Engine] Skipping duplicate message ${messageId} for ${externalId}`);
        return;
    }

    const now = new Date();
    const FORTY_EIGHT_HOURS_IN_MS = 48 * 60 * 60 * 1000;
    const ONE_HOUR_IN_MS = 60 * 60 * 1000;

    const input = (messageText || '').trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // Command categories (Refined: Removed common greetings from Menu)
    const isReset = /^(reinici[ao]r?|reinici|reinci(ar)?|restart|reset|clear|limpiar|borrar)/i.test(input);
    const isMenu = /^(menu|opciones|ayuda|ajustes|config|settings|inicio|start)/i.test(input);
    const isStop = /^(detener|stop|salir|chau|adios|exit)/i.test(input);
    
    // Combined command flag
    const isCommand = isReset || isMenu || isStop;

    // BILINGUAL STATUS RESOLUTION: Read both new and legacy state
    const botStatus = cardData.botState?.status || cardData.chatbotState?.status || 'none';
    const lastInteraction = cardData.botState?.lastInteraction || cardData.chatbotState?.lastInteraction;
    let shouldTrigger = false;

    if (isCommand) {
        // Command always triggers
        shouldTrigger = true;
    } else if (botStatus === 'completed') {
        // If 'completed', allow a restart after 1 hour of inactivity (no permanent block)
        if (lastInteraction) {
            const lastInt = lastInteraction.toDate ? lastInteraction.toDate() : new Date(0);
            if ((now.getTime() - lastInt.getTime()) > ONE_HOUR_IN_MS) {
                functions.logger.info(`[Bot Engine] Completed bot restarting after inactivity for ${externalId}`);
                shouldTrigger = true;
            }
        }
    } else if (botStatus === 'none' || botStatus === 'active') {
        shouldTrigger = true;
    } else if (lastInteraction) {
        const lastInt = lastInteraction.toDate ? lastInteraction.toDate() : new Date(0);
        if ((now.getTime() - lastInt.getTime()) > FORTY_EIGHT_HOURS_IN_MS) {
            shouldTrigger = true;
        }
    }

    if (shouldTrigger) {
        // Reset state if it's starting a fresh session
        if (botStatus === 'none' && (cardData.botState || cardData.chatbotState)) {
            await cardRef.update({
                botState: admin.firestore.FieldValue.delete(),
                chatbotState: admin.firestore.FieldValue.delete()
            });
            delete cardData.botState;
            delete cardData.chatbotState;
        }

    try {
        await executeBotFlow(activeBot, userId, entityId, externalId, cardData, messageText, messageId, metadata);
        await logBotTrace(userId, entityId, { step: 'execution_start', status: 'success', platform, externalId });
    } catch (e: any) {
        functions.logger.error(`[tryTriggerBot] ❌ CRITICAL Error in executeBotFlow for ${externalId}: ${e.message}`, { stack: e.stack });
        await logBotTrace(userId, entityId, { step: 'execution_start', status: 'error', platform, externalId, details: e.message });
    }
    }
}



// --- MAIN ENGINE ---

// --- MAIN ENGINE ---

export async function executeBotFlow(
    bot: any,
    userId: string,
    entityId: string,
    to: string,
    cardData: any,
    rawUserMessage: string,
    messageId?: string,
    metadata?: { mediaUrl?: string, type?: string, button_id?: string, list_id?: string }
): Promise<void> {
    functions.logger.info(`>>> EXECUTING FLOW: ${bot.name} for ${to} (Tenant: ${userId}/${entityId}) <<<`);

    let currentMsg = rawUserMessage || '';
    if (metadata?.button_id || metadata?.list_id) {
        currentMsg = metadata.button_id || metadata.list_id || '';
        functions.logger.info(`[executeBotFlow] Override currentMsg with interactive reply ID: "${currentMsg}"`);
    }

    const platform = cardData.source || 'whatsapp'; // Default to whatsapp if not set
    const adapter = getMessagingAdapter(platform, userId, entityId);

    if (!adapter) {
        functions.logger.error(`[executeBotFlow] ❌ FAILED to initialize adapter for platform: ${platform}`);
        return;
    }
    
    functions.logger.info(`[executeBotFlow] 📡 Messaging adapter initialized for ${platform}`);

    // Resolve cardRef once and reuse it throughout the entire flow
    const cardRef = await resolveCardRef(userId, entityId, to, platform);
    if (!cardRef) {
        functions.logger.warn(`[executeBotFlow] Could not resolve cardRef for ${to}`);
        return;
    }

    const tenantPath = `users/${userId}/entities/${entityId}`;
    let nodeGroupMap: Map<string, string> | undefined;
    try {
        nodeGroupMap = await buildBotNodeGroupMap(admin.firestore(), tenantPath, bot.id);
    } catch (err: any) {
        functions.logger.warn(`[KanbanSync] Could not load node group map: ${err?.message || err}`);
    }
    const kanbanContext: KanbanSyncContext = {
        botId: bot.id,
        nodeGroupMap,
        currentGroupId: cardData.groupId,
    };

    let lockAcquired = false;

    // Wrap everything in try/finally to ALWAYS release the lock
    try {
        // Acquire lock to prevent duplicate processing
        // COMMAND OVERRIDE: Reset/Menu commands don't wait for locks
        const normInputForLock = (rawUserMessage || '').trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const isPriorityCommand = /^(reinici[ao]r?|reinici|reinci(ar)?|restart|reset|clear|limpiar|menu|opciones|ayuda|help|inicio|start)/i.test(normInputForLock);

        if (!isPriorityCommand) {
            lockAcquired = await acquireBotLock(cardRef);
            if (!lockAcquired) {
                functions.logger.info(`[executeBotFlow] ⏳ Skipping duplicate execution for ${to} — lock active`);
                return;
            }
        } else {
            functions.logger.info(`[executeBotFlow] ⚡ Priority command detected, bypassing lock for ${to}`);
        }

        // --- RESTART / MENU COMMAND ---
        const normInput = (rawUserMessage || '').trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        // Regex expanded to catch typos like 'reinciar', 'reiniciar', 'restart'
        const isReset = /^(reinici[ao]r?|reinici|reinci(ar)?|restart|reset|clear|limpiar|borrar)/i.test(normInput);
        const isMenu = /^(menu|opciones|ayuda|ajustes|config|settings)/i.test(normInput);

        let botState = cardData.botState || cardData.chatbotState || { status: 'none' };

        // --- ABSOLUTE RESTART / MENU TRIGGER ---
        if (isReset || isMenu) {
            functions.logger.info(`[Bot Engine] Priority Trigger: ${isReset ? 'RESET' : 'MENU'}`);
            
            const wipePayload: any = {
                'botState.status': 'active',
                'botState.currentNodeId': null,
                'botState.waitingForInput': false,
                'botState.lastInteraction': admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            if (isReset) {
                wipePayload.botOutcome = admin.firestore.FieldValue.delete();
                wipePayload.lastError = admin.firestore.FieldValue.delete();
                wipePayload.chatbotState = admin.firestore.FieldValue.delete();
            }

            await cardRef.update(wipePayload);

            const confirmText = isReset ? "🔄 Reinicio completado, empezamos de nuevo." : "📋 Iniciando sistema...";
            await adapter.sendMessage(to, confirmText);
            await logBotMessage(to, confirmText, cardData.id, cardData.groupId, cardRef, 'text', undefined, userId, entityId, platform);
            
            // Local state sync 
            botState = { status: 'active', currentNodeId: null, waitingForInput: false };

            // If it's a reset, we stop here and wait for the user to send a new message ('hola', etc.) to start the flow
            if (isReset) {
                functions.logger.info(`[Bot Engine] Reset complete for ${to}. Waiting for next message.`);
                return;
            }
        } 
        
        // --- BILINGUAL STATE RESOLUTION / MIGRATION ---
        if (botState.status === undefined && cardData.chatbotState) {
            botState = {
                status: cardData.chatbotState.status || 'active',
                currentNodeId: cardData.chatbotState.currentNodeId,
                lastInteraction: cardData.chatbotState.lastInteraction || admin.firestore.Timestamp.now(),
                retryCount: 0
            };
        }

        let currentNodeId = botState?.currentNodeId;
        let nextNodeId: string | null = null;
        let shouldContinue = true;
        let executionCount = 0;
        const MAX_STEPS = 15;

        // --- PROCESAR INPUT USUARIO ---
        if (currentNodeId) {
            functions.logger.info(`[executeBotFlow] Processing Input for Node: ${currentNodeId}`);
            const currentNode = bot.flow.nodes.find((n: any) => String(n.id) === String(currentNodeId));
            if (!currentNode) {
                functions.logger.warn(`[executeBotFlow] Node ${currentNodeId} not found in flow.`);
                return;
            }

            // --- STUCK-NODE RECOVERY: Resend current node message if conversation was interrupted ---
            // If the bot was waiting (lastInteraction exists) and the user's message doesn't look like
            // a valid response (e.g., very short/generic), OR if significant time has passed (> 30 min),
            // resend the current node's prompt to guide the user back.
            const lastInteractionAt = cardData.botState?.lastInteraction?.toDate
                ? cardData.botState.lastInteraction.toDate()
                : null;
            const thirtyMinutesMs = 30 * 60 * 1000;
            const wasStuck = lastInteractionAt && (new Date().getTime() - lastInteractionAt.getTime() > thirtyMinutesMs);

            if (wasStuck) {
                functions.logger.info(`[executeBotFlow] Conversation was stuck for >30 min. Resending current node prompt to ${to}.`);
                try {
                    if (currentNode.type === 'quickReplyNode') {
                        const qrText = replaceVariables(currentNode.data?.bodyText || currentNode.data?.text || 'Por favor, elige una opción:', cardData);
                        const buttons = sanitizeButtonsData(currentNode.data?.buttons || []);
                        const header = {
                            type: currentNode.data?.headerType || 'none',
                            text: replaceVariables(currentNode.data?.headerText || '', cardData),
                            url: currentNode.data?.headerMediaUrl
                        };
                        if (buttons.length > 0) {
                            await adapter.sendButtonMessage(to, qrText, buttons, header);
                            await logBotMessage(to, qrText, cardData.id, cardData.groupId, cardRef, 'buttons', { buttons, header });
                        } else {
                            await adapter.sendMessage(to, qrText);
                            await logBotMessage(to, qrText, cardData.id, cardData.groupId, cardRef, 'text');
                        }
                    } else if (currentNode.type === 'listMessageNode') {
                        const listBody = replaceVariables(currentNode.data?.body || currentNode.data?.text || 'Elige una opción:', cardData);
                        const sections = sanitizeListData(currentNode.data);
                        if (sections.length > 0) {
                            const btnText = currentNode.data?.buttonText || 'Ver opciones';
                            await adapter.sendListMessage(to, listBody, btnText, sections);
                            await logBotMessage(to, listBody, cardData.id, cardData.groupId, cardRef, 'list', { buttonText: btnText, sections });
                        } else {
                            await adapter.sendMessage(to, listBody);
                            await logBotMessage(to, listBody, cardData.id, cardData.groupId, cardRef, 'text');
                        }
                    } else if (currentNode.type === 'captureInputNode') {
                        const prompt = replaceVariables(currentNode.data?.content || currentNode.data?.text || '', cardData);
                        if (prompt) {
                            await adapter.sendMessage(to, prompt);
                            await logBotMessage(to, prompt, cardData.id, cardData.groupId, cardRef, 'text');
                        }
                    }
                } catch (resendErr: any) {
                    functions.logger.warn(`[executeBotFlow] Could not resend stuck node: ${resendErr.message}`);
                }
                await delay(1000);
            }

            try {
                if (platform !== 'whatsapp') {
                    await adapter.markAsRead(to).catch(e => functions.logger.warn('markAsRead failed:', e.message));
                } else if (messageId) {
                    // WhatsApp markAsRead REQUIRES the actual WhatsApp message ID
                    await adapter.markAsRead(messageId).catch(e => functions.logger.warn(`[Bot Engine] markAsRead failed for msg ${messageId}:`, e.message));
                } else {
                    functions.logger.debug('[Bot Engine] Skipping markAsRead (No messageId provided)');
                }
            } catch (e) { }

            await delay(500);

            if (currentNode.type === 'captureInputNode') {
                const validation = validateInput(currentMsg, currentNode.data || {}, metadata);
                const maxRetries = currentNode.data?.maxRetries || 3;
                const currentRetries = cardData.botState?.retryCount || 0;

                if (!validation.isValid) {
                    functions.logger.info(`[executeBotFlow] Input validation failed for ${to}. Retry ${currentRetries + 1}/${maxRetries}`);

                    if (currentRetries + 1 >= maxRetries) {
                        functions.logger.info(`[executeBotFlow] Max retries reached for ${to}. Continuing flow.`);
                        // Fallback value for name variables if requested by user
                        const varName = currentNode.data?.variableName || '';
                        const isNameVar = ['nombre', 'name', 'firstname'].includes(varName.toLowerCase());
                        const fallbackValue = isNameVar ? "Skyler" : "No provisto";

                        await saveVariable(to, varName, fallbackValue, cardData.id, cardData.groupId, cardRef);
                        // continue to next node logic below
                    } else {
                        const errorMsg = replaceVariables(validation.errorMessage || "Respuesta inválida.", cardData);
                        await adapter.sendMessage(to, errorMsg);
                        await logBotMessage(to, errorMsg, cardData.id, cardData.groupId, cardRef, 'text');
                        // Update retry count in state
                        await updateBotState(to, {
                            ...cardData.botState,
                            retryCount: currentRetries + 1,
                            lastInteraction: admin.firestore.Timestamp.now()
                        }, cardData.id, cardData.groupId, cardRef, userId, entityId, platform, kanbanContext);
                        return;
                    }
                } else {
                    let valueToSave = currentMsg.trim();
                    const varName = currentNode.data?.variableName || `captured_${currentNode.id}`;

                    const vName = varName.toLowerCase();
                    const isNameVar = vName.includes('name') || vName.includes('nombre') || vName.includes('user') || vName.includes('persona');

                    if (isNameVar) {
                        valueToSave = extractName(valueToSave);
                        functions.logger.info(`[executeBotFlow] Name extracted: "${valueToSave}" from "${currentMsg}"`);
                    }

                    functions.logger.info(`[executeBotFlow] Saving variable ${varName} = ${valueToSave}`);
                    await saveVariable(to, varName, valueToSave, cardData.id, cardData.groupId, cardRef);

                    if (!cardData.customFields) cardData.customFields = {};
                    cardData.customFields[varName] = valueToSave;
                }
            }

            const outgoingEdges = bot.flow.edges.filter((e: any) => String(e.source) === String(currentNodeId));
            let selectedEdge = null;

            if (currentNode.type === 'quickReplyNode') {
                const buttons = sanitizeFlowButtons(currentNode.data?.buttons || []);
                const resolution = resolveQuickReplyEdge(bot.flow.edges, currentNodeId, buttons, currentMsg);

                if (resolution.invalid) {
                    functions.logger.info(`[executeBotFlow] Invalid quick-reply selection for ${to}: "${currentMsg}"`);
                    const errorMsg = 'Por favor, selecciona una de las opciones válidas del menú para continuar.';
                    await adapter.sendMessage(to, errorMsg);
                    await logBotMessage(to, errorMsg, cardData.id, cardData.groupId, cardRef, 'text');
                    return;
                }

                if (resolution.missingEdge) {
                    functions.logger.warn(`[executeBotFlow] No edge matched for quick-reply on node ${currentNodeId}. Trying default exit.`);
                    selectedEdge = resolveDefaultNextEdge(bot.flow.edges, currentNodeId);
                    if (!selectedEdge) {
                        const errorMsg = 'Por favor, selecciona una de las opciones del mensaje anterior para continuar.';
                        await adapter.sendMessage(to, errorMsg);
                        await logBotMessage(to, errorMsg, cardData.id, cardData.groupId, cardRef, 'text');
                        return;
                    }
                } else {
                    selectedEdge = resolution.edge;
                }
            } else if (currentNode.type === 'listMessageNode') {
                const sections = sanitizeListData(currentNode.data);
                const resolution = resolveListMessageEdge(bot.flow.edges, currentNodeId, sections, currentMsg);

                if (resolution.invalid) {
                    functions.logger.info(`[executeBotFlow] Invalid list selection for ${to}: "${currentMsg}"`);
                    const errorMsg = 'Por favor, selecciona una de las opciones válidas del menú para continuar.';
                    await adapter.sendMessage(to, errorMsg);
                    await logBotMessage(to, errorMsg, cardData.id, cardData.groupId, cardRef, 'text');
                    return;
                }

                if (resolution.missingEdge) {
                    functions.logger.warn(`[executeBotFlow] No edge matched for list on node ${currentNodeId}. Trying default exit.`);
                    selectedEdge = resolveDefaultNextEdge(bot.flow.edges, currentNodeId);
                    if (!selectedEdge) {
                        const errorMsg = 'Por favor, selecciona una de las opciones del menú para continuar.';
                        await adapter.sendMessage(to, errorMsg);
                        await logBotMessage(to, errorMsg, cardData.id, cardData.groupId, cardRef, 'text');
                        return;
                    }
                } else {
                    selectedEdge = resolution.edge;
                }
            } else {
                selectedEdge = resolveDefaultNextEdge(bot.flow.edges, currentNodeId);
            }

            if (outgoingEdges.length > 0) {
                if (selectedEdge) nextNodeId = selectedEdge.target;

            } else {
                await updateBotState(to, { status: 'completed', currentNodeId: null }, cardData.id, cardData.groupId, cardRef, userId, entityId, platform, kanbanContext);
                return;
            }
        } else {
            const startNode = bot.flow.nodes.find((n: any) => n.type === 'start' || n.type === 'startNode');
            if (!startNode) {
                functions.logger.warn(`[executeBotFlow] Start Node NOT found for bot ${bot.id}`);
                return;
            }
            const firstEdge = resolveDefaultNextEdge(bot.flow.edges, startNode.id);
            if (firstEdge) nextNodeId = firstEdge.target;
            else {
                functions.logger.warn(`[executeBotFlow] Start Node ${startNode.id} has no outgoing edges.`);
                return;
            }
        }

        // --- IMPORTANT: CONSUME MESSAGE ---
        // Once the initial input has been processed (or the flow started),
        // clear currentMsg so that subsequent captureInputNodes in the same 
        // execution execution don't reuse the trigger message (e.g., 'hola') as an answer.
        currentMsg = "";

        // --- EJECUCIÓN DE NODOS ---
        while (shouldContinue && nextNodeId && executionCount < MAX_STEPS) {
            executionCount++;
            const nextNode = bot.flow.nodes.find((n: any) => String(n.id) === String(nextNodeId));
            if (!nextNode) { shouldContinue = false; break; }

            if (nextNode.type === 'endNode') {
                const endData = nextNode.data || {};
                functions.logger.info(`[executeBotFlow] End Node reached for ${to}. Outcome: ${endData.outcome || 'neutral'}`);

                // 1. Process Garbage Collection (Clear Variables)
                if (endData.clearVariables) {
                    const varsToClear = endData.clearVariables.split(',').map((v: string) => v.trim()).filter((v: string) => v !== '');
                    if (varsToClear.length > 0) {
                        const updateObj: any = {};
                        varsToClear.forEach((v: string) => {
                            updateObj[`customFields.${v}`] = admin.firestore.FieldValue.delete();
                        });
                        await cardRef.update(updateObj);
                    }
                }

                // 2. Save Outcome for CRM/Analytics
                const botOutcome = {
                    outcome: endData.outcome || 'neutral',
                    label: endData.outcomeLabel || (endData.outcome === 'success' ? 'Éxito' : 'Cierre'),
                    finishedAt: new Date()
                };
                await cardRef.update({ botOutcome });

                await updateBotState(to, { status: 'completed', currentNodeId: nextNodeId, lastInteraction: new Date() }, cardData.id, cardData.groupId, cardRef, userId, entityId, platform, kanbanContext);
                shouldContinue = false;
                break;
            }
            await updateBotState(to, { status: 'active', currentNodeId: nextNodeId, lastInteraction: new Date() }, cardData.id, cardData.groupId, cardRef, userId, entityId, platform, kanbanContext);

            // Simulación Humana (Typing Delay) - CONTROLADO POR UI
            if (['textMessageNode', 'mediaMessageNode', 'quickReplyNode', 'listMessageNode'].includes(nextNode.type)) {
                // Por defecto es TRUE (Humano) a menos que se desactive explícitamente en el editor
                const simulateTyping = nextNode.data?.typingSimulation !== false;

                if (simulateTyping) {
                    const content = nextNode.data?.content || nextNode.data?.text || nextNode.data?.caption || '';
                    const humanDelay = calculateTypingDelay(content);
                    await delay(humanDelay);
                }
            }

            switch (nextNode.type) {
                case 'textMessageNode':
                    const txt = replaceVariables(nextNode.data.content || nextNode.data.text || nextNode.data.label || '', cardData);
                    if (txt) {
                        const options = { preview_url: nextNode.data.previewUrl !== false };
                        await adapter.sendMessage(to, txt, options);
                        await logBotMessage(to, txt, cardData.id, cardData.groupId, cardRef, 'text');
                    }
                    nextNodeId = getNextNodeId(bot, nextNodeId);
                    break;

                case 'captureInputNode':
                    functions.logger.info(`[Bot Engine] Reached CaptureInputNode ${nextNodeId}. Sending prompt and waiting for user input.`);

                    // Enviar el prompt y esperar
                    const prompt = replaceVariables(nextNode.data?.content || nextNode.data?.text || '', cardData);
                    if (prompt) {
                        await delay(calculateTypingDelay(prompt));
                        await adapter.sendMessage(to, prompt);
                        await logBotMessage(to, prompt, cardData.id, cardData.groupId, cardRef, 'text');
                    }

                    // Suspender ejecución y esperar nueva entrada
                    await updateBotState(to, {
                        status: 'active',
                        currentNodeId: nextNodeId,
                        retryCount: 0,
                        lastInteraction: admin.firestore.Timestamp.now()
                    }, cardData.id, cardData.groupId, cardRef, userId, entityId, platform, kanbanContext);
                    shouldContinue = false;
                    break;

                case 'mediaMessageNode':
                    const mediaUrl = replaceVariables(nextNode.data.url || '', cardData);
                    const caption = replaceVariables(nextNode.data.caption || '', cardData);
                    const mediaType = nextNode.data.type || nextNode.data.mediaType || 'image';

                    if (mediaUrl) {
                        functions.logger.info(`[Bot Engine] Sending Media (${mediaType}) to ${to}: ${mediaUrl}`);
                        await adapter.sendMediaMessage(to, mediaUrl, caption, mediaType);
                        await logBotMessage(to, caption, cardData.id, cardData.groupId, cardRef, 'media', { url: mediaUrl, filename: nextNode.data.filename, type: mediaType });
                        
                        // Buffer delay to allow platform to process media before next message
                        await delay(1500);
                    }
                    nextNodeId = getNextNodeId(bot, nextNodeId);
                    break;

                case 'quickReplyNode':
                    const qrText = replaceVariables(nextNode.data.text || nextNode.data.bodyText || 'Selecciona:', cardData);
                    const buttons = sanitizeButtonsData(nextNode.data.buttons || []);
                    const header = {
                        type: nextNode.data?.headerType || 'none',
                        text: replaceVariables(nextNode.data?.headerText || '', cardData),
                        url: nextNode.data?.headerMediaUrl
                    };
                    if (buttons.length > 0) {
                        await adapter.sendButtonMessage(to, qrText, buttons, header);
                        await logBotMessage(to, qrText, cardData.id, cardData.groupId, cardRef, 'buttons', { buttons, header });

                        // Save state so we know where to resume
                        await updateBotState(to, {
                            status: 'active',
                            currentNodeId: nextNodeId,
                            lastInteraction: admin.firestore.Timestamp.now()
                        }, cardData.id, cardData.groupId, cardRef, userId, entityId, platform, kanbanContext);

                        shouldContinue = false;
                    } else {
                        await adapter.sendMessage(to, qrText);
                        await logBotMessage(to, qrText, cardData.id, cardData.groupId, cardRef, 'text');
                        nextNodeId = getNextNodeId(bot, nextNodeId);
                    }
                    break;

                case 'listMessageNode':
                    const listBody = replaceVariables(nextNode.data.body || nextNode.data.text || 'Selecciona:', cardData);
                    const btnLabel = nextNode.data.buttonText || "Opciones";
                    const cleanSections = sanitizeListData(nextNode.data);
                    if (cleanSections.length > 0) {
                        await adapter.sendListMessage(to, listBody, btnLabel, cleanSections);
                        await logBotMessage(to, listBody, cardData.id, cardData.groupId, cardRef, 'list', { buttonText: btnLabel, sections: cleanSections });

                        // Save state so we know where to resume
                        await updateBotState(to, {
                            status: 'active',
                            currentNodeId: nextNodeId,
                            lastInteraction: admin.firestore.Timestamp.now()
                        }, cardData.id, cardData.groupId, cardRef, userId, entityId, platform, kanbanContext);

                        shouldContinue = false;
                    } else {
                        await adapter.sendMessage(to, listBody);
                        await logBotMessage(to, listBody, cardData.id, cardData.groupId, cardRef, 'text');
                        
                        // FIX: Even if there are no sections configured (user typed options as plain text),
                        // we must STILL wait for their reply before continuing.
                        await updateBotState(to, {
                            status: 'active',
                            currentNodeId: nextNodeId,
                            lastInteraction: admin.firestore.Timestamp.now()
                        }, cardData.id, cardData.groupId, cardRef, userId, entityId, platform, kanbanContext);

                        shouldContinue = false;
                    }
                    break;

                case 'locationNode':
                    if (nextNode.data.latitude) {
                        await adapter.sendLocationMessage(to, parseFloat(nextNode.data.latitude), parseFloat(nextNode.data.longitude), nextNode.data.name, nextNode.data.address);
                    }
                    nextNodeId = getNextNodeId(bot, nextNodeId);
                    break;

                case 'delayNode':
                    const delayData = nextNode.data || {};
                    let delayMs = 2000;

                    if (delayData.mode === 'random') {
                        const min = parseFloat(delayData.minSeconds || 1);
                        const max = parseFloat(delayData.maxSeconds || 3);
                        delayMs = (Math.random() * (max - min) + min) * 1000;
                        functions.logger.info(`[Bot Engine] Random delay for ${to}: ${delayMs.toFixed(0)}ms (Range: ${min}-${max}s)`);
                    } else {
                        const seconds = parseFloat(delayData.durationSeconds || delayData.duration || 2);
                        delayMs = seconds * 1000;
                    }

                    await delay(delayMs);
                    nextNodeId = getNextNodeId(bot, nextNodeId);
                    break;

                case 'conditionNode':
                    const conditionData = nextNode.data || {};
                    const routes = conditionData.routes || [];
                    let matchedRouteId: string | null = null;

                    for (const route of routes) {
                        const matchType = route.matchType || 'AND';
                        const routeConditions = route.conditions || [];

                        if (routeConditions.length === 0) continue;

                        let routeMatches = matchType === 'AND'; // Start true for AND, false for OR

                        for (const cond of routeConditions) {
                            // Resolve variable value from cardData
                            const varName = (cond.variable || '').replace(/[\{\}]/g, '').trim();
                            const varValue = cardData.customFields?.[varName] || cardData[varName];

                            const isMatch = evaluateCondition(varValue, cond.operator, cond.value, conditionData.fuzzyMatch !== false);

                            if (matchType === 'AND') {
                                routeMatches = routeMatches && isMatch;
                                if (!routeMatches) break; // Optimization: fail fast for AND
                            } else {
                                routeMatches = routeMatches || isMatch;
                                if (routeMatches) break; // Optimization: succeed fast for OR
                            }
                        }

                        if (routeMatches) {
                            matchedRouteId = route.id;
                            break;
                        }
                    }

                    if (matchedRouteId) {
                        const matchedEdge = bot.flow.edges.find((e: any) => String(e.source) === String(nextNodeId) && String(e.sourceHandle) === String(matchedRouteId));
                        if (matchedEdge) nextNodeId = matchedEdge.target;
                        else nextNodeId = getNextNodeId(bot, nextNodeId);
                    } else {
                        // Fallback to "else" handle
                        const elseEdge = bot.flow.edges.find((e: any) => String(e.source) === String(nextNodeId) && e.sourceHandle === 'else');
                        if (elseEdge) nextNodeId = elseEdge.target;
                        else nextNodeId = getNextNodeId(bot, nextNodeId);
                    }
                    break;

                case 'setVariableNode': {
                    const setVarData = nextNode.data || {};
                    const varToSet = (setVarData.variableName || '').replace(/[\{\}]/g, '').trim();
                    const opCat = setVarData.operationCategory || 'set';
                    const op = setVarData.operation || 'set';
                    let valueToUse = replaceVariables(setVarData.value || '', cardData);

                    if (varToSet) {
                        let currentVal = cardData.customFields?.[varToSet] ?? cardData[varToSet] ?? '';
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

                        // Save to Firestore
                        await cardRef.update({
                            [`customFields.${varToSet}`]: newVal,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });

                        // Update local cardData for immediate reuse in same flow
                        if (!cardData.customFields) cardData.customFields = {};
                        cardData.customFields[varToSet] = newVal;
                    }
                    nextNodeId = getNextNodeId(bot, nextNodeId);
                    break;
                }

                case 'webhookNode': {
                    const webhookData = nextNode.data || {};
                    const url = replaceVariables(webhookData.url || '', cardData);
                    const method = (webhookData.method || 'POST').toUpperCase();
                    const saveTo = (webhookData.saveResponseTo || '').replace(/[\{\}]/g, '').trim();

                    if (url) {
                        try {
                            functions.logger.info(`[Bot] Executing Webhook: ${method} ${url}`);
                            const response = await axios({
                                method,
                                url,
                                timeout: 10000,
                            });

                            if (saveTo) {
                                await cardRef.update({
                                    [`customFields.${saveTo}`]: response.data,
                                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                                });
                                if (!cardData.customFields) cardData.customFields = {};
                                cardData.customFields[saveTo] = response.data;
                            }

                            const successEdge = bot.flow.edges.find((e: any) => String(e.source) === String(nextNodeId) && e.sourceHandle === 'success');
                            if (successEdge) nextNodeId = successEdge.target;
                            else nextNodeId = getNextNodeId(bot, nextNodeId);

                        } catch (error: any) {
                            functions.logger.error(`[Bot] Webhook Error:`, error.message);
                            const failureEdge = bot.flow.edges.find((e: any) => String(e.source) === String(nextNodeId) && e.sourceHandle === 'failure');
                            if (failureEdge) nextNodeId = failureEdge.target;
                            else nextNodeId = getNextNodeId(bot, nextNodeId);
                        }
                    } else {
                        nextNodeId = getNextNodeId(bot, nextNodeId);
                    }
                    break;
                }

                case 'generativeAINode': {
                    const aiData = nextNode.data || {};
                    const systemPrompt = replaceVariables(aiData.systemPrompt || 'Eres un asistente útil.', cardData);
                    const userMsg = cardData.lastMessage || '';
                    const model = aiData.model || 'gpt-4o';
                    const temperature = aiData.temperature ?? 0.7;
                    const outputVar = (aiData.outputVariable || '').replace(/[\{\}]/g, '').trim();
                    const apiKey = functions.config().openai?.key;

                    if (apiKey) {
                        try {
                            functions.logger.info(`[Bot] Calling AI Model: ${model}`);
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
                                await cardRef.update({
                                    [`customFields.${outputVar}`]: aiText,
                                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                                });
                                if (!cardData.customFields) cardData.customFields = {};
                                cardData.customFields[outputVar] = aiText;
                            } else {
                                await adapter.sendMessage(to, aiText);
                                await logBotMessage(to, aiText, cardData.id, cardData.groupId, cardRef);
                            }
                        } catch (error: any) {
                            functions.logger.error(`[Bot] AI Error:`, error.response?.data || error.message);
                            await adapter.sendMessage(to, "Lo siento, tuve un problema procesando tu solicitud con IA.");
                            await logBotMessage(to, "Lo siento, tuve un problema procesando tu solicitud con IA.", cardData.id, cardData.groupId, cardRef, 'text');
                        }
                    } else {
                        functions.logger.warn("[Bot] Missing OpenAI API Key in functions.config().openai.key");
                        await adapter.sendMessage(to, "El nodo de IA no está configurado (falta API Key).");
                        await logBotMessage(to, "El nodo de IA no está configurado (falta API Key).", cardData.id, cardData.groupId, cardRef, 'text');
                    }
                    nextNodeId = getNextNodeId(bot, nextNodeId);
                    break;
                }

                case 'humanHandoffNode': {
                    functions.logger.info(`[Bot] Human Handoff initiated for ${to}`);
                    await cardRef.update({
                        isHandledByHuman: true,
                        botActive: false,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    await adapter.sendMessage(to, "Te estoy transfiriendo con un agente humano. Por favor, espera un momento.");
                    await logBotMessage(to, "Te estoy transfiriendo con un agente humano. Por favor, espera un momento.", cardData.id, cardData.groupId, cardRef, 'text');
                    return;
                }

                default:
                    nextNodeId = getNextNodeId(bot, nextNodeId);
                    break;
            }
        }

    } finally {
        // ALWAYS release the lock, even if an error occurred
        if (lockAcquired) {
            await releaseBotLock(cardRef);
        }
    }
}

function extractName(input: string): string {
    // Lista ampliada de prefijos y saludos comunes en español
    const prefixes = [
        /^(mucho gusto|un placer|encantado|encantada|qué tal|hola|buen[oa]s\s+(días|tardes|noches|dia|tarde|noche))[\s,!¡¿?.-]*/i,
        /^(me llamo|soy|mi nombre es|este es|habla|aquí)[\s:,!¡.-]*/i,
        // Combinaciones: "mucho gusto me llamo..."
        /^(mucho gusto|un placer|hola)[\s,!¡¿?.-]*(me llamo|soy|mi nombre es)[\s:,!¡.-]*/i,
        // Específico para "me llamo [Nombre]" al inicio
        /^[\s,!¡¿?.-]*(me llamo|soy|mi nombre es)[\s:,!¡.-]*/i
    ];

    let cleaned = input.trim();
    let changed = true;

    // Aplicar varias veces para limpiar múltiples capas (ej: "Hola mucho gusto me llamo Juan")
    while (changed) {
        changed = false;
        for (const p of prefixes) {
            if (p.test(cleaned)) {
                cleaned = cleaned.replace(p, '').trim();
                changed = true;
            }
        }
    }

    // Si la cadena quedó vacía o demasiado corta después de limpiar, devolver el input original
    // o un fallback amigablesi solo hay una palabra.
    if (!cleaned || cleaned.length < 2) {
        cleaned = input.trim();
    }

    // Capitalización inteligente (Primera letra Mayúscula, resto minúscula para cada palabra)
    // Pero solo si no parece un apellido compuesto o algo especial
    const words = cleaned.split(/\s+/).filter(w => w.length > 0);
    const capitalized = words.map(word => {
        if (word.length <= 2 && !['yo', 'el', 'la'].includes(word.toLowerCase())) return word.toLowerCase();
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ').trim();

    return capitalized || "Skyler";
}

function getNextNodeId(bot: any, currentId: string | null): string | null {
    if (!currentId) return null;
    const edge = resolveDefaultNextEdge(bot.flow.edges, currentId);
    return edge ? edge.target : null;
}

function validateInput(input: string, config: any, metadata?: { mediaUrl?: string, type?: string }): { isValid: boolean, errorMessage?: string } {
    const value = (input || '').trim();
    const defaultError = config.errorMessage || "Formato inválido. Por favor, intenta de nuevo.";

    // 0. Verificación de Vacío
    if (!value && !metadata?.mediaUrl) {
        return { isValid: false, errorMessage: "Respuesta vacía. Por favor escribe algo." };
    }

    // 1. Prioridad: Expresión Regular Personalizada o Generada desde la UI
    const regexStr = config.validationRegex || config.regex;
    if (regexStr && config.inputType !== 'text') {
        try {
            const re = new RegExp(regexStr);
            if (!re.test(value)) return { isValid: false, errorMessage: defaultError };
        } catch (e) {
            functions.logger.error('Invalid regex in node config:', regexStr);
        }
    }

    // 2. Control de Calidad Heurístico (Evitar "basura")
    if (config.inputType === 'text' || !config.inputType) {
        const hasTooManyRepeatedChars = /(.)\1{4,}/.test(value.toLowerCase());
        const isTooLongWithoutSpaces = value.length > 20 && !value.includes(' ');
        const isTooShort = value.length < 2 && !metadata?.mediaUrl;

        // --- DETECCIÓN DE BASURA (Heurística de vocales) ---
        // Los nombres y palabras reales en español/inglés suelen tener vocales.
        // "jksdbckjs" -> 0 vocales. Es probable que sea basura.
        const vowelCount = (value.match(/[aeiouáéíóúü]/gi) || []).length;
        const isLikelyGarbage = value.length > 4 && vowelCount === 0;

        if (hasTooManyRepeatedChars || isTooLongWithoutSpaces || isTooShort || isLikelyGarbage) {
            functions.logger.info(`[validateInput] Quality check FAILED for "${value}" (vowels: ${vowelCount})`);
            return { isValid: false, errorMessage: defaultError };
        }
    }

    // 3. Validaciones por Tipo
    const inputType = config.inputType;
    if (inputType === 'email') {
        // Regex más estricto que requiere punto después de la arroba
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
        if (!regex.test(value)) return { isValid: false, errorMessage: defaultError };
    } else if (inputType === 'number') {
        const regex = /^-?\d+(\.\d+)?$/;
        if (!regex.test(value)) return { isValid: false, errorMessage: defaultError };
    } else if (inputType === 'phone') {
        const regex = /^\+?[\d\s-]{8,20}$/;
        if (!regex.test(value)) return { isValid: false, errorMessage: defaultError };
    } else if (inputType === 'url') {
        try {
            new URL(value);
        } catch (_) {
            return { isValid: false, errorMessage: defaultError };
        }
    } else if (inputType === 'date') {
        // Validación para DD/MM/AAAA
        const regex = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;
        if (!regex.test(value)) return { isValid: false, errorMessage: defaultError };
    } else if (inputType === 'dni' || inputType === 'cpf') {
        // Validación genérica para DNI/CPF (numeros, puntos, guiones)
        const regex = /^[\d.-]{7,15}$/;
        if (!regex.test(value)) return { isValid: false, errorMessage: defaultError };
    } else if (inputType === 'image') {
        if (metadata?.type !== 'image' && !metadata?.mediaUrl) {
            return { isValid: false, errorMessage: "Por favor, envía una imagen." };
        }
    } else if (inputType === 'file' || inputType === 'document') {
        if (!['document', 'pdf', 'file'].includes(metadata?.type || '') && !metadata?.mediaUrl) {
            return { isValid: false, errorMessage: "Por favor, envía un documento." };
        }
    }

    return { isValid: true };
}

async function saveVariable(contactNumber: string, variable: string, value: string, cardId?: string, groupId?: string, existingRef?: FirebaseFirestore.DocumentReference | null, userId?: string, entityId?: string, platform?: string) {
    if (!variable) return;

    // Use pre-resolved ref if available, otherwise fall back to lookup
    const docRef = existingRef || (userId && entityId ? await resolveCardRef(userId, entityId, contactNumber, platform || 'whatsapp') : null);

    if (docRef) {
        const updateData: any = {};
        updateData[`customFields.${variable}`] = value;

        // --- AUTO-UPDATE CONTACT NAME ---
        const varLower = variable.toLowerCase();
        const isNameVariable = varLower === 'nombre' || varLower === 'name' || varLower === 'firstname';

        if (isNameVariable && value && value !== 'Amigo') {
            // updateData.contactName = value; // Disabled per user request
            functions.logger.info(`[saveVariable] Captured name ${value}, but NOT updating contactName per user request.`);
        }

        await docRef.update({
            ...updateData,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // SYNC WITH MASTER CONTACTS COLLECTION (Disabled by user request)
        /*
        if (isNameVariable) {
            ...
        }
        */
    }
}

interface KanbanSyncContext {
    botId?: string;
    nodeGroupMap?: Map<string, string>;
    currentGroupId?: string;
}

async function updateBotState(
    contactNumber: string,
    state: any,
    cardId?: string,
    groupId?: string,
    existingRef?: FirebaseFirestore.DocumentReference | null,
    userId?: string,
    entityId?: string,
    platform?: string,
    kanbanContext?: KanbanSyncContext
) {
    const docRef = existingRef || (userId && entityId ? await resolveCardRef(userId, entityId, contactNumber, platform || 'whatsapp') : null);

    if (docRef) {
        const nextState = kanbanContext?.botId ? { ...state, botId: kanbanContext.botId } : state;
        await docRef.update({ botState: nextState, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

        const activeGroupId = kanbanContext?.currentGroupId || groupId;
        if (
            state?.currentNodeId &&
            kanbanContext?.botId &&
            cardId &&
            activeGroupId &&
            userId &&
            entityId
        ) {
            try {
                const tenantPath = `users/${userId}/entities/${entityId}`;
                const newGroupId = await syncCardToBotNodeAdmin({
                    db: admin.firestore(),
                    tenantPath,
                    cardId,
                    currentGroupId: activeGroupId,
                    botId: kanbanContext.botId,
                    nodeId: String(state.currentNodeId),
                    nodeGroupMap: kanbanContext.nodeGroupMap,
                });
                if (newGroupId && kanbanContext) {
                    kanbanContext.currentGroupId = newGroupId;
                }
            } catch (err: any) {
                functions.logger.warn(`[KanbanSync] Auto-move failed: ${err?.message || err}`);
            }
        }
    }
}

async function logBotMessage(contactNumber: string, message: string, cardId?: string, groupId?: string, existingRef?: FirebaseFirestore.DocumentReference | null, type: string = 'text', metadata?: any, userId?: string, entityId?: string, platform?: string) {
    // Use pre-resolved ref if available, otherwise fall back to lookup
    const docRef = existingRef || (userId && entityId ? await resolveCardRef(userId, entityId, contactNumber, platform || 'whatsapp') : null);

    if (docRef) {
        try {
            // Build the message object — only include metadata if it has real value
            const msgObj: any = {
                sender: 'agent',
                text: message,
                type: type,
                messageId: `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                timestamp: admin.firestore.Timestamp.now()
            };
            if (metadata && Object.keys(metadata).length > 0) {
                msgObj.metadata = metadata;
            }

            // ⚠️ NOTE: FieldValue.serverTimestamp() is NOT allowed inside arrayUnion.
            // Use Timestamp.now() instead so the write succeeds.
            await docRef.update({
                lastMessage: message.substring(0, 100),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                messages: admin.firestore.FieldValue.arrayUnion(msgObj),
                unreadCount: 0
            });
            functions.logger.info(`[logBotMessage] ✅ Bot message logged to ${docRef.path}: "${message.substring(0, 60)}"`);
        } catch (err: any) {
            functions.logger.error(`[logBotMessage] ❌ FAILED to write bot message to Firestore. Path: ${docRef.path}. Error: ${err.message}`, { message, type, metadata });
        }
    } else {
        functions.logger.warn(`[logBotMessage] Could not resolve cardRef for ${contactNumber} (platform: ${platform}). Bot message NOT logged.`);
    }
}
