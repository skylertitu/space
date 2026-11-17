/**
 * Backfill chatbot.phoneNumberId from connected whatsapp_numbers slots (Admin SDK).
 */
import type { firestore } from 'firebase-admin';
import { admin } from '@/lib/firebase-admin';
import { normalizeNumberSlot, type NumberSlot } from '@/lib/whatsapp/numbers';

type AdminDb = firestore.Firestore;

async function resolveSlotPhoneIds(
    db: AdminDb,
    tenantPath: string
): Promise<Partial<Record<NumberSlot, string>>> {
    const out: Partial<Record<NumberSlot, string>> = {};
    const slots: NumberSlot[] = ['general', 'support', 'broadcast'];

    for (const slot of slots) {
        const snap = await db.doc(`${tenantPath}/whatsapp_numbers/${slot}`).get();
        const data = snap.data();
        const pid = data?.phoneNumberId || data?.phone_number_id || data?.phoneId;
        if (pid) out[slot] = String(pid).trim();
    }

    if (!out.general) {
        for (const integrationId of ['whatsapp', 'whatsapp_internal']) {
            const snap = await db.doc(`${tenantPath}/integrations/${integrationId}`).get();
            const data = snap.data();
            const pid = data?.phoneNumberId || data?.phone_number_id || data?.phoneId;
            if (pid) {
                out.general = String(pid).trim();
                break;
            }
        }
    }

    return out;
}

export async function ensureWhatsAppBotPhoneBindingAdmin(
    db: AdminDb,
    tenantPath: string
): Promise<void> {
    const slotPhones = await resolveSlotPhoneIds(db, tenantPath);
    const botsSnap = await db.collection(`${tenantPath}/chatbots`).get();

    let batch = db.batch();
    let writes = 0;

    for (const botDoc of botsSnap.docs) {
        const data = botDoc.data() || {};
        const existing = String(data.phoneNumberId || '').trim();
        if (existing) continue;

        const slot = normalizeNumberSlot(data.numberId);
        const fromSlot = slotPhones[slot];
        if (!fromSlot) continue;

        batch.set(
            botDoc.ref,
            {
                phoneNumberId: fromSlot,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
        );
        writes++;
        if (writes >= 400) {
            await batch.commit();
            batch = db.batch();
            writes = 0;
        }
    }

    if (writes > 0) await batch.commit();
}
