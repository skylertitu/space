import * as admin from 'firebase-admin';
if (!admin.apps.length) {
    admin.initializeApp();
}

/**
 * Firebase Functions (us-west3) — backend utilities + WhatsApp webhook proxy.
 * Web app + primary bot engine: Vercel (www.byroosevelt.com).
 */
export { whatsappWebhook } from './webhooks/whatsapp';
export { moveCard } from './helpers/kanbanOperations';
export { migrateCards } from './helpers/migrateCards';
