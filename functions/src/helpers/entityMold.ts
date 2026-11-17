import * as admin from 'firebase-admin';
import { MANUAL_KANBAN_COLUMNS } from './mold/manualKanbanColumns';

/** Mantener alineado con src/lib/mold/entityMold.ts */
export const ENTITY_MOLD_VERSION = 19;

const ENTITY_MOLD_FEATURES = {
    workspaceHub: true,
    botKanban: true,
    manualKanban: true,
    whatsappOutbound: true,
    whatsappBroadcast: true,
    whatsappMultiNumber: true,
    whatsappInboundMedia: true,
    botAdvancedNodes: true,
    conversationsStore: true,
    flowHumanize: true,
    geminiIntegration: true,
    stripeIntegration: true,
    gmailMultiAccount: true,
    gmailGoogleLoginBootstrap: true,
    integrationsHubV2: true,
    chatbotRulesExport: true,
    chatbotJsonImportExport: true,
    multiNumberBotIsolation: true,
    whatsappBotPhoneBinding: true,
    primarySlotNormalized: true,
    entityRouteSlugs: true,
    entitySlugsIndex: true,
    slugFirstRouteResolution: true,
    ghostEntityGuard: true,
    entityRouteContext: true,
    whatsappBotsRoute: true,
    firestoreWriteSanitize: true,
    customKanbanHub: true,
    customKanbanBoardKinds: true,
    principalKanbanLocked: true,
    broadcastKanbanHubSegments: true,
    broadcastTemplateBodyPersisted: true,
    broadcastConversationOutbound: true,
    broadcastWebhookReplySync: true,
    broadcastRepliedFilterStrict: true,
    broadcastSendRecovery: true,
    broadcastSendHeartbeat: true,
    broadcastConversationBackfill: true,
    omnichannelV2UI: true,
    botEngineSnippetSync: true,
} as const;

const MOLD_INTEGRATIONS_INIT = {
    encrypted: false,
    catalogVersion: 2,
    available: ['whatsapp', 'telegram', 'messenger', 'instagram', 'gmail', 'stripe', 'gemini', 'x_twitter'],
    connectable: ['whatsapp', 'messenger', 'instagram', 'telegram', 'x_twitter', 'gmail', 'stripe', 'gemini'],
} as const;

const MOLD_WHATSAPP_MESSAGING = {
    blockOutboundAfter24h: false,
    outboundTemplateName: 'hello_world',
    outboundTemplateLanguage: 'en_US',
    outboundTemplateUsesBodyParam: false,
};

type AdminDb = admin.firestore.Firestore;

function tenantPath(userId: string, entityId: string) {
    return `users/${userId}/entities/${entityId}`;
}

async function ensureManualKanbanInitializedAdmin(db: AdminDb, path: string): Promise<void> {
    const boardRef = db.doc(`${path}/workspaces/manual_kanban`);
    const columnsCol = boardRef.collection('columns');
    const existingSnap = await columnsCol.get();
    const existing = new Set(existingSnap.docs.map((d) => d.id));

    const batch = db.batch();

    for (const col of MANUAL_KANBAN_COLUMNS) {
        const payload: Record<string, unknown> = {
            ...col,
            id: col.slug,
            fixed: true,
            boardType: 'manual',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            sequenceContext: col.sequenceContext ?? admin.firestore.FieldValue.delete(),
            actionLogic: col.actionLogic ?? admin.firestore.FieldValue.delete(),
        };
        if (!existing.has(col.slug)) {
            payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
        }
        batch.set(columnsCol.doc(col.slug), payload, { merge: true });
    }

    await batch.commit();

    await boardRef.set(
        {
            columnOrder: MANUAL_KANBAN_COLUMNS.map((c) => c.slug),
            initialized: true,
            boardType: 'manual',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
    );
}

async function ensureCustomKanbanHubInitializedAdmin(db: AdminDb, path: string): Promise<void> {
    await db.doc(`${path}/workspaces/custom_kanban_hub`).set(
        {
            initialized: true,
            boardType: 'custom_hub',
            version: 1,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
    );
}

export async function provisionEntityMoldAdmin(
    db: AdminDb,
    userId: string,
    entityId: string
): Promise<void> {
    const path = tenantPath(userId, entityId);
    await ensureManualKanbanInitializedAdmin(db, path);
    await ensureCustomKanbanHubInitializedAdmin(db, path);

    await db.doc(`${path}/integrations/_init`).set(
        {
            ...MOLD_INTEGRATIONS_INIT,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
    );

    await db.doc(path).set(
        {
            moldVersion: ENTITY_MOLD_VERSION,
            features: ENTITY_MOLD_FEATURES,
            whatsappMessaging: MOLD_WHATSAPP_MESSAGING,
            moldProvisionedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
    );
}

export async function ensureEntityMoldUpToDateAdmin(
    db: AdminDb,
    userId: string,
    entityId: string
): Promise<void> {
    const snap = await db.doc(tenantPath(userId, entityId)).get();
    const currentVersion = snap.data()?.moldVersion ?? 0;
    if (currentVersion >= ENTITY_MOLD_VERSION) return;
    await provisionEntityMoldAdmin(db, userId, entityId);
}
