import { NextResponse } from 'next/server';
import { uploadWhatsAppMediaToMeta } from '@/lib/whatsapp/mediaUpload';
import { detectWhatsAppMediaType } from '@/lib/whatsapp/mediaUtils';
import { guardApi } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Registers a public file URL with Meta WhatsApp Cloud API and returns media_id.
 * Used by the bot editor to pre-upload voice notes / large files for reliable delivery.
 */
export async function POST(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;
    try {
        const body = await req.json();
        const { userId, entityId, fileUrl, mediaType, filename, mimeType } = body || {};

        if (!userId || !entityId || !fileUrl) {
            return NextResponse.json(
                { error: 'userId, entityId y fileUrl son requeridos.' },
                { status: 400 }
            );
        }

        const resolvedType = detectWhatsAppMediaType({
            explicit: mediaType,
            url: fileUrl,
            filename,
            mimeType,
        });

        const mediaId = await uploadWhatsAppMediaToMeta({
            userId,
            entityId,
            fileUrl,
            mediaType: resolvedType,
            filename,
            mimeType,
        });

        return NextResponse.json({
            success: true,
            mediaId,
            mediaType: resolvedType,
        });
    } catch (error: any) {
        console.error('[upload-media]', error);
        return NextResponse.json(
            { error: error?.message || 'No se pudo subir el archivo a Meta.' },
            { status: 500 }
        );
    }
}
