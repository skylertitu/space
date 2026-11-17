import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import {
    relocateAllCardsToBotNodesAdmin,
    syncKanbanGroupsFromBotAdmin,
} from '@/lib/kanban/kanbanBotSyncAdmin';
import { guardApi } from '@/lib/apiAuth';
import { requireSuite } from '@/lib/subscriptions/entitlements.server';

export async function POST(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;
    try {
        const body = await req.json();
        const { userId, entityId, botId, relocateCards = true } = body || {};
        const suiteDenied = await requireSuite(userId, entityId, 'coo');
        if (suiteDenied) return suiteDenied;

        if (!userId || !entityId) {
            return NextResponse.json(
                { error: 'userId y entityId son requeridos' },
                { status: 400 }
            );
        }

        const tenantPath = `users/${userId}/entities/${entityId}`;
        const entitySnap = await db.doc(tenantPath).get();
        const entityData = entitySnap.data() || {};

        let resolvedBotId = botId || entityData.kanbanBotSyncId;
        if (!resolvedBotId) {
            const activeBots = await db
                .collection(`${tenantPath}/chatbots`)
                .where('isActive', 'in', [true, 'true'])
                .limit(1)
                .get();
            if (!activeBots.empty) {
                resolvedBotId = activeBots.docs[0].id;
            }
        }

        if (!resolvedBotId) {
            return NextResponse.json(
                { error: 'No se encontró botId. Pasa botId o activa un chatbot.' },
                { status: 404 }
            );
        }

        const botSnap = await db.doc(`${tenantPath}/chatbots/${resolvedBotId}`).get();
        if (!botSnap.exists) {
            return NextResponse.json(
                { error: `Bot ${resolvedBotId} no encontrado` },
                { status: 404 }
            );
        }

        const botData = botSnap.data() || {};
        const flow = botData.flow || { nodes: [], edges: [] };

        const syncResult = await syncKanbanGroupsFromBotAdmin({
            db,
            tenantPath,
            botId: resolvedBotId,
            botName: botData.name,
            flow,
        });

        let relocation = { moved: 0, skipped: 0, startNodeId: null as string | null };
        if (relocateCards) {
            relocation = await relocateAllCardsToBotNodesAdmin({
                db,
                tenantPath,
                botId: resolvedBotId,
                flow,
            });
        }

        return NextResponse.json({
            success: true,
            botId: resolvedBotId,
            botName: botData.name,
            groups: syncResult,
            relocation,
        });
    } catch (error: any) {
        console.error('[sync-bot-groups]', error);
        return NextResponse.json(
            { error: error?.message || 'Error sincronizando grupos del kanban' },
            { status: 500 }
        );
    }
}
