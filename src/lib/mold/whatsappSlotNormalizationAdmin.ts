/**
 * WhatsApp multi-number mold helpers (Admin SDK).
 */
import type { firestore } from 'firebase-admin';
import { admin } from '@/lib/firebase-admin';

type AdminDb = firestore.Firestore;

export async function ensureWhatsAppSlotNormalizationAdmin(
    db: AdminDb,
    tenantPath: string
): Promise<void> {
    const primaryRef = db.doc(`${tenantPath}/whatsapp_numbers/primary`);
    const primarySnap = await primaryRef.get();

    if (primarySnap.exists) {
        const data = primarySnap.data() || {};
        const generalRef = db.doc(`${tenantPath}/whatsapp_numbers/general`);
        const generalSnap = await generalRef.get();
        if (!generalSnap.exists || !(generalSnap.data()?.phoneNumberId || generalSnap.data()?.phone_number_id)) {
            await generalRef.set(
                {
                    ...data,
                    slot: 'general',
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                },
                { merge: true }
            );
        }
        await primaryRef.delete();
    }

    const botsSnap = await db.collection(`${tenantPath}/chatbots`).get();
    let batch = db.batch();
    let writes = 0;
    for (const botDoc of botsSnap.docs) {
        const numberId = String(botDoc.data()?.numberId || '').trim().toLowerCase();
        if (numberId === 'primary') {
            batch.set(
                botDoc.ref,
                {
                    numberId: 'general',
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
    }
    if (writes > 0) await batch.commit();
}
