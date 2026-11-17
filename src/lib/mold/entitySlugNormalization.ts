/**
 * Entity route slug mold helpers (client Firestore SDK).
 * Backfills `slug` + `entity_slugs` index for tenants created before slug URLs.
 *
 * Firestore doc id is always the real tenant id; slug is URL-only (editable by user).
 */
import { doc, getDoc, setDoc, serverTimestamp, type Firestore } from 'firebase/firestore';
import {
    claimEntitySlug,
    generateUniqueEntitySlug,
} from '@/lib/entitySlug';
import {
    ENTITY_ROUTE_CONTRACT_VERSION,
    isSlugOwnedByOtherEntity,
} from './entityRouteContract';

async function isGhostEntityDoc(
    db: Firestore,
    userId: string,
    entityId: string
): Promise<boolean> {
    const indexSnap = await getDoc(
        doc(db, `users/${userId}/entity_slugs/${entityId.toLowerCase()}`)
    );
    if (!indexSnap.exists()) return false;
    return isSlugOwnedByOtherEntity(entityId, indexSnap.data()?.entityId as string);
}

export async function ensureEntitySlugNormalization(
    db: Firestore,
    userId: string,
    entityId: string
): Promise<void> {
    const entityRef = doc(db, `users/${userId}/entities/${entityId}`);
    const snap = await getDoc(entityRef);
    if (!snap.exists()) return;

    const data = snap.data() || {};
    if (!data.initialized && !data.name) return;
    if (await isGhostEntityDoc(db, userId, entityId)) return;

    const existingSlug = String(data.slug || '').trim().toLowerCase();

    if (existingSlug) {
        await claimEntitySlug(userId, entityId, existingSlug);
        await setDoc(
            entityRef,
            {
                routeContractVersion: ENTITY_ROUTE_CONTRACT_VERSION,
                updatedAt: serverTimestamp(),
            },
            { merge: true }
        );
        return;
    }

    const slug = await generateUniqueEntitySlug(
        userId,
        String(data.name || entityId),
        entityId
    );

    await setDoc(
        entityRef,
        {
            slug,
            routeContractVersion: ENTITY_ROUTE_CONTRACT_VERSION,
            updatedAt: serverTimestamp(),
        },
        { merge: true }
    );
    await claimEntitySlug(userId, entityId, slug);
}
