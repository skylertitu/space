/**
 * Opciones de FB.login para conectar Messenger, Instagram y WhatsApp.
 *
 * - Sin variables de configuración: inicio de sesión clásico con lista de permisos (`scope`). Es el comportamiento
 *   de siempre y funciona con la app de Meta actual.
 * - Con `NEXT_PUBLIC_META_CONFIG_ID_<CANAL>`: "Inicio de sesión con Facebook para empresas". Los permisos los define
 *   la configuración (config_id) creada en el panel de la app de Meta, no la lista de abajo.
 *
 * Las variables deben leerse con acceso literal (process.env.NEXT_PUBLIC_...) para que Next.js las incluya en el cliente.
 */
export type MetaLoginKind = 'messenger' | 'instagram' | 'whatsapp';

const SCOPES: Record<MetaLoginKind, string> = {
    messenger: 'pages_messaging,pages_show_list,pages_read_engagement',
    instagram: 'instagram_basic,instagram_manage_messages,instagram_manage_comments,pages_show_list,pages_read_engagement,pages_manage_metadata',
    whatsapp: 'whatsapp_business_management,whatsapp_business_messaging,business_management',
};

const CONFIG_IDS: Record<MetaLoginKind, string | undefined> = {
    messenger: process.env.NEXT_PUBLIC_META_CONFIG_ID_MESSENGER,
    instagram: process.env.NEXT_PUBLIC_META_CONFIG_ID_INSTAGRAM,
    whatsapp: process.env.NEXT_PUBLIC_META_CONFIG_ID_WHATSAPP,
};

export function metaLoginOptions(kind: MetaLoginKind): Record<string, unknown> {
    const configId = CONFIG_IDS[kind]?.trim();
    if (configId) {
        return { config_id: configId, response_type: 'token', override_default_response_type: true, return_scopes: true };
    }
    return { scope: SCOPES[kind], return_scopes: true };
}
