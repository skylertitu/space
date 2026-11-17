import type { Firestore } from 'firebase-admin/firestore';

/**
 * Resolves Gemini API key for a tenant entity.
 * Priority: integrations/gemini (Connected) → platform env fallback.
 * Same source Humanizar uses at runtime.
 */
export async function resolveTenantGeminiKey(
    db: Firestore,
    userId: string,
    entityId: string
): Promise<string | null> {
    try {
        const snap = await db
            .doc(`users/${userId}/entities/${entityId}/integrations/gemini`)
            .get();

        if (snap.exists) {
            const data = snap.data() || {};
            if (data.status === 'Connected') {
                const key = String(data.apiKey || '').trim();
                if (key.length >= 20) return key;
            }
        }
    } catch (err) {
        console.warn('[resolveTenantGeminiKey] Firestore lookup failed:', err);
    }

    const fromEnv = (process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS || '')
        .split(',')
        .map((k) => k.trim())
        .find((k) => k.length >= 20);

    return fromEnv || null;
}
