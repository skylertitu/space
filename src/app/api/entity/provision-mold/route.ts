import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { ensureEntityMoldUpToDateAdmin } from '@/lib/mold/entityMoldAdmin';
import { guardApi } from '@/lib/apiAuth';

/** Aplica / actualiza el molde multitenant CRM en una empresa. */
export async function POST(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;
    try {
        const body = await req.json();
        const { userId, entityId } = body || {};

        if (!userId || !entityId) {
            return NextResponse.json(
                { error: 'userId y entityId son requeridos' },
                { status: 400 }
            );
        }

        await ensureEntityMoldUpToDateAdmin(db, userId, entityId);

        const entitySnap = await db.doc(`users/${userId}/entities/${entityId}`).get();

        return NextResponse.json({
            success: true,
            entityId,
            moldVersion: entitySnap.data()?.moldVersion ?? null,
            features: entitySnap.data()?.features ?? null,
        });
    } catch (error: any) {
        console.error('[provision-mold]', error);
        return NextResponse.json(
            { error: error?.message || 'Error al aprovisionar molde' },
            { status: 500 }
        );
    }
}
