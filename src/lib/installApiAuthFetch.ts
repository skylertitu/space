import { auth } from '@/lib/firebase';

let installed = false;

/**
 * Adjunta `Authorization: Bearer <Firebase ID token>` a todas las peticiones
 * fetch same-origin hacia `/api/*`, para que el servidor pueda verificar la
 * identidad (ver `guardApi` en lib/apiAuth.ts). Idempotente.
 */
export function installApiAuthFetch(): void {
    if (installed || typeof window === 'undefined') return;
    installed = true;

    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        try {
            const rawUrl =
                typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
            const url = new URL(rawUrl, window.location.origin);
            const isOwnApi = url.origin === window.location.origin && url.pathname.startsWith('/api/');

            if (isOwnApi) {
                await auth.authStateReady();
                const user = auth.currentUser;
                if (user) {
                    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
                    if (!headers.has('Authorization')) {
                        headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
                    }
                    return originalFetch(input, { ...init, headers });
                }
            }
        } catch {
            /* nunca bloquear la petición original por un fallo de auth */
        }
        return originalFetch(input, init);
    };
}
