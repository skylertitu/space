/** Pide al servidor que verifique con Meta y registre el reclamo de una integración recién guardada. */
export async function claimIntegration(
    provider: 'messenger' | 'instagram' | 'whatsapp',
    userId: string,
    entityId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
        const res = await fetch('/api/integrations/claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, userId, entityId }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) return { ok: true };
        return { ok: false, message: data.message || 'No se pudo verificar la propiedad de la cuenta con Meta.' };
    } catch {
        return { ok: false, message: 'No se pudo verificar la propiedad de la cuenta con Meta.' };
    }
}
