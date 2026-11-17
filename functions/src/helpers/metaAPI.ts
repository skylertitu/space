
import * as functions from 'firebase-functions';
import axios from 'axios';

import * as admin from 'firebase-admin';

// Get tokens from environment variables
const PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;
const PERPETUAL_TOKEN = "EAARnTi3ZAPNYBRA8Gn2JALYYZCKVZBTurjuoZBQsjYXIHv6Ikv9ZBkrrDxqtN9vSCkPkD3Y24x5ZAqJaPoH2IYln3fVOZAAwrZCzkDCUg7te6QZCY9LiNxgQl5mSshX6WDtXOjmo0vvIVEhUCeO37u1JNUS0qZAIhakIQ2vS3zTCB6DyTDMdv9oFZBIQZBZBJrR9vbxJOtgZDZD";
export const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN || PERPETUAL_TOKEN;

interface Context {
    userId?: string;
    entityId?: string;
    provider?: 'messenger' | 'instagram';
}

// Generic function to make requests to Graph API
async function callSendApi(messageData: any, token?: string, ctx?: Context): Promise<any> {
    let accessToken = token || PAGE_ACCESS_TOKEN || PERPETUAL_TOKEN;
    let targetNodeId: string | undefined;

    // Resolve tenant-specific token if context provided
    if (ctx?.userId && ctx?.entityId && !token) {
        try {
            const db = admin.firestore();
            const platform = ctx.provider || 'messenger';

            // 1. Try direct doc lookup (fastest)
            let configSnap = await db.doc(`users/${ctx.userId}/entities/${ctx.entityId}/integrations/${platform}`).get();

            // 2. Try 'facebook' doc if 'messenger' fails
            if (!configSnap.exists && platform === 'messenger') {
                configSnap = await db.doc(`users/${ctx.userId}/entities/${ctx.entityId}/integrations/facebook`).get();
            }

            // 3. Robust fallback: search by field (matching resolveTenant logic)
            if (!configSnap.exists) {
                const fieldName = platform === 'instagram' ? 'instagramId' : 'pageId';
                const integrationsSnap = await db.collection(`users/${ctx.userId}/entities/${ctx.entityId}/integrations`)
                    .where(fieldName, '!=', '')
                    .limit(1)
                    .get();
                if (!integrationsSnap.empty) {
                    configSnap = integrationsSnap.docs[0] as any;
                }
            }

            if (configSnap && configSnap.exists) {
                const data = configSnap.data();
                if (data?.accessToken) {
                    accessToken = data.accessToken;
                    targetNodeId = platform === 'messenger' ? data.pageId : data.instagramId;
                }
            } else if (platform === 'messenger') {
                // Last ditch fallback to whatsapp config
                const waSnap = await db.doc(`users/${ctx.userId}/entities/${ctx.entityId}/integrations/whatsapp`).get();
                if (waSnap.exists) {
                    const waData = waSnap.data();
                    if (waData?.accessToken) {
                        accessToken = waData.accessToken;
                        targetNodeId = waData.pageId;
                    }
                }
            }
        } catch (error) {
            functions.logger.error('[Meta API] Error fetching tenant token', error);
        }
    }

    if (!accessToken) {
        functions.logger.error('[Meta API] ❌ Missing Access Token.');
        throw new Error('Access Token is not configured.');
    }

    const node = targetNodeId || 'me';
    const url = `https://graph.facebook.com/v21.0/${node}/messages?access_token=${accessToken}`;

    // Mask token for logs
    const maskedToken = accessToken.substring(0, 6) + '...' + accessToken.substring(accessToken.length - 4);
    functions.logger.info(`[Meta API] 🚀 Sending to ${node}. Recipient: ${messageData.recipient?.id}. Token: ${maskedToken} (Provider: ${ctx?.provider})`);

    try {
        const response = await axios.post(url, messageData);
        functions.logger.info(`[Meta API] ✅ Success: ${response.data.message_id || 'OK'}`);
        return response.data;
    } catch (error: any) {
        const errorData = error.response?.data || error.message;
        functions.logger.error(`[Meta API] ❌ FAILED for ${node}:`, errorData);
        throw new Error(`Meta API Error: ${JSON.stringify(errorData)}`);
    }
}

/**
 * Sends a text message to a user via Messenger.
 */
export async function sendMetaMessage(recipientId: string, text: string, token?: string, ctx?: Context): Promise<any> {
    if (!text) return;

    const messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: text
        }
    };

    return await callSendApi(messageData, token, ctx);
}

/**
 * Sends a media message (image, video, etc.).
 */
export async function sendMetaMediaMessage(recipientId: string, mediaUrl: string, mediaType: 'image' | 'video' | 'audio' | 'file' = 'image', token?: string, ctx?: Context): Promise<any> {
    if (!mediaUrl) return;

    const messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type: mediaType,
                payload: {
                    url: mediaUrl,
                    is_reusable: true
                }
            }
        }
    };

    return await callSendApi(messageData, token, ctx);
}

/**
 * Marks a message as read in Messenger.
 * Note: Facebook does not have an explicit "mark as read" endpoint same as WhatsApp, but we can send "sender_action: mark_seen".
 */
export async function markMetaMessageAsRead(recipientId: string, token?: string, ctx?: Context): Promise<any> {
    const messageData = {
        recipient: {
            id: recipientId
        },
        sender_action: 'mark_seen'
    };

    return await callSendApi(messageData, token, ctx);
}

/**
 * Sends Quick Replies (Buttons).
 * Facebook Quick Replies are different from WhatsApp Buttons.
 */
export async function sendMetaQuickReplies(recipientId: string, text: string, quickReplies: any[], token?: string, ctx?: Context): Promise<any> {
    // Format quick replies for Messenger
    // Expected format: { content_type: 'text', title: 'Yes', payload: 'YES_PAYLOAD' }
    const formattedQRs = quickReplies.slice(0, 13).map(qr => ({
        content_type: 'text',
        title: (qr.title || 'Opción').substring(0, 20),
        payload: qr.id || qr.payload || qr.title
    }));

    const messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            text: text,
            quick_replies: formattedQRs
        }
    };

    return await callSendApi(messageData, token, ctx);
}

/**
 * Fetches user profile from Meta
 */
export async function getMetaProfile(recipientId: string, token?: string, ctx?: Context): Promise<any> {
    let accessToken = token || PAGE_ACCESS_TOKEN;

    if (ctx?.userId && ctx?.entityId && !token) {
        try {
            const db = admin.firestore();
            const configSnap = await db.doc(`users/${ctx.userId}/entities/${ctx.entityId}/integrations/${ctx.provider || 'messenger'}`).get();
            if (configSnap.exists) accessToken = configSnap.data()?.accessToken || accessToken;
        } catch (e) { }
    }

    if (!accessToken) return null;

    const url = `https://graph.facebook.com/v21.0/${recipientId}?fields=name,first_name,last_name,profile_pic&access_token=${accessToken}`;

    try {
        const res = await axios.get(url);
        return res.data;
    } catch (e) {
        functions.logger.warn(`[Meta API] Failed to fetch profile for ${recipientId}`);
        return null;
    }
}
