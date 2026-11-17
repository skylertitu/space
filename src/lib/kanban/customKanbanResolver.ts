import type { BoardColumn, CustomBoardKind, CustomBoardPlacement } from './customKanbanBoards';
import { cardMatchesFilters, sortCardsInColumn } from './customKanbanFilters';

function cardMatchesRule(card: Record<string, any>, column: BoardColumn): boolean {
    if (!column.rule) return false;
    const { type, value } = column.rule;

    switch (type) {
        case 'unread':
            return (card.unreadCount ?? 0) > 0;
        case 'unassigned':
            return !card.assignedTo;
        case 'no_response_hours': {
            const hours = typeof value === 'number' ? value : 24;
            const raw = card.updatedAt ?? card.createdAt;
            let ms = 0;
            if (raw?.toDate) ms = raw.toDate().getTime();
            else if (raw?.seconds) ms = raw.seconds * 1000;
            else return false;
            return Date.now() - ms > hours * 3600 * 1000;
        }
        case 'keyword': {
            const kw = String(value || '').toLowerCase();
            if (!kw) return false;
            const text = `${card.lastMessage || ''} ${card.contactName || ''}`.toLowerCase();
            return text.includes(kw);
        }
        case 'channel': {
            const ch = String(value || '').toLowerCase();
            const cardCh = String(card.primary_channel || card.channel || '').toLowerCase();
            return cardCh.includes(ch);
        }
        default:
            return false;
    }
}

function columnExists(columns: BoardColumn[], columnId: string): boolean {
    return columns.some((c) => c.id === columnId);
}

function columnById(columns: BoardColumn[], columnId: string): BoardColumn | undefined {
    return columns.find((c) => c.id === columnId);
}

/** Where the card is shown right now (uses resolved board state). */
export function findCardColumnId(
    cardId: string,
    cardsByColumn: Record<string, any[]>
): string | null {
    for (const [colId, colCards] of Object.entries(cardsByColumn)) {
        if (colCards.some((c) => c.id === cardId)) return colId;
    }
    return null;
}

function defaultManualInboxColumn(columns: BoardColumn[]): BoardColumn | undefined {
    const sorted = [...columns].sort((a, b) => a.order - b.order);
    return sorted.find((c) => c.columnType === 'manual') || sorted[0];
}

export function resolveCardColumnId(
    card: Record<string, any>,
    columns: BoardColumn[],
    placements: Record<string, CustomBoardPlacement>,
    boardKind: CustomBoardKind = 'copy'
): string | null {
    const placement = placements[card.id];
    const savedColumnId = placement?.columnId;

    // Manual boards: only user placements (or inbox fallback) — no bot auto-mapping.
    if (boardKind === 'manual') {
        if (savedColumnId && columnExists(columns, savedColumnId)) {
            return savedColumnId;
        }
        return defaultManualInboxColumn(columns)?.id ?? null;
    }

    // User-organized cards stay where they were placed (survives reload + bot moves).
    if (savedColumnId && columnExists(columns, savedColumnId)) {
        const targetCol = columnById(columns, savedColumnId);
        if (placement?.manualLocked || targetCol?.columnType === 'manual') {
            return savedColumnId;
        }
    }

    const groupId = card.groupId || card.sourceGroupId;

    // Rule columns take priority when card matches (unless manually locked elsewhere)
    for (const col of columns.filter((c) => c.columnType === 'rule')) {
        if (cardMatchesRule(card, col)) return col.id;
    }

    // Mapped columns from bot group
    if (groupId) {
        const mapped = columns.find(
            (c) => c.columnType === 'mapped' && c.sourceGroupIds.includes(groupId)
        );
        if (mapped) return mapped.id;
    }

    // Placement without lock (e.g. manual sort in a mapped column)
    if (savedColumnId && columnExists(columns, savedColumnId)) {
        return savedColumnId;
    }

    return null;
}

export function buildCardsByColumn(
    cards: Record<string, any>[],
    columns: BoardColumn[],
    placements: Record<string, CustomBoardPlacement>,
    filters: { dateRange: string; customDateFrom?: string; customDateTo?: string; hourFrom?: number; hourTo?: number },
    sortMode: string,
    boardKind: CustomBoardKind = 'copy'
): Record<string, any[]> {
    const sortedCols = [...columns].sort((a, b) => a.order - b.order);
    const map: Record<string, any[]> = {};
    sortedCols.forEach((c) => {
        map[c.id] = [];
    });

    cards.forEach((card) => {
        if (!cardMatchesFilters(card, filters as any)) return;

        const colId = resolveCardColumnId(card, sortedCols, placements, boardKind);
        if (!colId || !map[colId]) return;
        map[colId].push(card);
    });

    Object.keys(map).forEach((colId) => {
        map[colId] = sortCardsInColumn(map[colId], sortMode, placements);
    });

    return map;
}
