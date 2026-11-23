import axios from 'axios';
import { db, admin } from '@/lib/firebase-admin';

/**
 * Registro de reclamos de identificadores externos (página de Facebook, cuenta de Instagram, número de WhatsApp).
 *
 * Problema: un cliente puede escribir CUALQUIER pageId/phoneNumberId en su propia integración (las reglas le dejan
 * escribir en `users/{uid}/**`). Si los webhooks confiaran en esos campos, podría desviar mensajes ajenos.
 *
 * Solución: `integration_claims/{provider}__{externalId}` lo escribe SOLO el servidor (Admin SDK; las reglas lo
 * deniegan al navegador) y SOLO tras comprobar con Graph que el token de ese cliente controla el id.
 * Los webhooks resuelven el tenant por este registro. Solo guarda {userId, entityId}: sin datos del cliente.
 *
 * INTEGRATION_CLAIMS_MODE: 'allow' (defecto) acepta además integraciones sin reclamo verificado (con guarda de
 * ambigüedad y verificación diferida); 'require' ignora todo id sin reclamo verificado.
 */
export type ClaimProvider = 'messenger' | 'instagram' | 'whatsapp';

export interface ClaimTenant { userId: string; entityId: string }

const GRAPH = 'https://graph.facebook.com/v21.0';

export const claimsRequired = () => (process.env.INTEGRATION_CLAIMS_MODE || 'allow').trim().toLowerCase() === 'require';
const claimRef = (provider: ClaimProvider, externalId: string) =>
    db.doc(`integration_claims/${provider}__${String(externalId).trim()}`);

export async function getClaim(provider: ClaimProvider, externalId: string | number): Promise<ClaimTenant | null> {
    const snap = await claimRef(provider, String(externalId)).get();
    const d = snap.data();
    return d?.userId && d?.entityId ? { userId: d.userId, entityId: d.entityId } : null;
}

/** ¿Este token controla realmente ese id? Lo responde Meta, no el cliente. */
export async function verifyOwnershipWithMeta(provider: ClaimProvider, externalId: string, accessToken: string): Promise<boolean> {
    try {
        const fields = provider === 'whatsapp' ? 'id,display_phone_number' : provider === 'instagram' ? 'id,username' : 'id,name';
        const res = await axios.get(`${GRAPH}/${encodeURIComponent(externalId)}`, { params: { fields, access_token: accessToken } });
        return String(res.data?.id) === String(externalId);
    } catch {
        return false;
    }
}

export type ClaimResult =
    | { ok: true }
    | { ok: false; reason: 'not_owner' | 'conflict' | 'missing_data'; message: string };

/** Qué campos de `integrations/{provider}` contienen el id y el token. */
const FIELDS: Record<ClaimProvider, { id: string[]; token: string[]; docId: string }> = {
    messenger: { id: ['pageId'], token: ['accessToken', 'pageAccessToken'], docId: 'messenger' },
    instagram: { id: ['instagramId'], token: ['accessToken', 'pageAccessToken'], docId: 'instagram' },
    whatsapp: { id: ['phoneNumberId', 'phone_number_id'], token: ['accessToken', 'token', 'access_token'], docId: 'whatsapp' },
};
const pick = (data: Record<string, any> | undefined, keys: string[]) => {
    for (const k of keys) if (data?.[k]) return String(data[k]).trim();
    return '';
};

const WHATSAPP_SLOTS = new Set(['general', 'support', 'broadcast']);

/** ¿La integración de ese tenant sigue conectada con ese id? (para decidir si un reclamo anterior sigue vigente) */
async function claimStillHeld(provider: ClaimProvider, externalId: string, owner: ClaimTenant): Promise<boolean> {
    const f = FIELDS[provider];
    const snap = await db.doc(`users/${owner.userId}/entities/${owner.entityId}/integrations/${f.docId}`).get();
    const d = snap.data();
    if (snap.exists && d?.status === 'Connected' && pick(d, f.id) === externalId) return true;
    if (provider !== 'whatsapp') return false;
    const numbers = await db.collection(`users/${owner.userId}/entities/${owner.entityId}/whatsapp_numbers`).get();
    return numbers.docs.some((doc) => {
        const data = doc.data();
        return data?.status === 'Connected' && pick(data, f.id) === externalId;
    });
}

async function readWhatsAppSource(tenant: ClaimTenant, slot?: string): Promise<Record<string, any> | undefined> {
    if (slot && WHATSAPP_SLOTS.has(slot) && slot !== 'general') {
        const slotSnap = await db.doc(`users/${tenant.userId}/entities/${tenant.entityId}/whatsapp_numbers/${slot}`).get();
        return slotSnap.data();
    }
    const snap = await db.doc(`users/${tenant.userId}/entities/${tenant.entityId}/integrations/whatsapp`).get();
    return snap.data();
}

/**
 * Verifica y registra el reclamo de una integración YA guardada por el cliente.
 * Lee id y token del documento (no del cuerpo de la petición) y los comprueba con Meta.
 */
export async function claimFromStoredIntegration(
    provider: ClaimProvider,
    tenant: ClaimTenant,
    slot?: string
): Promise<ClaimResult> {
    const f = FIELDS[provider];
    const data = provider === 'whatsapp'
        ? await readWhatsAppSource(tenant, slot)
        : (await db.doc(`users/${tenant.userId}/entities/${tenant.entityId}/integrations/${f.docId}`).get()).data();
    const externalId = pick(data, f.id);
    const token = pick(data, f.token);
    if (!externalId || !token) return { ok: false, reason: 'missing_data', message: 'Falta el id o el token de la integración.' };

    if (!(await verifyOwnershipWithMeta(provider, externalId, token))) {
        return { ok: false, reason: 'not_owner', message: 'Meta no confirma que este token controle ese id.' };
    }

    const ref = claimRef(provider, externalId);
    const existing = await getClaim(provider, externalId);
    if (existing && existing.userId !== tenant.userId && (await claimStillHeld(provider, externalId, existing))) {
        return { ok: false, reason: 'conflict', message: 'Este id ya está conectado a otra cuenta. Desconéctalo allí primero.' };
    }

    await ref.set({
        userId: tenant.userId,
        entityId: tenant.entityId,
        provider,
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    if (provider === 'whatsapp') {
        const { registerWhatsAppTenantMapping } = await import('@/lib/whatsappTenant');
        await registerWhatsAppTenantMapping(externalId, tenant.userId, tenant.entityId);
    }
    return { ok: true };
}

/** Suelta el reclamo solo si pertenece a esa entidad. El navegador no puede borrar integration_claims. */
export async function releaseClaim(provider: ClaimProvider, externalId: string, tenant: ClaimTenant): Promise<void> {
    const id = String(externalId || '').trim();
    if (!id) return;
    const existing = await getClaim(provider, id);
    if (!existing || existing.userId !== tenant.userId || existing.entityId !== tenant.entityId) return;
    await claimRef(provider, id).delete();
    if (provider === 'whatsapp') {
        await db.doc(`system_mappings/whatsapp_numbers/numbers/${id}`).delete().catch(() => {});
    }
}

/** Verificación diferida para integraciones antiguas: si Meta confirma, se registra el reclamo (sin intervención del cliente). */
export function claimInBackground(provider: ClaimProvider, tenant: ClaimTenant): void {
    claimFromStoredIntegration(provider, tenant).then(
        (r) => { if (!r.ok) console.warn(`[claims] ${provider} ${tenant.userId}/${tenant.entityId} no reclamado: ${r.reason}`); },
        (e) => console.warn('[claims] error en verificación diferida:', e?.message)
    );
}
