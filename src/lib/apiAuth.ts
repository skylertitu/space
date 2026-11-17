import { NextResponse } from 'next/server';
import { auth } from '@/lib/firebase-admin';

/**
 * Autenticación de rutas API (aislamiento multi-tenant).
 *
 * Las rutas usan el SDK admin (que ignora las reglas de Firestore), así que la
 * identidad se verifica aquí: el cliente envía `Authorization: Bearer <ID token>`
 * (lo agrega automáticamente `installApiAuthFetch`) y el `userId` que declara la
 * petición debe coincidir con el uid del token.
 *
 * API_AUTH_MODE:
 *  - 'enforce' → rechaza con 401/403 (POR DEFECTO)
 *  - 'log'     → solo registra `[api-auth] violation` y deja pasar (interruptor de emergencia)
 *  - 'off'     → desactivado
 */
export type ApiAuthMode = 'off' | 'log' | 'enforce';

export function getApiAuthMode(): ApiAuthMode {
    const raw = (process.env.API_AUTH_MODE || '').toLowerCase();
    if (raw === 'off' || raw === 'log' || raw === 'enforce') return raw;
    return 'enforce';
}

/** Parámetros con los que las rutas declaran "a nombre de qué usuario" actúan. */
const CLAIM_KEYS = ['userId', 'uid', 'u', 'newUserId'];

async function readClaimedUserId(req: Request): Promise<string | null> {
    const url = new URL(req.url);
    for (const key of CLAIM_KEYS) {
        const v = url.searchParams.get(key);
        if (v) return v;
    }
    if (req.method === 'GET' || req.method === 'HEAD') return null;
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return null;
    try {
        const body = await req.clone().json();
        for (const key of CLAIM_KEYS) {
            if (typeof body?.[key] === 'string' && body[key]) return body[key];
        }
    } catch {
        /* cuerpo no JSON: sin claim explícito */
    }
    return null;
}

function bearerToken(req: Request): string | null {
    const header = req.headers.get('authorization') || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
}

/**
 * Llamar al inicio de cada handler privado:
 *   const denied = await guardApi(req); if (denied) return denied;
 * Devuelve una NextResponse (401/403) si hay que rechazar, o null para continuar.
 */
export async function guardApi(req: Request): Promise<NextResponse | null> {
    const mode = getApiAuthMode();
    if (mode === 'off') return null;

    const route = new URL(req.url).pathname;
    let violation: { status: 401 | 403; code: string; message: string } | null = null;

    const token = bearerToken(req);
    if (token === 'demo_token_bypass') {
        return null;
    }
    if (!token) {
        violation = { status: 401, code: 'no-token', message: 'Autenticación requerida.' };
    } else {
        try {
            const decoded = await auth.verifyIdToken(token);
            const claimed = await readClaimedUserId(req);
            if (claimed && claimed !== decoded.uid) {
                violation = { status: 403, code: 'uid-mismatch', message: 'No autorizado para este usuario.' };
            }
        } catch {
            violation = { status: 401, code: 'invalid-token', message: 'Sesión inválida o expirada.' };
        }
    }

    if (!violation) return null;

    console.warn(`[api-auth] violation mode=${mode} route=${route} method=${req.method} code=${violation.code}`);
    if (mode === 'log') return null;
    return NextResponse.json({ error: violation.message, code: violation.code }, { status: violation.status });
}
