import { db } from '@/lib/firebase';
import {
    collection,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    Unsubscribe,
} from 'firebase/firestore';
import { normalizePhoneNumber } from '@/lib/phoneUtils';
import { getCountryFromPhone } from '@/lib/countryCodes';
import type { BroadcastRecipient } from '@/app/home/[entityId]/cmo/broadcast/list/lib/types';
import { filterGroupsForPrincipalBot, groupBelongsToPrincipalBot } from './principalKanban';
import {
    getBoard,
    resolveBoardKind,
    BOARD_KIND_LABELS,
    DEFAULT_BOARD_FILTERS,
    CUSTOM_BOARDS_HUB_ID,
    type CustomKanbanBoard,
    type CustomBoardPlacement,
} from './customKanbanBoards';
import { buildCardsByColumn } from './customKanbanResolver';
import { resolveManualColumnForCard } from './manualKanbanCardOrder';
import type { ManualPlacement } from './manualKanban';

export type HubKanbanBoardSource = 'principal' | 'manual_crm' | 'custom';

export interface HubKanbanBoardOption {
    id: string;
    source: HubKanbanBoardSource;
    name: string;
    kindLabel: string;
    botId?: string;
}

export interface HubKanbanColumnOption {
    id: string;
    name: string;
    order: number;
}

const MANUAL_CRM_BOARD_ID = 'system_manual';

function hubBoardsCol(tenantPath: string) {
    return collection(db, tenantPath, 'workspaces', CUSTOM_BOARDS_HUB_ID, 'boards');
}

function hasWhatsAppPhone(phone: string | undefined | null): boolean {
    if (!phone) return false;
    return phone.replace(/\D/g, '').length >= 8;
}

function buildRecipient(
    id: string,
    name: string,
    phone: string,
    extra: Partial<BroadcastRecipient> = {}
): BroadcastRecipient {
    const normalized = normalizePhoneNumber(phone);
    const c = getCountryFromPhone(normalized);
    return {
        id,
        contactId: id,
        name: name || 'Sin nombre',
        phone: normalized,
        country: c?.country,
        countryFlag: c?.flag,
        countryIso: c?.iso,
        status: 'pending',
        error: null,
        messageId: null,
        ...extra,
    };
}

function cardToRecipient(card: Record<string, any>, extra: Partial<BroadcastRecipient> = {}): BroadcastRecipient | null {
    const phone = card.contactNumber || card.contactNumberClean || card.phone;
    if (!hasWhatsAppPhone(phone)) return null;
    return buildRecipient(
        card.crmId || card.contactId || card.id,
        card.contactName || 'Sin nombre',
        phone,
        extra
    );
}

async function loadAllKanbanCards(tenantPath: string): Promise<{
    cards: Record<string, any>[];
    groupsById: Record<string, any>;
}> {
    const groupsSnap = await getDocs(collection(db, `${tenantPath}/kanban-groups`));
    const groupsById: Record<string, any> = {};
    groupsSnap.docs.forEach((d) => {
        groupsById[d.id] = { id: d.id, ...d.data() };
    });

    const cards: Record<string, any>[] = [];
    await Promise.all(
        groupsSnap.docs.map(async (groupDoc) => {
            const cardsSnap = await getDocs(
                collection(db, `${tenantPath}/kanban-groups`, groupDoc.id, 'cards')
            );
            cardsSnap.docs.forEach((c) => {
                cards.push({
                    id: c.id,
                    sourceGroupId: groupDoc.id,
                    groupId: groupDoc.id,
                    ...c.data(),
                });
            });
        })
    );

    return { cards, groupsById };
}

async function loadCustomBoardPlacements(
    tenantPath: string,
    boardId: string
): Promise<Record<string, CustomBoardPlacement>> {
    const snap = await getDocs(
        collection(db, tenantPath, 'workspaces', CUSTOM_BOARDS_HUB_ID, 'boards', boardId, 'placements')
    );
    const map: Record<string, CustomBoardPlacement> = {};
    snap.docs.forEach((d) => {
        map[d.id] = d.data() as CustomBoardPlacement;
    });
    return map;
}

async function loadManualPlacements(tenantPath: string): Promise<Record<string, ManualPlacement>> {
    const snap = await getDocs(collection(db, tenantPath, 'workspaces', 'manual_kanban', 'placements'));
    const map: Record<string, ManualPlacement> = {};
    snap.docs.forEach((d) => {
        map[d.id] = d.data() as ManualPlacement;
    });
    return map;
}

export async function fetchHubKanbanBoards(tenantPath: string): Promise<HubKanbanBoardOption[]> {
    const boards: HubKanbanBoardOption[] = [];

    try {
        const botsSnap = await getDocs(collection(db, `${tenantPath}/chatbots`));
        botsSnap.docs.forEach((d) => {
            const data = d.data();
            boards.push({
                id: d.id,
                source: 'principal',
                name: (data.name as string) || d.id,
                kindLabel: 'Inamovible',
                botId: d.id,
            });
        });
    } catch (e) {
        console.error('[broadcastKanbanTargets] fetch bots error:', e);
    }

    boards.push({
        id: MANUAL_CRM_BOARD_ID,
        source: 'manual_crm',
        name: 'Kanban Manual CRM',
        kindLabel: 'Manual CRM',
    });

    try {
        const customSnap = await getDocs(query(hubBoardsCol(tenantPath), orderBy('createdAt', 'desc')));
        customSnap.docs.forEach((d) => {
            const data = d.data() as CustomKanbanBoard;
            const kind = resolveBoardKind(data);
            boards.push({
                id: d.id,
                source: 'custom',
                name: data.name || d.id,
                kindLabel: BOARD_KIND_LABELS[kind].short,
                botId: data.botId,
            });
        });
    } catch (e) {
        console.error('[broadcastKanbanTargets] fetch custom boards error:', e);
    }

    return boards;
}

export function subscribeHubKanbanBoards(
    tenantPath: string,
    cb: (boards: HubKanbanBoardOption[]) => void
): () => void {
    let bots: HubKanbanBoardOption[] = [];
    let custom: HubKanbanBoardOption[] = [];
    const unsubs: Unsubscribe[] = [];

    const emit = () => {
        cb([
            ...bots,
            {
                id: MANUAL_CRM_BOARD_ID,
                source: 'manual_crm',
                name: 'Kanban Manual CRM',
                kindLabel: 'Manual CRM',
            },
            ...custom,
        ]);
    };

    unsubs.push(
        onSnapshot(
            collection(db, `${tenantPath}/chatbots`),
            (snap) => {
                bots = snap.docs.map((d) => {
                    const data = d.data();
                    return {
                        id: d.id,
                        source: 'principal' as const,
                        name: (data.name as string) || d.id,
                        kindLabel: 'Inamovible',
                        botId: d.id,
                    };
                });
                emit();
            },
            () => {
                bots = [];
                emit();
            }
        )
    );

    unsubs.push(
        onSnapshot(
            query(hubBoardsCol(tenantPath), orderBy('createdAt', 'desc')),
            (snap) => {
                custom = snap.docs.map((d) => {
                    const data = d.data() as CustomKanbanBoard;
                    const kind = resolveBoardKind(data);
                    return {
                        id: d.id,
                        source: 'custom' as const,
                        name: data.name || d.id,
                        kindLabel: BOARD_KIND_LABELS[kind].short,
                        botId: data.botId,
                    };
                });
                emit();
            },
            () => {
                custom = [];
                emit();
            }
        )
    );

    return () => unsubs.forEach((u) => u());
}

export async function fetchHubKanbanColumns(
    tenantPath: string,
    board: HubKanbanBoardOption
): Promise<HubKanbanColumnOption[]> {
    if (board.source === 'principal' && board.botId) {
        const groupsSnap = await getDocs(
            query(collection(db, `${tenantPath}/kanban-groups`), orderBy('order', 'asc'))
        );
        return filterGroupsForPrincipalBot(
            groupsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
            board.botId
        ).map((g, i) => ({
            id: g.id,
            name: g.name || `Columna ${i + 1}`,
            order: g.order ?? i,
        }));
    }

    if (board.source === 'manual_crm') {
        const snap = await getDocs(
            collection(db, tenantPath, 'workspaces', 'manual_kanban', 'columns')
        );
        return snap.docs
            .map((d) => {
                const data = d.data();
                return {
                    id: d.id,
                    name: (data.name as string) || d.id,
                    order: (data.order as number) ?? 0,
                };
            })
            .sort((a, b) => a.order - b.order);
    }

    if (board.source === 'custom') {
        const boardDoc = await getBoard(db, tenantPath, board.id);
        if (!boardDoc?.columns?.length) return [];
        return [...boardDoc.columns]
            .sort((a, b) => a.order - b.order)
            .map((c) => ({ id: c.id, name: c.name, order: c.order }));
    }

    return [];
}

export async function resolveKanbanBoardColumnRecipients(
    tenantPath: string,
    params: {
        kanbanBoardSource: HubKanbanBoardSource;
        kanbanBoardId: string;
        kanbanColumnId: string;
        kanbanBoardName?: string;
        kanbanColumnName?: string;
        botId?: string;
    }
): Promise<BroadcastRecipient[]> {
    const byPhone = new Map<string, BroadcastRecipient>();
    const push = (r: BroadcastRecipient) => {
        const key = r.phone.replace(/\D/g, '');
        if (!key || key.length < 8) return;
        if (!byPhone.has(key)) byPhone.set(key, r);
    };

    const extra = {
        kanbanGroupId: params.kanbanColumnId,
        kanbanGroupName: params.kanbanColumnName,
    };

    if (params.kanbanBoardSource === 'principal') {
        const snap = await getDocs(
            collection(db, `${tenantPath}/kanban-groups`, params.kanbanColumnId, 'cards')
        );
        snap.docs.forEach((d) => {
            const r = cardToRecipient({ id: d.id, ...d.data() }, extra);
            if (r) push(r);
        });
        return Array.from(byPhone.values());
    }

    if (params.kanbanBoardSource === 'manual_crm') {
        const { cards, groupsById } = await loadAllKanbanCards(tenantPath);
        const placements = await loadManualPlacements(tenantPath);

        cards.forEach((card) => {
            const slug = resolveManualColumnForCard(
                card.id,
                card,
                placements,
                groupsById[card.sourceGroupId]
            );
            if (slug !== params.kanbanColumnId) return;
            const r = cardToRecipient(card, extra);
            if (r) push(r);
        });
        return Array.from(byPhone.values());
    }

    if (params.kanbanBoardSource === 'custom') {
        const board = await getBoard(db, tenantPath, params.kanbanBoardId);
        if (!board) return [];

        const placements = await loadCustomBoardPlacements(tenantPath, params.kanbanBoardId);
        const { cards, groupsById } = await loadAllKanbanCards(tenantPath);

        const botId = board.botId;
        const scopedCards = botId
            ? cards.filter((c) => groupBelongsToPrincipalBot(groupsById[c.groupId], botId))
            : cards;

        const trackedGroupIds = new Set(board.columns.flatMap((c) => c.sourceGroupIds));
        const boardCards =
            trackedGroupIds.size > 0
                ? scopedCards.filter((c) => trackedGroupIds.has(c.groupId))
                : scopedCards;

        const byCol = buildCardsByColumn(
            boardCards,
            board.columns,
            placements,
            { ...DEFAULT_BOARD_FILTERS, ...board.filters },
            board.sortMode,
            resolveBoardKind(board)
        );

        (byCol[params.kanbanColumnId] || []).forEach((card) => {
            const r = cardToRecipient(card, extra);
            if (r) push(r);
        });
        return Array.from(byPhone.values());
    }

    return [];
}
