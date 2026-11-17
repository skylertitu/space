import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Filter, Clock, MessageCircle, ChevronDown, Check, CheckCheck, Mic, Mail, Globe2, Inbox, Users, CheckCircle, Instagram, Facebook, Twitter, Send, Phone, BadgeCheck, UserCheck, Bot } from 'lucide-react';
import WhatsappIcon from '@/components/icons/WhatsappIcon';
import { isInstagramCard, resolveCardChannel, resolveOmnichannelBadge } from '@/lib/omnichannel/resolveCardChannel';
import { getCountryStatsSummary, extractCardPhoneNumber } from '@/lib/omnichannel/countryStats';
import { CountryFlag } from '@/components/CountryFlag';
import { ConversationContactMeta, getContactAvatarInitial } from './ConversationContactMeta';
import { getContactHeaderNames, getContactPhoneDisplay } from '@/lib/omnichannel/contactHeaderInfo';
import { getCountryFromPhone } from '@/lib/countryCodes';
import { normalizePhoneNumber } from '@/lib/phoneUtils';
import { useAuth } from '@/contexts/AuthContext';
import { subscribeSlotConnections } from '@/lib/whatsapp/numbers';
import { isHumanTakeoverActive } from '@/lib/omnichannel/humanTakeover';

interface ChatListProps {
    selectedFolder: string;
    setSelectedFolder?: (folder: string) => void;
    activeConversationId: string | null;
    setActiveConversationId: (id: string) => void;
    cards?: any[];
    loading?: boolean;
}

type SortOption = 'newest' | 'oldest';
type FilterOption = 'all' | 'unread';

const TAB_ITEMS = [
    { id: 'all', label: 'Todos', type: 'inbox' },
    { id: 'whatsapp', label: 'WhatsApp', type: 'whatsapp' },
    { id: 'instagram', label: 'Instagram', type: 'instagram' },
    { id: 'messenger', label: 'Messenger', type: 'messenger' },
    { id: 'telegram', label: 'Telegram', type: 'telegram' },
    { id: 'twitter', label: 'X', type: 'twitter' },
    { id: 'gmail', label: 'Gmail', type: 'gmail' },
];

function renderTabIcon(type: string, isActive: boolean) {
    if (type === 'inbox') return <Inbox size={14} className={isActive ? "text-blue-400" : "text-neutral-400 group-hover:text-white"} />;
    if (type === 'mine') return <Users size={14} className={isActive ? "text-blue-400" : "text-neutral-400 group-hover:text-white"} />;
    if (type === 'unassigned') return <CheckCircle size={14} className={isActive ? "text-blue-400" : "text-neutral-400 group-hover:text-white"} />;
    if (type === 'whatsapp') return <WhatsappIcon className={`w-3.5 h-3.5 ${isActive ? "text-[#25D366]" : "text-neutral-400 group-hover:text-white"}`} />;
    if (type === 'instagram') return <Instagram size={14} className={isActive ? "text-pink-500" : "text-neutral-400 group-hover:text-white"} />;
    if (type === 'messenger') return <Facebook size={14} className={isActive ? "text-blue-500" : "text-neutral-400 group-hover:text-white"} />;
    if (type === 'telegram') return <Send size={14} className={isActive ? "text-sky-400" : "text-neutral-400 group-hover:text-white"} />;
    if (type === 'twitter') return <Twitter size={14} className={isActive ? "text-white" : "text-neutral-400 group-hover:text-white"} />;
    if (type === 'gmail') return <Mail size={14} className={isActive ? "text-red-500" : "text-neutral-400 group-hover:text-white"} />;
    return <Inbox size={14} className="opacity-60" />;
}

function filterCardsByFolder(cards: any[], selectedFolder: string): any[] {
    if (selectedFolder === 'mine') {
        return cards.filter(c => c.assignedTo === 'Mío');
    }
    if (selectedFolder === 'unassigned') {
        return cards.filter(c => !c.assignedTo || c.assignedTo === 'Unassigned');
    }
    if (selectedFolder === 'whatsapp') {
        return cards.filter(c => {
            const src = (c.channel || c.source || c.primary_channel || '').toLowerCase();
            return src.includes('whatsapp');
        });
    }
    if (selectedFolder === 'instagram') {
        return cards.filter((c) => isInstagramCard(c));
    }
    if (selectedFolder === 'messenger') {
        return cards.filter(c => {
            const src = (c.channel || c.source || c.primary_channel || '').toLowerCase();
            return src.includes('messenger') || src.includes('facebook') || src.includes('meta');
        });
    }
    if (selectedFolder === 'telegram') {
        return cards.filter(c => {
            const src = (c.channel || c.source || c.primary_channel || '').toLowerCase();
            return src.includes('telegram');
        });
    }
    if (selectedFolder === 'twitter' || selectedFolder === 'x') {
        return cards.filter(c => {
            const src = (c.channel || c.source || c.primary_channel || '').toLowerCase();
            return src.includes('x') || src.includes('twitter');
        });
    }
    if (selectedFolder === 'gmail') {
        return cards.filter(c => {
            const src = (c.channel || c.source || c.primary_channel || '').toLowerCase();
            return src.includes('gmail') || src.includes('email');
        });
    }
    if (selectedFolder.startsWith('label:')) {
        const labelFilter = selectedFolder.replace('label:', '');
        return cards.filter(c => c.labels?.includes(labelFilter));
    }
    return cards;
}

function dedupeCards(filtered: any[]): any[] {
    const uniqueMap = new Map<string, any>();

    filtered.forEach(c => {
        const phone = extractCardPhoneNumber(c);
        const resolved = resolveCardChannel(c);
        const sourceKey = resolved === 'others' ? 'unknown' : resolved;
        const idKey = phone
            ? phone.replace(/\D/g, '')
            : (c.platform_ids?.instagram ||
                  c.platform_ids?.messenger ||
                  c.platform_ids?.whatsapp ||
                  c.metaSenderId ||
                  c.external_id ||
                  c.id);

        const key = `${sourceKey}_${idKey}`;
        const existing = uniqueMap.get(key);

        const getTimestamp = (card: any) => {
            const ts = card.updatedAt;
            if (!ts) return 0;
            if (typeof ts.toDate === 'function') return ts.toDate().getTime();
            if (ts.seconds) return ts.seconds * 1000;
            if (ts instanceof Date) return ts.getTime();
            if (typeof ts === 'number') return ts;
            return 0;
        };

        if (!existing || getTimestamp(c) > getTimestamp(existing)) {
            uniqueMap.set(key, c);
        }
    });

    return Array.from(uniqueMap.values());
}

function filterCardsByApiPhone(cardsList: any[], selectedApiPhone: string | null, availableApiPhones: any[]): any[] {
    if (!selectedApiPhone) return cardsList;

    const selectedTarget = availableApiPhones.find(p => p.id === selectedApiPhone);
    const tokens = new Set<string>([selectedApiPhone]);
    if (selectedTarget?.phoneNumberId) tokens.add(String(selectedTarget.phoneNumberId));
    if (selectedTarget?.displayPhoneNumber) tokens.add(String(selectedTarget.displayPhoneNumber));
    if (selectedTarget?.slotKey) tokens.add(String(selectedTarget.slotKey));

    const cleanTokens = new Set<string>();
    tokens.forEach(t => {
        const clean = t.replace(/\D/g, '');
        if (clean) cleanTokens.add(clean);
    });

    return cardsList.filter(c => {
        const cardApiLines = [
            c.whatsappPhoneNumberId,
            c.wabaPhoneNumber,
            c.displayPhoneNumber,
            c.phoneNumberId,
            c.businessPhoneNumber,
            c.whatsapp_account,
            c.channelPhone,
            c.phoneId,
            c.slotId,
            c.assignedSlot,
            c.recipientPhoneNumberId,
            c.destinationNumber,
            c.toPhone,
            c.botPhoneNumber,
            c.customFields?.wabaPhoneNumber,
            c.customFields?.phoneNumberId,
        ].filter(Boolean).map(v => String(v));

        if (cardApiLines.length === 0) {
            if (availableApiPhones.length <= 1) return true;
            if (selectedTarget?.slotKey === 'general' || selectedApiPhone === availableApiPhones[0]?.id) return true;
            return false;
        }

        for (const line of cardApiLines) {
            if (tokens.has(line)) return true;
            const cleanVal = line.replace(/\D/g, '');
            if (cleanVal) {
                for (const ct of cleanTokens) {
                    if (cleanVal === ct || cleanVal.endsWith(ct) || ct.endsWith(cleanVal)) {
                        return true;
                    }
                }
            }
        }

        return false;
    });
}

function getLatestMessageSnippet(c: any): string {
    if (Array.isArray(c.messages) && c.messages.length > 0) {
        const lastMsg = c.messages[c.messages.length - 1];
        if (lastMsg) {
            const text = lastMsg.text || lastMsg.body || lastMsg.content || lastMsg.message || '';
            if (typeof text === 'string' && text.trim()) return text.trim();
            if (lastMsg.type === 'image' || lastMsg.fileType?.includes('image')) return '📷 Imagen';
            if (lastMsg.type === 'video' || lastMsg.fileType?.includes('video')) return '🎥 Video';
            if (lastMsg.type === 'audio' || lastMsg.fileType?.includes('audio')) return '🎵 Audio';
            if (lastMsg.type === 'document' || lastMsg.fileType?.includes('application')) return '📄 Archivo';
        }
    }

    const candidates = [
        c.lastMessage,
        c.last_message,
        c.latestMessage,
        c.lastMessageText,
        c.lastBotMessage,
        c.lastOutgoingMessage,
        c.lastSystemMessage
    ];

    for (const cand of candidates) {
        if (typeof cand === 'string' && cand.trim()) {
            return cand.trim();
        }
    }

    if (typeof c.description === 'string' && c.description.trim()) {
        return c.description.trim();
    }

    return 'Nueva conversación';
}

function isLastMessageOutbound(card: any): boolean {
    if (Array.isArray(card.messages) && card.messages.length > 0) {
        const lastMsg = card.messages[card.messages.length - 1];
        if (lastMsg) {
            const sender = (lastMsg.sender || lastMsg.role || lastMsg.from || '').toLowerCase();
            if (sender === 'agent' || sender === 'bot' || sender === 'system' || sender === 'me' || sender === 'outbound' || sender === 'ai') {
                return true;
            }
            if (sender === 'user' || sender === 'customer' || sender === 'client' || sender === 'inbound') {
                return false;
            }
        }
    }

    const direction = (
        card.lastMessageDirection ||
        card.lastSender ||
        card.lastMsgDirection ||
        card.direction ||
        ''
    ).toLowerCase();

    if (direction.includes('out') || direction.includes('agent') || direction.includes('bot') || direction.includes('sent')) {
        return true;
    }
    if (direction.includes('in') || direction.includes('user') || direction.includes('customer') || direction.includes('client')) {
        return false;
    }

    return (card.unreadCount || 0) === 0;
}

function DoubleCheckIcon({ className = "w-[15px] h-[11px] text-sky-400" }: { className?: string }) {
    return (
        <svg viewBox="0 0 20 14" fill="none" className={`shrink-0 ${className}`}>
            <path
                d="M1.5 7.5L5.5 11.5L14.5 2.5"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M6.5 7.5L10.5 11.5L19.5 2.5"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

function SingleCheckIcon({ className = "w-[12px] h-[11px] text-neutral-400" }: { className?: string }) {
    return (
        <svg viewBox="0 0 16 14" fill="none" className={`shrink-0 ${className}`}>
            <path
                d="M1.5 7.5L5.5 11.5L14.5 2.5"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export default function ChatList({ selectedFolder, setSelectedFolder, activeConversationId, setActiveConversationId, cards = [], loading = false }: ChatListProps) {
    const { currentUser, activeEntity } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [sortBy, setSortBy] = useState<SortOption>('newest');
    const [filterBy, setFilterBy] = useState<FilterOption>('all');
    
    // Tab-specific sub-toolbar filters
    const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
    const [selectedApiPhone, setSelectedApiPhone] = useState<string | null>(null);
    const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
    const [selectedTakeover, setSelectedTakeover] = useState<'human' | 'bot' | null>(null);

    const [showCountryDropdown, setShowCountryDropdown] = useState(false);
    const [showPhoneDropdown, setShowPhoneDropdown] = useState(false);
    const [showStatusDropdown, setShowStatusDropdown] = useState(false);
    const [showTakeoverDropdown, setShowTakeoverDropdown] = useState(false);

    const filterMenuRef = useRef<HTMLDivElement>(null);
    const countryMenuRef = useRef<HTMLDivElement>(null);
    const phoneMenuRef = useRef<HTMLDivElement>(null);
    const statusMenuRef = useRef<HTMLDivElement>(null);
    const takeoverMenuRef = useRef<HTMLDivElement>(null);

    // Real-time subscription to CTO Integrations (whatsapp_numbers & legacy integrations)
    const [ctoSlotConnections, setCtoSlotConnections] = useState<Record<string, any>>({});

    useEffect(() => {
        if (!currentUser?.uid || !activeEntity) return;
        const tenantPath = `users/${currentUser.uid}/entities/${activeEntity}`;
        const unsub = subscribeSlotConnections(tenantPath, (conns) => {
            setCtoSlotConnections(conns);
        });
        return () => unsub();
    }, [currentUser?.uid, activeEntity]);

    // Close menus when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
                setShowFilterMenu(false);
            }
            if (countryMenuRef.current && !countryMenuRef.current.contains(event.target as Node)) {
                setShowCountryDropdown(false);
            }
            if (phoneMenuRef.current && !phoneMenuRef.current.contains(event.target as Node)) {
                setShowPhoneDropdown(false);
            }
            if (statusMenuRef.current && !statusMenuRef.current.contains(event.target as Node)) {
                setShowStatusDropdown(false);
            }
            if (takeoverMenuRef.current && !takeoverMenuRef.current.contains(event.target as Node)) {
                setShowTakeoverDropdown(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const availableApiPhones = useMemo(() => {
        const phoneMap = new Map<string, { id: string; label: string; slotKey?: string; phoneNumberId?: string; displayPhoneNumber?: string }>();

        Object.entries(ctoSlotConnections).forEach(([slotKey, conn]: [string, any]) => {
            if (conn?.connected && (conn?.phoneNumberId || conn?.displayPhoneNumber)) {
                const id = String(conn.phoneNumberId || conn.displayPhoneNumber);
                const slotName = slotKey === 'general' ? 'General' : slotKey === 'support' ? 'Soporte' : slotKey === 'broadcast' ? 'Broadcast' : slotKey;
                const display = conn.displayPhoneNumber ? `${conn.displayPhoneNumber} (${slotName})` : `Línea ${slotName}`;
                phoneMap.set(id, { id, label: display, slotKey, phoneNumberId: conn.phoneNumberId, displayPhoneNumber: conn.displayPhoneNumber });
            }
        });

        cards.forEach(c => {
            const apiNum = c.whatsappPhoneNumberId || c.wabaPhoneNumber || c.displayPhoneNumber || c.phoneNumberId || c.businessPhoneNumber || c.whatsapp_account || c.channelPhone || c.phoneId;
            if (apiNum) {
                const key = String(apiNum);
                if (!phoneMap.has(key)) {
                    const label = c.displayPhoneNumber || c.wabaPhoneNumber || c.whatsapp_account || key;
                    phoneMap.set(key, { id: key, label: String(label) });
                }
            }
        });

        const list = Array.from(phoneMap.values());
        const folderCards = dedupeCards(filterCardsByFolder(cards, selectedFolder));

        return list.map(p => {
            const count = filterCardsByApiPhone(folderCards, p.id, list).length;
            return { ...p, count };
        });
    }, [ctoSlotConnections, cards, selectedFolder]);

    const countryStats = useMemo(() => {
        const folderCards = dedupeCards(filterCardsByFolder(cards, selectedFolder));
        const apiFilteredCards = filterCardsByApiPhone(folderCards, selectedApiPhone, availableApiPhones);
        return getCountryStatsSummary(apiFilteredCards);
    }, [cards, selectedFolder, selectedApiPhone, availableApiPhones]);

    const statusStats = useMemo(() => {
        const folderCards = dedupeCards(filterCardsByFolder(cards, selectedFolder));
        const apiCards = filterCardsByApiPhone(folderCards, selectedApiPhone, availableApiPhones);
        const countryCards = selectedCountry
            ? apiCards.filter(c => {
                const rawPhone = extractCardPhoneNumber(c);
                if (!rawPhone) return false;
                const normalized = normalizePhoneNumber(String(rawPhone));
                const countryInfo = getCountryFromPhone(normalized);
                if (selectedCountry === 'US') {
                    return countryInfo?.iso === 'US' || countryInfo?.code === '+1';
                }
                return countryInfo?.iso === selectedCountry;
            })
            : apiCards;

        const counts: Record<string, number> = {
            'Nuevo Aplicante': 0,
            'En Proceso': 0,
            'Aprobado': 0,
            'Rechazado': 0,
            'Pendiente': 0,
        };

        countryCards.forEach(c => {
            const st = c.status || 'Nuevo Aplicante';
            counts[st] = (counts[st] || 0) + 1;
        });

        return {
            total: countryCards.length,
            byStatus: Object.entries(counts).map(([status, count]) => ({ status, count })),
        };
    }, [cards, selectedFolder, selectedApiPhone, availableApiPhones, selectedCountry]);

    const takeoverStats = useMemo(() => {
        const folderCards = dedupeCards(filterCardsByFolder(cards, selectedFolder));
        const apiCards = filterCardsByApiPhone(folderCards, selectedApiPhone, availableApiPhones);
        const countryCards = selectedCountry
            ? apiCards.filter(c => {
                const rawPhone = extractCardPhoneNumber(c);
                if (!rawPhone) return false;
                const normalized = normalizePhoneNumber(String(rawPhone));
                const countryInfo = getCountryFromPhone(normalized);
                if (selectedCountry === 'US') {
                    return countryInfo?.iso === 'US' || countryInfo?.code === '+1';
                }
                return countryInfo?.iso === selectedCountry;
            })
            : apiCards;
        const statusCards = selectedStatus
            ? countryCards.filter(c => (c.status || 'Nuevo Aplicante') === selectedStatus)
            : countryCards;

        let humanCount = 0;
        let botCount = 0;

        statusCards.forEach(c => {
            if (isHumanTakeoverActive(c)) {
                humanCount++;
            } else {
                botCount++;
            }
        });

        return {
            total: statusCards.length,
            human: humanCount,
            bot: botCount,
        };
    }, [cards, selectedFolder, selectedApiPhone, availableApiPhones, selectedCountry, selectedStatus]);

    const tabCounts = useMemo(() => {
        return {
            all: cards.reduce((acc, c) => acc + (c.unreadCount || 0), 0),
            mine: cards.filter(c => c.assignedTo === 'Mío').reduce((acc, c) => acc + (c.unreadCount || 0), 0),
            unassigned: cards.filter(c => !c.assignedTo || c.assignedTo === 'Unassigned').reduce((acc, c) => acc + (c.unreadCount || 0), 0),
            whatsapp: cards.filter(c => (c.channel || c.source || c.primary_channel || '').toLowerCase().includes('whatsapp')).reduce((acc, c) => acc + (c.unreadCount || 0), 0),
            instagram: cards.filter(c => isInstagramCard(c)).reduce((acc, c) => acc + (c.unreadCount || 0), 0),
            messenger: cards.filter(c => {
                const src = (c.channel || c.source || c.primary_channel || '').toLowerCase();
                return src.includes('messenger') || src.includes('facebook') || src.includes('meta');
            }).reduce((acc, c) => acc + (c.unreadCount || 0), 0),
            telegram: cards.filter(c => (c.channel || c.source || c.primary_channel || '').toLowerCase().includes('telegram')).reduce((acc, c) => acc + (c.unreadCount || 0), 0),
            twitter: cards.filter(c => {
                const src = (c.channel || c.source || c.primary_channel || '').toLowerCase();
                return src.includes('twitter') || src.includes('x');
            }).reduce((acc, c) => acc + (c.unreadCount || 0), 0),
            gmail: cards.filter(c => {
                const src = (c.channel || c.source || c.primary_channel || '').toLowerCase();
                return src.includes('gmail') || src.includes('email');
            }).reduce((acc, c) => acc + (c.unreadCount || 0), 0),
        };
    }, [cards]);

    const conversations = useMemo(() => {
        let filtered = filterCardsByFolder(cards, selectedFolder);
        filtered = filterCardsByApiPhone(filtered, selectedApiPhone, availableApiPhones);

        if (filterBy === 'unread') {
            filtered = filtered.filter(c => (c.unreadCount || 0) > 0);
        }

        if (selectedCountry) {
            filtered = filtered.filter(c => {
                const rawPhone = extractCardPhoneNumber(c);
                if (!rawPhone) return false;
                const normalized = normalizePhoneNumber(String(rawPhone));
                const countryInfo = getCountryFromPhone(normalized);
                if (selectedCountry === 'US') {
                    return countryInfo?.iso === 'US' || countryInfo?.code === '+1';
                }
                return countryInfo?.iso === selectedCountry;
            });
        }

        if (selectedStatus) {
            filtered = filtered.filter(c => (c.status || 'Nuevo Aplicante') === selectedStatus);
        }

        if (selectedTakeover) {
            filtered = filtered.filter(c => {
                const isHuman = isHumanTakeoverActive(c);
                return selectedTakeover === 'human' ? isHuman : !isHuman;
            });
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(c => 
                (c.contactName || '').toLowerCase().includes(query) || 
                (c.contactNumber || '').toLowerCase().includes(query)
            );
        }

        filtered = dedupeCards(filtered);

        filtered.sort((a, b) => {
            const getTimestamp = (card: any) => {
                const ts = card.updatedAt || card.createdAt;
                if (!ts) return Date.now();
                if (typeof ts.toDate === 'function') return ts.toDate().getTime();
                if (ts.seconds) return ts.seconds * 1000;
                if (ts instanceof Date) return ts.getTime();
                if (typeof ts === 'number') return ts;
                return 0;
            };
            const timeA = getTimestamp(a);
            const timeB = getTimestamp(b);
            return sortBy === 'newest' ? timeB - timeA : timeA - timeB;
        });

        return filtered.map(c => ({
            id: c.id,
            card: c,
            channel: resolveOmnichannelBadge(c),
            snippet: getLatestMessageSnippet(c),
            time: c.updatedAt ? (typeof c.updatedAt.toDate === 'function' ? c.updatedAt.toDate() : (c.updatedAt.seconds ? new Date(c.updatedAt.seconds * 1000) : new Date(c.updatedAt))).toLocaleDateString(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'}) : 'Reciente',
            unread: c.unreadCount || 0,
            presence: c.presence || null,
        }));
    }, [cards, selectedFolder, searchQuery, sortBy, filterBy, selectedCountry, selectedApiPhone, selectedStatus, selectedTakeover, availableApiPhones]);

    return (
        <div className="w-full bg-[#0d0d0d] flex flex-col h-full flex-shrink-0 text-white">
            {/* Browser Style Channel Tabs Bar with Equal Tab Widths */}
            <div className="bg-[#070708] border-b border-neutral-900 pt-1.5 px-1.5 flex items-center overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden scroll-smooth select-none gap-0.5 shrink-0">
                {TAB_ITEMS.map((tab, idx) => {
                    const isActive = selectedFolder === tab.id;
                    const unread = tabCounts[tab.id as keyof typeof tabCounts] || 0;
                    const nextIsActive = selectedFolder === TAB_ITEMS[idx + 1]?.id;

                    return (
                        <React.Fragment key={tab.id}>
                            <button
                                type="button"
                                onClick={() => setSelectedFolder?.(tab.id)}
                                title={tab.label}
                                className={`
                                    group relative flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium transition-all duration-150 shrink-0 select-none rounded-t-lg border-t border-x flex-1 basis-0 w-full min-w-[100px] text-center
                                    ${isActive 
                                        ? 'bg-[#0d0d0d] text-white border-neutral-800/90 font-semibold -mb-[1px] z-10 shadow-[0_-2px_10px_rgba(0,0,0,0.5)]' 
                                        : 'bg-transparent text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/70 border-transparent'
                                    }
                                `}
                            >
                                {isActive && (
                                    <span className="absolute top-0 left-0 right-0 h-[2px] bg-blue-500 rounded-t-lg shadow-[0_0_8px_rgba(59,130,246,0.9)]" />
                                )}

                                <span className="flex items-center justify-center shrink-0">
                                    {renderTabIcon(tab.type, isActive)}
                                </span>

                                <span className="whitespace-nowrap truncate">{tab.label}</span>

                                {unread > 0 && (
                                    <span className={`
                                        ml-0.5 min-w-[15px] h-[15px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center leading-none shrink-0
                                        ${isActive ? 'bg-blue-600 text-white shadow-sm' : 'bg-neutral-800 text-blue-400 border border-blue-500/30'}
                                    `}>
                                        {unread > 99 ? '99+' : unread}
                                    </span>
                                )}
                            </button>

                            {!isActive && !nextIsActive && idx < TAB_ITEMS.length - 1 && (
                                <div className="h-3.5 w-[1px] bg-neutral-800/70 shrink-0 self-center mx-0.5" />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>

            {/* Tab-Specific Tools Sub-Toolbar (Above Search Bar) */}
            <div className="px-2.5 py-1.5 bg-[#09090b] border-b border-neutral-900 flex items-center justify-between gap-1.5 overflow-visible shrink-0">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    
                    {/* 1. WhatsApp API Phone Line Filter */}
                    {(selectedFolder === 'whatsapp' || selectedFolder === 'all') && (
                        <div className="relative flex-1 basis-0 min-w-[105px]" ref={phoneMenuRef}>
                            <button
                                type="button"
                                onClick={() => setShowPhoneDropdown(!showPhoneDropdown)}
                                className={`w-full flex items-center justify-between gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                                    selectedApiPhone 
                                        ? 'bg-neutral-800 border-neutral-700 text-white font-semibold shadow-sm' 
                                        : 'bg-neutral-900/90 border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700'
                                }`}
                                title="Filtrar por número API de WhatsApp (CTO Integraciones)"
                            >
                                <div className="flex items-center gap-1.5 min-w-0 truncate">
                                    <Phone size={11} className={selectedApiPhone ? "text-white shrink-0" : "text-neutral-400 shrink-0"} />
                                    <span className="truncate">
                                        {selectedApiPhone 
                                            ? (availableApiPhones.find(p => p.id === selectedApiPhone)?.label || selectedApiPhone)
                                            : "Número API"
                                        }
                                    </span>
                                </div>
                                <ChevronDown size={11} className="text-neutral-500 shrink-0" />
                            </button>

                            {showPhoneDropdown && (
                                <div className="absolute top-full left-0 mt-1.5 w-64 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl z-[70] overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150 p-1">
                                    <div className="px-2.5 py-1.5 border-b border-neutral-800 text-[9px] font-bold uppercase tracking-widest text-neutral-500 flex justify-between items-center">
                                        <span>Líneas API Conectadas</span>
                                        <span className="text-[10px] text-neutral-400 font-mono">{availableApiPhones.length} activas</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => { setSelectedApiPhone(null); setShowPhoneDropdown(false); }}
                                        className={`w-full text-left px-2.5 py-1.5 text-[11px] rounded-md transition-colors flex items-center justify-between ${!selectedApiPhone ? 'bg-neutral-800 text-white font-medium' : 'text-neutral-300 hover:bg-neutral-800'}`}
                                    >
                                        <span className="flex items-center gap-2">
                                            <Phone size={11} className="text-neutral-400" />
                                            Todos los números API
                                        </span>
                                        {!selectedApiPhone && <Check size={12} className="text-neutral-300" />}
                                    </button>
                                    <div className="max-h-52 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-800 space-y-0.5 pt-0.5">
                                        {availableApiPhones.length === 0 ? (
                                            <div className="px-2.5 py-2 text-[10px] text-neutral-500 italic">
                                                Sin números API configurados en Integraciones
                                            </div>
                                        ) : (
                                            availableApiPhones.map(p => (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    onClick={() => { setSelectedApiPhone(p.id); setShowPhoneDropdown(false); }}
                                                    className={`w-full text-left px-2.5 py-1.5 text-[11px] rounded-md transition-colors flex items-center justify-between ${selectedApiPhone === p.id ? 'bg-neutral-800 text-white font-medium' : 'text-neutral-300 hover:bg-neutral-800'}`}
                                                >
                                                    <span className="flex items-center gap-2 truncate">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                                                        <span className="truncate">{p.label}</span>
                                                    </span>
                                                    <span className="text-[10px] bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-400 font-mono">
                                                        {p.count}
                                                    </span>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 2. Interactive Country Filter Dropdown */}
                    <div className="relative flex-1 basis-0 min-w-[105px]" ref={countryMenuRef}>
                        <button
                            type="button"
                            onClick={() => setShowCountryDropdown(!showCountryDropdown)}
                            className={`w-full flex items-center justify-between gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                                selectedCountry 
                                    ? 'bg-neutral-800 border-neutral-700 text-white font-semibold shadow-sm' 
                                    : 'bg-neutral-900/90 border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700'
                            }`}
                            title="Filtrar por País del contacto"
                        >
                            <div className="flex items-center gap-1.5 min-w-0 truncate">
                                {selectedCountry ? (
                                    <CountryFlag iso={selectedCountry} country={countryStats.byCountry.find(c => c.iso === selectedCountry)?.country || selectedCountry} size="sm" />
                                ) : (
                                    <Globe2 size={11} className="text-neutral-400 shrink-0" />
                                )}
                                <span className="truncate">
                                    {selectedCountry 
                                        ? (countryStats.byCountry.find(c => c.iso === selectedCountry)?.country || selectedCountry)
                                        : "País"
                                    }
                                </span>
                            </div>
                            <ChevronDown size={11} className="text-neutral-500 shrink-0" />
                        </button>

                        {showCountryDropdown && (
                            <div className="absolute top-full left-0 mt-1.5 w-60 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl z-[70] overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150 p-1">
                                <div className="px-2.5 py-1.5 border-b border-neutral-800 text-[9px] font-bold uppercase tracking-widest text-neutral-500 flex justify-between items-center">
                                    <span>Filtrar por País</span>
                                    <span className="text-[10px] text-neutral-400 font-mono">{countryStats.total} contactos</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setSelectedCountry(null); setShowCountryDropdown(false); }}
                                    className={`w-full text-left px-2.5 py-1.5 text-[11px] rounded-md transition-colors flex items-center justify-between ${!selectedCountry ? 'bg-neutral-800 text-white font-medium' : 'text-neutral-300 hover:bg-neutral-800'}`}
                                >
                                    <span className="flex items-center gap-2">
                                        <Globe2 size={12} className="text-neutral-400" />
                                        Todos los países
                                    </span>
                                    <span className="text-[10px] text-neutral-500 font-mono">({countryStats.total})</span>
                                </button>
                                <div className="max-h-52 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-800 space-y-0.5 pt-0.5">
                                    {countryStats.byCountry.map((stat) => (
                                        <button
                                            key={stat.iso}
                                            type="button"
                                            onClick={() => { setSelectedCountry(stat.iso); setShowCountryDropdown(false); }}
                                            className={`w-full text-left px-2.5 py-1.5 text-[11px] rounded-md transition-colors flex items-center justify-between ${selectedCountry === stat.iso ? 'bg-neutral-800 text-white font-medium' : 'text-neutral-300 hover:bg-neutral-800'}`}
                                        >
                                            <span className="flex items-center gap-2 truncate">
                                                <CountryFlag iso={stat.iso} country={stat.country} size="sm" />
                                                <span className="truncate">{stat.country}</span>
                                            </span>
                                            <span className="text-[10px] bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-400 font-mono">
                                                {stat.count}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 3. Lead Stage / Status Filter */}
                    <div className="relative flex-1 basis-0 min-w-[105px]" ref={statusMenuRef}>
                        <button
                            type="button"
                            onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                            className={`w-full flex items-center justify-between gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                                selectedStatus 
                                    ? 'bg-neutral-800 border-neutral-700 text-white font-semibold shadow-sm' 
                                    : 'bg-neutral-900/90 border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700'
                            }`}
                            title="Filtrar por Estatus / Etapa del Lead"
                        >
                            <div className="flex items-center gap-1.5 min-w-0 truncate">
                                <BadgeCheck size={11} className={selectedStatus ? "text-white shrink-0" : "text-neutral-400 shrink-0"} />
                                <span className="truncate">
                                    {selectedStatus || "Estatus Lead"}
                                </span>
                            </div>
                            <ChevronDown size={11} className="text-neutral-500 shrink-0" />
                        </button>

                        {showStatusDropdown && (
                            <div className="absolute top-full left-0 mt-1.5 w-56 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl z-[70] overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150 p-1">
                                <div className="px-2.5 py-1.5 border-b border-neutral-800 text-[9px] font-bold uppercase tracking-widest text-neutral-500 flex justify-between items-center">
                                    <span>Filtrar por Estatus</span>
                                    <span className="text-[10px] text-neutral-400 font-mono">{statusStats.total} contactos</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setSelectedStatus(null); setShowStatusDropdown(false); }}
                                    className={`w-full text-left px-2.5 py-1.5 text-[11px] rounded-md transition-colors flex items-center justify-between ${!selectedStatus ? 'bg-neutral-800 text-white font-medium' : 'text-neutral-300 hover:bg-neutral-800'}`}
                                >
                                    <span>Todos los estatus</span>
                                    <span className="text-[10px] text-neutral-500 font-mono">({statusStats.total})</span>
                                </button>
                                {statusStats.byStatus.map(st => (
                                    <button
                                        key={st.status}
                                        type="button"
                                        onClick={() => { setSelectedStatus(st.status); setShowStatusDropdown(false); }}
                                        className={`w-full text-left px-2.5 py-1.5 text-[11px] rounded-md transition-colors flex items-center justify-between ${selectedStatus === st.status ? 'bg-neutral-800 text-white font-medium' : 'text-neutral-300 hover:bg-neutral-800'}`}
                                    >
                                        <span>{st.status}</span>
                                        <span className="text-[10px] bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-400 font-mono">
                                            {st.count}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 4. Human Agent vs Bot SI Attention Filter */}
                    <div className="relative flex-1 basis-0 min-w-[105px]" ref={takeoverMenuRef}>
                        <button
                            type="button"
                            onClick={() => setShowTakeoverDropdown(!showTakeoverDropdown)}
                            className={`w-full flex items-center justify-between gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                                selectedTakeover 
                                    ? 'bg-neutral-800 border-neutral-700 text-white font-semibold shadow-sm' 
                                    : 'bg-neutral-900/90 border-neutral-800 text-neutral-300 hover:text-white hover:border-neutral-700'
                            }`}
                            title="Filtrar por Atención Humana vs Bot SI"
                        >
                            <div className="flex items-center gap-1.5 min-w-0 truncate">
                                {selectedTakeover === 'human' ? <UserCheck size={11} className="text-white shrink-0" /> : <Bot size={11} className={selectedTakeover ? "text-white shrink-0" : "text-neutral-400 shrink-0"} />}
                                <span className="truncate">
                                    {selectedTakeover === 'human' ? 'Atención Agente' : selectedTakeover === 'bot' ? 'Atención Bot SI' : 'Atención SI/Humana'}
                                </span>
                            </div>
                            <ChevronDown size={11} className="text-neutral-500 shrink-0" />
                        </button>

                        {showTakeoverDropdown && (
                            <div className="absolute top-full left-0 mt-1.5 w-60 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl z-[70] overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150 p-1">
                                <div className="px-2.5 py-1.5 border-b border-neutral-800 text-[9px] font-bold uppercase tracking-widest text-neutral-500 flex justify-between items-center">
                                    <span>Filtrar por Atención</span>
                                    <span className="text-[10px] text-neutral-400 font-mono">{takeoverStats.total} contactos</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setSelectedTakeover(null); setShowTakeoverDropdown(false); }}
                                    className={`w-full text-left px-2.5 py-1.5 text-[11px] rounded-md transition-colors flex items-center justify-between ${!selectedTakeover ? 'bg-neutral-800 text-white font-medium' : 'text-neutral-300 hover:bg-neutral-800'}`}
                                >
                                    <span>Toda la atención</span>
                                    <span className="text-[10px] text-neutral-500 font-mono">({takeoverStats.total})</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setSelectedTakeover('human'); setShowTakeoverDropdown(false); }}
                                    className={`w-full text-left px-2.5 py-1.5 text-[11px] rounded-md transition-colors flex items-center justify-between ${selectedTakeover === 'human' ? 'bg-neutral-800 text-white font-medium' : 'text-neutral-300 hover:bg-neutral-800'}`}
                                >
                                    <span className="flex items-center gap-2">
                                        <UserCheck size={12} className="text-neutral-300" />
                                        Control Humano (Agente)
                                    </span>
                                    <span className="text-[10px] bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-400 font-mono">
                                        {takeoverStats.human}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setSelectedTakeover('bot'); setShowTakeoverDropdown(false); }}
                                    className={`w-full text-left px-2.5 py-1.5 text-[11px] rounded-md transition-colors flex items-center justify-between ${selectedTakeover === 'bot' ? 'bg-neutral-800 text-white font-medium' : 'text-neutral-300 hover:bg-neutral-800'}`}
                                >
                                    <span className="flex items-center gap-2">
                                        <Bot size={12} className="text-neutral-300" />
                                        Bot SI Atendiendo
                                    </span>
                                    <span className="text-[10px] bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-400 font-mono">
                                        {takeoverStats.bot}
                                    </span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Reset Filters button if any active */}
                {(selectedCountry || selectedApiPhone || selectedStatus || selectedTakeover) && (
                    <button
                        type="button"
                        onClick={() => {
                            setSelectedCountry(null);
                            setSelectedApiPhone(null);
                            setSelectedStatus(null);
                            setSelectedTakeover(null);
                        }}
                        className="text-[10px] text-neutral-400 hover:text-white font-semibold underline uppercase tracking-wider shrink-0"
                    >
                        Limpiar Filtros
                    </button>
                )}
            </div>

            <div className="p-2.5 border-b border-neutral-900 bg-[#0d0d0d] space-y-2 overflow-visible">
                <div className="flex items-center justify-between gap-2 relative">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-600" size={12} />
                        <input
                            type="text"
                            placeholder="Buscar..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-neutral-900/80 border border-neutral-800/80 rounded-lg py-1.5 pl-7 pr-2 text-[11px] focus:outline-none focus:border-blue-500/60 transition-all placeholder:text-neutral-600"
                        />
                    </div>

                    {/* Filter Button */}
                    <div className="relative shrink-0" ref={filterMenuRef}>
                        <button 
                            onClick={() => setShowFilterMenu(!showFilterMenu)}
                            className={`p-2 rounded-lg border transition-colors ${showFilterMenu || filterBy !== 'all' || sortBy !== 'newest' ? 'text-blue-400 bg-blue-500/15 border-blue-500/30' : 'text-neutral-400 bg-neutral-900/80 border-neutral-800/80 hover:text-white hover:bg-neutral-800'}`}
                            title="Filtros y ordenación"
                        >
                            <Filter size={13} />
                        </button>

                        {showFilterMenu && (
                            <div className="absolute top-full right-0 mt-1 w-48 bg-neutral-900 border border-neutral-800 rounded shadow-2xl z-[60] overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                                <div className="p-2 border-b border-neutral-800 bg-neutral-950/50">
                                    <span className="text-[9px] font-bold text-neutral-600 uppercase tracking-widest">Sort by</span>
                                </div>
                                <div className="p-0.5">
                                    <button onClick={() => { setSortBy('newest'); setShowFilterMenu(false); }} className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] rounded hover:bg-neutral-800 transition-colors text-neutral-400">
                                        Newest First {sortBy === 'newest' && <Check size={12} className="text-blue-500" />}
                                    </button>
                                    <button onClick={() => { setSortBy('oldest'); setShowFilterMenu(false); }} className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] rounded hover:bg-neutral-800 transition-colors text-neutral-400">
                                        Oldest First {sortBy === 'oldest' && <Check size={12} className="text-blue-500" />}
                                    </button>
                                </div>
                                <div className="p-2 border-b border-t border-neutral-800 bg-neutral-950/50">
                                    <span className="text-[9px] font-bold text-neutral-600 uppercase tracking-widest">Filter by</span>
                                </div>
                                <div className="p-0.5">
                                    <button onClick={() => { setFilterBy('all'); setShowFilterMenu(false); }} className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] rounded hover:bg-neutral-800 transition-colors text-neutral-400">
                                        All Messages {filterBy === 'all' && <Check size={12} className="text-blue-500" />}
                                    </button>
                                    <button onClick={() => { setFilterBy('unread'); setShowFilterMenu(false); }} className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] rounded hover:bg-neutral-800 transition-colors text-neutral-400">
                                        Unread Only {filterBy === 'unread' && <Check size={12} className="text-blue-500" />}
                                    </button>
                                </div>
                                {(sortBy !== 'newest' || filterBy !== 'all') && (
                                    <button onClick={() => {setSortBy('newest'); setFilterBy('all'); setShowFilterMenu(false);}} className="w-full py-2 text-[9px] font-bold text-blue-500 hover:text-blue-400 uppercase tracking-widest text-center border-t border-neutral-800">
                                        Reset
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-800 hover:scrollbar-thumb-neutral-700">
                <div className="divide-y divide-neutral-900/40">
                    {loading ? (
                        <div className="p-4 text-center text-neutral-700 text-[10px] animate-pulse">Cargando...</div>
                    ) : conversations.length === 0 ? (
                        <div className="p-6 text-center text-neutral-500 flex flex-col items-center justify-center gap-2">
                            <Inbox size={24} className="text-neutral-700 stroke-1" />
                            <p className="text-[11px] font-medium text-neutral-400">
                                {selectedCountry || selectedApiPhone || selectedStatus || selectedTakeover || searchQuery || filterBy === 'unread'
                                    ? 'No hay conversaciones con los filtros seleccionados'
                                    : 'Sin conversaciones en este canal'
                                }
                            </p>
                            {(selectedCountry || selectedApiPhone || selectedStatus || selectedTakeover || searchQuery) && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedCountry(null);
                                        setSelectedApiPhone(null);
                                        setSelectedStatus(null);
                                        setSelectedTakeover(null);
                                        setSearchQuery('');
                                    }}
                                    className="mt-1 px-3 py-1 rounded-md bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-[10px] text-blue-400 font-semibold transition-colors"
                                >
                                    Limpiar todos los filtros
                                </button>
                            )}
                        </div>
                    ) : (
                        conversations.map((chat) => (
                            <button
                                key={chat.id}
                                onClick={() => setActiveConversationId(chat.id)}
                                className={`w-full flex items-center p-3 text-left transition-colors hover:bg-neutral-900/50 relative ${activeConversationId === chat.id ? 'bg-neutral-900/80 shadow-inner' : ''}`}
                            >
                                {activeConversationId === chat.id && (
                                    <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-blue-500 rounded-r" />
                                )}

                                <div className="relative mr-3 flex-shrink-0 self-center">
                                    {(() => {
                                        const photoUrl = chat.card?.photoUrl || chat.card?.profilePictureUrl || chat.card?.profilePicUrl || chat.card?.avatarUrl || chat.card?.picture || chat.card?.photo || chat.card?.profilePic || null;
                                        return (
                                            <div className="w-12 h-12 bg-[#26282e] border border-neutral-700/60 rounded-full flex items-center justify-center font-bold text-base text-white overflow-hidden relative shrink-0">
                                                {photoUrl ? (
                                                    <img
                                                        src={photoUrl}
                                                        alt="Avatar"
                                                        className="w-full h-full object-cover rounded-full"
                                                        onError={(e) => {
                                                            (e.target as HTMLElement).style.display = 'none';
                                                            const initialEl = (e.target as HTMLElement).nextElementSibling;
                                                            if (initialEl) initialEl.classList.remove('hidden');
                                                        }}
                                                    />
                                                ) : null}
                                                <span className={photoUrl ? 'hidden' : ''}>
                                                    {getContactAvatarInitial(chat.card)}
                                                </span>
                                            </div>
                                        );
                                    })()}
                                    <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border border-[#0d0d0d] flex items-center justify-center overflow-hidden
                                        ${chat.channel.toLowerCase().includes('whatsapp') ? 'bg-[#25D366]' :
                                            chat.channel.toLowerCase().includes('instagram') ? 'bg-gradient-to-tr from-[#f09433] via-[#dc2743] to-[#bc1888]' :
                                                chat.channel.toLowerCase().includes('messenger') || chat.channel.toLowerCase().includes('facebook') ? 'bg-[#00B2FF]' :
                                                    chat.channel.toLowerCase().includes('telegram') ? 'bg-[#229ED9]' :
                                                        chat.channel.toLowerCase().includes('gmail') || chat.channel.toLowerCase().includes('email') ? 'bg-[#EA4335]' :
                                                            chat.channel.toLowerCase().includes('twitter') || chat.channel.toLowerCase().includes('x') ? 'bg-black' : 'bg-neutral-500'}
                                    `}>
                                        {chat.channel.toLowerCase().includes('whatsapp') ? (
                                            <WhatsappIcon className="w-2.5 h-2.5 text-white fill-current" />
                                        ) : chat.channel.toLowerCase().includes('instagram') ? (
                                            <svg viewBox="0 0 24 24" className="w-2 h-2 text-white fill-current"><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.27.057-1.649.07-4.859.07s-3.585-.015-4.85-.074c-1.17-.061-1.805-.256-2.227-.421-.562-.224-.96-.479-1.382-.899-.419-.419-.679-.824-.896-1.38-.164-.42-.36-1.065-.413-2.235-.057-1.27-.07-1.649-.07-4.859s.015-3.585.074-4.85c.061-1.17.256-1.805.421-2.227.224-.562.479-.96.899-1.382.419-.419.824-.679 1.38-.896.42-.164 1.065-.36 2.235-.413 1.27-.057 1.649-.07 4.859-.07zM12 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>
                                        ) : chat.channel.toLowerCase().includes('messenger') || chat.channel.toLowerCase().includes('facebook') ? (
                                            <svg viewBox="0 0 24 24" className="w-2 h-2 text-white fill-current"><path d="M12 0C5.31 0 0 4.92 0 11.13c0 3.53 1.71 6.67 4.38 8.65.23.17.38.45.39.73l.03 2.18c.01.62.66 1.02 1.2.73l2.42-1.3c.21-.11.45-.14.67-.09 1 .25 2 .39 3.1.39 6.69 0 12-4.92 12-11.31C24 4.92 18.69 0 12 0zm1.34 14.88l-3.07-3.28-6 3.28 6.59-7 3.12 3.28 5.83-3.28-6.47 7z" /></svg>
                                        ) : chat.channel.toLowerCase().includes('telegram') ? (
                                            <svg viewBox="0 0 24 24" className="w-2 h-2 text-white fill-current"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.62 4.498-.8 5.448-.073.398-.198.533-.341.547-.311.028-.546-.205-.845-.401-.469-.307-1.332-.851-1.688-1.085-.89-.586-.251-.908.196-1.372.117-.121 2.146-1.97 2.185-2.14.005-.021.01-.098-.035-.14a.159.159 0 0 0-.146-.03c-.063.014-1.077.683-3.03 2.001-.285.196-.544.292-.776.286-.255-.006-.746-.145-1.112-.262-.449-.143-.804-.22-1.066-.144-.047.014-.15.044-.221.111l2.42-1.3c.094-.031.18-.046.25-.046.126-.002.45-.034.7.127.24.156.452.378.36.726-.09.348-1.143 4.195-1.143 4.195s-.027.054-.035.1l-.013.1c-.01.127-.04.256-.1.353-.1.171-.24.32-.47.41-.28.1-.56.12-.83.12-.26 0-.58-.02-.85-.1-.28-.08-.6-.24-.8-.4-.22-.17-.4-.38-.5-.62-.12-.24-.2-.54-.2-.84 0-.3.08-.64.2-.95.12-.31.3-.58.53-.8l1.32-.98z" /></svg>
                                        ) : chat.channel.toLowerCase().includes('gmail') || chat.channel.toLowerCase().includes('email') ? (
                                            <Mail size={10} className="text-white fill-current" />
                                        ) : (
                                            <MessageCircle size={7} className="text-white fill-current" />
                                        )}
                                    </div>
                                </div>

                                {(() => {
                                    const { whatsappName, botName } = getContactHeaderNames(chat.card);
                                    const phoneDisplay = getContactPhoneDisplay(chat.card);

                                    return (
                                        <div className="flex-1 min-w-0 flex flex-col justify-center my-auto gap-1">
                                            <div className="flex justify-between items-center gap-2">
                                                {/* Contact Names (Left) */}
                                                <div className="min-w-0 flex items-baseline gap-x-1.5 flex-wrap flex-1">
                                                    <span className={`font-semibold truncate text-[13px] leading-tight ${chat.unread > 0 ? 'text-white' : 'text-neutral-200'}`}>
                                                        {whatsappName}
                                                    </span>
                                                    <span className="text-neutral-500 text-[11px] leading-none flex-shrink-0">|</span>
                                                    {botName ? (
                                                        <span className="text-sky-300 font-medium truncate text-[12px] leading-tight" title="Nombre indicado en la conversación">
                                                            {botName}
                                                        </span>
                                                    ) : (
                                                        <span className="text-neutral-400 italic truncate text-[11px] leading-tight">
                                                            En espera del nombre
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Flag, Phone Number & Time (Right) */}
                                                <div className="flex items-center gap-1.5 flex-shrink-0 text-neutral-400">
                                                    {phoneDisplay && (
                                                        <div className="flex items-center gap-1 text-[11px] leading-none">
                                                            <CountryFlag iso={phoneDisplay.iso} country={phoneDisplay.country} size="sm" />
                                                            <span className="font-mono text-[11px] text-neutral-400">{phoneDisplay.formatted}</span>
                                                        </div>
                                                    )}
                                                    <span className="text-neutral-600 text-[10px]">·</span>
                                                    <span className="text-[10px] text-neutral-500 font-medium leading-none">
                                                        {chat.time}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Message snippet & unread count */}
                                            <div className="flex items-center justify-between gap-2 min-w-0">
                                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                    {chat.unread > 0 ? (
                                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                                                    ) : (() => {
                                                        const card = chat.card || {};
                                                        const isOutbound = isLastMessageOutbound(card);
                                                        if (!isOutbound) return null;

                                                        const status = (
                                                            card.lastMessageStatus ||
                                                            card.lastStatus ||
                                                            card.status ||
                                                            'read'
                                                        ).toLowerCase();

                                                        if (status === 'read' || status === 'seen') {
                                                            return <DoubleCheckIcon className="w-[15px] h-[11px] text-sky-400 shrink-0" />;
                                                        }
                                                        if (status === 'delivered') {
                                                            return <DoubleCheckIcon className="w-[15px] h-[11px] text-neutral-400 shrink-0" />;
                                                        }
                                                        if (status === 'sent') {
                                                            return <SingleCheckIcon className="w-[12px] h-[11px] text-neutral-400 shrink-0" />;
                                                        }

                                                        return <DoubleCheckIcon className="w-[15px] h-[11px] text-sky-400 shrink-0" />;
                                                    })()}
                                                    <div className={`truncate text-[11px] ${chat.unread > 0 ? 'text-neutral-100 font-medium' : 'text-neutral-400'}`}>
                                                        {chat.presence === 'typing' ? (
                                                            <span className="text-blue-400 italic animate-pulse">Escribiendo...</span>
                                                        ) : chat.presence === 'recording' ? (
                                                            <span className="text-blue-400 italic animate-pulse flex items-center gap-1">
                                                                <Mic size={11} /> Grabando audio...
                                                            </span>
                                                        ) : (
                                                            chat.snippet
                                                        )}
                                                    </div>
                                                </div>
                                                {chat.unread > 0 && (
                                                    <span className="bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full inline-block min-w-[1.1rem] text-center leading-none flex-shrink-0">
                                                        {chat.unread}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

