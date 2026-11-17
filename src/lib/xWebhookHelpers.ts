import { admin, db } from '@/lib/firebase-admin';

export interface TwitterTenant {
    userId: string;
    entityId: string;
    entityPath: string;
    ourUserId: string;
}

/** Resolves Roosevelt tenant from X Account Activity payload. */
export async function resolveTwitterTenant(body: Record<string, any>): Promise<TwitterTenant | null> {
    const ourUserId = String(body.for_user_id || '');
    if (!ourUserId) return null;

    const integrationSnap = await db.collectionGroup('integrations')
        .where('provider', '==', 'x_twitter')
        .get();

    const matches: admin.firestore.DocumentReference[] = [];
    const screenName = body.user?.screen_name ? String(body.user.screen_name) : '';

    for (const doc of integrationSnap.docs) {
        const data = doc.data();
        // Exigir valores reales: `undefined === undefined` haría coincidir con cualquier tenant.
        const matchesId = !!data.twitterUserId && String(data.twitterUserId) === ourUserId;
        const matchesHandle = !!screenName && !!data.twitterHandle && String(data.twitterHandle) === screenName;
        if (matchesId || matchesHandle) matches.push(doc.ref);
    }

    // Anti-secuestro: varios usuarios reclamando la misma cuenta de X → ambiguo, no se entrega a nadie.
    if (new Set(matches.map((r) => r.path.split('/')[1])).size > 1) {
        console.error(`[X Tenant] CONFLICTO: cuenta ${ourUserId} reclamada por varios usuarios; no se entrega.`);
        return null;
    }
    const tenantRef = matches[0] || null;

    if (!tenantRef) return null;

    const pathParts = tenantRef.path.split('/');
    const userId = pathParts[pathParts.indexOf('users') + 1];
    const entityId = pathParts[pathParts.indexOf('entities') + 1];

    return {
        userId,
        entityId,
        entityPath: `users/${userId}/entities/${entityId}`,
        ourUserId,
    };
}
