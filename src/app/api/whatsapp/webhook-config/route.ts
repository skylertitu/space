import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { guardApi } from '@/lib/apiAuth';

const DEFAULT_VERIFY_TOKEN = process.env.kamban_VERIFY_TOKEN || 'vg37e';

/**
 * Returns the exact Callback URL and Verify Token to paste in Meta Developer Console.
 */
export async function GET(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;
    try {
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');
        const entityId = searchParams.get('entityId');
        const origin = searchParams.get('origin') || 'https://www.itsroosevelt.com';

        if (!userId || !entityId) {
            return NextResponse.json(
                { error: 'Faltan userId y entityId' },
                { status: 400 }
            );
        }

        if (userId.includes('TU_UID') || userId.length < 10) {
            return NextResponse.json(
                { error: 'userId inválido. Debes estar autenticado en Roosevelt.' },
                { status: 400 }
            );
        }

        const [publicSnap, internalSnap] = await Promise.all([
            db.doc(`users/${userId}/entities/${entityId}/integrations/whatsapp`).get(),
            db.doc(`users/${userId}/entities/${entityId}/integrations/whatsapp_internal`).get(),
        ]);

        const integration = publicSnap.data() || internalSnap.data() || {};
        const verifyToken =
            integration.verifyToken ||
            DEFAULT_VERIFY_TOKEN;

        const tenantWebhookUrl = `${origin.replace(/\/$/, '')}/api/whatsapp/webhook?u=${userId}&e=${entityId}`;
        const globalWebhookUrl = `${origin.replace(/\/$/, '')}/api/whatsapp/webhook`;

        return NextResponse.json({
            verifyToken,
            defaultVerifyToken: DEFAULT_VERIFY_TOKEN,
            tenantWebhookUrl,
            globalWebhookUrl,
            recommended: {
                callbackUrl: globalWebhookUrl,
                verifyToken: DEFAULT_VERIFY_TOKEN,
                note: 'Recomendado en Meta: URL en Vercel (bot + omnichannel). Firebase solo hace proxy de respaldo en us-west3.',
            },
            firebaseProxy: {
                callbackUrl: `https://us-west3-roosevelt-491004.cloudfunctions.net/whatsappWebhook`,
                note: 'Solo si Meta ya apunta a Cloud Functions. Reenvía automáticamente a Vercel.',
            },
            tenant: {
                callbackUrl: tenantWebhookUrl,
                verifyToken,
                note: 'Usa esta opción solo si guardaste un verifyToken personalizado en Integraciones.',
            },
            phoneNumberId: integration.phoneNumberId || null,
            status: integration.status || null,
        });
    } catch (error: any) {
        console.error('[webhook-config]', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;
    try {
        const { userId, entityId, verifyToken } = await req.json();
        if (!userId || !entityId || !verifyToken) {
            return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 });
        }

        const token = String(verifyToken).trim();
        if (token.length < 4 || token.length > 64) {
            return NextResponse.json({ error: 'Token debe tener entre 4 y 64 caracteres' }, { status: 400 });
        }

        const configRef = db.doc(`users/${userId}/entities/${entityId}/integrations/whatsapp`);
        const snap = await configRef.get();
        if (!snap.exists) {
            return NextResponse.json(
                { error: 'Primero conecta WhatsApp en Integraciones antes de guardar el token.' },
                { status: 400 }
            );
        }

        await configRef.set({ verifyToken: token, updatedAt: new Date() }, { merge: true });

        return NextResponse.json({ success: true, verifyToken: token });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
