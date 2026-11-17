import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

export interface TenantContext {
    userId: string;
    entityId: string;
}

/**
 * TENANT RESOLVER (Robust & Master Mold Compliant)
 * Maps platform-specific identifiers to { userId, entityId }
 * 
 * Strategy:
 * 1. Search in modern 'integrations' vault (Collection Group).
 * 2. Fallback to legacy 'system_mappings' if index not ready or not found.
 */
export async function resolveTenant(platform: string, platformId: string | number, secondaryId?: string | number): Promise<TenantContext | null> {
    const db = admin.firestore();
    // 0. MAP FIELD NAMES ACCORDING TO PLATFORM (Master Mold Agnostic Search)
    let fieldName = 'id';
    if (platform === 'whatsapp') fieldName = 'phoneNumberId';
    else if (platform === 'instagram') fieldName = 'instagramId';
    else if (platform === 'messenger') fieldName = 'pageId';
    else if (platform === 'telegram') fieldName = 'secretToken'; // secretToken = webhook verification header
    else if (platform === 'x_twitter') fieldName = 'twitterHandle';
    else if (platform === 'webchat') fieldName = 'widgetId';

    // 1. MODERN VAULT SEARCH (Preferred)
    try {
        let integrationsSnap = await db.collectionGroup("integrations")
            .where(fieldName, "==", platformId)
            .limit(1)
            .get();

        if (integrationsSnap.empty && !isNaN(Number(platformId))) {
            integrationsSnap = await db.collectionGroup("integrations")
                .where(fieldName, "==", Number(platformId))
                .limit(1)
                .get();
        }

        // Secondary search (WABA ID for WhatsApp)
        if (integrationsSnap.empty && platform === 'whatsapp' && secondaryId) {
            integrationsSnap = await db.collectionGroup("integrations")
                .where("wabaId", "==", secondaryId)
                .limit(1)
                .get();
        }

        // Secondary search: Telegram botToken fallback (legacy integrations stored token, not secretToken)
        if (integrationsSnap.empty && platform === 'telegram') {
            integrationsSnap = await db.collectionGroup("integrations")
                .where("botToken", "==", platformId)
                .limit(1)
                .get();
        }

        if (!integrationsSnap.empty) {
            const pathParts = integrationsSnap.docs[0].ref.path.split('/');
            const userId = pathParts[1];
            const entityId = pathParts[3];
            if (userId && entityId) {
                functions.logger.info(`[Tenant Resolver] ✅ Resolved via Vault: ${userId}/${entityId}`);
                return { userId, entityId };
            }
        }

        // Alternate field name used by some Meta setups
        if (platform === 'whatsapp') {
            for (const id of [platformId, Number(platformId)]) {
                if (id === undefined || (typeof id === 'number' && Number.isNaN(id))) continue;
                try {
                    const altSnap = await db.collectionGroup("integrations")
                        .where("phone_number_id", "==", id)
                        .limit(1)
                        .get();
                    if (!altSnap.empty) {
                        const pathParts = altSnap.docs[0].ref.path.split('/');
                        const userId = pathParts[1];
                        const entityId = pathParts[3];
                        if (userId && entityId) {
                            functions.logger.info(`[Tenant Resolver] ✅ Resolved via phone_number_id: ${userId}/${entityId}`);
                            return { userId, entityId };
                        }
                    }
                } catch (altErr: any) {
                    functions.logger.warn(`[Tenant Resolver] phone_number_id lookup skipped: ${altErr.message}`);
                }
            }
        }
    } catch (error: any) {
        functions.logger.warn(`[Tenant Resolver] ⚠️ Vault query skipped (index building?): ${error.message}`);
    }

    // 2. LEGACY GLOBAL MAPPING (WhatsApp phone_number_id → tenant)
    if (platform === 'whatsapp' && platformId) {
        try {
            const mappingRef = db.doc(`system_mappings/whatsapp_numbers/numbers/${platformId}`);
            const mappingDoc = await mappingRef.get();
            if (mappingDoc.exists) {
                const data = mappingDoc.data() as { userId?: string; entityId?: string };
                if (data?.userId && data?.entityId) {
                    functions.logger.info(`[Tenant Resolver] ✅ Resolved via system_mappings for ${platformId}`);
                    return { userId: data.userId, entityId: data.entityId };
                }
            }
        } catch (mapErr: any) {
            functions.logger.warn(`[Tenant Resolver] system_mappings lookup failed: ${mapErr.message}`);
        }
    }

    // 3. FINAL STATUS
    functions.logger.warn(`[Tenant Resolver] ❌ Final: UNRESOLVED for ${platform}:${platformId}`);
    return null;
}
