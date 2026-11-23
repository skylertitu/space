import crypto from "crypto";
import { NextResponse } from "next/server";
import { db, hasAdminCredentials } from "@/lib/firebase-admin";
import { dispatchDueBroadcasts } from "@/lib/broadcast/dispatchDueBroadcasts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cron horario: envía las campañas cuya hora programada ya pasó.
 * Misma protección que la renovación: Authorization Bearer CRON_SECRET.
 */
export async function GET(req: Request) {
    if (!hasAdminCredentials()) {
        return NextResponse.json({ error: "serviceAccountKey.json no configurado" }, { status: 503 });
    }
    const secret = (process.env.CRON_SECRET || "").trim();
    if (!secret) return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 503 });

    const header = req.headers.get("authorization") || "";
    const expected = `Bearer ${secret}`;
    const ok =
        header.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
    if (!ok) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    try {
        const summary = await dispatchDueBroadcasts(db);
        console.log("[broadcast-due]", JSON.stringify(summary));
        return NextResponse.json({ ok: true, ...summary });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Error al despachar campañas";
        console.error("[broadcast-due]", error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
