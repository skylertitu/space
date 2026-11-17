import {
    collection,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    deleteDoc,
    Timestamp,
    Firestore,
    writeBatch,
} from 'firebase/firestore';
import { isInboxGroup } from './botNodeGroups';
import { filterGroupsForPrincipalBot } from './principalKanban';
import { stripUndefined } from '@/lib/mold/firestoreWrite';

export type CustomBoardSortMode = 'last_activity' | 'fifo' | 'lifo' | 'manual';
export type CustomBoardDateFilter = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom';
/** copy = columnas del principal + fusionar; manual = organización libre sin auto-mapeo del bot */
export type CustomBoardKind = 'copy' | 'manual';

export interface BoardColumnRule {
    type: 'keyword' | 'unread' | 'unassigned' | 'no_response_hours' | 'channel';
    value?: string | number;
}

export interface BoardColumn {
    id: string;
    name: string;
    color: string;
    cardColor: string;
    textColor: string;
    pill: string;
    order: number;
    /** mapped = auto from bot node groups; rule = filter-based; manual = human bucket */
    columnType: 'mapped' | 'rule' | 'manual';
    sourceGroupIds: string[];
    rule?: BoardColumnRule;
}

export interface CustomBoardFilters {
    dateRange: CustomBoardDateFilter;
    customDateFrom?: string;
    customDateTo?: string;
    hourFrom?: number;
    hourTo?: number;
    channel?: string;
    country?: string;
    unreadOnly?: boolean;
    unassignedOnly?: boolean;
    noResponseHours?: number;
    keyword?: string;
}

export const DEFAULT_BOARD_FILTERS: CustomBoardFilters = {
    dateRange: 'all',
};

export interface CustomKanbanBoard {
    id: string;
    name: string;
    description?: string;
    botId?: string;
    /** @deprecated use boardKind */
    type: 'merged' | 'custom';
    boardKind?: CustomBoardKind;
    parentBoardId?: string;
    sortMode: CustomBoardSortMode;
    filters: CustomBoardFilters;
    columns: BoardColumn[];
    createdAt?: Timestamp;
    updatedAt?: Timestamp;
}

export function resolveBoardKind(board?: Pick<CustomKanbanBoard, 'boardKind' | 'type'> | null): CustomBoardKind {
    if (board?.boardKind) return board.boardKind;
    if (board?.type === 'custom') return 'manual';
    return 'copy';
}

export const BOARD_KIND_LABELS: Record<CustomBoardKind, { title: string; short: string; description: string }> = {
    copy: {
        title: 'Copia',
        short: 'Copia',
        description: 'Copia las columnas del Kamban Inamovible. Puedes fusionar columnas, mover tarjetas y el orden se guarda.',
    },
    manual: {
        title: 'Manual',
        short: 'Manual',
        description: 'Empiezas con una bandeja vacía. Creas tus columnas y organizas las tarjetas libremente — todo se guarda.',
    },
};

/**
 * View-layer placements for custom Kanban copies only (`/workspace/board/[boardId]`).
 * Does NOT affect principal inamovible boards (`/workspace/bot`) — those stay synced to the bot.
 */
export interface CustomBoardPlacement {
    cardId: string;
    columnId: string;
    order: number;
    manualLocked?: boolean;
    updatedAt?: Timestamp;
}

const DEFAULT_FILTERS: CustomBoardFilters = { ...DEFAULT_BOARD_FILTERS };

/** Firestore hub doc id under workspaces — boards live in subcollection. */
export const CUSTOM_BOARDS_HUB_ID = 'custom_kanban_hub';

/** Hub doc under workspaces — boards live in subcollection (odd segment count). */
function hubRef(db: Firestore, tenantPath: string) {
    return doc(db, tenantPath, 'workspaces', CUSTOM_BOARDS_HUB_ID);
}

function boardsCol(db: Firestore, tenantPath: string) {
    return collection(hubRef(db, tenantPath), 'boards');
}

function boardRef(db: Firestore, tenantPath: string, boardId: string) {
    return doc(hubRef(db, tenantPath), 'boards', boardId);
}

function placementsCol(db: Firestore, tenantPath: string, boardId: string) {
    return collection(boardRef(db, tenantPath, boardId), 'placements');
}

function generateId(): string {
    return `board_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function generateColumnId(): string {
    return `col_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const COLUMN_PALETTE = [
    { color: 'bg-[#0c2438]', cardColor: 'bg-[#081a29]', textColor: 'text-blue-400', pill: 'bg-[#1a4a75] text-blue-50' },
    { color: 'bg-[#123122]', cardColor: 'bg-[#0e2419]', textColor: 'text-emerald-400', pill: 'bg-[#1a5b3d] text-emerald-50' },
    { color: 'bg-[#2f1c34]', cardColor: 'bg-[#241527]', textColor: 'text-purple-400', pill: 'bg-[#6b3576] text-purple-50' },
    { color: 'bg-[#331c0e]', cardColor: 'bg-[#27150a]', textColor: 'text-orange-400', pill: 'bg-[#7a3b1f] text-orange-50' },
    { color: 'bg-[#332b0e]', cardColor: 'bg-[#27210a]', textColor: 'text-yellow-400', pill: 'bg-[#7a651f] text-yellow-50' },
    { color: 'bg-[#38111e]', cardColor: 'bg-[#290c16]', textColor: 'text-pink-400', pill: 'bg-[#82193f] text-pink-50' },
];

function paletteForIndex(i: number) {
    return COLUMN_PALETTE[i % COLUMN_PALETTE.length];
}

export function buildColumnsFromGroups(groups: any[], botId?: string): BoardColumn[] {
    const botGroups = botId
        ? filterGroupsForPrincipalBot(groups, botId)
        : groups
              .filter((g) => g.autoManaged === true || isInboxGroup(g))
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    return botGroups.map((g, i) => {
        const pal = paletteForIndex(i);
        return {
            id: generateColumnId(),
            name: g.name || `Columna ${i + 1}`,
            ...pal,
            order: i,
            columnType: 'mapped' as const,
            sourceGroupIds: [g.id],
        };
    });
}

export function buildColumnsFromBoard(parent: CustomKanbanBoard): BoardColumn[] {
    return parent.columns.map((col, i) => ({
        ...col,
        id: generateColumnId(),
        order: i,
        sourceGroupIds: [...col.sourceGroupIds],
    }));
}

export function buildInitialManualColumns(): BoardColumn[] {
    const pal = paletteForIndex(0);
    return [
        {
            id: generateColumnId(),
            name: 'Bandeja',
            ...pal,
            order: 0,
            columnType: 'manual' as const,
            sourceGroupIds: [],
        },
    ];
}

export async function createBoardFromBotGroups(
    db: Firestore,
    tenantPath: string,
    name: string,
    groups: any[],
    options: {
        parentBoardId?: string;
        parentBoard?: CustomKanbanBoard;
        botId: string;
        boardKind?: CustomBoardKind;
    }
): Promise<string> {
    const resolvedBotId = options.botId || options.parentBoard?.botId;
    if (!resolvedBotId) {
        throw new Error('Debes elegir un Kamban principal (flujo de WhatsApp)');
    }

    const boardKind = options.boardKind || resolveBoardKind(options.parentBoard);
    const id = generateId();
    const filteredGroups = filterGroupsForPrincipalBot(groups, resolvedBotId);

    let columns: BoardColumn[];
    if (boardKind === 'manual') {
        columns = options.parentBoard
            ? buildColumnsFromBoard(options.parentBoard).map((col) => ({
                  ...col,
                  columnType: 'manual' as const,
                  sourceGroupIds: [],
              }))
            : buildInitialManualColumns();
    } else {
        columns = options.parentBoard
            ? buildColumnsFromBoard(options.parentBoard)
            : buildColumnsFromGroups(filteredGroups, resolvedBotId);
    }

    if (boardKind === 'copy' && !columns.length) {
        throw new Error('El Kamban principal seleccionado no tiene columnas. Sincroniza el flujo primero.');
    }

    const board = stripUndefined({
        id,
        name,
        description: options.parentBoard
            ? `${BOARD_KIND_LABELS[boardKind].title} de "${options.parentBoard.name}"`
            : `${BOARD_KIND_LABELS[boardKind].title} del flujo ${resolvedBotId}`,
        botId: resolvedBotId,
        boardKind,
        type: boardKind === 'manual' ? ('custom' as const) : ('merged' as const),
        parentBoardId: options.parentBoardId,
        sortMode: boardKind === 'manual' ? ('manual' as const) : options.parentBoard?.sortMode || 'last_activity',
        filters: options.parentBoard?.filters || { ...DEFAULT_FILTERS },
        columns,
    });

    await setDoc(boardRef(db, tenantPath, id), {
        ...board,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });

    return id;
}

export async function updateBoard(
    db: Firestore,
    tenantPath: string,
    boardId: string,
    patch: Partial<CustomKanbanBoard>
): Promise<void> {
    const { id: _id, createdAt: _c, ...rest } = patch as any;
    await setDoc(
        boardRef(db, tenantPath, boardId),
        { ...stripUndefined(rest), updatedAt: serverTimestamp() },
        { merge: true }
    );
}

export async function deleteBoard(db: Firestore, tenantPath: string, boardId: string): Promise<void> {
    const placementsSnap = await getDocs(placementsCol(db, tenantPath, boardId));
    const batch = writeBatch(db);
    placementsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(boardRef(db, tenantPath, boardId));
    await batch.commit();
}

export function subscribeBoards(
    db: Firestore,
    tenantPath: string,
    onData: (boards: CustomKanbanBoard[]) => void
): () => void {
    const q = query(boardsCol(db, tenantPath), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
        onData(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CustomKanbanBoard)));
    });
}

export function subscribeBoard(
    db: Firestore,
    tenantPath: string,
    boardId: string,
    onData: (board: CustomKanbanBoard | null) => void
): () => void {
    return onSnapshot(boardRef(db, tenantPath, boardId), (snap) => {
        if (!snap.exists()) {
            onData(null);
            return;
        }
        onData({ id: snap.id, ...snap.data() } as CustomKanbanBoard);
    });
}

export function subscribePlacements(
    db: Firestore,
    tenantPath: string,
    boardId: string,
    onData: (placements: Record<string, CustomBoardPlacement>) => void
): () => void {
    return onSnapshot(placementsCol(db, tenantPath, boardId), (snap) => {
        const map: Record<string, CustomBoardPlacement> = {};
        snap.docs.forEach((d) => {
            map[d.id] = d.data() as CustomBoardPlacement;
        });
        onData(map);
    });
}

export async function setCardPlacement(
    db: Firestore,
    tenantPath: string,
    boardId: string,
    cardId: string,
    columnId: string,
    order: number,
    manualLocked = true
): Promise<void> {
    await setDoc(
        doc(placementsCol(db, tenantPath, boardId), cardId),
        {
            cardId,
            columnId,
            order,
            manualLocked,
            updatedAt: serverTimestamp(),
        },
        { merge: true }
    );
}

export async function updateCardOrders(
    db: Firestore,
    tenantPath: string,
    boardId: string,
    updates: Record<string, Pick<CustomBoardPlacement, 'order' | 'columnId' | 'manualLocked'>>
): Promise<void> {
    const batch = writeBatch(db);
    Object.entries(updates).forEach(([cardId, data]) => {
        batch.set(
            doc(placementsCol(db, tenantPath, boardId), cardId),
            {
                cardId,
                ...data,
                updatedAt: serverTimestamp(),
            },
            { merge: true }
        );
    });
    await batch.commit();
}

export function mergeBoardColumns(
    columns: BoardColumn[],
    columnIds: string[],
    newName: string
): BoardColumn[] {
    if (columnIds.length < 2) return columns;

    const toMerge = columns.filter((c) => columnIds.includes(c.id));
    const rest = columns.filter((c) => !columnIds.includes(c.id));
    const minOrder = Math.min(...toMerge.map((c) => c.order));
    const pal = toMerge[0];

    const merged: BoardColumn = {
        id: generateColumnId(),
        name: newName,
        color: pal.color,
        cardColor: pal.cardColor,
        textColor: pal.textColor,
        pill: pal.pill,
        order: minOrder,
        columnType: 'mapped',
        sourceGroupIds: toMerge.flatMap((c) => c.sourceGroupIds),
    };

    return [...rest, merged]
        .sort((a, b) => a.order - b.order)
        .map((c, i) => ({ ...c, order: i }));
}

export function splitBoardColumn(columns: BoardColumn[], columnId: string, groupsById: Record<string, any>): BoardColumn[] {
    const target = columns.find((c) => c.id === columnId);
    if (!target || target.sourceGroupIds.length <= 1) return columns;

    const rest = columns.filter((c) => c.id !== columnId);
    const idx = target.order;
    const newCols: BoardColumn[] = target.sourceGroupIds.map((gid, i) => {
        const g = groupsById[gid];
        const pal = paletteForIndex(idx + i);
        return {
            id: generateColumnId(),
            name: g?.name || `Columna ${i + 1}`,
            ...pal,
            order: idx + i,
            columnType: 'mapped' as const,
            sourceGroupIds: [gid],
        };
    });

    return [...rest, ...newCols]
        .sort((a, b) => a.order - b.order)
        .map((c, i) => ({ ...c, order: i }));
}

export function addManualColumn(columns: BoardColumn[], name: string): BoardColumn[] {
    const pal = paletteForIndex(columns.length);
    const col: BoardColumn = {
        id: generateColumnId(),
        name,
        ...pal,
        order: columns.length,
        columnType: 'manual',
        sourceGroupIds: [],
    };
    return [...columns, col];
}

export function addRuleColumn(columns: BoardColumn[], name: string, rule: BoardColumnRule): BoardColumn[] {
    const pal = paletteForIndex(columns.length);
    const col: BoardColumn = {
        id: generateColumnId(),
        name,
        ...pal,
        order: columns.length,
        columnType: 'rule',
        sourceGroupIds: [],
        rule,
    };
    return [...columns, col];
}

export async function getBoard(
    db: Firestore,
    tenantPath: string,
    boardId: string
): Promise<CustomKanbanBoard | null> {
    const snap = await getDoc(boardRef(db, tenantPath, boardId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as CustomKanbanBoard;
}

/** Molde multitenant: contenedor del hub de tableros personalizados (copias/manuales). Idempotente. */
export async function ensureCustomKanbanHubInitialized(db: Firestore, tenantPath: string): Promise<void> {
    await setDoc(
        hubRef(db, tenantPath),
        {
            initialized: true,
            boardType: 'custom_hub',
            version: 1,
            updatedAt: serverTimestamp(),
        },
        { merge: true }
    );
}
