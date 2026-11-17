'use client';

import React, { useState } from 'react';
import {
    DndContext,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    defaultDropAnimationSideEffects,
    DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import Card from '../../../../coo/kamban/components/Card';
import type { BoardColumn } from '@/lib/kanban/customKanbanBoards';

function CustomColumn({
    column,
    cards,
    onCardClick,
}: {
    column: BoardColumn;
    cards: any[];
    onCardClick: (card: any) => void;
}) {
    const { setNodeRef } = useDroppable({ id: column.id });
    const mappedCount = column.sourceGroupIds.length;

    return (
        <div
            ref={setNodeRef}
            className={cn(
                'flex flex-col flex-shrink-0 w-[85vw] sm:w-80 h-fit rounded-2xl border border-white/5 shadow-lg overflow-hidden mb-8 snap-center',
                column.color || 'bg-[#161616]'
            )}
        >
            <div className="p-3 pb-2 flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                    <div className={cn('px-2 py-1 rounded-md text-[10px] font-bold text-white max-w-[85%] leading-tight line-clamp-2', column.pill)}>
                        {column.name}
                    </div>
                    <span className="text-[12px] text-white/40 tabular-nums">{cards.length}</span>
                </div>
                {mappedCount > 1 && (
                    <span className="text-[9px] text-neutral-500 px-1">
                        {mappedCount} nodos fusionados · auto
                    </span>
                )}
                {column.columnType === 'rule' && column.rule && (
                    <span className="text-[9px] text-amber-500/80 px-1">
                        Regla: {column.rule.type}
                        {column.rule.value ? ` · ${column.rule.value}` : ''}
                    </span>
                )}
                {column.columnType === 'manual' && (
                    <span className="text-[9px] text-blue-400/80 px-1">Columna manual</span>
                )}
            </div>

            <div className="p-2 space-y-1 min-h-[120px]">
                <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                    {cards.map((card) => (
                        <Card
                            key={card.id}
                            card={card}
                            groupId={column.id}
                            onClick={() => onCardClick(card)}
                            cardColor={column.cardColor || 'bg-[#1e1e1e]'}
                            isCompact
                        />
                    ))}
                </SortableContext>
                {cards.length === 0 && (
                    <div className="py-6 text-center text-[10px] text-neutral-600 border border-dashed border-white/5 rounded-xl">
                        Vacío
                    </div>
                )}
            </div>
        </div>
    );
}

export default function CustomKambanBoard({
    columns,
    cardsByColumn,
    onCardClick,
    onDragEnd,
}: {
    columns: BoardColumn[];
    cardsByColumn: Record<string, any[]>;
    onCardClick: (card: any) => void;
    onDragEnd: (event: any) => void;
}) {
    const [activeId, setActiveId] = useState<string | null>(null);
    const sortedColumns = [...columns].sort((a, b) => a.order - b.order);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const allCards = Object.values(cardsByColumn).flat();
    const activeCard = allCards.find((c) => c.id === activeId);

    const dropAnimation = {
        sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.5' } } }),
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as string)}
            onDragEnd={(e) => {
                setActiveId(null);
                onDragEnd(e);
            }}
        >
            <div className="flex min-h-full w-full md:min-w-max p-2 pt-1 pb-4 gap-2 overflow-x-auto snap-x snap-mandatory no-scrollbar">
                {sortedColumns.map((col) => (
                    <CustomColumn
                        key={col.id}
                        column={col}
                        cards={cardsByColumn[col.id] || []}
                        onCardClick={onCardClick}
                    />
                ))}
            </div>
            <DragOverlay dropAnimation={dropAnimation}>
                {activeCard ? <Card card={activeCard} isOverlay /> : null}
            </DragOverlay>
        </DndContext>
    );
}
