import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { getSubscriptionCurrentDocPath } from './payment-config';
import { graceDays } from './renewals.server';
import { NO_ENTITLEMENTS, entitlementsForPlan, minimumPlanForSuite, normalizePlan, PLAN_LABELS, type Entitlements } from './plans';

/**
 * SUBSCRIPTION_ENFORCEMENT:
 *   'enforce' (por defecto) → las rutas protegidas responden 402 si el plan no incluye la suite/función, y toda
 *                             entidad sin plan vigente (suscripción o prueba por código) queda bloqueada.
 *   'log'                   → interruptor de emergencia: solo registra lo que bloquearía, sin bloquear.
 * Solo los perfiles personales (`persona`) son gratuitos; los profesionales y empresariales requieren plan.
 */
export function subscriptionsEnforced(): boolean {
    return (process.env.SUBSCRIPTION_ENFORCEMENT || 'enforce').trim().toLowerCase() !== 'log';
}

/** Permisos reales de una entidad, leídos con Admin SDK (el cliente no puede falsificar este documento). */
export async function getEntityEntitlements(userId: string, entityId: string): Promise<Entitlements> {
    const entitySnap = await db.doc(`users/${userId}/entities/${entityId}`).get();
    if (entitySnap.exists && entitySnap.data()?.type === 'persona') {
        return { active: true, plan: 'persona', suites: [], orgChart: false, free: true, expiresAt: null };
    }

    const sub = (await db.doc(getSubscriptionCurrentDocPath(userId, entityId)).get()).data();
    if (!sub || sub.status !== 'active') return NO_ENTITLEMENTS;

    const expiresAt: string | null = sub.expiresAt ? String(sub.expiresAt) : null;
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
        // Renovación de tarjeta fallida: se mantiene el acceso durante los días de gracia mientras se reintenta el cobro
        const inGrace = sub.renewalStatus === 'past_due' && new Date(expiresAt).getTime() + graceDays() * 24 * 60 * 60 * 1000 > Date.now();
        if (!inGrace) return NO_ENTITLEMENTS;
    }

    const plan = normalizePlan(sub.plan);
    if (!plan) return NO_ENTITLEMENTS;
    return entitlementsForPlan(plan, expiresAt);
}

function denial(entityId: string, need: string, minPlan: string | null) {
    return NextResponse.json(
        {
            error: 'plan_required',
            message: minPlan
                ? `Tu plan actual no incluye ${need}. Requiere el plan ${PLAN_LABELS[minPlan as keyof typeof PLAN_LABELS] ?? minPlan} o superior.`
                : `Tu plan actual no incluye ${need}.`,
            requiredPlan: minPlan,
            entityId,
        },
        { status: 402 }
    );
}

/** Para rutas API de una suite concreta. Devuelve una respuesta 402 si no corresponde; `null` si puede continuar. */
export async function requireSuite(userId: string, entityId: string, suite: string): Promise<NextResponse | null> {
  if (!userId || !entityId) return null; // la ruta responde 400 por datos faltantes
    const ent = await getEntityEntitlements(userId, entityId);
    if (ent.free || (ent.active && (ent.suites as string[]).includes(suite))) return null;

    const minPlan = minimumPlanForSuite(suite);
    if (!subscriptionsEnforced()) {
        console.warn(`[subscriptions] (modo log) habría bloqueado suite=${suite} entidad=${userId}/${entityId} plan=${ent.plan ?? 'ninguno'}`);
        return null;
    }
    return denial(entityId, `la suite ${suite.toUpperCase()}`, minPlan);
}

/** Para funciones exclusivas del plan Enterprise (organigrama). */
export async function requireOrgChart(userId: string, entityId: string): Promise<NextResponse | null> {
  if (!userId || !entityId) return null;
    const ent = await getEntityEntitlements(userId, entityId);
    if (ent.orgChart) return null;
    if (!subscriptionsEnforced()) {
        console.warn(`[subscriptions] (modo log) habría bloqueado organigrama entidad=${userId}/${entityId} plan=${ent.plan ?? 'ninguno'}`);
        return null;
    }
    return denial(entityId, 'el organigrama', 'enterprise');
}
