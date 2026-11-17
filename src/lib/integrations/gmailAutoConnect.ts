import type { User } from 'firebase/auth';

const BOOTSTRAP_KEY = 'roosevelt_gmail_bootstrap';

export type GmailBootstrapPayload = {
    userId: string;
    email: string | null;
    entityIds?: string[];
};

export function isGoogleLoginUser(user: User | null | undefined): boolean {
    return !!user?.providerData?.some((provider) => provider.providerId === 'google.com');
}

export type GmailConnectionState = 'connected' | 'pending_authorization' | 'not_connected';

export function getGmailConnectionState(
    user: User | null | undefined,
    integrationData?: { status?: string; accountCount?: number; accounts?: unknown[] } | null
): GmailConnectionState {
    if (
        integrationData?.status === 'Connected' ||
        (integrationData?.accountCount ?? 0) > 0 ||
        (integrationData?.accounts?.length ?? 0) > 0
    ) {
        return 'connected';
    }
    if (isGoogleLoginUser(user)) return 'pending_authorization';
    return 'not_connected';
}

export function getGoogleLoginEmail(user: User | null | undefined): string | null {
    if (!user) return null;
    const googleProvider = user.providerData.find((provider) => provider.providerId === 'google.com');
    return googleProvider?.email || user.email || null;
}

export function queueGmailBootstrap(payload: GmailBootstrapPayload) {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(BOOTSTRAP_KEY, JSON.stringify(payload));
}

export function readGmailBootstrap(): GmailBootstrapPayload | null {
    if (typeof window === 'undefined') return null;
    const raw = sessionStorage.getItem(BOOTSTRAP_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as GmailBootstrapPayload;
    } catch {
        return null;
    }
}

export function clearGmailBootstrap() {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(BOOTSTRAP_KEY);
}

export async function openGmailConnectPopup(options: {
    userId: string;
    entityId: string;
    entityIds?: string[];
    loginHint?: string | null;
    mode?: 'default' | 'add';
}): Promise<'success' | 'error' | 'blocked'> {
    const params = new URLSearchParams({
        e: options.entityId,
        u: options.userId,
    });
    if (options.loginHint) params.set('hint', options.loginHint);
    if (options.entityIds?.length) params.set('entities', options.entityIds.join(','));
    if (options.mode === 'add') params.set('mode', 'add');

    const res = await fetch(`/api/gmail/auth-url?${params.toString()}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) {
        throw new Error(data.details || data.error || 'No se pudo iniciar la conexión con Gmail.');
    }

    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
        data.url,
        'Google Gmail Connect',
        `width=${width},height=${height},left=${left},top=${top}`
    );

    if (!popup) {
        window.location.href = data.url;
        return 'blocked';
    }

    return new Promise((resolve) => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data === 'gmail-auth-success') {
                window.removeEventListener('message', handleMessage);
                resolve('success');
            } else if (event.data === 'gmail-auth-error') {
                window.removeEventListener('message', handleMessage);
                resolve('error');
            }
        };
        window.addEventListener('message', handleMessage);
    });
}
