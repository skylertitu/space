/** Catálogo de integraciones disponibles en el molde multitenant (Master Connect). */
export const MOLD_INTEGRATIONS_CATALOG_VERSION = 2;

export const MOLD_INTEGRATION_IDS = [
    'whatsapp',
    'telegram',
    'messenger',
    'instagram',
    'gmail',
    'stripe',
    'gemini',
    'x_twitter',
] as const;

export type MoldIntegrationId = (typeof MOLD_INTEGRATION_IDS)[number];

export const MOLD_INTEGRATIONS_INIT = {
    encrypted: false,
    catalogVersion: MOLD_INTEGRATIONS_CATALOG_VERSION,
    available: [...MOLD_INTEGRATION_IDS],
    connectable: ['whatsapp', 'messenger', 'instagram', 'telegram', 'x_twitter', 'gmail', 'stripe', 'gemini'],
    payments: ['stripe'],
    email: ['gmail'],
} as const;
