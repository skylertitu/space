import { extractWhatsAppInboundPayload } from '@/lib/whatsappInbound';
import { downloadAndStoreWhatsAppMedia } from '@/lib/whatsapp/downloadInboundMedia';

export async function buildInboundWhatsAppUserMessage(input: {
    message: any;
    userId: string;
    entityId: string;
    displayText: string;
    messageId: string;
}): Promise<Record<string, unknown>> {
    const payload = extractWhatsAppInboundPayload(input.message);
    const base: Record<string, unknown> = {
        sender: 'user',
        text: input.displayText,
        timestamp: new Date(),
        whatsappMessageId: input.messageId,
        platform: 'whatsapp',
        type: 'text',
    };

    if (payload.media?.mediaId) {
        try {
            const stored = await downloadAndStoreWhatsAppMedia({
                userId: input.userId,
                entityId: input.entityId,
                messageId: input.messageId,
                mediaId: payload.media.mediaId,
                mimeType: payload.media.mimeType,
                filename: payload.media.filename,
                mediaKind: payload.media.mediaKind,
            });
            return {
                ...base,
                type: 'media',
                text: payload.media.caption || input.displayText,
                fileUrl: stored.url,
                fileType: stored.mimeType,
                fileName: stored.filename,
                metadata: {
                    mediaKind: stored.mediaKind,
                    mediaId: payload.media.mediaId,
                },
            };
        } catch (err: any) {
            console.warn('[WhatsApp Inbound] Media download failed:', err?.message);
        }
    }

    if (payload.location) {
        const { latitude, longitude, name, address } = payload.location;
        const mapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
        return {
            ...base,
            type: 'location',
            text: name || address || input.displayText,
            metadata: { latitude, longitude, name, address, mapsUrl },
        };
    }

    if (payload.contacts?.length) {
        const c = payload.contacts[0] as any;
        const name = c?.name?.formatted_name || c?.name?.first_name || 'Contacto';
        return {
            ...base,
            type: 'contacts',
            text: name,
            metadata: { contacts: payload.contacts },
        };
    }

    if (payload.reaction) {
        return {
            ...base,
            type: 'reaction',
            text: payload.reaction.emoji,
            metadata: payload.reaction,
        };
    }

    return base;
}
