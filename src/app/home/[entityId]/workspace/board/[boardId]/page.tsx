'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { updateBoard, DEFAULT_BOARD_FILTERS, resolveBoardKind, BOARD_KIND_LABELS, type CustomKanbanBoard } from '@/lib/kanban/customKanbanBoards';
import { useCustomKambanBoard } from './hooks/useCustomKambanBoard';
import CustomKambanBoard from './components/CustomKambanBoard';
import BoardToolbar from './components/BoardToolbar';
import ConversationModal from '../../../coo/kamban/components/ConversationModal';

export default function CustomBoardPage() {
    const params = useParams();
    const entityId = params.entityId as string;
    const boardId = params.boardId as string;
    const { currentUser, activeEntity } = useAuth();

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCard, setSelectedCard] = useState<any | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const {
        board,
        columns,
        cardsByColumn,
        allCards,
        groupsById,
        loading,
        handleDragEnd,
    } = useCustomKambanBoard(boardId, searchTerm);

    const getTenantPath = () => {
        if (!currentUser?.uid || !activeEntity) return '';
        return `users/${currentUser.uid}/entities/${activeEntity}`;
    };

    const persistBoard = async (patch: Partial<CustomKanbanBoard>) => {
        const tenantPath = getTenantPath();
        if (!tenantPath) return;
        try {
            await updateBoard(db, tenantPath, boardId, patch);
        } catch {
            toast.error('Error al guardar configuración');
        }
    };

    if (loading && !board) {
        return (
            <div className="min-h-screen bg-black text-white flex items-center justify-center">
                <Loader2 className="animate-spin text-neutral-500" size={24} />
            </div>
        );
    }

    if (!board) {
        return (
            <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4">
                <p className="text-neutral-500">Tablero no encontrado</p>
                <Link href={`/home/${entityId}/workspace/hub`} className="text-violet-400 text-sm hover:underline">
                    Volver al Hub
                </Link>
            </div>
        );
    }

    const totalVisible = Object.values(cardsByColumn).reduce((s, arr) => s + arr.length, 0);
    const boardKind = resolveBoardKind(board);
    const kindMeta = BOARD_KIND_LABELS[boardKind];

    return (
        <div className="flex min-h-screen md:h-screen overflow-hidden bg-black text-white flex-col">
            <header className="border-b border-white/5 bg-[#0a0a0a] shrink-0">
                <div className="h-11 flex items-center justify-between px-3 gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <Link
                            href={`/home/${entityId}/workspace/hub`}
                            className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/5 transition-colors shrink-0"
                        >
                            <ArrowLeft size={15} />
                        </Link>
                        <div className="min-w-0 leading-tight">
                            <h1 className="text-sm font-medium truncate">{board.name}</h1>
                            <p className="text-[9px] text-neutral-600">
                                {totalVisible} de {allCards.length} leads · {columns.length} columnas
                            </p>
                            <p className="text-[8px] text-violet-500/70">
                                {kindMeta.title} · no modifica el Kamban Inamovible
                            </p>
                        </div>
                    </div>

                    <div className="relative w-36 sm:w-48 shrink-0">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-600" size={12} />
                        <input
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar..."
                            className="w-full bg-black/40 border border-white/10 rounded-lg py-1.5 pl-8 pr-2 text-[11px] placeholder:text-neutral-600 focus:outline-none focus:border-violet-500/40"
                        />
                    </div>
                </div>

                <BoardToolbar
                    boardKind={boardKind}
                    columns={columns}
                    filters={{ ...DEFAULT_BOARD_FILTERS, ...board.filters }}
                    sortMode={board.sortMode}
                    groupsById={groupsById}
                    allCards={allCards}
                    onColumnsChange={(cols) => persistBoard({ columns: cols })}
                    onFiltersChange={(filters) => persistBoard({ filters })}
                    onSortModeChange={(sortMode) => persistBoard({ sortMode })}
                />
            </header>

            <main className="flex-1 overflow-auto bg-[#0a0a0a]">
                <CustomKambanBoard
                    columns={columns}
                    cardsByColumn={cardsByColumn}
                    onCardClick={(card) => {
                        setSelectedCard(card);
                        setIsModalOpen(true);
                    }}
                    onDragEnd={handleDragEnd}
                />
            </main>

            <ConversationModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                card={selectedCard}
                allConversations={allCards}
                onSelectConversation={(card) => setSelectedCard(card)}
                stats={{ totalConversations: allCards.length, totalGroups: columns.length }}
            />
        </div>
    );
}
