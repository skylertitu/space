import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { getSubscriptionCurrentDocPath } from '@/lib/subscriptions/payment-config';
import { PLAN_CATALOG_USD } from '@/lib/subscriptions/upgrade-pricing';
import { resolveUpgradeChargeForUser } from '@/lib/subscriptions/upgrade-pricing-server';
import { guardApi } from '@/lib/apiAuth';

export async function POST(request: NextRequest) {
    const denied = await guardApi(request);
    if (denied) return denied;
  try {
    const { userId, entityId, plan } = await request.json();

    if (!userId || !entityId || !plan) {
      return NextResponse.json({ error: 'Missing userId, entityId, or plan' }, { status: 400 });
    }

    // Solo planes del catálogo (con precio). Sin esto, un plan sin precio (p. ej. enterprise) calculaba
    // un cobro de $0 y se "mejoraba" gratis.
    const planKey = String(plan).toLowerCase();
    if (!PLAN_CATALOG_USD[planKey]) {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
    }

    const resolved = await resolveUpgradeChargeForUser({
      userId,
      entityId,
      targetPlanId: planKey,
    });

    if (!resolved.hasActive) {
      return NextResponse.json({ error: 'No active subscription to upgrade' }, { status: 400 });
    }

    if (resolved.chargeUSD > 0.01) {
      return NextResponse.json(
        { error: 'Payment required for this upgrade', chargeUSD: resolved.chargeUSD },
        { status: 400 }
      );
    }

    const catalogPrice = PLAN_CATALOG_USD[String(plan).toLowerCase()] ?? resolved.fullTargetPriceUSD;
    const now = new Date();
    const subSnap = await db.doc(getSubscriptionCurrentDocPath(userId, entityId)).get();
    const existing = subSnap.exists ? subSnap.data()! : null;
    const expiresAtIso =
      existing?.expiresAt && new Date(existing.expiresAt).getTime() > now.getTime()
        ? String(existing.expiresAt)
        : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const activatedAtIso = existing?.activatedAt
      ? String(existing.activatedAt)
      : now.toISOString();

    await db.doc(getSubscriptionCurrentDocPath(userId, entityId)).set(
      {
        status: 'active',
        plan: planKey,
        priceUSD: catalogPrice,
        paymentMethod: 'upgrade_credit',
        upgradedAt: now.toISOString(),
        activatedAt: activatedAtIso,
        expiresAt: expiresAtIso,
        updatedAt: now.toISOString(),
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        priorCreditApplied: resolved.quote?.unusedCreditUSD ?? 0,
      },
      { merge: true }
    );

    return NextResponse.json({ success: true, plan: planKey, expiresAt: expiresAtIso });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Upgrade failed';
    console.error('[API] subscriptions/upgrade error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
