import {
    collection,
    doc,
    getDocs,
    onSnapshot,
    serverTimestamp,
    setDoc,
    Timestamp,
    writeBatch,
    deleteField,
    Firestore,
} from 'firebase/firestore';
import { MANUAL_INBOX_SLUG, MANUAL_KANBAN_COLUMNS } from './manualKanbanColumns';
import { inferManualColumnSlug, sortManualColumnCards } from './manualKanbanCardOrder';

export interface ManualPlacement {
    cardId: string;
    columnSlug: string;
    order: number;
    updatedAt?: Timestamp;
    placedBy?: string;
    manualLocked?: boolean;
}

function boardRef(db: Firestore, tenantPath: string) {
    return doc(db, tenantPath, 'workspaces', 'manual_kanban');
}

function columnsCol(db: Firestore, tenantPath: string) {
    return collection(boardRef(db, tenantPath), 'columns');
}

function placementsCol(db: Firestore, tenantPath: string) {
    return collection(boardRef(db, tenantPath), 'placements');
}

export async function ensureManualKanbanInitialized(db: Firestore, tenantPath: string): Promise<void> {
    const board = boardRef(db, tenantPath);
    const existingSnap = await getDocs(columnsCol(db, tenantPath));
    const existing = new Set(existingSnap.docs.map((d) => d.id));

    const batch = writeBatch(db);
    let writes = 0;

    for (const col of MANUAL_KANBAN_COLUMNS) {
        const payload: Record<string, unknown> = {
            ...col,
            id: col.slug,
            fixed: true,
            boardType: 'manual',
            updatedAt: serverTimestamp(),
            sequenceContext: col.sequenceContext ?? deleteField(),
            actionLogic: col.actionLogic ?? deleteField(),
        };

        if (!existing.has(col.slug)) {
            payload.createdAt = serverTimestamp();
        }

        batch.set(doc(columnsCol(db, tenantPath), col.slug), payload, { merge: true });
        writes++;
    }

    if (writes > 0) await batch.commit();

    await setDoc(
        board,
        {
            columnOrder: MANUAL_KANBAN_COLUMNS.map((c) => c.slug),
            initialized: true,
            boardType: 'manual',
            updatedAt: serverTimestamp(),
        },
        { merge: true }
    );
}

export async function setManualCardPlacement(
    db: Firestore,
    tenantPath: string,
    cardId: string,
    columnSlug: string,
    order = 0,
    placedBy?: string,
    manualLocked = true
): Promise<void> {
    await setDoc(
        doc(placementsCol(db, tenantPath), cardId),
        {
            cardId,
            columnSlug,
            order,
            placedBy: placedBy || 'crm_user',
            updatedAt: serverTimestamp(),
            manualLocked,
        },
        { merge: true }
    );
}

export async function moveManualCardPlacement(
    db: Firestore,
    tenantPath: string,
    cardId: string,
    destColumnSlug: string,
    placedBy?: string,
    order?: number
): Promise<void> {
    await setManualCardPlacement(
        db,
        tenantPath,
        cardId,
        destColumnSlug,
        order ?? Date.now(),
        placedBy,
        true
    );
}

export async function updateManualCardOrders(
    db: Firestore,
    tenantPath: string,
    columnSlug: string,
    orders: Record<string, number>,
    placedBy?: string
): Promise<void> {
    const entries = Object.entries(orders);
    if (!entries.length) return;

    const batch = writeBatch(db);
    for (const [cardId, order] of entries) {
        batch.set(
            doc(placementsCol(db, tenantPath), cardId),
            {
                cardId,
                columnSlug,
                order,
                placedBy: placedBy || 'crm_user',
                updatedAt: serverTimestamp(),
                manualLocked: true,
            },
            { merge: true }
        );
    }
    await batch.commit();
}

export async function syncInferredManualPlacements(
    db: Firestore,
    tenantPath: string,
    cards: Record<string, any>[],
    groupsById: Record<string, any>,
    placements: Record<string, ManualPlacement>
): Promise<void> {
    const pending = cards.filter((card) => !placements[card.id]);
    if (!pending.length) return;

    const byColumn: Record<string, Record<string, any>[]> = {};

    for (const card of pending) {
        const group = groupsById[card.sourceGroupId];
        const slug = inferManualColumnSlug(card, group);
        if (slug === MANUAL_INBOX_SLUG) continue;
        if (!byColumn[slug]) byColumn[slug] = [];
        byColumn[slug].push(card);
    }

    const batch = writeBatch(db);
    let writes = 0;

    for (const [slug, columnCards] of Object.entries(byColumn)) {
        const sorted = sortManualColumnCards(columnCards, {});
        sorted.forEach((card, index) => {
            batch.set(doc(placementsCol(db, tenantPath), card.id), {
                cardId: card.id,
                columnSlug: slug,
                order: (index + 1) * 1000,
                placedBy: 'auto_infer',
                manualLocked: false,
                updatedAt: serverTimestamp(),
            });
            writes++;
        });
    }

    if (writes > 0) await batch.commit();
}

export function subscribeManualBoard(
    db: Firestore,
    tenantPath: string,
    onColumns: (cols: any[]) => void,
    onPlacements: (map: Record<string, ManualPlacement>) => void
) {
    const unsubCols = onSnapshot(columnsCol(db, tenantPath), (snap) => {
        const cols = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
        onColumns(cols);
    });
    const unsubPlace = onSnapshot(placementsCol(db, tenantPath), (snap) => {
        const map: Record<string, ManualPlacement> = {};
        snap.docs.forEach((d) => {
            map[d.id] = d.data() as ManualPlacement;
        });
        onPlacements(map);
    });
    return () => {
        unsubCols();
        unsubPlace();
    };
}

export function resolveManualColumnSlug(
    cardId: string,
    placements: Record<string, ManualPlacement>
): string {
    return placements[cardId]?.columnSlug || MANUAL_INBOX_SLUG;
}
