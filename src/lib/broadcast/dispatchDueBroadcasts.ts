import type { Firestore } from "firebase-admin/firestore";
import { broadcastScheduleIsDue } from "./scheduleDue";
import { runBroadcastSendLoop } from "./runBroadcastSendLoop";

/**
 * Lanza campañas en estado Scheduled cuya hora ya pasó.
 * Una por vez: el envío puede durar varios minutos.
 */
export async function dispatchDueBroadcasts(db: Firestore, limit = 3) {
    const snap = await db.collectionGroup("broadcasts").where("status", "==", "Scheduled").limit(40).get();
    const due = snap.docs.filter((doc) => broadcastScheduleIsDue(doc.get("scheduleAt") || doc.get("broadcastTime")));
    const launched: { id: string; status: string; sent: number; failed: number }[] = [];

    for (const doc of due.slice(0, limit)) {
        const parts = doc.ref.path.split("/");
        const userId = parts[1];
        const entityId = parts[3];
        if (parts[0] !== "users" || parts[2] !== "entities" || !userId || !entityId) continue;
        const result = await runBroadcastSendLoop({
            db,
            userId,
            entityId,
            broadcastId: doc.id,
        });
        launched.push({
            id: doc.id,
            status: result.status,
            sent: result.sent,
            failed: result.failed,
        });
        if (result.error === "interrupted") break;
    }

    return { checked: snap.size, due: due.length, launched };
}
