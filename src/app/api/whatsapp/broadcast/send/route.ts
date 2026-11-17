import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { runBroadcastSendLoop } from "@/lib/broadcast/runBroadcastSendLoop";
import { guardApi } from '@/lib/apiAuth';
import { requireSuite } from '@/lib/subscriptions/entitlements.server';

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;
    try {
        const { userId, entityId, broadcastId, resume } = await req.json();
        const suiteDenied = await requireSuite(userId, entityId, 'cmo');
        if (suiteDenied) return suiteDenied;
        if (!userId || !entityId || !broadcastId) {
            return NextResponse.json(
                { error: "Missing userId, entityId or broadcastId" },
                { status: 400 }
            );
        }

        const result = await runBroadcastSendLoop({
            db,
            userId,
            entityId,
            broadcastId,
            resume: Boolean(resume),
        });

        if (result.error === "not_found") {
            return NextResponse.json({ error: "Broadcast not found" }, { status: 404 });
        }
        if (result.error === "already_completed") {
            return NextResponse.json({ error: "La campaña ya fue completada." }, { status: 409 });
        }
        if (result.error === "already_sending") {
            return NextResponse.json(
                { error: "La campaña ya se está enviando. Espera o usa Reanudar." },
                { status: 409 }
            );
        }

        return NextResponse.json({
            success: result.success,
            status: result.status,
            sent: result.sent,
            failed: result.failed,
            total: result.total,
            resumed: result.resumed,
            interrupted: result.error === "interrupted",
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Internal error";
        console.error("[Broadcast Send] ❌", error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
