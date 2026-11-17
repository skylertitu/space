/** Server-safe bot collection resolver (no React imports). */

const PLATFORM_TO_COLLECTION: Record<string, string> = {
    whatsapp: 'chatbots',
    messenger: 'messenger-bots',
    instagram: 'instagram-dm-bots',
    instagram_comments: 'instagram-comment-bots',
    facebook_comments: 'facebook-comment-bots',
    x_twitter: 'x-bots',
    x_twitter_comments: 'x-comment-bots',
    x: 'x-bots',
    telegram: 'telegram-bots',
    tiktok: 'tiktok-bots',
    tiktok_comments: 'tiktok-comment-bots',
    snapchat: 'snapchat-bots',
    snapchat_comments: 'snapchat-comment-bots',
    linkedin: 'linkedin-bots',
    linkedin_comments: 'linkedin-comment-bots',
    gmail: 'gmail-bots',
};

export function resolveBotsCollectionName(platform: string, override?: string): string {
    if (override) return override;
    const key = platform.toLowerCase().trim();
    return PLATFORM_TO_COLLECTION[key] || 'chatbots';
}

export function isIsolatedBotCollection(collectionName: string): boolean {
    return collectionName !== 'chatbots';
}
