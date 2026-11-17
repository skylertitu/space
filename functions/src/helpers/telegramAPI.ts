
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import axios from 'axios';

// Singleton env var token — used only when per-tenant token is not available
const TELEGRAM_BOT_TOKEN_ENV = process.env.TELEGRAM_BOT_TOKEN;

export interface TelegramCtx {
    userId?: string;
    entityId?: string;
    /** Pre-resolved bot token (skips Firestore lookup if provided) */
    botToken?: string;
}

/**
 * Resolves the Telegram bot token for a tenant.
 * Priority: ctx.botToken → Firestore integration doc → env var.
 */
async function resolveBotToken(ctx?: TelegramCtx): Promise<string> {
    if (ctx?.botToken) return ctx.botToken;

    if (ctx?.userId && ctx?.entityId) {
        try {
            const db = admin.firestore();
            const snap = await db
                .doc(`users/${ctx.userId}/entities/${ctx.entityId}/integrations/telegram`)
                .get();
            const token = snap.data()?.botToken as string | undefined;
            if (token) return token;
        } catch (err: any) {
            functions.logger.warn(`[TelegramAPI] Could not fetch tenant token for ${ctx.userId}/${ctx.entityId}: ${err.message}`);
        }
    }

    if (TELEGRAM_BOT_TOKEN_ENV) return TELEGRAM_BOT_TOKEN_ENV;

    throw new Error('Telegram Bot Token is not configured (no tenant token and no env var).');
}

// Generic function to make requests to Telegram API
async function callTelegramApi(method: string, data: object, ctx?: TelegramCtx): Promise<any> {
    const token = await resolveBotToken(ctx);
    const url = `https://api.telegram.org/bot${token}/${method}`;

    try {
        const response = await axios.post(url, data);
        return response.data;
    } catch (error: any) {
        const errorData = error.response?.data || error.message;
        functions.logger.error(`Telegram API Error (${method}):`, errorData);
        throw new Error(`Telegram API Error: ${JSON.stringify(errorData)}`);
    }
}

/**
 * Sends a text message to a user via Telegram.
 */
export async function sendTelegramMessage(chatId: string, text: string, ctx?: TelegramCtx): Promise<any> {
    if (!text) return;
    return await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: text
    }, ctx);
}

/**
 * Sends a photo to a user.
 */
export async function sendTelegramPhoto(chatId: string, photoUrl: string, caption?: string, ctx?: TelegramCtx): Promise<any> {
    return await callTelegramApi('sendPhoto', {
        chat_id: chatId,
        photo: photoUrl,
        caption: caption
    }, ctx);
}

/**
 * Sends a generic document/video/audio.
 */
export async function sendTelegramMedia(chatId: string, mediaUrl: string, type: 'video' | 'audio' | 'document', caption?: string, ctx?: TelegramCtx): Promise<any> {
    const method = type === 'video' ? 'sendVideo' : type === 'audio' ? 'sendAudio' : 'sendDocument';
    const payload: any = {
        chat_id: chatId,
        caption: caption
    };
    payload[type] = mediaUrl;
    return await callTelegramApi(method, payload, ctx);
}

/**
 * Sends Buttons (Inline Keyboard).
 */
export async function sendTelegramButtons(chatId: string, text: string, buttons: { id: string, title: string }[], ctx?: TelegramCtx): Promise<any> {
    const inlineKeyboard = buttons.map(btn => ([{
        text: btn.title,
        callback_data: btn.id
    }]));

    return await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: text,
        reply_markup: {
            inline_keyboard: inlineKeyboard
        }
    }, ctx);
}

/**
 * Sends Location.
 */
export async function sendTelegramLocation(chatId: string, lat: number, long: number, ctx?: TelegramCtx): Promise<any> {
    return await callTelegramApi('sendLocation', {
        chat_id: chatId,
        latitude: lat,
        longitude: long
    }, ctx);
}

/**
 * For Telegram, "mark as read" is not directly supported via Bot API.
 */
export async function markTelegramMessageAsRead(_chatId: string): Promise<any> {
    return Promise.resolve();
}
