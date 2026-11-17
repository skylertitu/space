import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import {
    ensureEntityMoldUpToDateAdmin,
    provisionEntityMoldAdmin,
} from '@/lib/mold/entityMoldAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Migración global del molde: barre TODOS los usuarios y TODAS sus entidades y
 * aplica la última versión del molde en el servidor, sin requerir que el cliente
 * inicie sesión. Se dispara desde el admin cada vez que se actualiza el molde.
 *
 * Protegido con MOLD_MIGRATION_SECRET (header `x-migration-secret` o body.secret).
 * Body opcional: { force?: boolean } — si true, re-aplica el molde aunque la
 * entidad ya esté en la versión actual (útil para cambios sin subir versión).
 */
export async function POST(req: Request) {
    const secret = process.env.MOLD_MIGRATION_SECRET;
    if (!secret) {
        return NextResponse.json(
            { error: 'MOLD_MIGRATION_SECRET no está configurado en el servidor.' },
            { status: 500 }
        );
    }

    let body: any = {};
    try {
        body = await req.json();
    } catch {
        body = {};
    }

    const provided = req.headers.get('x-migration-secret') || body?.secret;
    if (provided !== secret) {
        return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    }

    const force = body?.force === true;

    const summary = {
        users: 0,
        entities: 0,
        migrated: 0,
        skipped: 0,
        errors: [] as { path: string; error: string }[],
    };

    try {
        const usersSnap = await db.collection('users').get();
        summary.users = usersSnap.size;

        for (const userDoc of usersSnap.docs) {
            const userId = userDoc.id;
            const entitiesSnap = await db.collection(`users/${userId}/entities`).get();

            for (const entityDoc of entitiesSnap.docs) {
                const entityId = entityDoc.id;
                summary.entities += 1;
                try {
                    if (force) {
                        await provisionEntityMoldAdmin(db, userId, entityId);
                        summary.migrated += 1;
                    } else {
                        const before = entityDoc.data()?.moldVersion ?? 0;
                        await ensureEntityMoldUpToDateAdmin(db, userId, entityId);
                        // ensureUpToDate is a no-op when already current.
                        const after = (await db.doc(`users/${userId}/entities/${entityId}`).get()).data()?.moldVersion ?? 0;
                        if (after > before) summary.migrated += 1;
                        else summary.skipped += 1;
                    }
                } catch (err: any) {
                    summary.errors.push({
                        path: `users/${userId}/entities/${entityId}`,
                        error: err?.message || String(err),
                    });
                }
            }
        }

        return NextResponse.json({ success: true, ...summary });
    } catch (error: any) {
        console.error('[migrate-mold]', error);
        return NextResponse.json(
            { error: error?.message || 'Error en la migración global del molde', ...summary },
            { status: 500 }
        );
    }
}
