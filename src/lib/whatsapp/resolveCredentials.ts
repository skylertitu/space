import { db } from '@/lib/firebase-admin';

export interface WhatsAppTenantCredentials {
    token: string;
    phoneNumberId: string;
}

function applySource(
    source: Record<string, unknown> | undefined,
    out: { token?: string; phoneNumberId?: string }
) {
    if (!source) return;
    const resolvedToken =
        source.accessToken || source.token || source.access_token || source.pageAccessToken;
    const resolvedPhone = source.phoneNumberId || source.phone_number_id || source.phoneId;
    if (typeof resolvedToken === 'string' && resolvedToken.startsWith('EAA')) {
        out.token = resolvedToken;
    }
    if (resolvedPhone) {
        out.phoneNumberId = String(resolvedPhone);
    }
}

/**
 * Resolves WhatsApp Cloud API credentials for a tenant entity.
 * Mirrors the resolution order in sendWhatsAppMessage.
 */
export async function resolveTenantWhatsAppCredentials(
    userId: string,
    entityId: string
): Promise<WhatsAppTenantCredentials | null> {
    const out: { token?: string; phoneNumberId?: string } = {};
    const entityPath = `users/${userId}/entities/${entityId}`;
    const integrationsRef = db.collection(`${entityPath}/integrations`);

    const [standardSnap, internalSnap, allIntegrationsSnap] = await Promise.all([
        integrationsRef.doc('whatsapp').get(),
        integrationsRef.doc('whatsapp_internal').get(),
        integrationsRef.get(),
    ]);

    applySource(standardSnap.data() as Record<string, unknown>, out);
    applySource(internalSnap.data() as Record<string, unknown>, out);

    if (!out.token || !out.phoneNumberId) {
        for (const doc of allIntegrationsSnap.docs) {
            if (doc.id === '_init') continue;
            applySource(doc.data() as Record<string, unknown>, out);
            if (out.token && out.phoneNumberId) break;
        }
    }

    if (!out.token || !out.phoneNumberId) {
        const allUsers = await db.collection('users').get();
        const match = allUsers.docs.find((u) => u.id.toLowerCase() === userId.toLowerCase());
        if (match && match.id !== userId) {
            const altSnap = await db
                .collection(`users/${match.id}/entities/${entityId}/integrations`)
                .get();
            for (const doc of altSnap.docs) {
                if (doc.id === '_init') continue;
                applySource(doc.data() as Record<string, unknown>, out);
            }
        }
    }

    if (!out.token || !out.phoneNumberId) return null;
    return { token: out.token, phoneNumberId: out.phoneNumberId };
}
