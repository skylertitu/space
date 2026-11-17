import { NextResponse } from 'next/server';
import { db, auth } from '@/lib/firebase-admin';
import { guardApi } from '@/lib/apiAuth';
import { getSubscriptionCurrentDocPath } from '@/lib/subscriptions/payment-config';
import { findAccessCode } from '@/lib/subscriptions/accessCodes';

export const dynamic = 'force-dynamic';

/**
 * Canje de códigos de prueba gratuita, validado en el servidor (ver accessCodes.ts).
 * Salvaguardas (los códigos son fáciles de adivinar, así que se limita el abuso):
 *   - máx. 5 intentos fallidos por hora POR CUENTA (no por entidad: crear entidades no reinicia el contador);
 *   - una sola prueba por entidad (aunque ya haya vencido): después hay que pagar;
 *   - máx. SUBSCRIPTION_ACCESS_CODE_MAX_PER_ACCOUNT pruebas por cuenta (por defecto 1);
 *   - cuentas exentas (el dueño): SUBSCRIPTION_CODE_EXEMPT_EMAILS="correo@dominio.com" (correo verificado)
 *     o SUBSCRIPTION_CODE_EXEMPT_UIDS="uid1,uid2";
 *   - no se canjea sobre una suscripción de pago vigente.
 * Todos los documentos auxiliares viven en `subscriptions/*`, que solo escribe el servidor.
 */
const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 60 * 60 * 1000;

const maxPerAccount = () => {
    const n = Number(process.env.SUBSCRIPTION_ACCESS_CODE_MAX_PER_ACCOUNT);
    return Number.isFinite(n) && n > 0 ? n : 1;
};
const list = (v: string | undefined) => (v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

/** Cuentas que pueden canjear códigos sin el límite de una prueba (el dueño de la plataforma). */
async function isExemptAccount(userId: string): Promise<boolean> {
    if (list(process.env.SUBSCRIPTION_CODE_EXEMPT_UIDS).includes(userId.toLowerCase())) return true;
    const emails = list(process.env.SUBSCRIPTION_CODE_EXEMPT_EMAILS);
    if (emails.length === 0) return false;
    try {
        const user = await auth.getUser(userId);
        return !!user.email && user.emailVerified && emails.includes(user.email.toLowerCase());
    } catch {
        return false;
    }
}

export async function POST(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;

    try {
        const { userId, entityId, code } = await req.json();
        if (!userId || !entityId || typeof code !== 'string' || !code.trim()) {
            return NextResponse.json({ ok: false, message: 'Faltan datos.' }, { status: 400 });
        }

        const attemptsRef = db.doc(`users/${userId}/subscriptions/redeem_attempts`);
        const accountRef = db.doc(`users/${userId}/subscriptions/access_code_history`);
        const entityRef = db.doc(`users/${userId}/entities/${entityId}/subscriptions/access_code_history`);
        const subRef = db.doc(getSubscriptionCurrentDocPath(userId, entityId));

        const attempts = (await attemptsRef.get()).data();
        const recent = ((attempts?.failedAt as number[] | undefined) || []).filter((t) => Date.now() - t < WINDOW_MS);
        if (recent.length >= MAX_FAILED_ATTEMPTS) {
            return NextResponse.json({ ok: false, message: 'Demasiados intentos. Inténtalo más tarde.' }, { status: 429 });
        }

        const grant = findAccessCode(code);
        if (!grant) {
            await attemptsRef.set({ failedAt: [...recent, Date.now()] });
            return NextResponse.json({ ok: false, message: 'Código inválido.' }, { status: 400 });
        }

        const exempt = await isExemptAccount(userId);

        // Una sola prueba por entorno
        if (!exempt && (await entityRef.get()).exists) {
            return NextResponse.json(
                { ok: false, message: 'Este entorno ya usó su prueba gratuita. Para seguir usándolo activa una suscripción.' },
                { status: 409 }
            );
        }

        // No pisar una suscripción de pago vigente
        const current = (await subRef.get()).data();
        const stillActive = current?.status === 'active' && (!current.expiresAt || new Date(current.expiresAt).getTime() > Date.now());
        if (stillActive && current?.paymentMethod !== 'access_code') {
            return NextResponse.json({ ok: false, message: 'Este entorno ya tiene una suscripción activa.' }, { status: 409 });
        }

        // Límite de pruebas por cuenta
        const used = ((await accountRef.get()).data()?.redemptions as unknown[] | undefined)?.length ?? 0;
        if (!exempt && used >= maxPerAccount()) {
            return NextResponse.json(
                { ok: false, message: 'Tu cuenta ya usó su prueba gratuita. Para seguir usando la plataforma activa una suscripción.' },
                { status: 409 }
            );
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + grant.days * 24 * 60 * 60 * 1000);
        await subRef.set(
            {
                status: 'active',
                plan: grant.plan,
                priceUSD: 0,
                paymentMethod: 'access_code',
                trial: true,
                activatedAt: now.toISOString(),
                expiresAt: expiresAt.toISOString(),
                updatedAt: now.toISOString(),
                cancelAtPeriodEnd: false,
                cancelledAt: null,
            },
            { merge: true }
        );

        const entry = { plan: grant.plan, days: grant.days, at: now.toISOString(), entityId };
        const prev = ((await accountRef.get()).data()?.redemptions as unknown[] | undefined) ?? [];
        await accountRef.set({ redemptions: [...prev, entry] });
        await entityRef.set({ redeemedAt: now.toISOString(), plan: grant.plan, days: grant.days });
        await attemptsRef.set({ failedAt: [] });

        return NextResponse.json({ ok: true, plan: grant.plan, days: grant.days, expiresAt: expiresAt.toISOString() });
    } catch (e: any) {
        console.error('[subscriptions/redeem] error:', e?.message);
        return NextResponse.json({ ok: false, message: 'No se pudo canjear el código.' }, { status: 500 });
    }
}
