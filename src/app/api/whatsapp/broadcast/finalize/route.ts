import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { finalizeBroadcastIfDone } from "@/lib/broadcast/finalizeBroadcastSend";
import { backfillBroadcastConversations } from "@/lib/broadcast/backfillBroadcastConversations";
import { guardApi } from '@/lib/apiAuth';
import { requireSuite } from '@/lib/subscriptions/entitlements.server';

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Close a stuck campaign when all recipients are already sent/failed. */
export async function POST(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;
    try {
        const { userId, entityId, broadcastId } = await req.json();
        const suiteDenied = await requireSuite(userId, entityId, 'cmo');
        if (suiteDenied) return suiteDenied;
        if (!userId || !entityId || !broadcastId) {
            return NextResponse.json(
                { error: "Missing userId, entityId or broadcastId" },
                { status: 400 }
            );
        }

        const tenantPath = `users/${userId}/entities/${entityId}`;
        const broadcastRef = db.doc(`${tenantPath}/broadcasts/${broadcastId}`);
        const snap = await broadcastRef.get();
        if (!snap.exists) {
            return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });
        }

        const result = await finalizeBroadcastIfDone({
            db,
            tenantPath,
            broadcastId,
            broadcastRef,
        });

        if (result.finalized) {
            try {
                await backfillBroadcastConversations({ db, userId, entityId, broadcastId });
            } catch {
                /* non-fatal */
            }
        }

        return NextResponse.json({
            ok: true,
            finalized: result.finalized,
            status: result.status || "Sending",
            stats: result.stats,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Finalize failed";
        console.error("[Broadcast finalize]", error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
