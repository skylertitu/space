/**
 * Delete subscription-related docs for one user.
 * Usage: node functions/scripts/purgeUserSubscription.js <uid> [--execute]
 */

const admin = require('firebase-admin');
const path = require('path');

const uid = process.argv[2];
const execute = process.argv.includes('--execute');

if (!uid || uid.startsWith('--')) {
  console.error('Usage: node purgeUserSubscription.js <uid> [--execute]');
  process.exit(1);
}

const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

async function main() {
  const paths = [];
  const globalSub = `users/${uid}/subscriptions/current`;
  if ((await db.doc(globalSub).get()).exists) paths.push(globalSub);

  const entitiesSnap = await db.collection('users').doc(uid).collection('entities').get();
  for (const entityDoc of entitiesSnap.docs) {
    const p = `users/${uid}/entities/${entityDoc.id}/subscriptions/current`;
    if ((await db.doc(p).get()).exists) paths.push(p);
  }

  const paymentSnap = await db.collection('users').doc(uid).collection('paymentRequests').get();
  for (const doc of paymentSnap.docs) {
    paths.push(`users/${uid}/paymentRequests/${doc.id}`);
  }

  console.log(`User: ${uid}`);
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}\n`);
  if (paths.length === 0) {
    console.log('No subscription or paymentRequest documents found.');
    process.exit(0);
  }
  for (const p of paths) console.log(`  - ${p}`);

  if (!execute) {
    console.log('\nRe-run with --execute to delete.');
    process.exit(0);
  }

  const batch = db.batch();
  for (const p of paths) batch.delete(db.doc(p));
  await batch.commit();
  console.log(`\nDeleted ${paths.length} document(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
