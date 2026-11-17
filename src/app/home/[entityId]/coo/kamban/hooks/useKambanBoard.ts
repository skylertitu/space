import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, Timestamp, addDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { moveCardBetweenGroups } from '@/lib/kanban/moveCardClient';
import { isInboxGroup } from '@/lib/kanban/botNodeGroups';
import { groupBelongsToPrincipalBot } from '@/lib/kanban/principalKanban';

export const useKambanBoard = (
    filterTerm: string = '',
    boardMode: 'bot' | 'all' = 'all',
    botId?: string
) => {
    const { currentUser, activeEntity } = useAuth();
    const getTenantPath = () => {
        if (!currentUser?.uid || !activeEntity) return '';
        return `users/${currentUser.uid}/entities/${activeEntity}`;
    };

    const [groups, setGroups] = useState<any[]>([]);
    const [cards, setCards] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Load Groups
    useEffect(() => {
        const q = query(collection(db, `${getTenantPath()}/kanban-groups`), orderBy('order', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let groupsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            if (boardMode === 'bot') {
                groupsData = groupsData.filter((g: any) => {
                    if (botId) return groupBelongsToPrincipalBot(g, botId);
                    return g.autoManaged === true || isInboxGroup(g);
                });
            }
            setGroups(groupsData);
        });
        return () => unsubscribe();
    }, [currentUser?.uid, activeEntity, boardMode, botId]);

    // Load Cards
    useEffect(() => {
        if (groups.length === 0) return;
        const unsubscribes: (() => void)[] = [];

        groups.forEach(group => {
            const q = query(collection(db, `${getTenantPath()}/kanban-groups`, group.id, 'cards'));
            const unsub = onSnapshot(q, (snapshot) => {
                const groupCards = snapshot.docs.map(doc => ({
                    id: doc.id,
                    groupId: group.id,
                    ...doc.data()
                }));

                setCards(prev => {
                    // Robust update: remove old cards for this group, add new ones
                    const otherCards = prev.filter(c => c.groupId !== group.id);
                    return [...otherCards, ...groupCards];
                });
            });
            unsubscribes.push(unsub);
        });

        setLoading(false);
        return () => unsubscribes.forEach(u => u());
    }, [groups.length]);

    const handleDragEnd = async (event: any) => {
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;

        if (activeId === overId) return;

        const movedCard = cards.find(c => c.id === activeId);
        if (!movedCard) return;

        const sourceGroupId = movedCard.groupId;
        const tenantPath = getTenantPath();
        if (!tenantPath || !currentUser?.uid) return;

        // Determine destination group
        let destGroupId = overId;
        const isOverGroup = groups.some(g => g.id === overId);

        if (!isOverGroup) {
            const overCard = cards.find(c => c.id === overId);
            if (overCard) {
                destGroupId = overCard.groupId;
            } else {
                console.warn('[useKambanBoard] Over target not found:', overId);
                return;
            }
        }

        if (sourceGroupId === destGroupId) return;

        const destGroup = groups.find(g => g.id === destGroupId);

        // Optimistic update
        setCards(prev => prev.map(c =>
            c.id === activeId ? { ...c, groupId: destGroupId } : c
        ));

        try {
            await moveCardBetweenGroups({
                tenantPath,
                cardId: activeId,
                sourceGroupId,
                destGroupId,
                destGroupName: destGroup?.name,
                authorName: currentUser.displayName || 'Usuario',
            });
            toast.success(`Movido a ${destGroup?.name || 'grupo'}`);
        } catch (error) {
            console.error('[useKambanBoard] Move failed:', error);
            toast.error('Error al mover tarjeta');
            setCards(prev => prev.map(c =>
                c.id === activeId ? { ...c, groupId: sourceGroupId } : c
            ));
        }
    };

    const handleUpdateColor = async (groupId: string, color: string) => {
        try {
            await updateDoc(doc(db, `${getTenantPath()}/kanban-groups`, groupId), { color });
        } catch (error) {
            console.error('Error updating color:', error);
            toast.error('Error changing color.');
        }
    };

    const handleAddGroup = async (name: string) => {
        try {
            await addDoc(collection(db, `${getTenantPath()}/kanban-groups`), {
                name,
                order: groups.length,
                color: 'bg-[#121212]/50', // Default color
                createdAt: Timestamp.now(),
            });
            toast.success(`Group "${name}" created.`);
        } catch (error) {
            console.error('Error adding group:', error);
            toast.error('Error creating group.');
        }
    };

    return {
        groups,
        cards,
        loading,
        handleDragEnd,
        handleUpdateColor,
        handleAddGroup,
        setCards
    };
};
