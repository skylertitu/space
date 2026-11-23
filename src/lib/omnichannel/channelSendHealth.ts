export type InboxChannel = 'messenger' | 'instagram' | 'telegram';

export interface ChannelSendHealth {
    configured: boolean;
    canSend: boolean;
    partial: boolean;
    reason: string;
}

function tokenOf(data: Record<string, any> | undefined): string {
    const token = data?.accessToken || data?.pageAccessToken || data?.token;
    return typeof token === 'string' ? token.trim() : '';
}

export function getChannelSendHealth(
    channel: InboxChannel,
    data?: Record<string, any> | null
): ChannelSendHealth {
    const status = String(data?.status || '');
    const configured = status === 'Connected' || status === 'Error';

    if (channel === 'telegram') {
        const token = typeof data?.botToken === 'string' ? data.botToken.trim() : '';
        const canSend = status === 'Connected' && token.includes(':');
        return {
            configured,
            canSend,
            partial: configured && !canSend,
            reason: 'Telegram no puede enviar. Falta el token del bot en Integraciones.',
        };
    }

    const token = tokenOf(data || undefined);
    const accountId = channel === 'instagram'
        ? String(data?.instagramId || data?.pageId || '')
        : String(data?.pageId || '');
    const canSend = status === 'Connected' && !!token && !!accountId;
    const label = channel === 'instagram' ? 'Instagram' : 'Messenger';
    return {
        configured,
        canSend,
        partial: configured && !canSend,
        reason: `${label} no puede enviar. Falta la cuenta conectada o el token en Integraciones.`,
    };
}

export function channelSendBlockReason(
    platform: string,
    docs: Record<string, any>,
    ready: boolean
): string | null {
    const key = platform.toLowerCase();
    const channel: InboxChannel | null =
        key === 'instagram' ? 'instagram'
        : key === 'messenger' || key === 'facebook' ? 'messenger'
        : key === 'telegram' ? 'telegram'
        : null;
    if (!channel || !ready) return null;
    const health = getChannelSendHealth(channel, docs[channel]);
    return health.canSend ? null : health.reason;
}
