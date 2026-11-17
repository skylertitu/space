/**
 * WhatsApp multi-number mold helpers (client Firestore SDK).
 * Migrates legacy `primary` slot → canonical `general`.
 */
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    setDoc,
    serverTimestamp,
    type Firestore,
} from 'firebase/firestore';

/**
 * - Copies `whatsapp_numbers/primary` → `whatsapp_numbers/general` then deletes primary.
 * - Rewrites chatbot `numberId: 'primary'` → `'general'` so tabs / activation match the engine.
 * Idempotent.
 */
export async function ensureWhatsAppSlotNormalization(
    db: Firestore,
    tenantPath: string
): Promise<void> {
    const primaryRef = doc(db, `${tenantPath}/whatsapp_numbers`, 'primary');
    const primarySnap = await getDoc(primaryRef);

    if (primarySnap.exists()) {
        const data = primarySnap.data() || {};
        const generalRef = doc(db, `${tenantPath}/whatsapp_numbers`, 'general');
        const generalSnap = await getDoc(generalRef);
        // Prefer existing general if already connected; otherwise take primary payload.
        if (!generalSnap.exists() || !(generalSnap.data()?.phoneNumberId || generalSnap.data()?.phone_number_id)) {
            await setDoc(
                generalRef,
                {
                    ...data,
                    slot: 'general',
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );
        }
        await deleteDoc(primaryRef);
    }

    const botsSnap = await getDocs(collection(db, `${tenantPath}/chatbots`));
    for (const botDoc of botsSnap.docs) {
        const numberId = String(botDoc.data()?.numberId || '').trim().toLowerCase();
        if (numberId === 'primary') {
            await setDoc(
                botDoc.ref,
                {
                    numberId: 'general',
                    updatedAt: serverTimestamp(),
                },
                { merge: true }
            );
        }
    }
}
