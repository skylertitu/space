import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import {
  activateSubscriptionFromOrder,
  getPaymentOrder,
  recoverUserPaymentOrders,
  resolvePaymentOrderStatus,
} from '@/lib/subscriptions/qr-payment';
import { getSubscriptionCurrentDocPath } from '@/lib/subscriptions/payment-config';
import { verifySubscriptionTransaction } from '@/lib/subscriptions/verify-payment';
import type { SubscriptionPaymentMethod } from '@/lib/subscriptions/payment-config';
import { guardApi } from '@/lib/apiAuth';

export async function POST(request: NextRequest) {
    const denied = await guardApi(request);
    if (denied) return denied;
  try {
    const { userId, entityId, requestId, signature, plan, paymentMethod, planPrice } = await request.json();

    if (!userId || !entityId) {
      return NextResponse.json({ error: 'Missing userId or entityId' }, { status: 400 });
    }

    // 1) Recover open QR orders (pending or expired) by scanning the blockchain
    const orderResults = await recoverUserPaymentOrders(userId, entityId);
    const paidFromOrders = orderResults.filter((r) => r.status === 'paid');

    if (paidFromOrders.length > 0) {
      return NextResponse.json({
        success: true,
        source: 'paymentRequests',
        activated: paidFromOrders,
      });
    }

    // 2) Recover a specific requestId (e.g. user still has checkout open)
    if (requestId) {
      const order = await getPaymentOrder(userId, entityId, requestId);
      if (!order) {
        return NextResponse.json({ error: 'Payment request not found' }, { status: 404 });
      }
      const resolved = await resolvePaymentOrderStatus(order);
      if (resolved.status === 'paid') {
        return NextResponse.json({
          success: true,
          source: 'requestId',
          requestId,
          paymentSignature: resolved.paymentSignature,
        });
      }
    }

    // 3) Recover by on-chain transaction signature (no QR document required)
    if (signature && plan && paymentMethod && planPrice) {
      const verification = await verifySubscriptionTransaction(
        signature,
        paymentMethod as SubscriptionPaymentMethod
      );
      if (!verification.ok) {
        return NextResponse.json({ error: verification.error }, { status: 400 });
      }

      const existingSub = await db.doc(getSubscriptionCurrentDocPath(userId, entityId)).get();
      if (existingSub.exists && existingSub.data()?.paymentSignature === signature) {
        return NextResponse.json({
          success: true,
          source: 'signature',
          alreadyActive: true,
        });
      }

      const activatedAt = new Date().toISOString();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      await db.doc(getSubscriptionCurrentDocPath(userId, entityId)).set(
        {
          status: 'active',
          plan,
          priceUSD: Number(planPrice),
          paymentMethod,
          paymentSignature: signature,
          activatedAt,
          expiresAt: expiresAt.toISOString(),
          updatedAt: activatedAt,
        },
        { merge: true }
      );

      if (requestId) {
        const order = await getPaymentOrder(userId, entityId, requestId);
        if (order) {
          await activateSubscriptionFromOrder(order, signature);
        }
      }

      return NextResponse.json({
        success: true,
        source: 'signature',
        paymentSignature: signature,
      });
    }

    return NextResponse.json({
      success: false,
      message: 'No matching on-chain payment found for open requests',
      orderResults,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Recovery failed';
    console.error('[API] subscriptions/recover error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
