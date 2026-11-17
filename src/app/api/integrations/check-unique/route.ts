import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { guardApi } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

/** Campos de `integrations/*` que deben ser únicos entre tenants. */
const UNIQUE_FIELDS = new Set(['botToken', 'twitterHandle', 'pageId', 'instagramId']);

/**
 * ¿Este identificador externo (bot, página, cuenta) ya está vinculado a OTRO tenant?
 * Reemplaza las consultas collectionGroup que antes se hacían desde el navegador:
 * solo devuelve un booleano, nunca datos de otros clientes.
 */
export async function POST(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;

    try {
        const { userId, entityId, field, value } = await req.json();
        if (!userId || !entityId || !UNIQUE_FIELDS.has(field) || typeof value !== 'string' || !value.trim()) {
            return NextResponse.json({ error: 'Parámetros inválidos.' }, { status: 400 });
        }

        const ownPrefix = `users/${userId}/entities/${entityId}/`;
        const snap = await db.collectionGroup('integrations').where(field, '==', value.trim()).get();
        const usedByAnotherTenant = snap.docs.some((d) => !d.ref.path.startsWith(ownPrefix));

        return NextResponse.json({ usedByAnotherTenant });
    } catch (error: any) {
        console.error('[check-unique] error:', error?.message);
        return NextResponse.json({ error: 'No se pudo verificar la integración.' }, { status: 500 });
    }
}
