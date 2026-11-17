import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { toast } from 'sonner';
import {
    subscribeBoard,
    subscribePlacements,
    setCardPlacement,
    updateCardOrders,
    DEFAULT_BOARD_FILTERS,
    resolveBoardKind,
    type CustomKanbanBoard,
    type CustomBoardPlacement,
} from '@/lib/kanban/customKanbanBoards';
import { buildCardsByColumn, findCardColumnId } from '@/lib/kanban/customKanbanResolver';
import { computeManualCardOrder } from '@/lib/kanban/manualKanbanCardOrder';
import { groupBelongsToPrincipalBot } from '@/lib/kanban/principalKanban';

export function useCustomKambanBoard(boardId: string, searchTerm = '') {
    const { currentUser, activeEntity } = useAuth();

    const getTenantPath = () => {
        if (!currentUser?.uid || !activeEntity) return '';
        return `users/${currentUser.uid}/entities/${activeEntity}`;
    };

    const [board, setBoard] = useState<CustomKanbanBoard | null>(null);
    const [placements, setPlacements] = useState<Record<string, CustomBoardPlacement>>({});
    const [cards, setCards] = useState<any[]>([]);
    const [groupsById, setGroupsById] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const tenantPath = getTenantPath();
        if (!tenantPath || !boardId) return;

        const unsubBoard = subscribeBoard(db, tenantPath, boardId, (b) => {
            setBoard(b);
            if (!b) setLoading(false);
        });
        const unsubPlacements = subscribePlacements(db, tenantPath, boardId, setPlacements);

        return () => {
            unsubBoard();
            unsubPlacements();
        };
    }, [currentUser?.uid, activeEntity, boardId]);

    useEffect(() => {
        const tenantPath = getTenantPath();
        if (!tenantPath || !board?.botId) return;

        const unsub = onSnapshot(collection(db, `${tenantPath}/kanban-groups`), (snap) => {
            const map: Record<string, any> = {};
            snap.docs.forEach((d) => {
                const data = { id: d.id, ...d.data() };
                if (groupBelongsToPrincipalBot(data, board.botId!)) {
                    map[d.id] = data;
                }
            });
            setGroupsById(map);
        });
        return unsub;
    }, [currentUser?.uid, activeEntity, board?.botId]);

    const trackedGroupIds = useMemo(() => {
        if (!board) return [] as string[];
        const fromColumns = board.columns.flatMap((c) => c.sourceGroupIds);
        const unique = [...new Set(fromColumns)];
        if (unique.length) return unique;
        return Object.keys(groupsById);
    }, [board, groupsById]);

    useEffect(() => {
        const tenantPath = getTenantPath();
        if (!tenantPath || !board) return;

        const unsubs: (() => void)[] = [];
        const registry = new Map<string, any>();

        if (!trackedGroupIds.length) {
            setCards([]);
            setLoading(false);
            return;
        }

        trackedGroupIds.forEach((groupId) => {
            const unsub = onSnapshot(
                collection(db, `${tenantPath}/kanban-groups`, groupId, 'cards'),
                (cardsSnap) => {
                    cardsSnap.docs.forEach((c) => {
                        registry.set(c.id, {
                            id: c.id,
                            groupId,
                            sourceGroupId: groupId,
                            ...c.data(),
                        });
                    });
                    const currentIds = new Set(cardsSnap.docs.map((d) => d.id));
                    registry.forEach((card, id) => {
                        if (card.groupId === groupId && !currentIds.has(id)) {
                            registry.delete(id);
                        }
                    });
                    setCards(Array.from(registry.values()));
                    setLoading(false);
                }
            );
            unsubs.push(unsub);
        });

        return () => unsubs.forEach((u) => u());
    }, [currentUser?.uid, activeEntity, board?.id, trackedGroupIds.join(',')]);

    const cardsByColumn = useMemo(() => {
        if (!board) return {};

        let result = buildCardsByColumn(
            cards,
            board.columns,
            placements,
            { ...DEFAULT_BOARD_FILTERS, ...board.filters },
            board.sortMode,
            resolveBoardKind(board)
        );

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            Object.keys(result).forEach((colId) => {
                result[colId] = result[colId].filter(
                    (c) =>
                        c.contactName?.toLowerCase().includes(term) ||
                        c.lastMessage?.toLowerCase().includes(term) ||
                        c.contactNumber?.includes(term)
                );
            });
        }

        return result;
    }, [cards, board, placements, searchTerm]);

    const handleDragEnd = async (event: any) => {
        const { active, over } = event;
        if (!over || !board) return;

        const cardId = active.id as string;
        const overId = over.id as string;
        if (cardId === overId) return;

        const tenantPath = getTenantPath();
        if (!tenantPath || !currentUser?.uid) return;

        const activeCard = cards.find((c) => c.id === cardId);
        if (!activeCard) return;

        const boardKind = resolveBoardKind(board);
        const columns = board.columns;
        const isColumn = columns.some((c) => c.id === overId);

        let destColId = overId;
        if (!isColumn) {
            const overCard = cards.find((c) => c.id === overId);
            if (!overCard) return;
            destColId =
                findCardColumnId(overCard.id, cardsByColumn) ||
                placements[overCard.id]?.columnId ||
                columns.find((c) => c.sourceGroupIds.includes(overCard.groupId))?.id ||
                overId;
        }

        const prevColId =
            findCardColumnId(cardId, cardsByColumn) ||
            placements[cardId]?.columnId ||
            columns.find((c) => c.sourceGroupIds.includes(activeCard.groupId))?.id;

        if (prevColId === destColId) {
            const columnCards = cardsByColumn[destColId] || [];
            const orders = computeManualCardOrder(
                columnCards.map((c) => ({ id: c.id, ...placements[c.id] })),
                cardId,
                overId,
                placements as any
            );
            if (!Object.keys(orders).length) return;

            const destCol = columns.find((c) => c.id === destColId);
            const lockPlacement =
                boardKind === 'manual' ||
                boardKind === 'copy' ||
                destCol?.columnType === 'manual' ||
                board.sortMode === 'manual';

            setPlacements((prev) => {
                const next = { ...prev };
                Object.entries(orders).forEach(([id, order]) => {
                    next[id] = {
                        ...(next[id] || { cardId: id, columnId: destColId }),
                        cardId: id,
                        columnId: destColId,
                        order,
                        manualLocked: lockPlacement || next[id]?.manualLocked === true,
                    };
                });
                return next;
            });

            try {
                const updates: Record<string, { order: number; columnId: string; manualLocked: boolean }> = {};
                Object.entries(orders).forEach(([id, order]) => {
                    updates[id] = {
                        order,
                        columnId: destColId,
                        manualLocked: lockPlacement || placements[id]?.manualLocked === true,
                    };
                });
                await updateCardOrders(db, tenantPath, boardId, updates);
            } catch {
                toast.error('Error al ordenar tarjeta');
            }
            return;
        }

        const destCards = (cardsByColumn[destColId] || []).filter((c) => c.id !== cardId);
        const overIndex = isColumn ? destCards.length : destCards.findIndex((c) => c.id === overId);
        const insertOrder = overIndex >= 0 ? (overIndex + 1) * 1000 : Date.now();

        setPlacements((prev) => ({
            ...prev,
            [cardId]: { cardId, columnId: destColId, order: insertOrder, manualLocked: true },
        }));

        try {
            await setCardPlacement(db, tenantPath, boardId, cardId, destColId, insertOrder, true);
            const colName = columns.find((c) => c.id === destColId)?.name || destColId;
            toast.success(`Movido a ${colName}`);
        } catch {
            toast.error('Error al mover tarjeta');
            setPlacements((prev) => {
                const next = { ...prev };
                delete next[cardId];
                return next;
            });
        }
    };

    return {
        board,
        setBoard,
        columns: board?.columns || [],
        cardsByColumn,
        allCards: cards,
        placements,
        groupsById,
        loading,
        handleDragEnd,
    };
}
