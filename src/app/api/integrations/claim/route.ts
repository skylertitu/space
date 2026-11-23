import { NextResponse } from 'next/server';
import { guardApi } from '@/lib/apiAuth';
import { claimFromStoredIntegration, releaseClaim, type ClaimProvider } from '@/lib/integrationClaims';

export const dynamic = 'force-dynamic';

const PROVIDERS = new Set<ClaimProvider>(['messenger', 'instagram', 'whatsapp']);

/**
 * Reclama (tras verificar con Meta) el id externo de una integración ya guardada por el cliente.
 * Se llama justo después de conectar Messenger, Instagram o WhatsApp.
 */
export async function POST(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;
    try {
        const { provider, userId, entityId, slot, action, externalId } = await req.json();
        if (!PROVIDERS.has(provider) || !userId || !entityId) {
            return NextResponse.json({ ok: false, message: 'Parámetros inválidos.' }, { status: 400 });
        }
        if (action === 'release') {
            if (!externalId) {
                return NextResponse.json({ ok: false, message: 'Falta el id a soltar.' }, { status: 400 });
            }
            await releaseClaim(provider, String(externalId), { userId, entityId });
            return NextResponse.json({ ok: true });
        }
        const result = await claimFromStoredIntegration(provider, { userId, entityId }, slot);
        if (result.ok) return NextResponse.json({ ok: true });
        const status = result.reason === 'conflict' ? 409 : result.reason === 'not_owner' ? 403 : 400;
        return NextResponse.json({ ok: false, reason: result.reason, message: result.message }, { status });
    } catch (e: any) {
        console.error('[integrations/claim] error:', e?.message);
        return NextResponse.json({ ok: false, message: 'No se pudo verificar la integración.' }, { status: 500 });
    }
}
