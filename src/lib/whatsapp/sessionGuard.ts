import {
    buildWhatsAppTemplatePayload,
    isWithinWhatsAppSessionWindow,
    requiresWhatsAppTemplate,
} from '@/lib/omnichannel/whatsappSessionWindow';
import { resolveWhatsAppMessagingSettings } from '@/lib/mold/whatsappMessaging';

type MessageLike = { sender?: string; timestamp?: unknown };

export interface WhatsAppSendGuardResult {
    withinSession: boolean;
    useTemplate: boolean;
    templatePayload?: ReturnType<typeof buildWhatsAppTemplatePayload>;
    blockSend?: boolean;
    blockReason?: string;
}

/**
 * Determines whether a WhatsApp outbound text should be sent as session message or template.
 */
export function resolveWhatsAppSendGuard(
    messages: MessageLike[] = [],
    messageText: string,
    entityData?: Record<string, unknown> | null,
    forceTemplate = false
): WhatsAppSendGuardResult {
    const settings = resolveWhatsAppMessagingSettings(entityData);
    const withinSession = isWithinWhatsAppSessionWindow(messages);
    const useTemplate = forceTemplate || requiresWhatsAppTemplate(messages);

    if (!useTemplate) {
        return { withinSession, useTemplate: false };
    }

    if (settings.blockOutboundAfter24h) {
        return {
            withinSession,
            useTemplate: true,
            blockSend: true,
            blockReason: 'Fuera de la ventana de 24h. Configura una plantilla aprobada o espera respuesta del cliente.',
        };
    }

    return {
        withinSession,
        useTemplate: true,
        templatePayload: buildWhatsAppTemplatePayload(messageText, settings),
    };
}
