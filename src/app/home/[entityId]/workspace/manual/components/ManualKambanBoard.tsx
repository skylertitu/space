'use client';

import React, { useState, useMemo } from 'react';
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
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import Card from '../../../coo/kamban/components/Card';
import { useManualKambanBoard } from '../hooks/useManualKambanBoard';

function ManualColumn({
    column,
    cards,
    onCardClick,
}: {
    column: any;
    cards: any[];
    onCardClick: (card: any) => void;
}) {
    const [showContext, setShowContext] = useState(false);
    const { setNodeRef } = useDroppable({ id: column.slug || column.id });

    return (
        <div
            ref={setNodeRef}
            className={cn(
                'flex flex-col flex-shrink-0 w-[85vw] sm:w-80 h-fit rounded-2xl border border-white/5 shadow-lg overflow-hidden mb-8 snap-center',
                column.color || 'bg-[#161616]'
            )}
        >
            <div className="p-3 pb-2 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                    <div className={cn('px-2 py-1 rounded-md text-[10px] font-bold text-white max-w-[85%] leading-tight line-clamp-2', column.pill)}>
                        {column.name}
                    </div>
                    <span className="text-[12px] text-white/40 tabular-nums">{cards.length}</span>
                </div>

                {(column.sequenceContext || column.actionLogic) && (
                    <div className="rounded-xl border border-white/10 bg-black/25 overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setShowContext((v) => !v)}
                            className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-white/[0.04] transition-colors"
                        >
                            <Menu size={14} className="text-neutral-400 shrink-0" />
                            <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 flex-1">
                                Secuencia
                            </span>
                            <span className="text-[10px] text-neutral-600">{showContext ? 'Ocultar' : 'Ver'}</span>
                        </button>
                        {showContext && (
                            <div className="px-3 pb-3 border-t border-white/5 pt-2 space-y-2">
                                {column.sequenceContext && (
                                    <p className="text-[10px] text-neutral-400 whitespace-pre-wrap leading-relaxed">
                                        {column.sequenceContext}
                                    </p>
                                )}
                                {column.actionLogic && (
                                    <p className="text-[10px] text-rose-400/80 whitespace-pre-wrap leading-relaxed border-t border-white/5 pt-2">
                                        {column.actionLogic}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="p-2 space-y-1 min-h-[120px]">
                <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                    {cards.map((card) => (
                        <Card
                            key={card.id}
                            card={card}
                            groupId={column.slug}
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

export default function ManualKambanBoard({
    searchTerm,
    onCardClick,
}: {
    searchTerm: string;
    onCardClick: (card: any) => void;
}) {
    const { columns, cardsByColumn, loading, handleDragEnd } = useManualKambanBoard(searchTerm);
    const [activeId, setActiveId] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const allCards = useMemo(() => {
        return Object.values(cardsByColumn).flat();
    }, [cardsByColumn]);

    const activeCard = useMemo(() => allCards.find((c) => c.id === activeId), [allCards, activeId]);

    if (loading && columns.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center text-neutral-500 text-sm animate-pulse">
                Cargando embudo manual...
            </div>
        );
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as string)}
            onDragEnd={(e) => {
                setActiveId(null);
                handleDragEnd(e);
            }}
        >
            <div className="flex min-h-full w-full md:min-w-max p-2 gap-2 overflow-x-auto snap-x no-scrollbar">
                {columns.map((col) => (
                    <ManualColumn
                        key={col.slug || col.id}
                        column={col}
                        cards={cardsByColumn[col.slug || col.id] || []}
                        onCardClick={onCardClick}
                    />
                ))}
            </div>
            <DragOverlay dropAnimation={{ sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.5' } } }) }}>
                {activeCard ? <Card card={activeCard} isOverlay /> : null}
            </DragOverlay>
        </DndContext>
    );
}
