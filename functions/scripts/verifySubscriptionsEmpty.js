/**
 * Verify no subscription or admin audit documents remain.
 * Exit code 0 if clean, 1 if any found.
 */

const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');
const serviceAccount = require(serviceAccountPath);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function main() {
  const found = [];

  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const globalPath = `users/${uid}/subscriptions/current`;
    if ((await db.doc(globalPath).get()).exists) {
      found.push(globalPath);
    }

    const entitiesSnap = await db.collection('users').doc(uid).collection('entities').get();
    for (const entityDoc of entitiesSnap.docs) {
      const entityPath = `users/${uid}/entities/${entityDoc.id}/subscriptions/current`;
      if ((await db.doc(entityPath).get()).exists) {
        found.push(entityPath);
      }
    }
  }

  const auditSnap = await db.collection('admin').doc('auditLog').collection('subscriptions').get();
  for (const doc of auditSnap.docs) {
    found.push(`admin/auditLog/subscriptions/${doc.id}`);
  }

  if (found.length === 0) {
    console.log('OK: No subscription or admin audit documents found.');
    process.exit(0);
  }

  console.log('FAIL: Found remaining documents:');
  for (const p of found) {
    console.log(`  - ${p}`);
  }
  process.exit(1);
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
