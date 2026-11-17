import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { runRenewals } from '@/lib/subscriptions/renewals.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Cron diario (vercel.json): cobra las renovaciones de tarjeta que vencen pronto.
 * Ruta privada por secreto, no por sesión: Vercel envía `Authorization: Bearer $CRON_SECRET`.
 * Sin CRON_SECRET configurado la ruta responde 503 y no hace nada.
 */
export async function GET(req: Request) {
    const secret = (process.env.CRON_SECRET || '').trim();
    if (!secret) return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 503 });

    const header = req.headers.get('authorization') || '';
    const expected = `Bearer ${secret}`;
    const ok = header.length === expected.length && crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
    if (!ok) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const summary = await runRenewals();
    console.log('[renewals] resumen', JSON.stringify(summary));
    return NextResponse.json({ ok: true, ...summary });
}
