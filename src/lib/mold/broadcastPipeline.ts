/**
 * Molde multitenant — pipeline de campañas WhatsApp ↔ omnicanal.
 * Cada tenant: users/{uid}/entities/{entityId}/...
 *
 * Fuente de verdad de mensajes: /conversations/{id}.messages
 * Kanban cards = punteros finos (sin messages/botState).
 */

/** Colecciones y documentos creados por el pipeline de broadcast. */
export const MOLD_BROADCAST_COLLECTIONS = {
    broadcasts: 'broadcasts',
    recipients: 'recipients',
    /** Índice inverso teléfono → campaña activa (consumido al primer reply). */
    replyIndex: 'broadcast_reply_index',
    /** Índice messageId Meta → recipient (delivery/read). */
    msgIndex: 'broadcast_msg_index',
    conversations: 'conversations',
} as const;

/** Campos obligatorios en broadcast.message al crear campaña con plantilla. */
export const MOLD_BROADCAST_MESSAGE_FIELDS = {
    templateBody: 'templateBody',
    messagePreview: 'messagePreview',
} as const;

/** Campos en recipients cuando el webhook confirma una respuesta. */
export const MOLD_BROADCAST_RECIPIENT_REPLY_FIELDS = {
    replyText: 'replyText',
    replyMessageId: 'replyMessageId',
    repliedAt: 'repliedAt',
    sentText: 'sentText',
} as const;

/** Campos de control de envío en el documento broadcast. */
export const MOLD_BROADCAST_SEND_CONTROL_FIELDS = {
    sendHeartbeatAt: 'sendHeartbeatAt',
    launchedAt: 'launchedAt',
    completedAt: 'completedAt',
} as const;

/** Rutas API del pipeline de campañas (servidor / tenant). */
export const MOLD_BROADCAST_API_ROUTES = {
    send: '/api/whatsapp/broadcast/send',
    finalize: '/api/whatsapp/broadcast/finalize',
    backfillChat: '/api/whatsapp/broadcast/backfill-chat',
} as const;

/** Metadatos en mensajes de conversación generados por campaña. */
export const MOLD_BROADCAST_CONVERSATION_MESSAGE = {
    source: 'broadcast',
    metadataSource: 'broadcast',
    isBroadcast: true,
} as const;
