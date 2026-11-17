type MessageLike = {
    sender?: string;
    timestamp?: unknown;
};

function parseMessageTimestamp(raw: unknown): Date | null {
    if (!raw) return null;

    try {
        const ts = raw as Record<string, unknown>;
        if (typeof (ts as { toDate?: () => Date }).toDate === 'function') {
            return (ts as { toDate: () => Date }).toDate();
        }
        if (typeof ts.seconds === 'number') {
            return new Date(ts.seconds * 1000);
        }
        if (raw instanceof Date) return raw;
        if (typeof raw === 'string' || typeof raw === 'number') {
            const parsed = new Date(raw);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        }
    } catch {
        return null;
    }

    return null;
}

/** Último mensaje entrante del contacto (no agente). */
export function getLastUserMessageTimestamp(
    messages: MessageLike[] = [],
    now: Date = new Date()
): Date | null {
    const userMessages = messages.filter((m) => m.sender !== 'agent');
    if (userMessages.length === 0) return null;

    const lastUserMsg = userMessages[userMessages.length - 1];
    return parseMessageTimestamp(lastUserMsg.timestamp) ?? now;
}

/** Ventana de sesión activa de WhatsApp (menos de 24 h desde el último mensaje del cliente). */
export function isWithinWhatsAppSessionWindow(
    messages: MessageLike[] = [],
    now: Date = new Date()
): boolean {
    const lastUserAt = getLastUserMessageTimestamp(messages, now);
    if (!lastUserAt) return false;

    const diffHours = (now.getTime() - lastUserAt.getTime()) / (1000 * 60 * 60);
    return diffHours < 24;
}

/**
 * Fuera de sesión o sin mensajes previos del cliente → Meta exige plantilla aprobada.
 */
export function requiresWhatsAppTemplate(
    messages: MessageLike[] = [],
    now: Date = new Date()
): boolean {
    return !isWithinWhatsAppSessionWindow(messages, now);
}

export function buildWhatsAppTemplatePayload(
    messageText: string,
    settings: {
        outboundTemplateName: string;
        outboundTemplateLanguage: string;
        outboundTemplateUsesBodyParam: boolean;
    }
) {
    const template: Record<string, unknown> = {
        name: settings.outboundTemplateName,
        language: { code: settings.outboundTemplateLanguage },
    };

    if (settings.outboundTemplateUsesBodyParam && messageText.trim()) {
        template.components = [
            {
                type: 'body',
                parameters: [{ type: 'text', text: messageText }],
            },
        ];
    }

    return {
        type: 'template' as const,
        template,
    };
}
