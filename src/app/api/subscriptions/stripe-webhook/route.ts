import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { db } from '@/lib/firebase-admin';
import { getSubscriptionCurrentDocPath } from '@/lib/subscriptions/payment-config';
import { applicationFromPaymentIntent, applyStripePayment } from '@/lib/subscriptions/stripe-activation';

// Ruta pública por diseño: la autenticidad se valida con la firma de Stripe.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

async function activateFromPaymentIntent(pi: Stripe.PaymentIntent) {
  const application = applicationFromPaymentIntent(pi);
  if (!application) return; // solo cobros creados por /subscriptions/stripe-intent o por la renovación automática
  await applyStripePayment(application);
}

async function markPaymentIssue(pi: Stripe.PaymentIntent, status: 'past_due' | 'refunded') {
  const { userId, entityId } = pi.metadata || {};
  if (!userId) return;
  // Los cobros fallidos de una renovación automática los gestiona el cron (reintentos y días de gracia)
  if (status === 'past_due' && pi.metadata?.renewal === 'true') return;
  const ref = db.doc(getSubscriptionCurrentDocPath(userId, entityId || 'default'));
  const snap = await ref.get();
  // Solo tocar la suscripción si corresponde a este mismo cobro
  if (!snap.exists || snap.data()?.stripePaymentIntentId !== pi.id) return;
  await ref.set({ status, updatedAt: new Date().toISOString() }, { merge: true });
}

export async function POST(request: NextRequest) {
  if (!stripeSecretKey || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe webhook no configurado' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Falta la firma' }, { status: 400 });
  }

  const stripe = new Stripe(stripeSecretKey);
  let event: Stripe.Event;
  try {
    // Se necesita el cuerpo crudo para verificar la firma
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    console.warn('[stripe-webhook] firma inválida:', err.message);
    return NextResponse.json({ error: 'Firma inválida' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await activateFromPaymentIntent(event.data.object as Stripe.PaymentIntent);
        break;
      case 'payment_intent.payment_failed':
        await markPaymentIssue(event.data.object as Stripe.PaymentIntent, 'past_due');
        break;
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        if (charge.payment_intent) {
          const pi = await stripe.paymentIntents.retrieve(
            typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent.id
          );
          await markPaymentIssue(pi, 'refunded');
        }
        break;
      }
      default:
        break; // eventos no suscritos: ack
    }
    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('[stripe-webhook] error procesando', event.type, err);
    // 500 para que Stripe reintente
    return NextResponse.json({ error: 'Error procesando evento' }, { status: 500 });
  }
}
