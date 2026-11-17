import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';

/**
 * Verificación de firma de webhooks de proveedores (Meta, X, Pub/Sub de Gmail, Telegram).
 *
 * WEBHOOK_SIGNATURE_MODE:
 *   'log'     (por defecto) → verifica y registra el resultado, pero NO bloquea. Para desplegar con seguridad.
 *   'enforce' → rechaza (401) lo que no traiga firma válida.
 * Secuencia recomendada: desplegar en 'log', revisar en los logs de Vercel que aparezca
 * "[webhook-sig] ok", y entonces poner WEBHOOK_SIGNATURE_MODE=enforce.
 */
export function isEnforcing(): boolean {
    return (process.env.WEBHOOK_SIGNATURE_MODE || 'log').trim().toLowerCase() === 'enforce';
}

function safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function hmac(secret: string, rawBody: string, encoding: 'hex' | 'base64'): string {
    return crypto.createHmac('sha256', secret).update(rawBody).digest(encoding);
}

/** Apps de Meta de la plataforma: META_APP_SECRET y, opcionalmente, META_APP_SECRETS (lista separada por comas). */
function metaAppSecrets(): string[] {
    const clean = (v: string) => v.trim().replace(/^['"]|['"]$/g, '');
    return [process.env.META_APP_SECRET || '', ...(process.env.META_APP_SECRETS || '').split(',')]
        .map(clean)
        .filter(Boolean);
}

function reject(label: string, reason: string): NextResponse | null {
    if (isEnforcing()) {
        console.warn(`[webhook-sig] ${label} RECHAZADO: ${reason}`);
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    console.warn(`[webhook-sig] ${label} (modo log, se permite): ${reason}`);
    return null;
}

/** Meta (WhatsApp, Messenger, Instagram): cabecera X-Hub-Signature-256 = sha256=HMAC(app_secret, cuerpo crudo). */
export function checkMetaSignature(req: Request, rawBody: string, label: string): NextResponse | null {
    const secrets = metaAppSecrets();
    if (secrets.length === 0) return reject(label, 'META_APP_SECRET no configurado');

    const header = req.headers.get('x-hub-signature-256') || '';
    if (!header.startsWith('sha256=')) return reject(label, 'falta X-Hub-Signature-256');

    const received = header.slice('sha256='.length);
    if (secrets.some((s) => safeEqual(hmac(s, rawBody, 'hex'), received))) {
        console.log(`[webhook-sig] ${label} ok`);
        return null;
    }
    return reject(label, 'firma no coincide con ninguna app de Meta configurada');
}

/** X (Account Activity): cabecera x-twitter-webhooks-signature = sha256=base64(HMAC(consumer_secret, cuerpo)). */
export function checkTwitterSignature(req: Request, rawBody: string): NextResponse | null {
    const secret = (process.env.TWITTER_CONSUMER_SECRET || '').trim();
    if (!secret) return reject('x', 'TWITTER_CONSUMER_SECRET no configurado');

    const header = req.headers.get('x-twitter-webhooks-signature') || '';
    if (!header.startsWith('sha256=')) return reject('x', 'falta x-twitter-webhooks-signature');

    if (safeEqual(hmac(secret, rawBody, 'base64'), header.slice('sha256='.length))) {
        console.log('[webhook-sig] x ok');
        return null;
    }
    return reject('x', 'firma no coincide');
}

/**
 * Pub/Sub push de Gmail: Authorization: Bearer <JWT OIDC firmado por Google>.
 * Requiere configurar la suscripción push con autenticación (cuenta de servicio + audiencia):
 *   GMAIL_PUBSUB_AUDIENCE          → la misma "audience" de la suscripción (p. ej. la URL del webhook)
 *   GMAIL_PUBSUB_SERVICE_ACCOUNT   → (opcional) email de la cuenta de servicio de la suscripción
 */
const googleClient = new OAuth2Client();
export async function checkPubSubPush(req: Request): Promise<NextResponse | null> {
    const audience = (process.env.GMAIL_PUBSUB_AUDIENCE || '').trim();
    if (!audience) return reject('gmail', 'GMAIL_PUBSUB_AUDIENCE no configurado');

    const auth = req.headers.get('authorization') || '';
    if (!auth.toLowerCase().startsWith('bearer ')) return reject('gmail', 'falta token Bearer de Pub/Sub');

    try {
        const ticket = await googleClient.verifyIdToken({ idToken: auth.slice(7).trim(), audience });
        const payload = ticket.getPayload();
        const expectedSa = (process.env.GMAIL_PUBSUB_SERVICE_ACCOUNT || '').trim().toLowerCase();
        if (!payload?.email_verified) return reject('gmail', 'email del token no verificado');
        if (expectedSa && payload.email?.toLowerCase() !== expectedSa) {
            return reject('gmail', `cuenta de servicio inesperada: ${payload.email}`);
        }
        console.log('[webhook-sig] gmail ok');
        return null;
    } catch (e: any) {
        return reject('gmail', `token inválido: ${e?.message || e}`);
    }
}

/** Telegram: secret_token por entidad (se genera al registrar el webhook). */
export function newTelegramSecret(): string {
    return crypto.randomBytes(24).toString('hex');
}

export function telegramSecretMatches(req: Request, expected: string): boolean {
    return safeEqual(req.headers.get('x-telegram-bot-api-secret-token') || '', expected);
}
