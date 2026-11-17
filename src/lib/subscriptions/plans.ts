/**
 * Qué desbloquea cada plan (fuente única, usada por el servidor y por la interfaz).
 *
 *   starter    → CTO y COO
 *   standard   → starter + CMO y CHRO
 *   pro        → todas las suites          (`plus` es un alias heredado de `pro`)
 *   enterprise → todas las suites + organigrama (gestión de personal y agentes SI)
 *
 * Los perfiles personales (`type: 'persona'`) son gratuitos y no usan suites.
 */
export const ALL_SUITES = ['board', 'ceo', 'coo', 'cfo', 'cto', 'cmo', 'chro', 'cso', 'cdo', 'ciso', 'cpo', 'clo'] as const;
export type SuiteId = (typeof ALL_SUITES)[number];

export type PlanId = 'starter' | 'standard' | 'pro' | 'enterprise';

const STARTER: SuiteId[] = ['cto', 'coo'];
const STANDARD: SuiteId[] = [...STARTER, 'cmo', 'chro'];

export const PLAN_SUITES: Record<PlanId, readonly SuiteId[]> = {
    starter: STARTER,
    standard: STANDARD,
    pro: ALL_SUITES,
    enterprise: ALL_SUITES,
};

export const PLAN_LABELS: Record<PlanId, string> = {
    starter: 'Starter',
    standard: 'Standard',
    pro: 'Pro',
    enterprise: 'Enterprise',
};

/** Orden para decidir "qué plan mínimo necesito". */
const PLAN_ORDER: PlanId[] = ['starter', 'standard', 'pro', 'enterprise'];

export function normalizePlan(plan: unknown): PlanId | null {
    const p = String(plan ?? '').trim().toLowerCase();
    if (p === 'plus') return 'pro';
    return (PLAN_ORDER as string[]).includes(p) ? (p as PlanId) : null;
}

export interface Entitlements {
    /** ¿La entidad tiene acceso vigente (suscripción activa o perfil personal)? */
    active: boolean;
    plan: PlanId | 'persona' | null;
    suites: SuiteId[];
    orgChart: boolean;
    /** Perfil personal gratuito. */
    free: boolean;
    expiresAt: string | null;
}

export const NO_ENTITLEMENTS: Entitlements = { active: false, plan: null, suites: [], orgChart: false, free: false, expiresAt: null };

export function entitlementsForPlan(plan: PlanId, expiresAt: string | null = null): Entitlements {
    return {
        active: true,
        plan,
        suites: [...PLAN_SUITES[plan]],
        orgChart: plan === 'enterprise',
        free: false,
        expiresAt,
    };
}

export function minimumPlanForSuite(suite: string): PlanId | null {
    return PLAN_ORDER.find((p) => (PLAN_SUITES[p] as readonly string[]).includes(suite)) ?? null;
}
