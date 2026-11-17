import type Stripe from 'stripe';
import { db } from '@/lib/firebase-admin';
import { getSubscriptionCurrentDocPath } from './payment-config';
import { PERIOD_DAYS, PLAN_CATALOG_USD } from './upgrade-pricing';
import { scheduleRenewal } from './renewals.server';

export interface StripePaymentApplication {
    userId: string;
    entityId: string;
    plan: string;
    billingCycle: 'monthly' | 'annual';
    netAmountUSD: number;
    paymentIntentId: string;
    customerId: string | null;
    paymentMethodId: string | null;
    /** Cobro de renovación automática: la vigencia se EXTIENDE desde el vencimiento actual. */
    renewal?: boolean;
}

/** Registra un cobro de Stripe en la suscripción (idempotente por PaymentIntent). Solo lo usa el servidor. */
export async function applyStripePayment(p: StripePaymentApplication): Promise<void> {
    if (!PLAN_CATALOG_USD[p.plan.toLowerCase()]) return;
    const ref = db.doc(getSubscriptionCurrentDocPath(p.userId, p.entityId || 'default'));
    const snap = await ref.get();
    const existing = snap.data();
    // Idempotencia: /activate, el webhook y la renovación pueden notificar el mismo cobro.
    if (existing?.stripePaymentIntentId === p.paymentIntentId && existing?.status === 'active') return;

    const now = new Date();
    let base = now;
    if (p.renewal && existing?.expiresAt) {
        const current = new Date(existing.expiresAt);
        if (current.getTime() > now.getTime()) base = current; // no se pierden los días ya pagados
    }
    const expiresAt = new Date(base);
    expiresAt.setDate(expiresAt.getDate() + PERIOD_DAYS[p.billingCycle]);

    await ref.set(
        {
            status: 'active',
            trial: false,
            billingCycle: p.billingCycle,
            plan: p.plan,
            priceUSD: p.netAmountUSD,
            paymentMethod: 'card_stripe',
            stripePaymentIntentId: p.paymentIntentId,
            stripeCustomerId: p.customerId,
            stripePaymentMethodId: p.paymentMethodId,
            recurring: true,
            activatedAt: p.renewal && existing?.activatedAt ? existing.activatedAt : now.toISOString(),
            expiresAt: expiresAt.toISOString(),
            updatedAt: now.toISOString(),
            cancelAtPeriodEnd: false,
            cancelledAt: null,
            renewalStatus: 'ok',
            renewalFailedAt: null,
            renewalError: null,
            renewalAttempts: 0,
            ...(p.renewal ? { lastRenewedAt: now.toISOString() } : {}),
        },
        { merge: true }
    );
    await scheduleRenewal(p.userId, p.entityId || 'default', expiresAt.toISOString());
}

export function applicationFromPaymentIntent(pi: Stripe.PaymentIntent): StripePaymentApplication | null {
    const m = pi.metadata || {};
    if (!m.userId || !m.plan) return null; // solo cobros creados por /subscriptions/stripe-intent
    return {
        userId: m.userId,
        entityId: m.entityId || 'default',
        plan: String(m.plan).toLowerCase(),
        billingCycle: m.billingCycle === 'annual' ? 'annual' : 'monthly',
        netAmountUSD: Number(m.netAmount) || pi.amount / 100,
        paymentIntentId: pi.id,
        customerId: typeof pi.customer === 'string' ? pi.customer : pi.customer?.id ?? null,
        paymentMethodId: typeof pi.payment_method === 'string' ? pi.payment_method : pi.payment_method?.id ?? null,
        renewal: m.renewal === 'true',
    };
}
