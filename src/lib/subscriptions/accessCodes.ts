import crypto from 'crypto';
import { normalizePlan, type PlanId } from './plans';

/**
 * Códigos de prueba gratuita: desbloquean un plan por un tiempo limitado (30 días) para personas a las que el
 * dueño de la plataforma quiere regalar el acceso. Pasado el plazo la entidad vuelve a bloquearse (los datos se
 * conservan) hasta que se canjee otro código permitido o se pague.
 *
 * Por defecto se guardan solo los HASH de los códigos (no el texto) y se comparan sin distinguir mayúsculas.
 * Para cambiarlos sin tocar el código: SUBSCRIPTION_ACCESS_CODES="codigo:plan[:dias],codigo2:plan2[:dias]"
 * (si está definida REEMPLAZA a los códigos por defecto).
 */
export interface AccessCodeGrant {
    plan: PlanId;
    days: number;
}

export const DEFAULT_TRIAL_DAYS = 30;

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const normalize = (v: string) => v.trim().toLowerCase().replace(/\s+/g, '');

/** hash(sha256 del código en minúsculas) → plan que desbloquea */
const DEFAULT_CODE_HASHES: Record<string, PlanId> = {
    e2caca25ba466608f12abfca5df578fdc426ecdc04aef65e8b4ccbc41d93105c: 'starter',
    '9abe29e3d5723fe11c51d3a0e72919f7b2f092dc9e959eb2c875f5180e9a8c05': 'standard',
    '07267d2a8a9ebdc6d2598c7c700827eb4807fbe39688206aee3c7f2c561e3ab8': 'pro',
    a21892fa6c809df985c8844e49d58d9fa1cd4139091db2a762f9d51b37eb4014: 'enterprise',
};

function envOverride(): Array<{ hash: string; grant: AccessCodeGrant }> | null {
    const raw = (process.env.SUBSCRIPTION_ACCESS_CODES || '').trim();
    if (!raw) return null;
    const out: Array<{ hash: string; grant: AccessCodeGrant }> = [];
    for (const pair of raw.split(',')) {
        const [code, planRaw, daysRaw] = pair.trim().split(':');
        const plan = normalizePlan(planRaw ?? 'pro');
        const days = Number(daysRaw ?? DEFAULT_TRIAL_DAYS);
        if (code && plan && Number.isFinite(days) && days > 0) out.push({ hash: sha256(normalize(code)), grant: { plan, days } });
    }
    return out;
}

const safeEqualHex = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Devuelve el plan y los días que otorga un código, o null si no existe. */
export function findAccessCode(input: string): AccessCodeGrant | null {
    const hash = sha256(normalize(input));
    const override = envOverride();
    const table = override ?? Object.entries(DEFAULT_CODE_HASHES).map(([h, plan]) => ({ hash: h, grant: { plan, days: DEFAULT_TRIAL_DAYS } }));
    const hit = table.find((row) => safeEqualHex(row.hash, hash));
    return hit ? hit.grant : null;
}
