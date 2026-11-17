import axios from 'axios';
import { detectWhatsAppMediaType, type WhatsAppMediaKind } from './mediaUtils';
import { resolveTenantWhatsAppCredentials } from './resolveCredentials';

export interface UploadMediaToMetaInput {
    userId: string;
    entityId: string;
    /** Public URL to download the file from (Firebase Storage, etc.). */
    fileUrl: string;
    mediaType?: WhatsAppMediaKind;
    filename?: string;
    mimeType?: string;
}

/**
 * Downloads a file and uploads it to Meta's `/{phone_number_id}/media` endpoint.
 * Returns the reusable media_id for outbound messages.
 */
export async function uploadWhatsAppMediaToMeta(input: UploadMediaToMetaInput): Promise<string> {
    const creds = await resolveTenantWhatsAppCredentials(input.userId, input.entityId);
    if (!creds) {
        throw new Error('Configuración de WhatsApp incompleta para esta entidad.');
    }

    const mediaType =
        input.mediaType ||
        detectWhatsAppMediaType({
            url: input.fileUrl,
            filename: input.filename,
            mimeType: input.mimeType,
        });

    const fileResponse = await axios.get(input.fileUrl, {
        responseType: 'arraybuffer',
        timeout: 120_000,
        maxContentLength: 100 * 1024 * 1024,
    });

    const contentType =
        input.mimeType ||
        (typeof fileResponse.headers['content-type'] === 'string'
            ? fileResponse.headers['content-type']
            : 'application/octet-stream');

    const buffer = Buffer.from(fileResponse.data);
    const formData = new FormData();
    const blob = new Blob([buffer], { type: contentType });
    const uploadName = input.filename || `media_${Date.now()}`;
    formData.append('file', blob, uploadName);
    formData.append('type', mediaType);
    formData.append('messaging_product', 'whatsapp');

    const uploadUrl = `https://graph.facebook.com/v19.0/${creds.phoneNumberId}/media`;
    const response = await axios.post(uploadUrl, formData, {
        headers: {
            Authorization: `Bearer ${creds.token}`,
        },
        timeout: 120_000,
    });

    const mediaId = response.data?.id;
    if (!mediaId) {
        throw new Error('Meta no devolvió media_id.');
    }
    return String(mediaId);
}
