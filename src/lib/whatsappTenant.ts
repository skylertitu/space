import { db, admin } from '@/lib/firebase-admin';
import { getClaim, claimInBackground, claimsRequired } from '@/lib/integrationClaims';

export interface WhatsAppTenantContext {
    userId: string;
    entityId: string;
}

/** Digits-only WhatsApp sender id (Meta `message.from`). */
export function cleanWhatsAppSenderId(from: string): string {
    return String(from || '').replace(/\D/g, '');
}

/** Phone values used in CRM `contacts.phone` (with/without +). */
export function phoneLookupVariants(cleanFrom: string): string[] {
    if (!cleanFrom) return [];
    const variants = new Set<string>([`+${cleanFrom}`, cleanFrom]);
    return Array.from(variants);
}

function parseTenantFromIntegrationPath(path: string): WhatsAppTenantContext | null {
    const parts = path.split('/');
    const uIdx = parts.indexOf('users');
    const eIdx = parts.indexOf('entities');
    if (uIdx === -1 || eIdx === -1) return null;
    const userId = parts[uIdx + 1];
    const entityId = parts[eIdx + 1];
    if (!userId || !entityId) return null;
    return { userId, entityId };
}

/**
 * Busca el tenant dueño de un phone_number_id. Anti-secuestro: un cliente puede escribir cualquier id
 * en su propia integración, así que si el mismo número lo reclaman usuarios DISTINTOS el resultado es
 * ambiguo y no se entrega a nadie (nunca "el primero que aparezca").
 */
async function queryIntegrationsByPhoneId(phoneId: string | number): Promise<WhatsAppTenantContext | null> {
    const candidates: Array<string | number> = [String(phoneId)];
    const numeric = Number(phoneId);
    if (!Number.isNaN(numeric)) candidates.push(numeric);

    const lookups: Array<Promise<FirebaseFirestore.QuerySnapshot | null>> = [];
    for (const id of candidates) {
        for (const [group, field] of [
            ['integrations', 'phoneNumberId'],
            ['integrations', 'phone_number_id'],
            ['whatsapp_numbers', 'phoneNumberId'],
        ] as const) {
            lookups.push(
                db.collectionGroup(group).where(field, '==', id).limit(5).get().catch((e) => {
                    console.warn(`[WhatsApp Tenant] ${group}.${field} lookup failed:`, e);
                    return null;
                })
            );
        }
    }

    const tenants = new Map<string, WhatsAppTenantContext>();
    for (const snap of await Promise.all(lookups)) {
        for (const doc of snap?.docs || []) {
            const parsed = parseTenantFromIntegrationPath(doc.ref.path);
            if (parsed && !tenants.has(`${parsed.userId}/${parsed.entityId}`)) tenants.set(`${parsed.userId}/${parsed.entityId}`, parsed);
        }
    }

    const found = Array.from(tenants.values());
    if (new Set(found.map((t) => t.userId)).size > 1) {
        console.error(`[WhatsApp Tenant] CONFLICTO: phone_number_id ${phoneId} reclamado por varios usuarios; no se entrega.`);
        return null;
    }
    return found[0] || null;
}

/** Persists a global fallback map used when collectionGroup lookup is unavailable. */
export async function registerWhatsAppTenantMapping(
    phoneNumberId: string,
    userId: string,
    entityId: string
): Promise<void> {
    if (!phoneNumberId || !userId || !entityId) return;
    const payload = {
        userId,
        entityId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const ids = new Set<string>([String(phoneNumberId)]);
    const numeric = Number(phoneNumberId);
    if (!Number.isNaN(numeric)) ids.add(String(numeric));

    await Promise.all(
        Array.from(ids).map((id) =>
            db.doc(`system_mappings/whatsapp_numbers/numbers/${id}`).set(payload, { merge: true })
        )
    );
}

/**
 * Resolves { userId, entityId } for an inbound WhatsApp Cloud API webhook.
 */
export async function resolveWhatsAppTenant(
    recipientPhoneNumberId: string | undefined,
    urlUserId?: string | null,
    urlEntityId?: string | null
): Promise<WhatsAppTenantContext | null> {
    if (urlUserId && urlEntityId) {
        return { userId: urlUserId, entityId: urlEntityId };
    }

    if (!recipientPhoneNumberId) return null;

    // Reclamo verificado por el servidor (ver integrationClaims.ts): manda sobre cualquier campo escrito por clientes.
    const claimed = await getClaim('whatsapp', recipientPhoneNumberId);
    if (claimed) return claimed;
    if (claimsRequired()) {
        console.warn(`[WhatsApp Tenant] ${recipientPhoneNumberId} sin reclamo verificado (INTEGRATION_CLAIMS_MODE=require)`);
        return null;
    }

    const fromIntegrations = await queryIntegrationsByPhoneId(recipientPhoneNumberId);
    if (fromIntegrations) {
        claimInBackground('whatsapp', fromIntegrations);
        // Self-heal: cache the mapping so future lookups are fast and index-independent.
        registerWhatsAppTenantMapping(
            recipientPhoneNumberId,
            fromIntegrations.userId,
            fromIntegrations.entityId
        ).catch(() => {});
        return fromIntegrations;
    }

    try {
        const mappingRef = db.doc(
            `system_mappings/whatsapp_numbers/numbers/${recipientPhoneNumberId}`
        );
        const mappingDoc = await mappingRef.get();
        if (mappingDoc.exists) {
            const legacy = mappingDoc.data() as { userId?: string; entityId?: string };
            if (legacy?.userId && legacy?.entityId) {
                return { userId: legacy.userId, entityId: legacy.entityId };
            }
        }
    } catch (e) {
        console.warn('[WhatsApp Tenant] system_mappings lookup failed:', e);
    }

    return null;
}
