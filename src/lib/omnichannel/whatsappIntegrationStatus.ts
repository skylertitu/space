export type WhatsAppHealthLevel = 'offline' | 'partial' | 'ready';

export interface WhatsAppIntegrationHealth {
    level: WhatsAppHealthLevel;
    label: string;
    canSend: boolean;
    canReceive: boolean;
    hasPhoneNumberId: boolean;
    hasAccessToken: boolean;
    hasWabaId: boolean;
    phoneNumberId?: string;
    wabaId?: string;
    displayPhoneNumber?: string;
}

function resolveToken(data: Record<string, any> | undefined): string | undefined {
    if (!data) return undefined;
    const token = data.accessToken || data.token || data.access_token;
    return token && typeof token === 'string' && token.startsWith('EAA') ? token : undefined;
}

function resolvePhoneId(data: Record<string, any> | undefined): string | undefined {
    if (!data) return undefined;
    const phone = data.phoneNumberId || data.phone_number_id || data.phoneId;
    return phone ? String(phone) : undefined;
}

/** Merge `whatsapp` + `whatsapp_internal` docs into one effective config. */
export function mergeWhatsAppIntegrationDocs(
    standard?: Record<string, any>,
    internal?: Record<string, any>
): Record<string, any> | undefined {
    if (!standard && !internal) return undefined;
    return { ...(internal || {}), ...(standard || {}) };
}

export function getWhatsAppIntegrationHealth(
    standard?: Record<string, any>,
    internal?: Record<string, any>
): WhatsAppIntegrationHealth {
    const data = mergeWhatsAppIntegrationDocs(standard, internal);
    const phoneNumberId = resolvePhoneId(data);
    const accessToken = resolveToken(data);
    const wabaId = data?.wabaId ? String(data.wabaId) : undefined;
    const displayPhoneNumber = data?.displayPhoneNumber;
    const status = data?.status;
    const isLinked = status === 'Connected' || status === 'Internal';

    const base = {
        hasPhoneNumberId: !!phoneNumberId,
        hasAccessToken: !!accessToken,
        hasWabaId: !!wabaId,
        phoneNumberId,
        wabaId,
        displayPhoneNumber,
    };

    if (isLinked && phoneNumberId && accessToken) {
        return {
            ...base,
            level: 'ready',
            label: 'Listo para omnicanal',
            canSend: true,
            canReceive: true,
        };
    }

    if (isLinked && phoneNumberId && !accessToken) {
        return {
            ...base,
            level: 'partial',
            label: 'Falta Access Token',
            canSend: false,
            canReceive: true,
        };
    }

    if (isLinked) {
        return {
            ...base,
            level: 'partial',
            label: 'Configuración incompleta',
            canSend: false,
            canReceive: false,
        };
    }

    return {
        ...base,
        level: 'offline',
        label: 'Sin conectar',
        canSend: false,
        canReceive: false,
    };
}
