/**
 * Purge all subscription documents from Firestore.
 *
 * Deletes:
 *   - users/{uid}/subscriptions/current
 *   - users/{uid}/entities/{entityId}/subscriptions/current
 *   - admin/auditLog/subscriptions/*
 *
 * Usage:
 *   node functions/scripts/purgeAllSubscriptions.js           # dry-run (default)
 *   node functions/scripts/purgeAllSubscriptions.js --execute # apply deletes
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
const BATCH_LIMIT = 500;
const execute = process.argv.includes('--execute');

async function collectSubscriptionPaths() {
  const paths = [];
  const usersSnap = await db.collection('users').get();

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const globalPath = `users/${uid}/subscriptions/current`;
    const globalRef = db.doc(globalPath);
    const globalSnap = await globalRef.get();
    if (globalSnap.exists) {
      paths.push(globalPath);
    }

    const entitiesSnap = await db.collection('users').doc(uid).collection('entities').get();
    for (const entityDoc of entitiesSnap.docs) {
      const entityPath = `users/${uid}/entities/${entityDoc.id}/subscriptions/current`;
      const entityRef = db.doc(entityPath);
      const entitySnap = await entityRef.get();
      if (entitySnap.exists) {
        paths.push(entityPath);
      }
    }
  }

  return paths;
}

async function collectAuditLogPaths() {
  const paths = [];
  const auditSnap = await db.collection('admin').doc('auditLog').collection('subscriptions').get();
  for (const doc of auditSnap.docs) {
    paths.push(`admin/auditLog/subscriptions/${doc.id}`);
  }
  return paths;
}

async function deletePaths(paths) {
  let deleted = 0;
  for (let i = 0; i < paths.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    const chunk = paths.slice(i, i + BATCH_LIMIT);
    for (const docPath of chunk) {
      batch.delete(db.doc(docPath));
    }
    await batch.commit();
    deleted += chunk.length;
  }
  return deleted;
}

async function main() {
  const projectId = serviceAccount.project_id;
  console.log(`Firebase project: ${projectId}`);
  console.log(`Mode: ${execute ? 'EXECUTE (deletes will be applied)' : 'DRY-RUN (no deletes)'}\n`);

  const subscriptionPaths = await collectSubscriptionPaths();
  const auditPaths = await collectAuditLogPaths();
  const allPaths = [...subscriptionPaths, ...auditPaths];

  const globalSubs = subscriptionPaths.filter((p) => p.includes('/subscriptions/current') && !p.includes('/entities/'));
  const entitySubs = subscriptionPaths.filter((p) => p.includes('/entities/'));

  console.log('Documents to delete:');
  if (allPaths.length === 0) {
    console.log('  (none found)\n');
  } else {
    for (const p of allPaths) {
      console.log(`  - ${p}`);
    }
    console.log('');
  }

  console.log('Summary:');
  console.log(`  global subscriptions: ${globalSubs.length}`);
  console.log(`  entity subscriptions: ${entitySubs.length}`);
  console.log(`  admin audit logs:     ${auditPaths.length}`);
  console.log(`  total:                ${allPaths.length}\n`);

  if (!execute) {
    console.log('Dry-run complete. Re-run with --execute to apply deletes.');
    process.exit(0);
  }

  if (allPaths.length === 0) {
    console.log('Nothing to delete.');
    process.exit(0);
  }

  const deleted = await deletePaths(allPaths);
  console.log(`Deleted ${deleted} document(s).`);
  process.exit(0);
}

main().catch((error) => {
  console.error('Error:', error.message);
  console.error(error);
  process.exit(1);
});
