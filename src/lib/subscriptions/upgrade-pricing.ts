export const PLAN_CATALOG_USD: Record<string, number> = {
  starter: 49.99,
  standard: 99.99,
  pro: 199.99,
  plus: 199.99,
  enterprise: 999.99,
};

export const PLAN_CATALOG_ANNUAL_USD: Record<string, number> = {
  starter: 39.99 * 12,
  standard: 79.99 * 12,
  pro: 159.99 * 12,
  plus: 159.99 * 12,
  enterprise: 799.99 * 12,
};

// Pago con LXR: 25% menos que el precio en USD (los mismos precios que muestra la pantalla de planes).
/** Días de acceso que compra cada ciclo de facturación. */
export const PERIOD_DAYS = { monthly: 30, annual: 365 } as const;
export type BillingCycle = keyof typeof PERIOD_DAYS;

export const PLAN_CATALOG_LXR_USD: Record<string, number> = {
  starter: 37.49,
  standard: 74.99,
  pro: 149.99,
  enterprise: 749.99,
};

export interface UpgradeChargeQuote {
  isUpgrade: boolean;
  fullTargetPriceUSD: number;
  currentPriceUSD: number;
  unusedCreditUSD: number;
  amountDueUSD: number;
  daysRemaining: number;
  periodDays: number;
}

function roundUsd(value: number) {
  return Math.round(value * 100) / 100;
}

export function computeUpgradeCharge(params: {
  currentPriceUSD: number;
  targetPriceUSD: number;
  expiresAt?: string | null;
  activatedAt?: string | null;
}): UpgradeChargeQuote {
  const now = Date.now();
  const expiresMs = params.expiresAt ? new Date(params.expiresAt).getTime() : now;
  const activatedMs = params.activatedAt
    ? new Date(params.activatedAt).getTime()
    : expiresMs - 30 * 24 * 60 * 60 * 1000;

  const periodDays = Math.max(
    1,
    Math.ceil((expiresMs - activatedMs) / (24 * 60 * 60 * 1000))
  );
  const daysRemaining = Math.max(0, Math.ceil((expiresMs - now) / (24 * 60 * 60 * 1000)));

  // Crédito = precio del plan actual (lo ya pagado). A pagar = precio nuevo − precio actual.
  const unusedCreditUSD = roundUsd(params.currentPriceUSD);
  const amountDueUSD = roundUsd(Math.max(0, params.targetPriceUSD - unusedCreditUSD));

  return {
    isUpgrade: true,
    fullTargetPriceUSD: params.targetPriceUSD,
    currentPriceUSD: params.currentPriceUSD,
    unusedCreditUSD,
    amountDueUSD,
    daysRemaining,
    periodDays,
  };
}

export function getTargetPlanPrices(planId: string, useLxr = false) {
  const key = planId.toLowerCase();
  const fullTargetPriceUSD = PLAN_CATALOG_USD[key] ?? 0;
  const lxr = PLAN_CATALOG_LXR_USD[key];
  const targetPriceUSD =
    useLxr && lxr != null
      ? lxr
      : fullTargetPriceUSD;
  return { fullTargetPriceUSD, targetPriceUSD };
}

export function buildCheckoutPricing(params: {
  hasActiveSubscription: boolean;
  currentPriceUSD: number;
  expiresAt: string | null;
  activatedAt?: string | null;
  targetPlanId: string;
  useLxr?: boolean;
}) {
  const { fullTargetPriceUSD, targetPriceUSD } = getTargetPlanPrices(
    params.targetPlanId,
    params.useLxr
  );

  if (!params.hasActiveSubscription || params.currentPriceUSD <= 0) {
    return {
      chargeUSD: targetPriceUSD,
      fullTargetPriceUSD: targetPriceUSD,
      quote: null as UpgradeChargeQuote | null,
    };
  }

  const quote = computeUpgradeCharge({
    currentPriceUSD: params.currentPriceUSD,
    targetPriceUSD,
    expiresAt: params.expiresAt,
    activatedAt: params.activatedAt,
  });

  return {
    chargeUSD: quote.amountDueUSD,
    fullTargetPriceUSD,
    quote,
  };
}
