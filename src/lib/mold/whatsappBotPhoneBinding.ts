/**
 * Backfill chatbot.phoneNumberId from connected whatsapp_numbers slots (client SDK).
 * Bots bind to any connected number freely; phoneNumberId is the routing key.
 */
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    serverTimestamp,
    type Firestore,
} from 'firebase/firestore';
import { normalizeNumberSlot, type NumberSlot } from '@/lib/whatsapp/numbers';

async function resolveSlotPhoneIds(
    db: Firestore,
    tenantPath: string
): Promise<Partial<Record<NumberSlot, string>>> {
    const out: Partial<Record<NumberSlot, string>> = {};
    const slots: NumberSlot[] = ['general', 'support', 'broadcast'];

    for (const slot of slots) {
        const snap = await getDoc(doc(db, `${tenantPath}/whatsapp_numbers`, slot));
        const data = snap.data();
        const pid = data?.phoneNumberId || data?.phone_number_id || data?.phoneId;
        if (pid) out[slot] = String(pid).trim();
    }

    if (!out.general) {
        for (const integrationId of ['whatsapp', 'whatsapp_internal']) {
            const snap = await getDoc(doc(db, `${tenantPath}/integrations`, integrationId));
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

/** Set phoneNumberId on bots that only have legacy slot numberId. Idempotent. */
export async function ensureWhatsAppBotPhoneBinding(
    db: Firestore,
    tenantPath: string
): Promise<void> {
    const slotPhones = await resolveSlotPhoneIds(db, tenantPath);
    const botsSnap = await getDocs(collection(db, `${tenantPath}/chatbots`));

    for (const botDoc of botsSnap.docs) {
        const data = botDoc.data() || {};
        const existing = String(data.phoneNumberId || '').trim();
        if (existing) continue;

        const slot = normalizeNumberSlot(data.numberId);
        const fromSlot = slotPhones[slot];
        if (!fromSlot) continue;

        await setDoc(
            botDoc.ref,
            {
                phoneNumberId: fromSlot,
                updatedAt: serverTimestamp(),
            },
            { merge: true }
        );
    }
}
