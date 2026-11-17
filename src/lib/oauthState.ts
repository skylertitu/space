import crypto from 'crypto';

/**
 * `state` firmado para flujos OAuth (HMAC-SHA256 + expiración).
 * Evita que alguien forje userId/entityId en el callback y vincule una cuenta a la entidad de otro.
 * La clave deriva de GMAIL_CLIENT_SECRET (ya existe en el servidor); no requiere variables nuevas.
 */
const STATE_TTL_MS = 15 * 60 * 1000;

function getKey(): Buffer {
    const secret = process.env.GMAIL_CLIENT_SECRET?.trim();
    if (!secret) throw new Error('OAuth state: falta GMAIL_CLIENT_SECRET en el servidor');
    return crypto.createHash('sha256').update(`oauth-state:${secret}`).digest();
}

function sign(body: string): string {
    return crypto.createHmac('sha256', getKey()).update(body).digest('base64url');
}

export function signOAuthState(payload: Record<string, unknown>): string {
    const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + STATE_TTL_MS })).toString('base64url');
    return `${body}.${sign(body)}`;
}

/** Devuelve el payload si la firma es válida y no expiró; si no, null. */
export function verifyOAuthState<T = Record<string, any>>(state: string | null | undefined): T | null {
    if (!state) return null;
    const [body, signature] = state.split('.');
    if (!body || !signature) return null;
    try {
        const expected = Buffer.from(sign(body));
        const received = Buffer.from(signature);
        if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
        if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
        return payload as T;
    } catch {
        return null;
    }
}
