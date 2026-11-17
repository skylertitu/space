/** Parse Meta webhook change payloads (Instagram/Facebook comments). */

export interface ParsedMetaChange {
    field: string;
    isComment: boolean;
    commentId: string | null;
    mediaId: string | null;
    text: string;
    senderId: string | null;
    senderUsername: string | null;
    messageId: string | null;
}

export function isMetaCommentChange(changes: { field?: string; value?: Record<string, unknown> } | null | undefined): boolean {
    if (!changes) return false;
    const field = changes.field || '';
    const value = changes.value || {};
    return (
        field === 'comments' ||
        field === 'live_comments' ||
        field === 'mentions' ||
        (field === 'feed' && value.item === 'comment' && (value.verb === 'add' || !value.verb))
    );
}

export function parseMetaChange(
    changes: { field?: string; value?: Record<string, unknown> } | null | undefined
): ParsedMetaChange | null {
    if (!changes) return null;

    const field = String(changes.field || '');
    const value = changes.value || {};
    const isComment = isMetaCommentChange(changes);

    const commentId = value.comment_id
        ? String(value.comment_id)
        : value.id
          ? String(value.id)
          : null;

    const text = String(
        value.text || value.message || value.post_comment || ''
    ).trim();

    const senderId = value.from && typeof value.from === 'object'
        ? String((value.from as { id?: string }).id || '')
        : null;

    const senderUsername =
        value.from && typeof value.from === 'object'
            ? String((value.from as { username?: string }).username || '')
            : null;

    const messageId =
        commentId ||
        (value.message_id ? String(value.message_id) : null) ||
        (changes as { message_id?: string }).message_id ||
        null;

    return {
        field,
        isComment,
        commentId,
        mediaId: value.media && typeof value.media === 'object'
            ? String((value.media as { id?: string }).id || '')
            : value.parent_id
              ? String(value.parent_id)
              : null,
        text,
        senderId: senderId || null,
        senderUsername: senderUsername || null,
        messageId,
    };
}
