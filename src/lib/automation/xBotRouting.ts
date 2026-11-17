import { resolveBotsCollectionName } from './botStorage';

export type XInteractionType = 'dm' | 'comment';

export interface XBotRouting {
    platform: string;
    botsCollection: string;
    interactionType: XInteractionType;
}

export function resolveXBotRouting(interactionType: XInteractionType): XBotRouting {
    if (interactionType === 'comment') {
        return {
            platform: 'x_twitter_comments',
            botsCollection: resolveBotsCollectionName('x_twitter_comments'),
            interactionType: 'comment',
        };
    }
    return {
        platform: 'x_twitter',
        botsCollection: resolveBotsCollectionName('x_twitter'),
        interactionType: 'dm',
    };
}

/** True when the tweet is a reply, @mention, or quote directed at our account. */
export function isXCommentInteraction(tweet: Record<string, any>, ourUserId: string): boolean {
    if (!tweet || !ourUserId) return false;
    const authorId = tweet.user?.id_str || tweet.user?.id;
    if (String(authorId) === String(ourUserId)) return false;

    const mentions = tweet.entities?.user_mentions || [];
    const mentioned = mentions.some(
        (m: { id_str?: string; id?: string }) => String(m.id_str || m.id) === String(ourUserId)
    );
    const isReplyToUs = String(tweet.in_reply_to_user_id_str || '') === String(ourUserId);
    const isQuoteOfUs = String(tweet.quoted_status?.user?.id_str || '') === String(ourUserId);

    return mentioned || isReplyToUs || isQuoteOfUs;
}
