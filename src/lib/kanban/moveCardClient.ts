import { moveKanbanCard } from '@/lib/kanban/moveCard';
import { db } from '@/lib/firebase';
import { Timestamp, arrayUnion } from 'firebase/firestore';

interface MoveCardBetweenGroupsArgs {
    tenantPath: string;
    cardId: string;
    sourceGroupId: string;
    destGroupId: string;
    destGroupName?: string;
    authorName?: string;
}

export async function moveCardBetweenGroups({
    tenantPath,
    cardId,
    sourceGroupId,
    destGroupId,
    destGroupName,
    authorName,
}: MoveCardBetweenGroupsArgs): Promise<void> {
    await moveKanbanCard({
        db,
        tenantPath,
        cardId,
        sourceGroupId,
        destGroupId,
        historyEntry: {
            id: `hist_${Date.now()}`,
            type: 'status',
            content: `Movido a ${destGroupName || 'Grupo'}`,
            timestamp: Timestamp.now(),
            author: authorName || 'Usuario',
        },
    });
}
