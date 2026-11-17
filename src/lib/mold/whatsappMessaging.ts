/** Política de envío WhatsApp Cloud API — valores por defecto del molde multitenant. */

export interface WhatsAppMessagingSettings {
    /**
     * Si es true, no se envían mensajes fuera de la ventana de 24 h
     * (evita el costo de plantillas / conversaciones iniciadas por el negocio).
     */
    blockOutboundAfter24h?: boolean;
    /** Plantilla aprobada en Meta para reabrir o iniciar conversación. */
    outboundTemplateName?: string;
    outboundTemplateLanguage?: string;
    /** Si la plantilla tiene {{1}} en el cuerpo, se rellena con el texto del agente. */
    outboundTemplateUsesBodyParam?: boolean;
}

export const MOLD_WHATSAPP_MESSAGING: Required<WhatsAppMessagingSettings> = {
    blockOutboundAfter24h: false,
    outboundTemplateName: 'hello_world',
    outboundTemplateLanguage: 'en_US',
    outboundTemplateUsesBodyParam: false,
};

export function resolveWhatsAppMessagingSettings(
    entityData?: Record<string, unknown> | null
): Required<WhatsAppMessagingSettings> {
    const fromEntity = (entityData?.whatsappMessaging || {}) as WhatsAppMessagingSettings;
    return {
        blockOutboundAfter24h:
            fromEntity.blockOutboundAfter24h ?? MOLD_WHATSAPP_MESSAGING.blockOutboundAfter24h,
        outboundTemplateName:
            fromEntity.outboundTemplateName ?? MOLD_WHATSAPP_MESSAGING.outboundTemplateName,
        outboundTemplateLanguage:
            fromEntity.outboundTemplateLanguage ?? MOLD_WHATSAPP_MESSAGING.outboundTemplateLanguage,
        outboundTemplateUsesBodyParam:
            fromEntity.outboundTemplateUsesBodyParam ?? MOLD_WHATSAPP_MESSAGING.outboundTemplateUsesBodyParam,
    };
}
