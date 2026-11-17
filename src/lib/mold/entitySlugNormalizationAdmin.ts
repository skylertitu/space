/**
 * Entity route slug mold helpers (Firebase Admin SDK).
 */
import * as admin from 'firebase-admin';
import { slugifyEntityName, validateEntitySlug } from '@/lib/entitySlug';
import {
    ENTITY_ROUTE_CONTRACT_VERSION,
    isSlugOwnedByOtherEntity,
} from './entityRouteContract';

type AdminDb = admin.firestore.Firestore;

async function isSlugAvailableAdmin(
    db: AdminDb,
    userId: string,
    slug: string,
    entityId: string
): Promise<boolean> {
    const snap = await db.doc(`users/${userId}/entity_slugs/${slug}`).get();
    if (!snap.exists) return true;
    return snap.data()?.entityId === entityId;
}

async function generateUniqueEntitySlugAdmin(
    db: AdminDb,
    userId: string,
    name: string,
    entityId: string
): Promise<string> {
    const base = slugifyEntityName(name) || 'entidad';
    let candidate = base;
    let attempt = 0;
    while (attempt < 20) {
        const validation = validateEntitySlug(candidate);
        if (validation.valid && (await isSlugAvailableAdmin(db, userId, candidate, entityId))) {
            return candidate;
        }
        attempt += 1;
        candidate = `${base}-${attempt}`.slice(0, 32);
    }
    return `${base.slice(0, 24)}-${entityId.slice(-4)}`.slice(0, 32);
}

async function isGhostEntityDocAdmin(
    db: AdminDb,
    userId: string,
    entityId: string
): Promise<boolean> {
    const indexSnap = await db.doc(`users/${userId}/entity_slugs/${entityId.toLowerCase()}`).get();
    if (!indexSnap.exists) return false;
    return isSlugOwnedByOtherEntity(entityId, indexSnap.data()?.entityId as string);
}

export async function ensureEntitySlugNormalizationAdmin(
    db: AdminDb,
    userId: string,
    entityId: string
): Promise<void> {
    const entityRef = db.doc(`users/${userId}/entities/${entityId}`);
    const snap = await entityRef.get();
    if (!snap.exists) return;

    const data = snap.data() || {};
    if (!data.initialized && !data.name) return;
    if (await isGhostEntityDocAdmin(db, userId, entityId)) return;

    const existingSlug = String(data.slug || '').trim().toLowerCase();

    if (existingSlug) {
        await db.doc(`users/${userId}/entity_slugs/${existingSlug}`).set(
            {
                entityId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
        );
        await entityRef.set(
            {
                routeContractVersion: ENTITY_ROUTE_CONTRACT_VERSION,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
        );
        return;
    }

    const slug = await generateUniqueEntitySlugAdmin(
        db,
        userId,
        String(data.name || entityId),
        entityId
    );

    await entityRef.set(
        {
            slug,
            routeContractVersion: ENTITY_ROUTE_CONTRACT_VERSION,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
    );

    await db.doc(`users/${userId}/entity_slugs/${slug}`).set(
        {
            entityId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
    );
}
