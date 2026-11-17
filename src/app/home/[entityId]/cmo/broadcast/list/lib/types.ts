// Shared types for the Broadcast / Campaign feature.

export type BroadcastStatus =
    | "Draft"
    | "Scheduled"
    | "Sending"
    | "Completed"
    | "Failed"
    | "Paused";

export type MessageKind = "template" | "text" | "media";
export type MediaType = "image" | "audio" | "document" | "video";

// Serializable description of what to send for a campaign.
export interface BroadcastMessage {
    kind: MessageKind;
    // Template (Meta approved)
    templateName?: string;
    templateLanguage?: string;
    templateVariables?: string[]; // e.g. ["{{1}}", "{{2}}"]
    templateParamValues?: Record<string, string>; // {{1}} -> "{{Nombre}}" (dynamic token or literal)
    /** Meta template BODY text at creation time (for chat preview / history). */
    templateBody?: string;
    /** Resolved preview shown in the campaign builder (param values applied). */
    messagePreview?: string;
    // Plain text (only valid inside the 24h customer service window)
    text?: string;
    // Media
    mediaType?: MediaType;
    mediaUrl?: string;
    caption?: string;
    filename?: string;
}

// Segment definition used to resolve recipients from the contacts/kanban data.
export interface SegmentConfig {
    type:
        | "all"
        | "tag"
        | "country"
        | "kanban_group"
        | "kanban_board_column"
        | "created_recent"
        | "inactive"
        | "stage"
        | "manual";
    // Parameters depending on type
    tag?: string;
    countryIso?: string;
    kanbanGroupId?: string;
    kanbanGroupName?: string;
    /** Hub kanban board column targeting */
    kanbanBoardSource?: "principal" | "manual_crm" | "custom";
    kanbanBoardId?: string;
    kanbanBoardName?: string;
    kanbanColumnId?: string;
    kanbanColumnName?: string;
    botId?: string;
    stage?: string;
    days?: number; // for created_recent / inactive
    label?: string; // human readable label for display
    manualRecipients?: BroadcastRecipient[];
}

export interface BroadcastStats {
    total: number;
    pending: number;
    sent: number;
    failed: number;
    delivered: number;
    read: number;
    replied: number;
}

export interface Broadcast {
    id: string;
    status: BroadcastStatus;
    broadcastTime: string;
    name: string;
    labels: string;
    channel: string;
    segment: string;
    recipients: number;
    totalMessages: number;
    // Extended (persisted) fields
    segmentConfig?: SegmentConfig;
    message?: BroadcastMessage;
    botId?: string | null;
    botName?: string | null;
    /** WhatsApp number slot to send FROM (general | support | broadcast). Empty = default number. */
    senderSlot?: string | null;
    senderPhoneNumberId?: string | null;
    deliverySpeed?: string;
    sendImmediately?: boolean;
    scheduleAt?: string | null;
    stats?: BroadcastStats;
    createdAt?: any;
    launchedAt?: any;
    completedAt?: any;
}

export type RecipientStatus =
    | "pending"
    | "sent"
    | "failed"
    | "delivered"
    | "read"
    | "replied";

export interface BroadcastRecipient {
    id: string;
    contactId: string;
    name: string;
    phone: string;
    country?: string;
    countryFlag?: string;
    countryIso?: string;
    kanbanGroupId?: string;
    kanbanGroupName?: string;
    status: RecipientStatus;
    error?: string | null;
    messageId?: string | null;
    sentText?: string | null;
    sentAt?: any;
    repliedAt?: any;
    /** Inbound text captured when webhook marks recipient as replied. */
    replyText?: string | null;
    replyMessageId?: string | null;
}

export const emptyStats = (): BroadcastStats => ({
    total: 0,
    pending: 0,
    sent: 0,
    failed: 0,
    delivered: 0,
    read: 0,
    replied: 0,
});
