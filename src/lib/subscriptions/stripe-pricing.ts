/** Comisión de Stripe que se suma al precio para que la plataforma reciba exactamente el neto (2.9% + $0.30). */
export function grossFromNet(netUSD: number) {
    const gross = Math.round(((netUSD + 0.3) / (1 - 0.029)) * 100) / 100;
    const fee = Math.round((gross - netUSD) * 100) / 100;
    return { grossUSD: gross, feeUSD: fee, amountInCents: Math.round(gross * 100) };
}
