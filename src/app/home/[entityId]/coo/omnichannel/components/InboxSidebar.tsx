import React, { useState, useEffect } from 'react';
import { Mail, Users, CheckCircle, Hash, Settings, ChevronDown, ChevronRight, MessageSquare, AlertTriangle, Instagram, Facebook, Twitter, Music, Send, Menu } from 'lucide-react';
import WhatsappIcon from '@/components/icons/WhatsappIcon';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { useEntityRoute } from '@/hooks/useEntityRoute';
import { cn } from '@/lib/utils';
import { getWhatsAppIntegrationHealth } from '@/lib/omnichannel/whatsappIntegrationStatus';
import { getChannelSendHealth, type InboxChannel } from '@/lib/omnichannel/channelSendHealth';
import { isAssignedToMe, isUnassignedChat } from '@/lib/omnichannel/humanTakeover';

interface SidebarProps {
    selectedFolder: string;
    setSelectedFolder: (folder: string) => void;
    cards?: any[];
}

const STORAGE_KEY = 'omnichannel-inbox-sidebar-collapsed';

function CollapsedTooltip({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="group relative flex justify-center">
            <span
                role="tooltip"
                className="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 z-50 rounded-md bg-neutral-800 px-2 py-1 text-[10px] font-medium text-white whitespace-nowrap opacity-0 shadow-md border border-neutral-700 transition-opacity duration-150 group-hover:opacity-100"
            >
                {label}
                <span
                    aria-hidden
                    className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-neutral-800"
                />
            </span>
            {children}
        </div>
    );
}

export default function InboxSidebar({ selectedFolder, setSelectedFolder, cards = [] }: SidebarProps) {
    const { currentUser } = useAuth();
    const { firestoreId: activeEntity, routeSegment } = useEntityRoute();
    const [integrationDocs, setIntegrationDocs] = useState<Record<string, any>>({});
    const [isCollapsed, setIsCollapsed] = useState(true);

    useEffect(() => {
        try {
            if (localStorage.getItem(STORAGE_KEY) === 'false') setIsCollapsed(false);
        } catch {
            /* ignore */
        }
    }, []);

    const toggleCollapse = () => {
        setIsCollapsed((prev) => {
            const next = !prev;
            try {
                localStorage.setItem(STORAGE_KEY, String(next));
            } catch {
                /* ignore */
            }
            return next;
        });
    };

    useEffect(() => {
        if (!currentUser || !activeEntity) return;
        const integrationsRef = collection(db, `users/${currentUser.uid}/entities/${activeEntity}/integrations`);
        const unsubscribe = onSnapshot(integrationsRef, (snapshot) => {
            const docs: Record<string, any> = {};
            snapshot.docs.forEach(doc => {
                if (doc.id === '_init') return;
                docs[doc.id] = doc.data();
            });
            setIntegrationDocs(docs);
        });
        return () => unsubscribe();
    }, [currentUser, activeEntity]);

    const [expandedSections, setExpandedSections] = useState({
        inboxes: true,
        labels: true
    });

    const toggleSection = (section: 'inboxes' | 'labels') => {
        setExpandedSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }));
    };

    const counts = {
        all: cards.reduce((acc, c) => acc + (c.unreadCount || 0), 0),
        mine: cards.filter(c => isAssignedToMe(c, currentUser?.uid)).reduce((acc, c) => acc + (c.unreadCount || 0), 0),
        unassigned: cards.filter(c => isUnassignedChat(c)).reduce((acc, c) => acc + (c.unreadCount || 0), 0),
    };

    const folders = [
        { id: 'mine', label: 'Mine', icon: <Users size={16} />, count: counts.mine },
        { id: 'unassigned', label: 'Unassigned', icon: <CheckCircle size={16} />, count: counts.unassigned },
        { id: 'all', label: 'All', icon: <Mail size={16} />, count: counts.all },
    ];

    const channels = [
        { id: 'whatsapp', label: 'WhatsApp', type: 'whatsapp' },
        { id: 'instagram', label: 'Instagram', type: 'instagram' },
        { id: 'messenger', label: 'Messenger', type: 'messenger' },
        { id: 'twitter', label: 'X (Twitter)', type: 'twitter' },
        { id: 'gmail', label: 'Gmail', type: 'gmail' },
        { id: 'telegram', label: 'Telegram', type: 'telegram' },
    ];

    const renderChannelIcon = (type: string) => {
        const t = type?.toLowerCase();
        if (t === 'whatsapp') return <WhatsappIcon className="w-3.5 h-3.5 text-neutral-400" />;
        if (t === 'instagram') return <Instagram size={14} className="text-neutral-400" />;
        if (t === 'messenger' || t === 'facebook') return <Facebook size={14} className="text-neutral-400" />;
        if (t === 'gmail') return <Mail size={14} className="text-neutral-400" />;
        if (t === 'twitter' || t === 'x') return <Twitter size={14} className="text-neutral-400" />;
        if (t === 'tiktok') return <Music size={14} className="text-neutral-400" />;
        if (t === 'telegram') return <Send size={14} className="text-neutral-400" />;
        return <Hash size={14} className="opacity-40" />;
    };

    const whatsappHealth = getWhatsAppIntegrationHealth(integrationDocs.whatsapp, integrationDocs.whatsapp_internal);

    const renderStatusDot = (channelId: string) => {
        if (channelId === 'whatsapp') {
            if (whatsappHealth.canSend) return <div className="absolute -right-0.5 -bottom-0.5 w-1.5 h-1.5 bg-blue-500 rounded-full border border-[#0a0a0a]" />;
            if (whatsappHealth.level === 'partial') return <div className="absolute -right-0.5 -bottom-0.5 w-1.5 h-1.5 bg-amber-500 rounded-full border border-[#0a0a0a] animate-pulse" />;
            return <div className="absolute -right-0.5 -bottom-0.5 w-1.5 h-1.5 bg-neutral-800 rounded-full border border-[#0a0a0a]" />;
        }
        const status = integrationDocs[channelId]?.status || integrationDocs[`${channelId}_internal`]?.status;
        if (channelId === 'messenger' || channelId === 'instagram' || channelId === 'telegram') {
            const health = getChannelSendHealth(channelId as InboxChannel, integrationDocs[channelId]);
            if (health.canSend) return <div className="absolute -right-0.5 -bottom-0.5 w-1.5 h-1.5 bg-blue-500 rounded-full border border-[#0a0a0a]" />;
            if (health.partial) return <div className="absolute -right-0.5 -bottom-0.5 w-1.5 h-1.5 bg-amber-500 rounded-full border border-[#0a0a0a] animate-pulse" />;
            return <div className="absolute -right-0.5 -bottom-0.5 w-1.5 h-1.5 bg-neutral-800 rounded-full border border-[#0a0a0a]" />;
        }
        if (status === 'Connected') return <div className="absolute -right-0.5 -bottom-0.5 w-1.5 h-1.5 bg-blue-500 rounded-full border border-[#0a0a0a]" />;
        if (status === 'Error') return <div className="absolute -right-0.5 -bottom-0.5 w-1.5 h-1.5 bg-amber-500 rounded-full border border-[#0a0a0a] animate-pulse" />;
        return <div className="absolute -right-0.5 -bottom-0.5 w-1.5 h-1.5 bg-neutral-800 rounded-full border border-[#0a0a0a]" />;
    };

    const folderButtonClass = (isSelected: boolean) =>
        cn(
            'w-full flex items-center rounded text-[12px] transition-colors group relative',
            isCollapsed ? 'justify-center px-0 py-2' : 'px-2 py-1.5',
            isSelected
                ? 'bg-blue-600/10 text-blue-500 font-medium'
                : 'text-neutral-400 hover:bg-neutral-900 hover:text-white'
        );

    const wrapCollapsed = (label: string, node: React.ReactNode) =>
        isCollapsed ? <CollapsedTooltip label={label}>{node}</CollapsedTooltip> : node;

    return (
        <div
            className={cn(
                'bg-[#0a0a0a] border-r border-neutral-900 flex flex-col h-full flex-shrink-0 select-none transition-[width] duration-200 ease-in-out overflow-hidden',
                isCollapsed ? 'w-[52px]' : 'w-52'
            )}
        >
            {/* Header */}
            <div className={cn(
                'h-12 flex items-center border-b border-neutral-900 flex-shrink-0',
                isCollapsed ? 'justify-center px-0' : 'px-2 justify-between'
            )}>
                {isCollapsed ? (
                    wrapCollapsed('Expandir menú', (
                        <button
                            onClick={toggleCollapse}
                            className="p-2 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-900 transition-colors"
                            aria-label="Expandir menú"
                        >
                            <Menu size={18} />
                        </button>
                    ))
                ) : (
                    <>
                        <div className="flex items-center min-w-0">
                            <div className="w-5 h-5 bg-blue-600 rounded mr-2 flex items-center justify-center flex-shrink-0">
                                <MessageSquare size={12} className="text-white" />
                            </div>
                            <span className="font-semibold text-white tracking-wide text-sm truncate">Inbox</span>
                        </div>
                        <button
                            onClick={toggleCollapse}
                            className="p-1.5 rounded-md text-neutral-500 hover:text-white hover:bg-neutral-900 transition-colors flex-shrink-0"
                            aria-label="Colapsar menú"
                            title="Colapsar menú"
                        >
                            <Menu size={16} />
                        </button>
                    </>
                )}
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden pt-2 space-y-4 scrollbar-thin scrollbar-thumb-neutral-800">

                {/* Standard Folders */}
                <div className={cn('space-y-0.5', isCollapsed ? 'px-1.5' : 'px-2')}>
                    {folders.map(folder => {
                        const btn = (
                            <button
                                onClick={() => setSelectedFolder(folder.id)}
                                className={folderButtonClass(selectedFolder === folder.id)}
                            >
                                <span className={cn('opacity-80 flex-shrink-0', !isCollapsed && 'mr-2.5')}>
                                    {React.cloneElement(folder.icon as React.ReactElement, { size: 14 })}
                                </span>
                                {!isCollapsed && (
                                    <>
                                        {folder.label}
                                        {folder.count > 0 && (
                                            <span className={cn(
                                                'ml-auto text-[9px] px-1.5 py-0 rounded-full transition-colors',
                                                selectedFolder === folder.id
                                                    ? 'bg-blue-600/20 text-blue-500'
                                                    : 'bg-neutral-800 text-neutral-400 group-hover:text-white'
                                            )}>
                                                {folder.count}
                                            </span>
                                        )}
                                    </>
                                )}
                                {isCollapsed && folder.count > 0 && (
                                    <span className="absolute top-1 right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-blue-600 text-white text-[8px] font-bold flex items-center justify-center leading-none">
                                        {folder.count > 99 ? '99+' : folder.count}
                                    </span>
                                )}
                            </button>
                        );
                        return (
                            <React.Fragment key={folder.id}>
                                {isCollapsed ? wrapCollapsed(folder.label, btn) : btn}
                            </React.Fragment>
                        );
                    })}
                </div>

                {/* Channels */}
                <div className={isCollapsed ? 'px-1.5' : 'px-2'}>
                    {!isCollapsed && (
                        <button
                            onClick={() => toggleSection('inboxes')}
                            className="w-full flex items-center text-[10px] font-bold text-neutral-600 uppercase tracking-widest mb-1 px-2 hover:text-neutral-400 transition-colors"
                        >
                            <span className="flex-1 text-left">Inboxes</span>
                            {expandedSections.inboxes ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </button>
                    )}

                    {(isCollapsed || expandedSections.inboxes) && (
                        <div className={cn('space-y-0.5', !isCollapsed && 'animate-in fade-in slide-in-from-top-1 duration-200')}>
                            {channels.map(channel => {
                                const isError = channel.id === 'whatsapp'
                                    ? whatsappHealth.level === 'partial'
                                    : (channel.id === 'messenger' || channel.id === 'instagram' || channel.id === 'telegram')
                                        ? getChannelSendHealth(channel.id as InboxChannel, integrationDocs[channel.id]).partial
                                        : integrationDocs[channel.id]?.status === 'Error';
                                const btn = (
                                    <button
                                        onClick={() => setSelectedFolder(channel.id)}
                                        className={folderButtonClass(selectedFolder === channel.id)}
                                    >
                                        <div className={cn('relative flex-shrink-0', !isCollapsed && 'mr-2.5')}>
                                            {renderChannelIcon(channel.type)}
                                            {renderStatusDot(channel.id)}
                                        </div>
                                        {!isCollapsed && (
                                            <>
                                                <span className={cn('truncate flex-1', isError && 'text-amber-500 font-bold')}>
                                                    {channel.label}
                                                </span>
                                                {isError && (
                                                    <div
                                                        className="ml-auto flex items-center gap-1 bg-amber-500/20 px-1 rounded animate-pulse"
                                                        title="Click para reconectar en Configuración"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            window.open(`/home/${routeSegment}/cto/integrations`, '_blank');
                                                        }}
                                                    >
                                                        <AlertTriangle size={10} className="text-amber-500" />
                                                        <span className="text-[8px] font-black text-amber-500 uppercase">OFFLINE</span>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                        {isCollapsed && isError && (
                                            <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                                        )}
                                    </button>
                                );
                                return (
                                    <React.Fragment key={channel.id}>
                                        {isCollapsed ? wrapCollapsed(channel.label, btn) : btn}
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Labels */}
                <div className={isCollapsed ? 'px-1.5' : 'px-2'}>
                    {!isCollapsed && (
                        <button
                            onClick={() => toggleSection('labels')}
                            className="w-full flex items-center text-[10px] font-bold text-neutral-600 uppercase tracking-widest mb-1 px-2 hover:text-neutral-400 transition-colors"
                        >
                            <span className="flex-1 text-left">Labels</span>
                            {expandedSections.labels ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </button>
                    )}

                    {(isCollapsed || expandedSections.labels) && (
                        <div className={cn('space-y-0.5', !isCollapsed && 'animate-in fade-in slide-in-from-top-1 duration-200')}>
                            {['Sales', 'Support', 'Urgent'].map(label => {
                                const dotColor =
                                    label === 'Urgent' ? 'bg-red-500' :
                                    label === 'Sales' ? 'bg-green-500' : 'bg-blue-500';
                                const btn = (
                                    <button
                                        onClick={() => setSelectedFolder(`label:${label}`)}
                                        className={folderButtonClass(selectedFolder === `label:${label}`)}
                                    >
                                        <div className={cn(
                                            'rounded-full flex-shrink-0',
                                            isCollapsed ? 'w-2.5 h-2.5' : 'w-1.5 h-1.5 mr-2.5',
                                            dotColor
                                        )} />
                                        {!isCollapsed && <span>{label}</span>}
                                    </button>
                                );
                                return (
                                    <React.Fragment key={label}>
                                        {isCollapsed ? wrapCollapsed(label, btn) : btn}
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Footer Settings */}
            <div className={cn('border-t border-neutral-900 flex-shrink-0', isCollapsed ? 'p-1.5' : 'p-2')}>
                {wrapCollapsed('Settings', (
                    <button className={cn(
                        'w-full flex items-center rounded text-[12px] text-neutral-400 hover:bg-neutral-900 transition-colors',
                        isCollapsed ? 'justify-center py-2' : 'px-2 py-1.5'
                    )}>
                        <Settings size={14} className={cn(!isCollapsed && 'mr-2.5')} />
                        {!isCollapsed && 'Settings'}
                    </button>
                ))}
            </div>
        </div>
    );
}
