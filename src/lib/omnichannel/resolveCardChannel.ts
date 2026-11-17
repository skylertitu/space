/** Normalized channel key for omnichannel / kamban UI filtering and icons. */

export type ResolvedCardChannel =
    | 'whatsapp'
    | 'instagram'
    | 'instagram_comments'
    | 'messenger'
    | 'telegram'
    | 'gmail'
    | 'x'
    | 'tiktok'
    | 'snapchat'
    | 'web'
    | 'others';

export function resolveCardChannel(card: Record<string, any> | null | undefined): ResolvedCardChannel {
    if (!card) return 'others';

    const explicitChannel = String(card.channel || card.source || card.primary_channel || '').toLowerCase();

    if (explicitChannel.includes('instagram_comment') || explicitChannel === 'instagram_comments') {
        return 'instagram_comments';
    }
    if (explicitChannel.includes('gmail') || explicitChannel.includes('email')) return 'gmail';
    if (explicitChannel.includes('instagram')) return 'instagram';
    if (explicitChannel.includes('messenger') || explicitChannel.includes('facebook')) return 'messenger';
    if (explicitChannel.includes('snapchat')) return 'snapchat';
    if (explicitChannel.includes('telegram')) return 'telegram';
    if (explicitChannel.includes('twitter') || explicitChannel === 'x') return 'x';
    if (explicitChannel.includes('tiktok')) return 'tiktok';
    if (explicitChannel.includes('web')) return 'web';
    if (explicitChannel.includes('whatsapp') || explicitChannel === 'manual') return 'whatsapp';

    if (card.platform === 'gmail' || card.metadata?.platform === 'gmail') return 'gmail';

    if (card.platform_ids?.instagram) return 'instagram';
    if (card.platform_ids?.messenger) return 'messenger';
    if (card.platform_ids?.telegram) return 'telegram';
    if (card.platform_ids?.whatsapp) return 'whatsapp';

    if (card.metaSenderId) {
        const src = String(card.source || '').toLowerCase();
        if (src.includes('instagram')) return 'instagram';
        return 'messenger';
    }

    if (card.contactNumber) return 'whatsapp';

    return 'others';
}

/** True when card belongs to Instagram DM or comment threads. */
export function isInstagramCard(card: Record<string, any> | null | undefined): boolean {
    const ch = resolveCardChannel(card);
    return ch === 'instagram' || ch === 'instagram_comments';
}

/** Omnichannel list badge channel (comments still show Instagram branding). */
export function resolveOmnichannelBadge(card: Record<string, any> | null | undefined): string {
    const ch = resolveCardChannel(card);
    if (ch === 'instagram_comments') return 'instagram';
    if (ch === 'others') return 'whatsapp';
    return ch;
}
