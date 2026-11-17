import type { Firestore } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";

const SENTISH = new Set(["sent", "delivered", "read", "replied"]);

export interface BroadcastSendStats {
    total: number;
    sent: number;
    failed: number;
    pending: number;
    delivered: number;
    read: number;
    replied: number;
}

export async function countBroadcastRecipientStats(
    db: Firestore,
    tenantPath: string,
    broadcastId: string
): Promise<BroadcastSendStats> {
    const recSnap = await db
        .collection(`${tenantPath}/broadcasts/${broadcastId}/recipients`)
        .get();

    const stats: BroadcastSendStats = {
        total: recSnap.size,
        sent: 0,
        failed: 0,
        pending: 0,
        delivered: 0,
        read: 0,
        replied: 0,
    };

    recSnap.docs.forEach((d) => {
        const s = String(d.data().status || "pending");
        if (SENTISH.has(s)) stats.sent++;
        else if (s === "failed") stats.failed++;
        else stats.pending++;

        if (s === "delivered") stats.delivered++;
        if (s === "read") stats.read++;
        if (s === "replied") stats.replied++;
    });

    return stats;
}

/** Mark campaign Completed/Failed when no recipients are left pending. */
export async function finalizeBroadcastIfDone(params: {
    db: Firestore;
    tenantPath: string;
    broadcastId: string;
    broadcastRef: FirebaseFirestore.DocumentReference;
    incrementSent?: number;
    incrementFailed?: number;
}): Promise<{ finalized: boolean; status?: string; stats: BroadcastSendStats }> {
    const { db, tenantPath, broadcastId, broadcastRef } = params;
    const stats = await countBroadcastRecipientStats(db, tenantPath, broadcastId);

    if (stats.pending > 0) {
        await broadcastRef.set(
            {
                status: "Sending",
                stats: {
                    total: stats.total,
                    sent: stats.sent,
                    failed: stats.failed,
                    pending: stats.pending,
                    delivered: stats.delivered,
                    read: stats.read,
                    replied: stats.replied,
                },
                sendHeartbeatAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
        );
        return { finalized: false, stats };
    }

    const finalStatus = stats.sent === 0 && stats.failed > 0 ? "Failed" : "Completed";
    await broadcastRef.set(
        {
            status: finalStatus,
            stats: {
                total: stats.total,
                sent: stats.sent,
                failed: stats.failed,
                pending: 0,
                delivered: stats.delivered,
                read: stats.read,
                replied: stats.replied,
            },
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
    );

    return { finalized: true, status: finalStatus, stats };
}

export function broadcastSendLooksStale(broadcast: Record<string, unknown>): boolean {
    const heartbeat =
        broadcast.sendHeartbeatAt || broadcast.updatedAt || broadcast.launchedAt;
    if (!heartbeat) return true;

    let ms = 0;
    if (typeof (heartbeat as { toDate?: () => Date }).toDate === "function") {
        ms = (heartbeat as { toDate: () => Date }).toDate().getTime();
    } else if (typeof (heartbeat as { seconds?: number }).seconds === "number") {
        ms = (heartbeat as { seconds: number }).seconds * 1000;
    }

    if (!ms) return true;
    // No heartbeat for 3+ minutes → safe to resume/finalize.
    return Date.now() - ms > 3 * 60 * 1000;
}
