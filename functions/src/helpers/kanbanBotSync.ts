import * as admin from 'firebase-admin';
import {
    getBotNodeLabel,
    getGroupColorForIndex,
    getKanbanEligibleNodes,
    isInboxLikeGroupName,
    orderNodesForKanban,
    resolveCardBotId,
    resolveCardBotNodeId,
    extractBotNodeDetails,
} from './botNodeGroups';

type AdminDb = admin.firestore.Firestore;

type KanbanGroupRecord = { id: string; [key: string]: any };

export interface SyncKanbanGroupsResult {
    botId: string;
    created: number;
    updated: number;
    linked: number;
    removed: number;
    nodeGroupMap: Record<string, string>;
}

async function moveKanbanCardAdmin(
    db: AdminDb,
    tenantPath: string,
    cardId: string,
    sourceGroupId: string,
    destGroupId: string
): Promise<void> {
    if (!sourceGroupId || !destGroupId || sourceGroupId === destGroupId) return;

    const sourceRef = db.doc(`${tenantPath}/kanban-groups/${sourceGroupId}/cards/${cardId}`);
    const destRef = db.doc(`${tenantPath}/kanban-groups/${destGroupId}/cards/${cardId}`);

    let contactId: string | undefined;

    await db.runTransaction(async (tx) => {
        const snap = await tx.get(sourceRef);
        if (!snap.exists) return;
        const data = snap.data() || {};
        contactId = (data.contactId || data.crmId) as string | undefined;
        tx.set(destRef, {
            ...data,
            groupId: destGroupId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        tx.delete(sourceRef);
    });

    if (contactId) {
        await db.doc(`${tenantPath}/contacts/${contactId}`).set(
            {
                kanbanGroupId: destGroupId,
                kanbanCardId: cardId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
        ).catch(() => undefined);
    }
}

export async function locateKanbanCard(
    db: AdminDb,
    tenantPath: string,
    cardId: string
): Promise<{ groupId: string; ref: admin.firestore.DocumentReference } | null> {
    const groupsSnap = await db.collection(`${tenantPath}/kanban-groups`).get();
    for (const groupDoc of groupsSnap.docs) {
        const cardRef = groupDoc.ref.collection('cards').doc(cardId);
        const snap = await cardRef.get();
        if (snap.exists) {
            return { groupId: groupDoc.id, ref: cardRef };
        }
    }
    return null;
}

export async function ensureCardKanbanPlacement(params: {
    db: AdminDb;
    tenantPath: string;
    cardId: string;
    botId: string;
    preferredGroupId?: string;
}): Promise<string | null> {
    const { db, tenantPath, cardId, botId, preferredGroupId } = params;

    // Regla de oro: el bot no altera posición en el tablero manual
    const manualPlacementRef = db.doc(`${tenantPath}/workspaces/manual_kanban/placements/${cardId}`);
    const manualPlacementSnap = await manualPlacementRef.get();
    if (manualPlacementSnap.exists && manualPlacementSnap.data()?.manualLocked) {
        return null;
    }

    let groupId = preferredGroupId;
    let cardSnap = preferredGroupId
        ? await db.doc(`${tenantPath}/kanban-groups/${preferredGroupId}/cards/${cardId}`).get()
        : null;

    if (!cardSnap?.exists) {
        const located = await locateKanbanCard(db, tenantPath, cardId);
        if (!located) return null;
        groupId = located.groupId;
        cardSnap = await located.ref.get();
    }

    const data = cardSnap?.data();
    const nodeId = resolveCardBotNodeId(data);
    if (!nodeId || !groupId) return groupId || null;

    const nodeGroupMap = await buildBotNodeGroupMap(db, tenantPath, botId);
    return syncCardToBotNodeAdmin({
        db,
        tenantPath,
        cardId,
        currentGroupId: groupId,
        botId,
        nodeId,
        nodeGroupMap,
    });
}

export async function buildBotNodeGroupMap(
    db: AdminDb,
    tenantPath: string,
    botId: string
): Promise<Map<string, string>> {
    const snap = await db.collection(`${tenantPath}/kanban-groups`).where('botId', '==', botId).get();
    const map = new Map<string, string>();
    snap.docs.forEach((doc) => {
        const nodeId = doc.data().botNodeId;
        if (nodeId) map.set(String(nodeId), doc.id);
    });
    return map;
}

export async function syncKanbanGroupsFromBotAdmin(params: {
    db: AdminDb;
    tenantPath: string;
    botId: string;
    botName?: string;
    flow: { nodes?: any[]; edges?: any[] };
}): Promise<SyncKanbanGroupsResult> {
    const { db, tenantPath, botId, botName, flow } = params;
    const nodes = getKanbanEligibleNodes(flow?.nodes || []);
    const ordered = orderNodesForKanban(nodes, flow?.edges || []);

    const groupsRef = db.collection(`${tenantPath}/kanban-groups`);
    const existingSnap = await groupsRef.get();
    const existing: KanbanGroupRecord[] = existingSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const byBotNodeId = new Map<string, { id: string; data: any }>();
    const manualGroups: { id: string; data: any }[] = [];

    existing.forEach((g) => {
        if (g.botId === botId && g.botNodeId) {
            byBotNodeId.set(String(g.botNodeId), { id: g.id, data: g });
        } else if (!g.autoManaged) {
            manualGroups.push({ id: g.id, data: g });
        }
    });

    let created = 0;
    let updated = 0;
    let linked = 0;
    const nodeGroupMap: Record<string, string> = {};
    const seenNodeIds = new Set<string>();

    for (let i = 0; i < ordered.length; i++) {
        const node = ordered[i];
        const nodeId = String(node.id);
        seenNodeIds.add(nodeId);
        const nodeDetails = extractBotNodeDetails(node);
        const name = nodeDetails.title || getBotNodeLabel(node);
        const color = getGroupColorForIndex(i);
        const payload = {
            name,
            color,
            order: i,
            botId,
            botNodeId: nodeId,
            botNodeType: node.type,
            botNodeDetails: nodeDetails,
            autoManaged: true,
            boardType: 'bot',
            botName: botName || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const existingGroup = byBotNodeId.get(nodeId);
        if (existingGroup) {
            await groupsRef.doc(existingGroup.id).set(payload, { merge: true });
            nodeGroupMap[nodeId] = existingGroup.id;
            updated++;
            continue;
        }

        if (node.type === 'startNode' || node.type === 'start') {
            const inbox = manualGroups.find((g) => isInboxLikeGroupName(g.data?.name || ''));
            if (inbox) {
                await groupsRef.doc(inbox.id).set(
                    { ...payload, order: inbox.data?.order ?? 0 },
                    { merge: true }
                );
                nodeGroupMap[nodeId] = inbox.id;
                linked++;
                continue;
            }
        }

        const createdRef = await groupsRef.add({
            ...payload,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        nodeGroupMap[nodeId] = createdRef.id;
        created++;
    }

    let removed = 0;
    for (const g of existing) {
        if (g.botId === botId && g.autoManaged && g.botNodeId && !seenNodeIds.has(String(g.botNodeId))) {
            await groupsRef.doc(g.id).delete();
            removed++;
        }
    }

    await db.doc(tenantPath).set(
        {
            kanbanBotSyncId: botId,
            kanbanBotSyncName: botName || null,
            kanbanBotSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
    );

    return { botId, created, updated, linked, removed, nodeGroupMap };
}

export async function syncCardToBotNodeAdmin(params: {
    db: AdminDb;
    tenantPath: string;
    cardId: string;
    currentGroupId: string;
    botId: string;
    nodeId: string | null | undefined;
    nodeGroupMap?: Map<string, string>;
}): Promise<string | null> {
    const { db, tenantPath, cardId, currentGroupId, botId, nodeId } = params;
    if (!nodeId || !botId || !cardId || !currentGroupId) return null;

    let targetGroupId: string | undefined;
    if (params.nodeGroupMap) {
        targetGroupId = params.nodeGroupMap.get(String(nodeId));
    }
    if (!targetGroupId) {
        const snap = await db
            .collection(`${tenantPath}/kanban-groups`)
            .where('botId', '==', botId)
            .where('botNodeId', '==', String(nodeId))
            .limit(1)
            .get();
        if (snap.empty) return null;
        targetGroupId = snap.docs[0].id;
    }

    if (!targetGroupId || targetGroupId === currentGroupId) return targetGroupId || null;

    const destGroupSnap = await db.doc(`${tenantPath}/kanban-groups/${targetGroupId}`).get();
    if (!destGroupSnap.exists || destGroupSnap.data()?.boardType === 'manual' || destGroupSnap.data()?.autoManaged === false) {
        return currentGroupId;
    }

    await moveKanbanCardAdmin(db, tenantPath, cardId, currentGroupId, targetGroupId);
    return targetGroupId;
}

export async function relocateAllCardsToBotNodesAdmin(params: {
    db: AdminDb;
    tenantPath: string;
    botId: string;
    flow: { nodes?: any[]; edges?: any[] };
}): Promise<{ moved: number; skipped: number; startNodeId: string | null }> {
    const { db, tenantPath, botId, flow } = params;
    const syncResult = await syncKanbanGroupsFromBotAdmin({ db, tenantPath, botId, flow });
    const nodeGroupMap = new Map(Object.entries(syncResult.nodeGroupMap));

    const startNode = (flow?.nodes || []).find((n: any) => n.type === 'startNode' || n.type === 'start');
    const startNodeId = startNode ? String(startNode.id) : null;

    const groupsSnap = await db.collection(`${tenantPath}/kanban-groups`).get();
    let moved = 0;
    let skipped = 0;

    for (const groupDoc of groupsSnap.docs) {
        const cardsSnap = await groupDoc.ref.collection('cards').get();
        for (const cardDoc of cardsSnap.docs) {
            const data = cardDoc.data();
            const nodeId = resolveCardBotNodeId(data);
            const cardBotId = resolveCardBotId(data, botId) || botId;
            if (!nodeId || cardBotId !== botId) {
                skipped++;
                continue;
            }

            let targetGroupId = nodeGroupMap.get(String(nodeId));
            if (!targetGroupId || targetGroupId === groupDoc.id) {
                skipped++;
                continue;
            }

            await moveKanbanCardAdmin(db, tenantPath, cardDoc.id, groupDoc.id, targetGroupId);
            moved++;
        }
    }

    return { moved, skipped, startNodeId };
}
