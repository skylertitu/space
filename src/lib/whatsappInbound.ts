import type { WhatsAppMediaKind } from '@/lib/whatsapp/mediaUtils';

export interface WhatsAppInboundMedia {
    mediaId: string;
    mimeType?: string;
    filename?: string;
    caption?: string;
    mediaKind: WhatsAppMediaKind | 'sticker';
}

export interface WhatsAppInboundLocation {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
}

export interface WhatsAppInboundPayload {
    text: string;
    shouldProcess: boolean;
    media?: WhatsAppInboundMedia;
    location?: WhatsAppInboundLocation;
    contacts?: unknown[];
    reaction?: { emoji: string; messageId: string };
}

function mediaFromMessage(message: any): WhatsAppInboundMedia | undefined {
    const type = message?.type;
    if (!type) return undefined;

    if (type === 'image') {
        return {
            mediaId: message.image?.id,
            mimeType: message.image?.mime_type,
            caption: message.image?.caption,
            mediaKind: 'image',
        };
    }
    if (type === 'video') {
        return {
            mediaId: message.video?.id,
            mimeType: message.video?.mime_type,
            caption: message.video?.caption,
            mediaKind: 'video',
        };
    }
    if (type === 'audio' || type === 'voice') {
        return {
            mediaId: message.audio?.id,
            mimeType: message.audio?.mime_type,
            mediaKind: 'audio',
        };
    }
    if (type === 'document') {
        return {
            mediaId: message.document?.id,
            mimeType: message.document?.mime_type,
            filename: message.document?.filename,
            caption: message.document?.caption,
            mediaKind: 'document',
        };
    }
    if (type === 'sticker') {
        return {
            mediaId: message.sticker?.id,
            mimeType: message.sticker?.mime_type,
            mediaKind: 'sticker',
        };
    }
    return undefined;
}

/**
 * Extracts user-visible text and structured payload from an inbound WhatsApp message.
 */
export function extractWhatsAppInboundPayload(message: any): WhatsAppInboundPayload {
    if (!message) return { text: '', shouldProcess: false };

    let text = message.text?.body || '';

    if (message.type === 'interactive') {
        const interactive = message.interactive;
        text =
            interactive?.button_reply?.id ||
            interactive?.list_reply?.id ||
            interactive?.button_reply?.title ||
            interactive?.list_reply?.title ||
            '';
    } else if (message.type === 'button') {
        text = message.button?.payload || message.button?.text || '';
    } else if (message.type === 'image' || message.type === 'document' || message.type === 'video') {
        text = message[message.type]?.caption || `[Archivo ${message.type}]`;
    } else if (message.type === 'audio' || message.type === 'voice') {
        text = '[Audio]';
    } else if (message.type === 'sticker') {
        text = '[Sticker]';
    } else if (message.type === 'location') {
        text = message.location?.name || message.location?.address || '[Ubicación]';
    } else if (message.type === 'contacts') {
        text = '[Contacto compartido]';
    } else if (message.type === 'reaction') {
        text = message.reaction?.emoji || '[Reacción]';
    }

    const media = mediaFromMessage(message);
    const location =
        message.type === 'location' && message.location
            ? {
                  latitude: Number(message.location.latitude),
                  longitude: Number(message.location.longitude),
                  name: message.location.name,
                  address: message.location.address,
              }
            : undefined;

    const contacts = message.type === 'contacts' ? message.contacts : undefined;
    const reaction =
        message.type === 'reaction' && message.reaction
            ? { emoji: message.reaction.emoji, messageId: message.reaction.message_id }
            : undefined;

    const trimmed = String(text || '').trim();
    const shouldProcess =
        trimmed.length > 0 ||
        !!media?.mediaId ||
        !!location ||
        !!contacts?.length ||
        !!reaction ||
        ['image', 'document', 'video', 'audio', 'voice', 'sticker', 'interactive', 'button', 'location', 'contacts', 'reaction'].includes(
            message.type
        );

    return {
        text: trimmed || (shouldProcess ? `[${message.type || 'mensaje'}]` : ''),
        shouldProcess,
        media: media?.mediaId ? media : undefined,
        location,
        contacts,
        reaction,
    };
}

/** @deprecated Use extractWhatsAppInboundPayload */
export function extractWhatsAppInboundText(message: any): { text: string; shouldProcess: boolean } {
    const payload = extractWhatsAppInboundPayload(message);
    return { text: payload.text, shouldProcess: payload.shouldProcess };
}
