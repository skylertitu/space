'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { STARTER_CHATBOT_ID } from '@/lib/mold/starterChatbot';
import KambanBoard from '../../coo/kamban/components/KambanBoard';

export default function WorkspaceBotKanbanPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const entityId = params.entityId as string;
    const { currentUser, activeEntity } = useAuth();
    const botId = searchParams.get('botId') || STARTER_CHATBOT_ID;
    const [botName, setBotName] = useState<string>('');

    useEffect(() => {
        if (!currentUser?.uid || !activeEntity || !botId) return;
        getDoc(doc(db, `users/${currentUser.uid}/entities/${activeEntity}/chatbots/${botId}`)).then((snap) => {
            if (snap.exists()) {
                setBotName(snap.data()?.name || botId);
            } else {
                setBotName(botId);
            }
        });
    }, [currentUser?.uid, activeEntity, botId]);

    return (
        <div className="flex min-h-screen md:h-screen overflow-hidden bg-black text-white flex-col font-sans tracking-tight">
            <div className="h-10 border-b border-white/5 flex items-center px-4 gap-3 shrink-0 bg-[#0a0a0a]">
                <Link href={`/home/${entityId}/workspace/hub`} className="text-neutral-500 hover:text-white transition-colors">
                    <ArrowLeft size={16} />
                </Link>
                <span className="text-[11px] font-normal uppercase tracking-wider text-emerald-500/90">
                    Kamban Inamovible · {botName || 'Principal'}
                </span>
            </div>
            <main className="flex-1 overflow-hidden">
                <KambanBoard boardMode="bot" botId={botId} />
            </main>
        </div>
    );
}
