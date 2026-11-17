'use client';

import React, { useState, useEffect } from 'react';
import ChatList from './components/ChatList';
import ChatArea from './components/ChatArea';
import { useKanbanBoard } from '../whatsapp/hooks/useKanbanBoard';
import { useAuth } from '@/contexts/AuthContext';
import { useEntityRoute } from '@/hooks/useEntityRoute';
import { preloadWhatsAppTemplateBodies } from '@/lib/broadcast/templateDisplayCache';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { AlertTriangle } from 'lucide-react';

export default function OmnichannelInboxPage() {
    // State to manage which conversation is active
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
    const [selectedFolder, setSelectedFolder] = useState<string>('all');
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const { cards, groups, loading } = useKanbanBoard();
    const { currentUser, activeEntity, activeEntityRoute } = useAuth();
    const { firestoreId } = useEntityRoute();
    const entityIdForApi = firestoreId || activeEntity || '';

    useEffect(() => {
        if (!currentUser?.uid || !entityIdForApi) return;
        preloadWhatsAppTemplateBodies(currentUser.uid, entityIdForApi);
    }, [currentUser?.uid, entityIdForApi]);

    // Close sidebar when a folder is selected on mobile
    useEffect(() => {
        setIsSidebarOpen(false);
    }, [selectedFolder]);

    // Auto-Recovery: If activeConversationId is not in cards, we reset or switch
    // This solves the 'Ghost Card' problem where the UI is stuck on a deleted/stale ID
    React.useEffect(() => {
        if (!activeConversationId || loading || cards.length === 0) return;

        const exists = cards.some(c => c.id === activeConversationId);
        if (!exists) {
            console.warn(`[Omnichannel] Active ID ${activeConversationId} not found in board. Attempting recovery...`);
            // Try to find ANY card that might be a better match for the contact we were looking at
            // For now, simply resetting to null is safer to unblock the UI
            setActiveConversationId(null);
        }
    }, [activeConversationId, cards, loading]);

    // Global Integration Status Watchdog
    const [integrationStatuses, setIntegrationStatuses] = useState<Record<string, string>>({});
    
    React.useEffect(() => {
        if (!currentUser?.uid || !entityIdForApi) return;
        if (currentUser.uid.startsWith('demo')) {
            setIntegrationStatuses({ whatsapp: 'Connected', meta: 'Connected', telegram: 'Connected' });
            return;
        }
        const integrationsRef = collection(db, `users/${currentUser.uid}/entities/${entityIdForApi}/integrations`);
        const unsubscribe = onSnapshot(integrationsRef, (snapshot) => {
            const statuses: Record<string, string> = {};
            snapshot.docs.forEach(doc => {
                if (doc.id === '_init') return;
                statuses[doc.id] = doc.data().status;
            });
            setIntegrationStatuses(statuses);
        }, (err) => {
            console.warn('[Omnichannel] Integrations listener offline', err);
            setIntegrationStatuses({ whatsapp: 'Connected', meta: 'Connected' });
        });
        return () => unsubscribe();
    }, [currentUser?.uid, entityIdForApi]);

    const offlineChannels = Object.entries(integrationStatuses)
        .filter(([_, status]) => status === 'Error')
        .map(([id]) => id.charAt(0).toUpperCase() + id.slice(1));

    // Find active card data
    const activeCard = cards.find(c => c.id === activeConversationId) || null;
    const activeGroupName = groups.find(g => activeCard && g.id === activeCard.groupId)?.name || '';

    return (
        <div className="flex flex-col min-h-screen overflow-y-auto md:h-screen md:overflow-hidden bg-[#0a0a0a] text-white text-sm font-sans tracking-tight">
            {/* 0. Global Connectivity Alert Banner */}
            {offlineChannels.length > 0 && (
                <div className="bg-amber-600 px-4 py-1.5 flex items-center justify-between animate-in slide-in-from-top duration-500 z-[100]">
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={14} className="text-white animate-pulse" />
                        <span className="text-[11px] font-black uppercase tracking-wider text-white">
                            Atención: {offlineChannels.join(', ')} se ha desconectado. Reconéctalo en Configuración.
                        </span>
                    </div>
                    <button 
                        onClick={() => window.open(`/home/${activeEntityRoute || activeEntity}/cto/integrations`, '_blank')}
                        className="bg-white/20 hover:bg-white/30 text-white text-[9px] font-black px-3 py-1 rounded transition-colors uppercase"
                    >
                        Reconectar Ahora
                    </button>
                </div>
            )}

            <div className="flex flex-1 overflow-hidden relative p-2.5 gap-2.5 bg-[#050505]">
                {/* 1. Left Column: Floating card with List of conversations & top channel browser tabs */}
                <div className={`${activeConversationId ? 'hidden' : 'flex'} md:flex flex-col w-full md:w-[50%] lg:w-[50%] h-full bg-[#0d0d0d] rounded-2xl border border-neutral-800/80 shadow-2xl shadow-black/80 overflow-hidden flex-shrink-0`}>
                    <ChatList
                        selectedFolder={selectedFolder}
                        setSelectedFolder={setSelectedFolder}
                        activeConversationId={activeConversationId}
                        setActiveConversationId={setActiveConversationId}
                        cards={cards}
                        loading={loading}
                    />
                </div>

                {/* 2. Right Area: Floating card with Chat history */}
                <div className={`${activeConversationId ? 'flex' : 'hidden'} md:flex flex-1 flex-col overflow-hidden bg-[#111111] rounded-2xl border border-neutral-800/80 shadow-2xl shadow-black/80`}>
                    {activeCard ? (
                        <div className="flex flex-1 flex-col overflow-hidden">
                            <ChatArea
                                card={activeCard}
                                groups={groups}
                                groupName={activeGroupName}
                                allConversations={cards}
                                tenantPath={currentUser?.uid && entityIdForApi ? `users/${currentUser.uid}/entities/${entityIdForApi}` : undefined}
                                onBack={() => setActiveConversationId(null)}
                            />
                        </div>
                    ) : (
                        <div className="hidden md:flex flex-1 items-center justify-center flex-col text-neutral-500">
                            <div className="w-16 h-16 rounded-full bg-neutral-800/50 flex items-center justify-center mb-4 border border-neutral-700/40 shadow-inner">
                                <svg className="w-8 h-8 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                </svg>
                            </div>
                            <p className="text-lg font-light tracking-wide text-neutral-400">Selecciona una conversación para comenzar</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
