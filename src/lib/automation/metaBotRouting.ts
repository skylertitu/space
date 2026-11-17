import { resolveBotsCollectionName } from './botStorage';

export interface MetaBotRouting {
    platform: string;
    botsCollection: string;
}

/** Routes Meta webhook events to the correct isolated bot collection. */
export function resolveMetaBotRouting(
    objectType: string | undefined,
    provider: 'messenger' | 'instagram',
    changes?: { field?: string; value?: { item?: string } } | null
): MetaBotRouting {
    const field = changes?.field || '';
    const isComment =
        !!changes &&
        (field === 'comments' ||
            field === 'live_comments' ||
            field === 'feed' ||
            changes?.value?.item === 'comment' ||
            field === 'mentions');

    if (isComment) {
        if (objectType === 'instagram' || provider === 'instagram') {
            return {
                platform: 'instagram_comments',
                botsCollection: resolveBotsCollectionName('instagram_comments'),
            };
        }
        return {
            platform: 'facebook_comments',
            botsCollection: resolveBotsCollectionName('facebook_comments'),
        };
    }

    if (provider === 'instagram') {
        return {
            platform: 'instagram',
            botsCollection: resolveBotsCollectionName('instagram'),
        };
    }

    return {
        platform: 'messenger',
        botsCollection: resolveBotsCollectionName('messenger'),
    };
}
