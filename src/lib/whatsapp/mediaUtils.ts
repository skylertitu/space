export type WhatsAppMediaKind = 'image' | 'video' | 'audio' | 'document';

/** Meta Cloud API size limits (bytes). */
export const WHATSAPP_MEDIA_LIMITS: Record<WhatsAppMediaKind, number> = {
    image: 5 * 1024 * 1024,
    video: 16 * 1024 * 1024,
    audio: 16 * 1024 * 1024,
    document: 100 * 1024 * 1024,
};

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp)$/i;
const VIDEO_EXT = /\.(mp4|3gp|mov|avi|webm|mkv)$/i;
const AUDIO_EXT = /\.(mp3|aac|ogg|wav|m4a|opus|amr|webm)$/i;
const DOC_EXT = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|zip|rar)$/i;

export function detectWhatsAppMediaType(input: {
    explicit?: string | null;
    url?: string | null;
    filename?: string | null;
    mimeType?: string | null;
}): WhatsAppMediaKind {
    const explicit = (input.explicit || '').toLowerCase();
    if (['image', 'video', 'audio', 'document'].includes(explicit)) {
        return explicit as WhatsAppMediaKind;
    }

    const mime = (input.mimeType || '').toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime === 'application/pdf' || mime.includes('document') || mime.includes('sheet')) return 'document';

    const probe = `${input.filename || ''} ${(input.url || '').split('?')[0]}`.toLowerCase();

    if (IMAGE_EXT.test(probe)) return 'image';
    if (VIDEO_EXT.test(probe)) return 'video';
    if (AUDIO_EXT.test(probe)) return 'audio';
    if (DOC_EXT.test(probe)) return 'document';

    return 'document';
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateMediaSize(kind: WhatsAppMediaKind, sizeBytes: number): string | null {
    const max = WHATSAPP_MEDIA_LIMITS[kind];
    if (sizeBytes > max) {
        return `El archivo supera el límite de WhatsApp para ${kind} (${formatBytes(max)}).`;
    }
    return null;
}
