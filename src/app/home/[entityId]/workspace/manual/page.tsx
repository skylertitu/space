'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Search } from 'lucide-react';
import ManualKambanBoard from './components/ManualKambanBoard';
import ConversationModal from '../../coo/kamban/components/ConversationModal';

export default function WorkspaceManualKanbanPage() {
    const params = useParams();
    const entityId = params.entityId as string;
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCard, setSelectedCard] = useState<any | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <div className="flex min-h-screen md:h-screen overflow-hidden bg-black text-white flex-col">
            <header className="h-[52px] border-b border-white/5 bg-[#0a0a0a] flex items-center justify-between px-4 shrink-0">
                <div className="flex items-center gap-3">
                    <Link href={`/home/${entityId}/workspace/hub`} className="text-neutral-500 hover:text-white transition-colors">
                        <ArrowLeft size={16} />
                    </Link>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-400/90">
                        Kanban manual · Follow-ups
                    </span>
                </div>
                <div className="relative w-48 md:w-64">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-600" size={12} />
                    <input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar lead..."
                        className="w-full bg-black/40 border border-white/10 rounded-lg py-1.5 pl-8 pr-2 text-[11px] placeholder:text-neutral-600 focus:outline-none focus:border-blue-500/40"
                    />
                </div>
            </header>

            <main className="flex-1 overflow-auto">
                <ManualKambanBoard
                    searchTerm={searchTerm}
                    onCardClick={(card) => {
                        setSelectedCard(card);
                        setIsModalOpen(true);
                    }}
                />
            </main>

            <ConversationModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                card={selectedCard}
            />
        </div>
    );
}
