import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/firebase-admin';
import { getSubscriptionCurrentDocPath } from '@/lib/subscriptions/payment-config';
import { guardApi } from '@/lib/apiAuth';
import { scheduleRenewal } from '@/lib/subscriptions/renewals.server';
import { PLAN_CATALOG_USD, PERIOD_DAYS } from '@/lib/subscriptions/upgrade-pricing';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

export async function POST(request: NextRequest) {
    const denied = await guardApi(request);
    if (denied) return denied;
  try {
    if (!stripeSecretKey) {
      return NextResponse.json(
        { error: 'STRIPE_SECRET_KEY is not configured in .env.local' },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeSecretKey);
    const body = await request.json();
    const { paymentIntentId, userId, entityId, plan, billingData } = body;

    if (!paymentIntentId || !userId || !plan) {
      return NextResponse.json(
        { error: 'Missing required parameters: paymentIntentId, userId, plan' },
        { status: 400 }
      );
    }

    // Verificar el estado del PaymentIntent directamente con Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return NextResponse.json(
        { error: `Payment is not completed. Current status: ${paymentIntent.status}` },
        { status: 400 }
      );
    }

    // El plan, el usuario y la entidad se toman del cobro creado por /stripe-intent (validado en servidor),
    // nunca del cuerpo de la petición.
    const meta = paymentIntent.metadata || {};
    if (meta.userId !== String(userId) || (meta.entityId || 'default') !== String(entityId || 'default')) {
      return NextResponse.json({ error: 'This payment does not belong to this account or environment.' }, { status: 403 });
    }
    const verifiedPlan = String(meta.plan || '').toLowerCase();
    if (!PLAN_CATALOG_USD[verifiedPlan]) {
      return NextResponse.json({ error: 'Payment has no valid plan.' }, { status: 400 });
    }
    const priceUSD = Number(meta.netAmount) || (paymentIntent.amount / 100);
    const activatedAt = new Date().toISOString();
    const expiresAt = new Date();
    const billingCycle = meta.billingCycle === 'annual' ? 'annual' : 'monthly';
    expiresAt.setDate(expiresAt.getDate() + PERIOD_DAYS[billingCycle]);

    // Guardar suscripción activa en Firestore
    await db.doc(getSubscriptionCurrentDocPath(userId, entityId || 'default')).set(
      {
        status: 'active',
        trial: false,
        billingCycle,
        plan: verifiedPlan,
        priceUSD: priceUSD,
        paymentMethod: 'card_stripe',
        stripePaymentIntentId: paymentIntent.id,
        stripeCustomerId: paymentIntent.customer || null,
        stripePaymentMethodId: paymentIntent.payment_method || null,
        recurring: true,
        activatedAt: activatedAt,
        expiresAt: expiresAt.toISOString(),
        updatedAt: activatedAt,
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        ...(billingData && { billing: billingData }),
      },
      { merge: true }
    );

    // Renovación automática de la tarjeta guardada (cron diario)
    await scheduleRenewal(String(userId), String(entityId || 'default'), expiresAt.toISOString());

    return NextResponse.json({
      success: true,
      message: 'Subscription activated successfully with recurring payment enabled',
      subscription: {
        status: 'active',
        plan: verifiedPlan,
        expiresAt: expiresAt.toISOString(),
        recurring: true,
      },
    });
  } catch (error: any) {
    console.error('[API] /subscriptions/activate error:', error);
    return NextResponse.json(
      { error: error.message || 'Error activating subscription' },
      { status: 500 }
    );
  }
}
