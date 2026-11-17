import { getPhoneDisplayInfo, PhoneDisplayInfo } from '@/lib/countryCodes';
import { normalizePhoneNumber } from '@/lib/phoneUtils';
import { resolveCardChannel } from '@/lib/omnichannel/resolveCardChannel';

const GENERIC_NAME_VALUES = new Set([
    'usuario',
    'user',
    'amigo',
    'skyler',
    'sin nombre',
    'desconocido',
    'estimado/a cliente',
    'estimado cliente',
    'estimada cliente',
]);

const NAME_FIELD_PRIORITY = ['nombre', 'name', 'firstName', 'firstname', 'first_name'];

const NON_PHONE_CHANNELS = new Set([
    'instagram',
    'instagram_comments',
    'messenger',
    'gmail',
    'x',
    'tiktok',
    'snapchat',
]);

function isValidCapturedName(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (trimmed.length < 2) return false;
    return !GENERIC_NAME_VALUES.has(trimmed.toLowerCase());
}

/** WhatsApp / platform profile name shown on the card by default. */
export function getWhatsAppDisplayName(card: Record<string, any> | null | undefined): string {
    if (!card) return 'Desconocido';

    const raw = card.contactName?.trim();
    const phone = String(card.contactNumber || card.contactNumberClean || '').trim();

    if (!raw) return phone || 'Desconocido';

    const cleanRaw = raw.replace(/\D/g, '');
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanRaw && cleanPhone && cleanRaw === cleanPhone) {
        return phone || 'Desconocido';
    }

    return raw;
}

/**
 * Name captured during bot conversation (stored in customFields).
 * Read-only — does not mutate card data or bot state.
 */
export function getBotCapturedName(card: Record<string, any> | null | undefined): string | null {
    if (!card) return null;

    const customFields = card.customFields || {};

    for (const key of NAME_FIELD_PRIORITY) {
        const value = customFields[key];
        if (isValidCapturedName(value)) return value.trim();
    }

    const firstLast = [card.firstName, card.lastName]
        .filter((part) => typeof part === 'string' && part.trim())
        .join(' ')
        .trim();

    if (isValidCapturedName(firstLast)) return firstLast;

    for (const [key, value] of Object.entries(customFields)) {
        if (!isValidCapturedName(value)) continue;
        const normalizedKey = key.toLowerCase();
        if (/nombre|name|persona|user|cli/i.test(normalizedKey)) {
            return value.trim();
        }
    }

    return null;
}

export function getContactHeaderNames(card: Record<string, any> | null | undefined): {
    whatsappName: string;
    botName: string | null;
} {
    const whatsappName = getWhatsAppDisplayName(card);
    const botName = getBotCapturedName(card);

    return { whatsappName, botName };
}

/** Phone + country flag for a card (WhatsApp / phone channels only). */
export function getContactPhoneDisplay(card: Record<string, any> | null | undefined): PhoneDisplayInfo | null {
    if (!card) return null;

    const channel = resolveCardChannel(card);
    if (NON_PHONE_CHANNELS.has(channel)) return null;

    const rawPhone = card.contactNumber || card.contactNumberClean || card.phone;
    if (!rawPhone) return null;

    return getPhoneDisplayInfo(normalizePhoneNumber(String(rawPhone)));
}
