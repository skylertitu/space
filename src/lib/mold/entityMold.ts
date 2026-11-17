import { doc, getDoc, setDoc, serverTimestamp, Firestore } from 'firebase/firestore';
import { ensureManualKanbanInitialized } from '@/lib/kanban/manualKanban';
import { ensureCustomKanbanHubInitialized } from '@/lib/kanban/customKanbanBoards';
import { MOLD_WHATSAPP_MESSAGING } from './whatsappMessaging';
import { SYSTEM_INBOX_GROUP_FIELDS, SYSTEM_INBOX_GROUP_ID } from '@/lib/kanban/botNodeGroups';
import {
    STARTER_CHATBOT_COUNTER,
    STARTER_CHATBOT_FIELDS,
    STARTER_CHATBOT_ID,
} from './starterChatbot';
import { ensureWhatsAppBotPhoneBinding } from './whatsappBotPhoneBinding';
import { ensureWhatsAppSlotNormalization } from './whatsappSlotNormalization';
import { ensureEntitySlugNormalization } from './entitySlugNormalization';
import { isSlugOwnedByOtherEntity } from './entityRouteContract';
import { MOLD_INTEGRATIONS_INIT } from './integrationsCatalog';

/** Incrementar cuando el molde multitenant gane nuevas estructuras obligatorias. */
export const ENTITY_MOLD_VERSION = 21;

export const ENTITY_MOLD_FEATURES = {
    workspaceHub: true,
    /** Rediseño Plano Cartesiano Workspace (esquema claro/oscuro puro, láminas 3D transparentes, barra inferior de controles, toggle plano). */
    workspaceCartesianPlaneV2: true,
    botKanban: true,
    manualKanban: true,
    whatsappOutbound: true,
    whatsappBroadcast: true,
    whatsappMultiNumber: true,
    whatsappInboundMedia: true,
    botAdvancedNodes: true,
    /** Conversaciones estables (messages/botState fuera del kanban). */
    conversationsStore: true,
    /** Switch Humanizar en chatbots (tono vía LLM, flujo manda). */
    flowHumanize: true,
    /** Integración Gemini por entidad en /cto/integrations. */
    geminiIntegration: true,
    /** Stripe por entidad (claves en integrations/stripe + stripe_internal). */
    stripeIntegration: true,
    /** Gmail multi-cuenta (personal + Google Workspace) por entidad. */
    gmailMultiAccount: true,
    /** Auto-conectar Gmail tras login con Google (OAuth bootstrap). */
    gmailGoogleLoginBootstrap: true,
    /** Hub de integraciones rediseñado (ancho completo, tarjetas). */
    integrationsHubV2: true,
    /** Exportar reglas/nodos JSON desde el editor de chatbots. */
    chatbotRulesExport: true,
    /** Importar/exportar JSON del bot completo en el editor. */
    chatbotJsonImportExport: true,
    /**
     * Bots vinculados por phone_number_id (Meta): cualquier bot a cualquier número conectado.
     * Un bot activo por número; el motor enruta por el ID del número que recibió el mensaje.
     */
    multiNumberBotIsolation: true,
    /** Backfill phoneNumberId en chatbots legacy que solo tenían numberId (slot). */
    whatsappBotPhoneBinding: true,
    /** Legacy whatsapp_numbers/primary migrado a general. */
    primarySlotNormalized: true,
    /** URLs de entidad con slug personalizable (/home/{slug}/...). */
    entityRouteSlugs: true,
    /** Resolución slug→doc id con índice entity_slugs (Firestore id nunca cambia). */
    entitySlugsIndex: true,
    /** Prioridad slug sobre doc id al resolver rutas (evita docs fantasma). */
    slugFirstRouteResolution: true,
    /** No aprovisionar molde en documentos fantasma (id === slug de otra entidad). */
    ghostEntityGuard: true,
    /** Contexto de ruta sincronizado antes de renderizar páginas del tenant. */
    entityRouteContext: true,
    /** Ruta de bots WhatsApp en /cto/automation/whatsappbots. */
    whatsappBotsRoute: true,
    /** Sanitizar payloads Firestore (omitir undefined) en broadcasts y escrituras CRM. */
    firestoreWriteSanitize: true,
    /** Hub de tableros Kanban personalizados (copias/manuales) bajo workspaces/custom_kanban_hub. */
    customKanbanHub: true,
    /** Tipos de tablero: copia (fusionar columnas) y manual (organización libre). */
    customKanbanBoardKinds: true,
    /** Kamban principal inamovible (solo lectura, sincronizado al bot). */
    principalKanbanLocked: true,
    /** Segmentación de broadcasts por tablero/columna del Hub Kanban. */
    broadcastKanbanHubSegments: true,
    /** Texto real de plantilla guardado al crear campaña (templateBody + messagePreview). */
    broadcastTemplateBodyPersisted: true,
    /** Envío de campaña persiste burbuja morada en /conversations con texto real. */
    broadcastConversationOutbound: true,
    /** Webhook marca replyText y enlaza respuesta al hilo de la campaña. */
    broadcastWebhookReplySync: true,
    /** Filtro "Respondió" exige evidencia post-envío (no mensajes previos). */
    broadcastRepliedFilterStrict: true,
    /** Reanudar / finalizar campañas atascadas en Sending (resume + finalize APIs). */
    broadcastSendRecovery: true,
    /** Heartbeat sendHeartbeatAt en campañas para detectar envíos interrumpidos. */
    broadcastSendHeartbeat: true,
    /** Backfill automático de texto real y respuestas en /conversations post-envío. */
    broadcastConversationBackfill: true,
    /** UI Omnicanal V2: fotos reales de perfil, tabs & filtros uniformes, doble vistas full, bandera + hora. */
    omnichannelV2UI: true,
    /** Sincronización automática de snippet lastMessage/lastMessageDirection/updatedAt en motor Bot AI. */
    botEngineSnippetSync: true,
    /** Control de acceso empresarial: solo suites CTO, CMO y COO activas; otras bloqueadas con 'coming soon'. */
    enterpriseSuiteGateV1: true,
    /** Modales de plataforma translúcidos con frosted glass, sin cajas contenedor pesadas y partículas ultra-vívidas. */
    nucleoFrostedGlassUI: true,
    /** Tipografía Outfit unificada globalmente en todos los módulos y layouts. */
    globalOutfitFont: true,
    /** Idioma inglés por defecto automático al acceder a entornos (/home/[entityId]). */
    environmentEnglishDefault: true,
} as const;

function tenantPath(userId: string, entityId: string) {
    return `users/${userId}/entities/${entityId}`;
}

/**
 * Columna de recepción permanente en `kanban-groups`. Siempre debe existir para que los
 * mensajes lleguen aunque el bot esté apagado. Idempotente.
 */
async function ensureReceptionColumn(db: Firestore, path: string): Promise<void> {
    await setDoc(
        doc(db, `${path}/kanban-groups`, SYSTEM_INBOX_GROUP_ID),
        {
            ...SYSTEM_INBOX_GROUP_FIELDS,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        },
        { merge: true }
    );
}

/**
 * Bot de bienvenida de arranque. Solo se crea si aún no existe (no destructivo:
 * nunca sobrescribe un bot editado o borrado a propósito por el usuario).
 */
async function ensureStarterChatbot(db: Firestore, path: string): Promise<void> {
    const botRef = doc(db, `${path}/chatbots`, STARTER_CHATBOT_ID);
    const existing = await getDoc(botRef);
    if (existing.exists()) return;

    await setDoc(botRef, {
        ...STARTER_CHATBOT_FIELDS,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });

    // El contador arranca en 3 para que el primer bot del usuario sea 00000004.
    await setDoc(
        doc(db, `${path}/system_metadata`, 'chatbot_counter'),
        { count: STARTER_CHATBOT_COUNTER },
        { merge: true }
    );
}

/** Documento semilla del catálogo de integraciones (no credenciales). */
async function ensureIntegrationsInit(db: Firestore, path: string): Promise<void> {
    await setDoc(
        doc(db, `${path}/integrations/_init`),
        {
            ...MOLD_INTEGRATIONS_INIT,
            updatedAt: serverTimestamp(),
        },
        { merge: true }
    );
}

/**
 * Aprovisiona estructuras CRM/Kanban del molde maestro para una empresa (tenant).
 * Idempotente — seguro llamar varias veces.
 */
export async function provisionEntityMold(
    db: Firestore,
    userId: string,
    entityId: string
): Promise<void> {
    const path = tenantPath(userId, entityId);

    await ensureManualKanbanInitialized(db, path);
    await ensureCustomKanbanHubInitialized(db, path);
    await ensureReceptionColumn(db, path);
    await ensureStarterChatbot(db, path);
    await ensureWhatsAppSlotNormalization(db, path);
    await ensureWhatsAppBotPhoneBinding(db, path);
    await ensureEntitySlugNormalization(db, userId, entityId);
    await ensureIntegrationsInit(db, path);

    await setDoc(
        doc(db, path),
        {
            moldVersion: ENTITY_MOLD_VERSION,
            features: ENTITY_MOLD_FEATURES,
            whatsappMessaging: MOLD_WHATSAPP_MESSAGING,
            kanbanBotSyncId: STARTER_CHATBOT_ID,
            moldProvisionedAt: serverTimestamp(),
        },
        { merge: true }
    );
}

/**
 * Migra empresas existentes al molde actual (p. ej. creadas antes del Hub/Kanban manual).
 */
export async function ensureEntityMoldUpToDate(
    db: Firestore,
    userId: string,
    entityId: string
): Promise<void> {
    const entityRef = doc(db, tenantPath(userId, entityId));
    const snap = await getDoc(entityRef);
    if (!snap.exists()) return;

    const data = snap.data() || {};
    // Never provision mold on a phantom doc (e.g. slug used as path segment by mistake).
    if (!data.initialized && !data.name) return;

    const slugIndexSnap = await getDoc(
        doc(db, `users/${userId}/entity_slugs/${entityId.toLowerCase()}`)
    );
    if (
        slugIndexSnap.exists() &&
        isSlugOwnedByOtherEntity(entityId, slugIndexSnap.data()?.entityId as string)
    ) {
        return;
    }

    const currentVersion = data.moldVersion ?? 0;

    if (currentVersion >= ENTITY_MOLD_VERSION) return;

    await provisionEntityMold(db, userId, entityId);
}
