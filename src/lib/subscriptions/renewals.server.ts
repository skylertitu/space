import Stripe from 'stripe';
import { db } from '@/lib/firebase-admin';
import { getSubscriptionCurrentDocPath } from './payment-config';
import { PERIOD_DAYS, PLAN_CATALOG_ANNUAL_USD, PLAN_CATALOG_USD } from './upgrade-pricing';
import { grossFromNet } from './stripe-pricing';
import { applyStripePayment } from './stripe-activation';

/**
 * Renovación automática de suscripciones de TARJETA (Stripe). Los pagos con Solana no se renuevan solos.
 *
 *  - Al activarse un cobro de tarjeta se agenda en `subscription_renewals/{uid}__{entidad}` (colección raíz solo del
 *    servidor, solo ids y fechas) para cobrar 1 día antes del vencimiento.
 *  - Un cron diario (/api/subscriptions/renew) cobra con la tarjeta guardada (off_session).
 *  - Si el cobro falla se reintenta cada día durante SUBSCRIPTION_GRACE_DAYS (por defecto 3) tras el vencimiento
 *    manteniendo el acceso; pasado ese plazo la entidad se bloquea (los datos se conservan).
 *  - Si el cliente canceló la renovación, no se cobra y la suscripción vence al final del período pagado.
 */
const DAY = 24 * 60 * 60 * 1000;
export const RENEWAL_LEAD_DAYS = 1;

export const graceDays = () => {
    const n = Number(process.env.SUBSCRIPTION_GRACE_DAYS);
    return Number.isFinite(n) && n >= 0 ? n : 3;
};

const queueRef = (userId: string, entityId: string) => db.doc(`subscription_renewals/${userId}__${entityId}`);

export async function scheduleRenewal(userId: string, entityId: string, expiresAtIso: string) {
    const renewAt = new Date(new Date(expiresAtIso).getTime() - RENEWAL_LEAD_DAYS * DAY).toISOString();
    await queueRef(userId, entityId).set({ userId, entityId, renewAt, expiresAt: expiresAtIso });
}

export async function unscheduleRenewal(userId: string, entityId: string) {
    await queueRef(userId, entityId).delete();
}

export type RenewalCharge =
    | { ok: true; paymentIntentId: string }
    | { ok: false; code: string; message: string };

export interface RenewalChargeRequest {
    customerId: string;
    paymentMethodId: string;
    amountInCents: number;
    idempotencyKey: string;
    metadata: Record<string, string>;
}
export type RenewalCharger = (req: RenewalChargeRequest) => Promise<RenewalCharge>;

/** Cobro real contra Stripe (off_session, con la tarjeta guardada). */
export const stripeCharger: RenewalCharger = async (req) => {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return { ok: false, code: 'config', message: 'STRIPE_SECRET_KEY no configurada' };
    const stripe = new Stripe(key);
    try {
        const pi = await stripe.paymentIntents.create(
            {
                amount: req.amountInCents,
                currency: 'usd',
                customer: req.customerId,
                payment_method: req.paymentMethodId,
                off_session: true,
                confirm: true,
                description: 'Renovación de suscripción Roosevelt',
                metadata: req.metadata,
            },
            { idempotencyKey: req.idempotencyKey }
        );
        if (pi.status === 'succeeded') return { ok: true, paymentIntentId: pi.id };
        return { ok: false, code: pi.status, message: `El cobro quedó en estado ${pi.status}` };
    } catch (e: any) {
        return { ok: false, code: e?.code || e?.type || 'error', message: e?.message || 'Error al cobrar' };
    }
};

export interface RenewalSummary {
    due: number;
    renewed: number;
    failed: number;
    expired: number;
    skipped: number;
}

export async function runRenewals(opts: { now?: Date; charger?: RenewalCharger; limit?: number } = {}): Promise<RenewalSummary> {
    const now = opts.now ?? new Date();
    const charger = opts.charger ?? stripeCharger;
    const summary: RenewalSummary = { due: 0, renewed: 0, failed: 0, expired: 0, skipped: 0 };

    const dueSnap = await db.collection('subscription_renewals').where('renewAt', '<=', now.toISOString()).limit(opts.limit ?? 200).get();
    summary.due = dueSnap.size;

    for (const doc of dueSnap.docs) {
        const { userId, entityId } = doc.data() as { userId: string; entityId: string };
        try {
            const subRef = db.doc(getSubscriptionCurrentDocPath(userId, entityId));
            const sub = (await subRef.get()).data();

            if (!sub || sub.status !== 'active' || sub.paymentMethod !== 'card_stripe' || !sub.recurring || !sub.stripeCustomerId || !sub.stripePaymentMethodId) {
                await doc.ref.delete();
                summary.skipped++;
                continue;
            }

            const expiresMs = new Date(sub.expiresAt).getTime();
            const graceEndMs = expiresMs + graceDays() * DAY;

            // Cancelada por el cliente: sin cobro; vence al final del período pagado
            if (sub.cancelAtPeriodEnd === true) {
                if (now.getTime() >= expiresMs) {
                    await subRef.set({ status: 'expired', updatedAt: now.toISOString() }, { merge: true });
                    await doc.ref.delete();
                    summary.expired++;
                } else {
                    await doc.ref.set({ renewAt: new Date(expiresMs).toISOString() }, { merge: true });
                    summary.skipped++;
                }
                continue;
            }

            // Se acabó la gracia sin lograr cobrar: se bloquea
            if (now.getTime() > graceEndMs) {
                await subRef.set({ status: 'expired', renewalStatus: 'failed', updatedAt: now.toISOString() }, { merge: true });
                await doc.ref.delete();
                summary.expired++;
                continue;
            }

            const plan = String(sub.plan).toLowerCase();
            const cycle = sub.billingCycle === 'annual' ? 'annual' : 'monthly';
            const net = cycle === 'annual' ? PLAN_CATALOG_ANNUAL_USD[plan] : PLAN_CATALOG_USD[plan];
            if (!net) {
                await doc.ref.delete();
                summary.skipped++;
                continue;
            }

            const { grossUSD, feeUSD, amountInCents } = grossFromNet(net);
            const result = await charger({
                customerId: sub.stripeCustomerId,
                paymentMethodId: sub.stripePaymentMethodId,
                amountInCents,
                // La misma clave durante todo el ciclo: un reintento nunca cobra dos veces
                idempotencyKey: `renew_${userId}_${entityId}_${sub.expiresAt}`,
                metadata: {
                    userId,
                    entityId,
                    plan,
                    billingCycle: cycle,
                    netAmount: String(net),
                    stripeFee: String(feeUSD),
                    grossAmount: String(grossUSD),
                    isRecurring: 'true',
                    renewal: 'true',
                },
            });

            if (result.ok) {
                await applyStripePayment({
                    userId,
                    entityId,
                    plan,
                    billingCycle: cycle,
                    netAmountUSD: net,
                    paymentIntentId: result.paymentIntentId,
                    customerId: sub.stripeCustomerId,
                    paymentMethodId: sub.stripePaymentMethodId,
                    renewal: true,
                });
                summary.renewed++;
            } else {
                await subRef.set(
                    {
                        renewalStatus: 'past_due',
                        renewalFailedAt: now.toISOString(),
                        renewalError: result.code,
                        renewalAttempts: (Number(sub.renewalAttempts) || 0) + 1,
                        updatedAt: now.toISOString(),
                    },
                    { merge: true }
                );
                await doc.ref.set({ renewAt: new Date(now.getTime() + DAY).toISOString() }, { merge: true });
                summary.failed++;
                console.warn(`[renewals] cobro fallido ${userId}/${entityId}: ${result.code}`);
            }
        } catch (e: any) {
            console.error(`[renewals] error con ${doc.id}:`, e?.message);
            summary.failed++;
        }
    }
    return summary;
}
