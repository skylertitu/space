import axios from 'axios';
import { db, admin } from './firebase-admin'; // Use admin to fetch tokens on server
import { getGmailAccessToken } from './googleAuth';

// --- Meta (Instagram & Messenger) ---

export interface MetaSendOptions {
    type?: 'text' | 'image' | 'quick_reply' | 'media' | 'video' | 'audio' | 'document' | 'list';
    mediaType?: string;
    userId?: string;
    entityId?: string;
    provider?: 'messenger' | 'instagram';
    buttons?: any[];
    sections?: any[];
    url?: string;
}

export async function sendMetaMessage(
    recipientId: string,
    text: string,
    options: MetaSendOptions | string = {}
): Promise<any> {
    // If text is empty, it's okay IF it's a media message (image, video, audio, document)
    const META_MEDIA_TYPES = ['image', 'media', 'video', 'audio', 'document'];
    const isMedia = (typeof options !== 'string') && (
        META_MEDIA_TYPES.includes(options.type || '') || META_MEDIA_TYPES.includes(options.mediaType || '')
    );
    if (!text && !isMedia) return;

    // Fallback for list type from WhatsApp into text for Messenger
    if (typeof options !== 'string' && options.type === 'list' && options.sections) {
        let listText = '\n\n';
        options.sections.forEach((section: any) => {
            if (section.title && section.title !== 'Opciones') {
                listText += `*${section.title}*\n`;
            }
            (section.rows || []).forEach((row: any) => {
                listText += `- ${row.title}\n`;
            });
        });
        text = (text || '') + listText;
    }

    // Backwards compatibility with the old signature
    let token: string | undefined = undefined;
    if (typeof options === 'string') {
        token = options;
        options = {};
    }

    // Instagram DM does not support Messenger quick replies; degrade gracefully to plain text options.
    if (options.provider === 'instagram' && options.type === 'quick_reply' && Array.isArray(options.buttons) && options.buttons.length > 0) {
        const quickReplyText = options.buttons
            .map((btn: any) => {
                const base = btn.reply || btn;
                return `- ${base.title || base.text || base}`;
            })
            .join('\n');
        text = `${text || 'Selecciona una opción:'}\n\n${quickReplyText}`;
        options = { ...options, type: 'text', buttons: [] };
    }

    if (options.userId && options.entityId && options.provider) {
        try {
            const configPath = `users/${options.userId}/entities/${options.entityId}/integrations/${options.provider}`;
            const configDoc = await db.doc(configPath).get();
            if (configDoc.exists) {
                const data = configDoc.data();
                const resolvedToken = data?.accessToken || data?.pageAccessToken || data?.token;
                if (resolvedToken) {
                    token = resolvedToken;
                    console.log(`[sendMetaMessage] Using PERMANENT TOKEN from Firestore (${options.provider})`);
                }
            }

            if (!token) {
                throw new Error(
                    `Token permanente no encontrado en Firestore para ${options.provider} (entity: ${options.entityId}). ` +
                    `Reconecta la integración desde Configuración → Integraciones.`
                );
            }
        } catch (err: any) {
            console.error(`[sendMetaMessage] Error resolving config:`, err.message);
            throw err;
        }
    }

    if (!token) {
        console.error('[sendMetaMessage] No tenant context provided and no token available.');
        throw new Error('Access Token is not configured.');
    }

    const endpoint = 'me';
    const apiUrl = `https://graph.facebook.com/v21.0/${endpoint}/messages?access_token=${token}`;

    const messageData: any = {
        messaging_type: 'RESPONSE',
        recipient: { id: recipientId },
        message: {}
    };

    // Determine final media type — covers image, video, audio, document
    const resolvedMediaType = (typeof options !== 'string') ? (options.mediaType || options.type || '') : '';
    const isMediaFinal = (typeof options !== 'string') && !!resolvedMediaType && META_MEDIA_TYPES.includes(resolvedMediaType);
    let mediaUrl = (typeof options !== 'string' && options.url) ? options.url : null;

    // Safety check: if mediaUrl doesn't look like a URL, don't treat it as an attachment
    if (mediaUrl && !mediaUrl.startsWith('http')) {
        mediaUrl = null;
    }

    if (isMediaFinal && mediaUrl) {
        // Map internal type to Meta attachment type ('document' → 'file' in Meta API)
        const attachmentType = resolvedMediaType === 'document' ? 'file'
            : resolvedMediaType === 'media' ? 'image'
            : resolvedMediaType;

        messageData.message = {
            attachment: {
                type: attachmentType,
                payload: {
                    url: mediaUrl,
                    is_reusable: true
                }
            }
        };

        // If there's ALSO text (caption), we send the media first, then the caption separately for Messenger reliability
        if (text && text.trim() && text !== mediaUrl) {
            try {
                // Send media-only first
                await axios.post(apiUrl, messageData);
                // Then send caption as separate text message
                const textOnlyPayload = {
                    messaging_type: 'RESPONSE',
                    recipient: { id: recipientId },
                    message: { text: text }
                };
                const textResponse = await axios.post(apiUrl, textOnlyPayload);
                return {
                    ...textResponse.data,
                    message_id: textResponse.data.message_id || textResponse.data.id,
                    sentTo: recipientId
                };
            } catch (err) {
                console.error(`[Meta Sending] Multi-part delivery failed:`, err);
                throw err;
            }
        }
    } else {
        // Fallback: If it was supposed to be media but URL is missing,
        // send the text (which might contain the link as text)
        messageData.message = { text: text || mediaUrl || 'Mensaje sin contenido' };
    }

    // --- QUICK REPLY SUPPORT (FIXES MESSENGER MISSING BUTTONS) ---
    if (options.provider !== 'instagram' && options.type === 'quick_reply' && options.buttons && options.buttons.length > 0) {
        // Messenger REQUIRES text when sending quick_replies. If empty, add fallback.
        if (!messageData.message.text) {
            messageData.message.text = text || '¿Qué te gustaría hacer?';
        }

        messageData.message.quick_replies = options.buttons.map((btn: any) => {
            const b = btn.reply || btn;
            return {
                content_type: 'text',
                title: (b.title || b).substring(0, 20),
                payload: (b.id || b.title || b).substring(0, 50)
            };
        });
    }

    // Metadata for Instagram accounts is handled via targetNodeId above

    try {
        const response = await axios.post(apiUrl, messageData);

        // Success! Autoclear Error status if we have the context
        if (options.userId && options.entityId && options.provider) {
            const integrationRef = db.doc(`users/${options.userId}/entities/${options.entityId}/integrations/${options.provider}`);
            // Check status before updating to avoid unnecessary writes
            integrationRef.get().then(snap => {
                if (snap.exists && snap.data()?.status === 'Error') {
                    integrationRef.update({ status: 'Connected', lastError: null, updatedAt: admin.firestore.FieldValue.serverTimestamp() }).catch(() => {});
                }
            }).catch(() => {});
        }

        return {
            ...response.data,
            message_id: response.data.message_id || response.data.id,
            sentTo: recipientId
        };
    } catch (error: any) {
        const errorData = error.response?.data || { message: error.message };
        const detailedError = typeof errorData === 'object' ? JSON.stringify(errorData) : errorData;
        console.error('Meta API Error:', detailedError);

        // Self-documenting error in Firestore for easier debugging
        if (options.userId && options.entityId && options.provider) {
            try {
                const entityPath = `users/${options.userId}/entities/${options.entityId}`;
                
                // 1. Detect Token Death (Code 190) and mark integration as Error
                if (detailedError.includes('Code 190') || detailedError.includes('OAuthException')) {
                    const integrationRef = db.doc(`${entityPath}/integrations/${options.provider}`);
                    await integrationRef.update({
                        status: 'Error',
                        lastError: `Token expirado: ${detailedError}`,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    }).catch(() => {}); // Avoid crashing if doc missing
                }

                // 2. Find card to log error directly where user sees it
                const groupsRef = db.collection(`${entityPath}/kanban-groups`);
                const groupsSnap = await groupsRef.get();
                
                for (const groupDoc of groupsSnap.docs) {
                    const searchSnap = await groupDoc.ref.collection('cards')
                        .where(`platform_ids.${options.provider}`, '==', recipientId)
                        .get();

                    if (!searchSnap.empty) {
                        await searchSnap.docs[0].ref.update({
                            'botState.lastError': `Meta Error [${options.provider}]: ${detailedError}`,
                            'botState.lastErrorAt': admin.firestore.FieldValue.serverTimestamp()
                        });
                        break;
                    }
                }
                
                // Also log to general entity logs
                await db.collection(`${entityPath}/system_logs`).add({
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    type: `error_${options.provider}`,
                    error: errorData,
                    recipientId
                });
            } catch (fsErr) {
                console.error('[sendMetaMessage] Failed to log error to Firestore:', fsErr);
            }
        }

        throw new Error(`Meta API Error: ${detailedError}`);
    }
}

/** Reply publicly to an Instagram comment (Graph API). Uses integrations/instagram token. */
export async function sendInstagramCommentReply(
    commentId: string,
    text: string,
    options: { userId?: string; entityId?: string } = {}
): Promise<any> {
    if (!commentId || !text?.trim()) {
        throw new Error('commentId and text are required for Instagram comment replies.');
    }

    let token: string | undefined;
    if (options.userId && options.entityId) {
        const configDoc = await db.doc(`users/${options.userId}/entities/${options.entityId}/integrations/instagram`).get();
        if (configDoc.exists) {
            const data = configDoc.data();
            token = data?.accessToken || data?.pageAccessToken || data?.token;
        }
    }

    if (!token) {
        throw new Error('Instagram access token not found. Reconnect in CTO → Integraciones.');
    }

    const apiUrl = `https://graph.facebook.com/v21.0/${commentId}/replies`;
    try {
        const response = await axios.post(
            apiUrl,
            { message: text },
            { params: { access_token: token } }
        );

        return {
            ...response.data,
            comment_id: response.data.id,
            repliedTo: commentId,
        };
    } catch (error: any) {
        const metaError = error.response?.data?.error;
        const detail = metaError?.message || error.message;
        console.error('[sendInstagramCommentReply] Failed:', metaError || detail);

        if (options.userId && options.entityId) {
            try {
                await db.collection(`users/${options.userId}/entities/${options.entityId}/internal_logs`).add({
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                    type: 'instagram_comment_reply_error',
                    commentId,
                    error: detail,
                    code: metaError?.code || null,
                });
            } catch (logErr) {
                console.error('[sendInstagramCommentReply] Failed to log error:', logErr);
            }
        }

        throw new Error(`Instagram comment reply failed: ${detail}`);
    }
}

// --- WhatsApp Business Cloud API (Multi-Tenant Aware) ---

interface WhatsAppSendOptions {
    type?: 'text' | 'template' | 'quick_reply' | 'list' | 'media' | 'multimedia' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'contacts' | 'reaction';
    mediaType?: string;
    template?: any;
    buttons?: any[];
    button?: string;
    sections?: any[];
    url?: string;
    filename?: string;
    mimeType?: string;
    mediaId?: string;
    preferMediaId?: boolean;
    location?: { latitude: number; longitude: number; name?: string; address?: string };
    contacts?: any[];
    reaction?: { message_id: string; emoji: string };
    forceTemplate?: boolean;
    userId?: string;
    entityId?: string;
    /** Business phone_number_id to send FROM (multi-number). Replies use the number the customer wrote to. */
    fromPhoneNumberId?: string;
}

/**
 * Sends a message via WhatsApp Business API.
 * If userId and entityId are provided, it fetches the credentials from Firestore.
 */
export async function sendWhatsAppMessage(
    toNumber: string,
    message: string,
    options: WhatsAppSendOptions = {}
): Promise<any> {
    // Aislamiento multi-tenant: las credenciales salen SOLO de la entidad. Nunca de variables de
    // entorno de la plataforma (un cliente sin credenciales enviaría desde el número del dueño).
    let token: string | undefined;
    let phoneNumberId: string | undefined;

    const applyWhatsAppCredentials = (source: Record<string, any> | undefined) => {
        if (!source) return;
        const resolvedToken = source.accessToken || source.token || source.access_token || source.pageAccessToken;
        const resolvedPhone = source.phoneNumberId || source.phone_number_id || source.phoneId;
        if (resolvedToken && typeof resolvedToken === 'string' && resolvedToken.startsWith('EAA')) {
            token = resolvedToken;
        }
        if (resolvedPhone) {
            phoneNumberId = String(resolvedPhone);
        }
    };

    // 1. Multi-Tenant Token Resolution (Surgical Separation)
    if (options.userId && options.entityId) {
        try {
            const entityPath = `users/${options.userId}/entities/${options.entityId}`;
            const integrationsRef = db.collection(`${entityPath}/integrations`);

            const [standardSnap, internalSnap, allIntegrationsSnap] = await Promise.all([
                integrationsRef.doc('whatsapp').get(),
                integrationsRef.doc('whatsapp_internal').get(),
                integrationsRef.get(),
            ]);

            applyWhatsAppCredentials(standardSnap.data());
            applyWhatsAppCredentials(internalSnap.data());

            if (!token || !phoneNumberId) {
                for (const doc of allIntegrationsSnap.docs) {
                    if (doc.id === '_init') continue;
                    applyWhatsAppCredentials(doc.data());
                    if (token && phoneNumberId) break;
                }
            }

            if (token) console.log(`[WhatsApp] 🛡️ Token resolved for entity ${options.entityId}`);
            if (phoneNumberId) console.log(`[WhatsApp] 📱 PhoneID resolved for entity ${options.entityId}`);

            console.log(`[WhatsApp] 🎯 Final Resolution: hasToken=${!!token}, hasPhoneId=${!!phoneNumberId}`);

            // Fallback de Casing si aún falta algo (userId con distinto casing)
            if (!token || !phoneNumberId) {
                const allUsers = await db.collection('users').get();
                const match = allUsers.docs.find(u => u.id.toLowerCase() === options.userId!.toLowerCase());
                if (match && match.id !== options.userId) {
                    const altSnap = await db.collection(`users/${match.id}/entities/${options.entityId}/integrations`).get();
                    for (const doc of altSnap.docs) {
                        if (doc.id === '_init') continue;
                        applyWhatsAppCredentials(doc.data());
                    }
                }
            }
        } catch (err) {
            console.error(`[sendWhatsAppMessage] Error resolving config:`, err);
        }
    }

    // 1b. MULTI-NUMBER: reply FROM the exact number the customer wrote to.
    // Looks for a connected slot number (whatsapp_numbers) or integration whose
    // phoneNumberId matches, and uses its own access token. Falls back to the default
    // sender if that number has no stored token (keeps single-number setups working).
    if (options.fromPhoneNumberId && options.userId && options.entityId) {
        try {
            const targetId = String(options.fromPhoneNumberId).trim();
            const entityPath = `users/${options.userId}/entities/${options.entityId}`;
            const [slotsSnap, integrationsSnap] = await Promise.all([
                db.collection(`${entityPath}/whatsapp_numbers`).get(),
                db.collection(`${entityPath}/integrations`).get(),
            ]);
            const findMatch = (docs: any[]) => {
                for (const d of docs) {
                    const data = d.data() || {};
                    const pid = String(data.phoneNumberId || data.phone_number_id || data.phoneId || '');
                    if (pid && pid === targetId) return data;
                }
                return null;
            };
            const match = findMatch(slotsSnap.docs) || findMatch(integrationsSnap.docs);
            const matchToken = match?.accessToken || match?.token || match?.access_token || match?.pageAccessToken;
            if (match && typeof matchToken === 'string' && matchToken.startsWith('EAA')) {
                token = matchToken;
                phoneNumberId = targetId;
                console.log(`[WhatsApp] 🎯 Replying from customer's own number ${targetId}`);
            } else {
                console.warn(`[WhatsApp] ⚠️ No stored token for number ${targetId}; using default sender number.`);
            }
        } catch (e) {
            console.warn('[WhatsApp] fromPhoneNumberId resolution failed:', e);
        }
    }

    // 2. Final Extraction & Validation
    if (!token || !phoneNumberId) {
        throw new Error(
            `Configuración de WhatsApp incompleta para '${options.entityId}'. ` +
            `Falta ${!token && !phoneNumberId ? 'Access Token y Phone Number ID' : !token ? 'Access Token' : 'Phone Number ID'}. ` +
            `Ve a CTO → Integraciones → WhatsApp, edita la conexión y guarda ambos campos. ` +
            `Detalles: userId=${options.userId}, hasToken=${!!token}, hasPhoneId=${!!phoneNumberId}`
        );
    }

    const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;
    const cleanTo = toNumber.replace(/\D/g, '');

    let payload: any = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
    };

    console.log(`[sendWhatsAppMessage] Preparing message type: ${options.type || 'text'} to ${cleanTo}`);

    // Construct Payload based on type
    if (options.type === 'template' && options.template) {
        payload.type = 'template';
        payload.template = {
            name: options.template.name,
            language: { code: options.template.language?.code || 'es' },
            components: options.template.components || []
        };
    } else if (options.type === 'quick_reply') {
        payload.type = 'interactive';
        payload.interactive = {
            type: 'button',
            body: { text: message },
            action: { buttons: options.buttons }
        };
    } else if (options.type === 'list') {
        payload.type = 'interactive';
        payload.interactive = {
            type: 'list',
            header: { type: 'text', text: 'Opciones' },
            body: { text: message },
            action: {
                button: options.button || 'Seleccionar',
                sections: options.sections
            }
        };
    } else if (['media', 'multimedia', 'image', 'video', 'audio', 'document'].includes((options.type || '').toLowerCase())) {
        const { detectWhatsAppMediaType } = await import('@/lib/whatsapp/mediaUtils');
        const typeIn = (options.type || 'image').toLowerCase();
        const mediaUrl = options.url || '';
        const mediaType = detectWhatsAppMediaType({
            explicit: options.mediaType || (typeIn === 'multimedia' || typeIn === 'media' ? undefined : typeIn),
            url: mediaUrl,
            filename: options.filename,
            mimeType: options.mimeType,
        });

        const msgType = mediaType;
        payload.type = msgType;

        const mediaData: any = {};
        const shouldUseMediaId =
            !!options.mediaId ||
            (options.preferMediaId !== false && mediaUrl && options.userId && options.entityId);

        if (options.mediaId) {
            mediaData.id = options.mediaId;
        } else if (shouldUseMediaId && mediaUrl) {
            try {
                const { uploadWhatsAppMediaToMeta } = await import('@/lib/whatsapp/mediaUpload');
                const uploadedId = await uploadWhatsAppMediaToMeta({
                    userId: options.userId!,
                    entityId: options.entityId!,
                    fileUrl: mediaUrl,
                    mediaType,
                    filename: options.filename,
                    mimeType: options.mimeType,
                });
                mediaData.id = uploadedId;
                console.log(`[sendWhatsAppMessage] 📦 Media uploaded to Meta: ${uploadedId}`);
            } catch (uploadErr: any) {
                console.warn('[sendWhatsAppMessage] Media upload failed, falling back to link:', uploadErr?.message);
                if (!mediaUrl) throw uploadErr;
                mediaData.link = mediaUrl;
            }
        } else if (mediaUrl) {
            mediaData.link = mediaUrl;
        } else {
            throw new Error('Media message requires url or mediaId.');
        }

        // Meta rejects caption on audio messages.
        if (msgType !== 'audio' && message) {
            mediaData.caption = message;
        }
        if (msgType === 'document' && options.filename) {
            mediaData.filename = options.filename;
        }

        payload[msgType] = mediaData;
    } else if (options.type === 'location' && options.location) {
        payload.type = 'location';
        payload.location = {
            latitude: options.location.latitude,
            longitude: options.location.longitude,
            ...(options.location.name ? { name: options.location.name } : {}),
            ...(options.location.address ? { address: options.location.address } : {}),
        };
    } else if (options.type === 'contacts' && options.contacts?.length) {
        payload.type = 'contacts';
        payload.contacts = options.contacts;
    } else if (options.type === 'reaction' && options.reaction) {
        payload.type = 'reaction';
        payload.reaction = options.reaction;
    } else {
        console.warn(`[sendWhatsAppMessage] ⚠️ Falling back to TEXT. Received Type: "${options.type || 'undefined'}"`);
        payload.type = 'text';
        payload.text = { body: message, preview_url: false };
    }

    // Retry logic (up to 3 attempts, same as Firebase Functions version)
    let lastError: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await axios.post(url, payload, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            console.log(`[sendWhatsAppMessage] ✅ Success (attempt ${attempt}):`, JSON.stringify(response.data));
            return { ...response.data, sentTo: cleanTo };
        } catch (error: any) {
            lastError = error.response?.data || error.message;
            const detailedError = typeof lastError === 'object' ? JSON.stringify(lastError) : lastError;
            const status = error.response?.status;
            const isTransient = status === 429 || (status >= 500 && status <= 599);
            
            if (isTransient && attempt < 3) {
                const wait = Math.pow(2, attempt) * 1000;
                console.warn(`[sendWhatsAppMessage] ⚠️ Transient error (attempt ${attempt}/3), retrying in ${wait}ms...`);
                await new Promise(r => setTimeout(r, wait));
                continue;
            }

            // EXHAUSTIVE LOGGING: If it fails, log the error to the card so the user knows WHY
            if (options.userId && options.entityId) {
                try {
                    const entityPath = `users/${options.userId}/entities/${options.entityId}`;
                    const groupsRef = db.collection(`${entityPath}/kanban-groups`);
                    const groupsSnap = await groupsRef.get();
                    
                    for (const groupDoc of groupsSnap.docs) {
                        const searchSnap = await groupDoc.ref.collection('cards')
                            .where('contactNumber', '==', toNumber)
                            .get();

                        if (!searchSnap.empty) {
                            await searchSnap.docs[0].ref.update({
                                'botState.lastError': `WhatsApp Error: ${detailedError}`,
                                'botState.lastErrorAt': admin.firestore.FieldValue.serverTimestamp()
                            });
                            break;
                        }
                    }
                    
                    await db.collection(`${entityPath}/system_logs`).add({
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                        type: 'error_whatsapp',
                        error: lastError,
                        recipient: toNumber
                    });
                } catch (fsErr) {
                    console.error('[sendWhatsAppMessage] Failed to log error to Firestore:', fsErr);
                }
            }
            break;
        }
    }
    throw new Error(`WhatsApp API Error: ${JSON.stringify(lastError)}`);
}

// --- Telegram Bot API ---

export async function sendTelegramMessage(
    chatId: string,
    text: string,
    options: { 
        userId?: string; 
        entityId?: string; 
        botToken?: string;
        type?: 'text' | 'image' | 'video' | 'audio' | 'document' | 'quick_reply';
        url?: string;
        filename?: string;
        buttons?: any[];
    } = {}
): Promise<any> {
    const { userId, entityId, type = 'text', url: mediaUrl, filename, buttons } = options;
    let token = options.botToken;

    if (userId && entityId && !token) {
        try {
            const configPath = `users/${userId}/entities/${entityId}/integrations/telegram`;
            const configDoc = await db.doc(configPath).get();
            if (configDoc.exists) {
                token = configDoc.data()?.botToken;
            }
        } catch (err) {
            console.error(`[sendTelegramMessage] Error resolving config:`, err);
        }
    }

    if (!token) {
        throw new Error('Telegram Bot Token is not configured for this entity.');
    }

    // Determine endpoint based on type
    let method = 'sendMessage';
    const payload: any = { chat_id: chatId };

    if (type === 'image' || type === 'video' || type === 'audio' || type === 'document') {
        const isPhoto = type === 'image';
        method = isPhoto ? 'sendPhoto' : (type === 'video' ? 'sendVideo' : (type === 'audio' ? 'sendAudio' : 'sendDocument'));
        const field = isPhoto ? 'photo' : type;
        payload[field] = mediaUrl;
        payload.caption = text;
        payload.parse_mode = 'HTML';
    } else {
        payload.text = text;
        payload.parse_mode = 'HTML';
    }

    // Support for buttons (Inline Keyboard)
    if ((type === 'quick_reply' || buttons) && Array.isArray(buttons)) {
        payload.reply_markup = {
            inline_keyboard: buttons.map((btn: any) => {
                const b = btn.reply || btn;
                return [{ text: b.title || b.text || 'Opción', callback_data: b.id || b.title || b.text }];
            })
        };
    }

    const apiUrl = `https://api.telegram.org/bot${token}/${method}`;

    try {
        const response = await axios.post(apiUrl, payload);
        return {
            ...response.data,
            message_id: response.data.result?.message_id,
            sentTo: chatId
        };
    } catch (error: any) {
        const errorData = error.response?.data || { message: error.message };
        const detailedError = JSON.stringify(errorData);
        console.error('Telegram API Error:', detailedError);

        // Self-log error if context exists
        if (userId && entityId) {
            const entityPath = `users/${userId}/entities/${entityId}`;
            db.collection(`${entityPath}/system_logs`).add({
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                type: 'error_telegram',
                error: errorData,
                recipient: chatId
            }).catch(() => {});
        }

        throw new Error(`Telegram API Error: ${detailedError}`);
    }
}

// --- Gmail API ---

export async function sendGmailMessage(
    to: string,
    text: string,
    options: { userId: string; entityId: string; subject?: string; threadId?: string }
): Promise<any> {
    if (!text) throw new Error('El mensaje está vacío.');

    try {
        const accessToken = await getGmailAccessToken(options.userId, options.entityId);

        const subject = options.subject || 'Respuesta de elizmey';
        const headers = [
            `To: ${to}`,
            'Content-Type: text/html; charset=utf-8',
            'MIME-Version: 1.0',
            `Subject: ${subject}`
        ];

        // If we have a threadId, we should ideally include threading headers
        // Note: For a "perfect" reply we'd need the specific Message-ID of the parent email.
        // Gmail API automatically handles most threading if threadId is provided in the root object.
        if (options.threadId) {
            headers.push(`Thread-Topic: ${subject}`);
            // headers.push(`In-Reply-To: <${options.threadId}@gmail.com>`); // Partial logic
        }

        const str = [
            ...headers,
            '',
            text.replace(/\n/g, '<br/>')
        ].join('\r\n');

        const encodedMail = Buffer.from(str, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
        const response = await axios.post(url, { 
            raw: encodedMail,
            threadId: options.threadId // This is key for grouping in Gmail
        }, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        return { ...response.data, sentTo: to };
    } catch (error: any) {
        const apiErr = error.response?.data || { message: error.message };
        const detailedMsg = typeof apiErr === 'object' ? JSON.stringify(apiErr) : apiErr;
        console.error('Gmail Send API Error:', detailedMsg);
        throw new Error(`Google API Error: ${detailedMsg}`);
    }
}
