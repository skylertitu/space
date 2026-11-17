import { NextResponse } from 'next/server';
import { guardApi } from '@/lib/apiAuth';
import { getEntityEntitlements, subscriptionsEnforced } from '@/lib/subscriptions/entitlements.server';

export const dynamic = 'force-dynamic';

/** Permisos de la entidad según su suscripción REAL (servidor). La interfaz solo los refleja. */
export async function GET(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const entityId = searchParams.get('entityId');
    if (!userId || !entityId) return NextResponse.json({ error: 'Faltan userId o entityId.' }, { status: 400 });

    try {
        const entitlements = await getEntityEntitlements(userId, entityId);
        return NextResponse.json({ ...entitlements, enforced: subscriptionsEnforced() });
    } catch (e: any) {
        console.error('[subscriptions/entitlements] error:', e?.message);
        return NextResponse.json({ error: 'No se pudieron calcular los permisos.' }, { status: 500 });
    }
}
