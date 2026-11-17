import { getSubscriptionPaymentConfig, type SubscriptionPaymentMethod } from './payment-config';

/**
 * Cotización calculada EN EL SERVIDOR del monto de tokens a cobrar.
 * Antes el monto salía del navegador: alguien podía pedir el plan Pro y pagar una fracción de centavo.
 */
const SOL_MINT = 'So11111111111111111111111111111111111111112';

async function fetchUsdPrice(mint: string): Promise<number | null> {
    try {
        const res = await fetch(`https://api.jup.ag/price/v3?ids=${mint}`, { cache: 'no-store' });
        if (!res.ok) return null;
        const data = (await res.json()) as Record<string, { usdPrice?: number }>;
        const price = data?.[mint]?.usdPrice;
        return typeof price === 'number' && price > 0 ? price : null;
    } catch {
        return null;
    }
}

export type TokenQuote = { ok: true; ui: string; raw: string } | { ok: false; error: string };

function toUiAndRaw(value: number, decimals: number, round: 'ceil' | 'round') {
    const factor = 10 ** decimals;
    const rawNum = round === 'ceil' ? Math.ceil(value * factor - 1e-9) : Math.round(value * factor);
    const raw = String(rawNum);
    const padded = raw.padStart(decimals + 1, '0');
    const ui = `${padded.slice(0, -decimals) || '0'}.${padded.slice(-decimals)}`.replace(/\.?0+$/, '');
    return { ui, raw };
}

export async function quoteTokenAmount(chargeUSD: number, method: SubscriptionPaymentMethod): Promise<TokenQuote> {
    const cfg = getSubscriptionPaymentConfig(method);
    if (!(chargeUSD > 0)) return { ok: false, error: 'Monto inválido.' };

    if (method === 'usdc' || method === 'usdt') {
        const { ui, raw } = toUiAndRaw(chargeUSD, cfg.decimals, 'round');
        return { ok: true, ui, raw };
    }

    const mint = method === 'sol' ? SOL_MINT : cfg.mint;
    const price = mint ? await fetchUsdPrice(mint) : null;
    if (!price) return { ok: false, error: `No se pudo obtener el precio de ${cfg.label} ahora. Intenta de nuevo o paga con USDC/USDT.` };

    // ceil: nunca cobrar de menos por redondeo
    const { ui, raw } = toUiAndRaw(chargeUSD / price, cfg.decimals, 'ceil');
    return { ok: true, ui, raw };
}
