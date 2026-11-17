import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { regionalFunctions } from '../region';

/**
 * ONE-TIME MIGRATION: Adds `platform_ids`, `channel`, and `contactNumberClean`
 * to existing Kanban cards that were created before the omnichannel refactor.
 *
 * CALL ONCE via: GET https://us-west3-roosevelt-491004.cloudfunctions.net/migrateCards?secret=...
 * After migration is confirmed, remove this function and redeploy.
 */
export const migrateCards = regionalFunctions.https.onRequest(async (req, res) => {
    const db = admin.firestore();

    // Security: basic check to prevent accidental runs
    const secret = req.query.secret;
    if (secret !== 'udreamms-migrate-2025') {
        res.status(403).send('Unauthorized');
        return;
    }

    functions.logger.info('[Migration] Starting card migration...');

    const u = req.query.u as string;
    const e = req.query.e as string;

    if (!u || !e) {
        res.status(400).send('Missing tenant identifiers (u, e)');
        return;
    }

    const vaultPath = `users/${u}/entities/${e}/kanban-groups`;
    const groupsSnap = await db.collection(vaultPath).get();
    
    if (groupsSnap.empty) {
        res.json({ success: true, message: `No groups found in ${vaultPath}`, updated: 0 });
        return;
    }

    let totalUpdated = 0;
    let totalSkipped = 0;
    const errors: string[] = [];
    const BATCH_SIZE = 400;
    let batch = db.batch();
    let batchCount = 0;

    for (const groupDoc of groupsSnap.docs) {
        const cardsSnap = await groupDoc.ref.collection('cards').get();

        for (const cardDoc of cardsSnap.docs) {
            const data = cardDoc.data();

            // Determine what platform this card belongs to
            // If it already has platform_ids, it's already migrated
            if (data.platform_ids && Object.keys(data.platform_ids).length > 0) {
                totalSkipped++;
                continue;
            }

            // Determine platform from `source` field (old field name)
            const sourcePlatform: string = data.source || 'whatsapp';
            const externalId: string = data.contactNumber || data.contactNumberClean || '';

            if (!externalId) {
                functions.logger.warn(`[Migration] Card ${cardDoc.id} has no contactNumber, skipping.`);
                totalSkipped++;
                continue;
            }

            const updateData: any = {
                // New unified platform identity map
                platform_ids: {
                    [sourcePlatform]: externalId
                },
                // Channel field for UI icon rendering
                channel: sourcePlatform,
                primary_channel: sourcePlatform,
                // Ensure contactNumberClean exists (self-healing)
                contactNumberClean: externalId.replace(/\+/g, ''),
            };

            // If platform_metadata is missing, initialize it
            if (!data.platform_metadata) {
                updateData.platform_metadata = {};
            }

            batch.update(cardDoc.ref, updateData);
            batchCount++;
            totalUpdated++;

            // Commit batch every BATCH_SIZE writes
            if (batchCount >= BATCH_SIZE) {
                await batch.commit();
                functions.logger.info(`[Migration] Committed batch of ${batchCount} cards`);
                batch = db.batch();
                batchCount = 0;
            }
        }
    }

    // Commit remaining
    if (batchCount > 0) {
        await batch.commit();
        functions.logger.info(`[Migration] Committed final batch of ${batchCount} cards`);
    }

    const summary = {
        success: true,
        updated: totalUpdated,
        skipped: totalSkipped,
        errors: errors.length > 0 ? errors : undefined,
        message: `Migration complete. ${totalUpdated} cards updated, ${totalSkipped} already migrated.`
    };

    functions.logger.info('[Migration] Done:', summary);
    res.json(summary);
});
