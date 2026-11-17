import { db } from '@/lib/firebase-admin';
import { getSubscriptionCurrentDocPath } from './payment-config';
import {
  PLAN_CATALOG_USD,
  buildCheckoutPricing,
  computeUpgradeCharge,
} from './upgrade-pricing';

export async function resolveUpgradeChargeForUser(params: {
  userId: string;
  entityId?: string;
  targetPlanId: string;
  useLxr?: boolean;
}) {
  const subSnap = await db.doc(getSubscriptionCurrentDocPath(params.userId, params.entityId)).get();
  if (!subSnap.exists) {
    return { hasActive: false as const, chargeUSD: PLAN_CATALOG_USD[params.targetPlanId.toLowerCase()] ?? 0 };
  }

  const data = subSnap.data()!;
  const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
  const isExpired = expiresAt ? expiresAt.getTime() <= Date.now() : true;
  if (data.status !== 'active' || isExpired) {
    return { hasActive: false as const, chargeUSD: PLAN_CATALOG_USD[params.targetPlanId.toLowerCase()] ?? 0 };
  }

  const currentPriceUSD =
    typeof data.priceUSD === 'number'
      ? data.priceUSD
      : PLAN_CATALOG_USD[String(data.plan).toLowerCase()] ?? 0;

  // Una prueba gratuita (código de acceso, precio 0) no es una suscripción de pago: al pagar se empieza un
  // período nuevo completo y no se hereda el vencimiento de la prueba.
  if (currentPriceUSD <= 0 || data.paymentMethod === 'access_code') {
    return { hasActive: false as const, chargeUSD: PLAN_CATALOG_USD[params.targetPlanId.toLowerCase()] ?? 0 };
  }

  const pricing = buildCheckoutPricing({
    hasActiveSubscription: true,
    currentPriceUSD,
    expiresAt: data.expiresAt ?? null,
    activatedAt: data.activatedAt ?? null,
    targetPlanId: params.targetPlanId,
    useLxr: params.useLxr,
  });

  return {
    hasActive: true as const,
    currentPlan: String(data.plan),
    currentPriceUSD,
    ...pricing,
    quote: pricing.quote,
  };
}

export function assertClientChargeMatchesServer(
  clientChargeUSD: number,
  serverChargeUSD: number,
  tolerance = 0.02
) {
  return Math.abs(clientChargeUSD - serverChargeUSD) <= tolerance;
}

export { computeUpgradeCharge };
