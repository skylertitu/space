import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { toast } from 'sonner';
import {
    ensureManualKanbanInitialized,
    moveManualCardPlacement,
    subscribeManualBoard,
    syncInferredManualPlacements,
    updateManualCardOrders,
} from '@/lib/kanban/manualKanban';
import { ensureEntityMoldUpToDate } from '@/lib/mold/entityMold';
import {
    computeManualCardOrder,
    resolveManualColumnForCard,
    sortManualColumnCards,
} from '@/lib/kanban/manualKanbanCardOrder';

export function useManualKambanBoard(searchTerm = '') {
    const { currentUser, activeEntity } = useAuth();
    const getTenantPath = () => {
        if (!currentUser?.uid || !activeEntity) return '';
        return `users/${currentUser.uid}/entities/${activeEntity}`;
    };

    const [columns, setColumns] = useState<any[]>([]);
    const [placements, setPlacements] = useState<Record<string, any>>({});
    const [groupsById, setGroupsById] = useState<Record<string, any>>({});
    const [cards, setCards] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const tenantPath = getTenantPath();
        if (!tenantPath || !currentUser?.uid || !activeEntity) return;

        ensureEntityMoldUpToDate(db, currentUser.uid, activeEntity).catch((err) => {
            console.error('[useManualKambanBoard] mold upgrade failed:', err);
        });

        ensureManualKanbanInitialized(db, tenantPath).catch((err) => {
            console.error('[useManualKambanBoard] init failed:', err);
        });

        const unsubBoard = subscribeManualBoard(db, tenantPath, setColumns, setPlacements);
        return unsubBoard;
    }, [currentUser?.uid, activeEntity]);

    useEffect(() => {
        const tenantPath = getTenantPath();
        if (!tenantPath) return;

        const unsub = onSnapshot(collection(db, `${tenantPath}/kanban-groups`), (snap) => {
            const map: Record<string, any> = {};
            snap.docs.forEach((d) => {
                map[d.id] = { id: d.id, ...d.data() };
            });
            setGroupsById(map);
        });
        return unsub;
    }, [currentUser?.uid, activeEntity]);

    useEffect(() => {
        const tenantPath = getTenantPath();
        if (!tenantPath) return;

        const unsubs: (() => void)[] = [];
        const registry = new Map<string, any>();

        const groupsUnsub = onSnapshot(collection(db, `${tenantPath}/kanban-groups`), (groupsSnap) => {
            unsubs.forEach((u) => u());
            unsubs.length = 0;
            registry.clear();

            if (groupsSnap.empty) {
                setCards([]);
                setLoading(false);
                return;
            }

            groupsSnap.docs.forEach((groupDoc) => {
                const unsub = onSnapshot(
                    collection(db, `${tenantPath}/kanban-groups`, groupDoc.id, 'cards'),
                    (cardsSnap) => {
                        cardsSnap.docs.forEach((c) => {
                            registry.set(c.id, { id: c.id, sourceGroupId: groupDoc.id, ...c.data() });
                        });
                        const currentIds = new Set(cardsSnap.docs.map((d) => d.id));
                        registry.forEach((card, id) => {
                            if (card.sourceGroupId === groupDoc.id && !currentIds.has(id)) {
                                registry.delete(id);
                            }
                        });
                        setCards(Array.from(registry.values()));
                        setLoading(false);
                    }
                );
                unsubs.push(unsub);
            });
        });

        return () => {
            groupsUnsub();
            unsubs.forEach((u) => u());
        };
    }, [currentUser?.uid, activeEntity]);

    useEffect(() => {
        const tenantPath = getTenantPath();
        if (!tenantPath || loading || !cards.length) return;

        const unplaced = cards.filter((c) => !placements[c.id]);
        if (!unplaced.length) return;

        syncInferredManualPlacements(db, tenantPath, unplaced, groupsById, placements).catch((err) => {
            console.error('[useManualKambanBoard] infer sync failed:', err);
        });
    }, [cards, groupsById, placements, loading, currentUser?.uid, activeEntity]);

    const cardsByColumn = useMemo(() => {
        const map: Record<string, any[]> = {};
        columns.forEach((col) => {
            map[col.slug || col.id] = [];
        });

        cards.forEach((card) => {
            const group = groupsById[card.sourceGroupId];
            const slug = resolveManualColumnForCard(card.id, card, placements, group);
            if (!map[slug]) map[slug] = [];
            map[slug].push({ ...card, manualColumnSlug: slug });
        });

        Object.keys(map).forEach((slug) => {
            map[slug] = sortManualColumnCards(map[slug], placements);
        });

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            Object.keys(map).forEach((slug) => {
                map[slug] = map[slug].filter(
                    (c) =>
                        c.contactName?.toLowerCase().includes(term) ||
                        c.lastMessage?.toLowerCase().includes(term) ||
                        c.contactNumber?.includes(term)
                );
            });
        }

        return map;
    }, [cards, columns, placements, groupsById, searchTerm]);

    const handleDragEnd = async (event: any) => {
        const { active, over } = event;
        if (!over) return;

        const cardId = active.id as string;
        const overId = over.id as string;
        if (cardId === overId) return;

        const tenantPath = getTenantPath();
        if (!tenantPath || !currentUser?.uid) return;

        const activeCard = cards.find((c) => c.id === cardId);
        if (!activeCard) return;

        const prevSlug = resolveManualColumnForCard(
            cardId,
            activeCard,
            placements,
            groupsById[activeCard.sourceGroupId]
        );

        let destSlug = overId;
        const isColumn = columns.some((c) => (c.slug || c.id) === overId);
        if (!isColumn) {
            const overCard = cards.find((c) => c.id === overId);
            if (!overCard) return;
            destSlug = resolveManualColumnForCard(
                overCard.id,
                overCard,
                placements,
                groupsById[overCard.sourceGroupId]
            );
        }

        const placedBy = currentUser.displayName || 'Usuario';

        if (prevSlug === destSlug) {
            const columnCards = cardsByColumn[destSlug] || [];
            const orders = computeManualCardOrder(columnCards, cardId, overId, placements);
            if (!Object.keys(orders).length) return;

            setPlacements((prev) => {
                const next = { ...prev };
                Object.entries(orders).forEach(([id, order]) => {
                    next[id] = {
                        ...(next[id] || { cardId: id, columnSlug: destSlug }),
                        cardId: id,
                        columnSlug: destSlug,
                        order,
                        manualLocked: true,
                    };
                });
                return next;
            });

            try {
                await updateManualCardOrders(db, tenantPath, destSlug, orders, placedBy);
            } catch (error) {
                console.error('[useManualKambanBoard] reorder failed:', error);
                toast.error('Error al ordenar tarjeta');
            }
            return;
        }

        const destCards = (cardsByColumn[destSlug] || []).filter((c) => c.id !== cardId);
        const overIndex = isColumn ? destCards.length : destCards.findIndex((c) => c.id === overId);
        const insertOrder = overIndex >= 0 ? (overIndex + 1) * 1000 : Date.now();

        setPlacements((prev) => ({
            ...prev,
            [cardId]: { cardId, columnSlug: destSlug, order: insertOrder, manualLocked: true },
        }));

        try {
            await moveManualCardPlacement(db, tenantPath, cardId, destSlug, placedBy, insertOrder);
            const colName = columns.find((c) => (c.slug || c.id) === destSlug)?.name || destSlug;
            toast.success(`Movido a ${colName}`);
        } catch (error) {
            console.error('[useManualKambanBoard] move failed:', error);
            toast.error('Error al mover tarjeta');
            setPlacements((prev) => {
                const next = { ...prev };
                if (!prev[cardId]) {
                    delete next[cardId];
                } else {
                    next[cardId] = { ...prev[cardId], columnSlug: prevSlug };
                }
                return next;
            });
        }
    };

    return {
        columns,
        cardsByColumn,
        allCards: cards,
        loading,
        handleDragEnd,
    };
}
