import axios from 'axios';
import { randomUUID } from 'crypto';
import { admin } from '@/lib/firebase-admin';
import { resolveTenantWhatsAppCredentials } from './resolveCredentials';
import type { WhatsAppMediaKind } from './mediaUtils';

export interface StoredInboundMedia {
    url: string;
    mimeType: string;
    filename: string;
    mediaKind: WhatsAppMediaKind | 'sticker';
}

function storageBucketName(): string {
    return (
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
        process.env.FIREBASE_STORAGE_BUCKET ||
        `${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.appspot.com`
    );
}

function extensionForMime(mime: string, mediaKind: string): string {
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
    if (mime.includes('png')) return 'png';
    if (mime.includes('webp')) return 'webp';
    if (mime.includes('gif')) return 'gif';
    if (mime.includes('pdf')) return 'pdf';
    if (mime.includes('ogg')) return 'ogg';
    if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
    if (mime.includes('mp4')) return 'mp4';
    if (mime.includes('webm')) return 'webm';
    if (mediaKind === 'audio') return 'ogg';
    if (mediaKind === 'video') return 'mp4';
    if (mediaKind === 'image') return 'jpg';
    return 'bin';
}

/**
 * Downloads media from Meta Graph API and stores it in Firebase Storage.
 */
export async function downloadAndStoreWhatsAppMedia(input: {
    userId: string;
    entityId: string;
    messageId: string;
    mediaId: string;
    mimeType?: string;
    filename?: string;
    mediaKind: WhatsAppMediaKind | 'sticker';
}): Promise<StoredInboundMedia> {
    const creds = await resolveTenantWhatsAppCredentials(input.userId, input.entityId);
    if (!creds) throw new Error('WhatsApp credentials not found for tenant.');

    const metaRes = await axios.get(`https://graph.facebook.com/v19.0/${input.mediaId}`, {
        headers: { Authorization: `Bearer ${creds.token}` },
        timeout: 30_000,
    });

    const downloadUrl = metaRes.data?.url;
    const mimeType = input.mimeType || metaRes.data?.mime_type || 'application/octet-stream';
    if (!downloadUrl) throw new Error('Meta did not return a media download URL.');

    const fileRes = await axios.get(downloadUrl, {
        headers: { Authorization: `Bearer ${creds.token}` },
        responseType: 'arraybuffer',
        timeout: 120_000,
        maxContentLength: 100 * 1024 * 1024,
    });

    const ext = extensionForMime(mimeType, input.mediaKind);
    const filename = input.filename || `${input.mediaKind}_${input.messageId}.${ext}`;
    const storagePath = `whatsapp_inbound/${input.entityId}/${input.messageId}_${filename}`;
    const bucket = admin.storage().bucket(storageBucketName());
    const file = bucket.file(storagePath);
    const token = randomUUID();

    await file.save(Buffer.from(fileRes.data), {
        metadata: {
            contentType: mimeType,
            metadata: { firebaseStorageDownloadTokens: token },
        },
    });

    const downloadTokenUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;

    return {
        url: downloadTokenUrl,
        mimeType,
        filename,
        mediaKind: input.mediaKind,
    };
}
