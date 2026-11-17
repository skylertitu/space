/**
 * Utilidades de escritura Firestore del molde multitenant.
 * Firestore rechaza valores `undefined` en documentos anidados.
 */

/** Omite claves con valor `undefined` antes de setDoc/updateDoc. */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
    const out: Record<string, unknown> = {};
    Object.entries(obj).forEach(([k, v]) => {
        if (v !== undefined) out[k] = v;
    });
    return out as Partial<T>;
}

/** Sanitiza payloads anidados típicos de broadcast (segmentConfig, message, etc.). */
export function sanitizeFirestorePayload<T extends Record<string, unknown>>(obj: T): T {
    return stripUndefined(obj) as T;
}
