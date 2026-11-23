import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Filter, Clock, MessageCircle, ChevronDown, Check, CheckCheck, Mic, Mail, Globe2, Inbox, Users, CheckCircle, Instagram, Facebook, Twitter, Send, Phone, BadgeCheck, UserCheck, Bot, Plus, Sparkles, Loader2, ArrowLeft } from 'lucide-react';
import WhatsappIcon from '@/components/icons/WhatsappIcon';
import { isInstagramCard, resolveCardChannel, resolveOmnichannelBadge } from '@/lib/omnichannel/resolveCardChannel';
import { getCountryStatsSummary, extractCardPhoneNumber } from '@/lib/omnichannel/countryStats';
import { CountryFlag } from '@/components/CountryFlag';
import { ConversationContactMeta, getContactAvatarInitial } from './ConversationContactMeta';
import { getContactHeaderNames, getContactPhoneDisplay } from '@/lib/omnichannel/contactHeaderInfo';
import { getCountryFromPhone } from '@/lib/countryCodes';
import { normalizePhoneNumber } from '@/lib/phoneUtils';
import { useAuth } from '@/contexts/AuthContext';
import { useEntityRoute } from '@/hooks/useEntityRoute';
import { subscribeSlotConnections } from '@/lib/whatsapp/numbers';
import { isAssignedToMe, isHumanTakeoverActive, isUnassignedChat } from '@/lib/omnichannel/humanTakeover';
import { db } from '@/lib/firebase';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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

function renderTabIcon(type: string, isActive: boolean, size: number = 18) {
    const iconClass = isActive ? "" : "text-neutral-400 group-hover:text-white transition-colors";
    if (type === 'inbox') return <Inbox size={size} className={isActive ? "text-blue-400" : iconClass} />;
    if (type === 'mine') return <Users size={size} className={isActive ? "text-blue-400" : iconClass} />;
    if (type === 'unassigned') return <CheckCircle size={size} className={isActive ? "text-blue-400" : iconClass} />;
    if (type === 'whatsapp') return <WhatsappIcon className={`w-[18px] h-[18px] ${isActive ? "text-[#25D366]" : iconClass}`} />;
    if (type === 'instagram') return <Instagram size={size} className={isActive ? "text-pink-400" : iconClass} />;
    if (type === 'messenger') return <Facebook size={size} className={isActive ? "text-blue-400" : iconClass} />;
    if (type === 'telegram') return <Send size={size} className={isActive ? "text-sky-400" : iconClass} />;
    if (type === 'twitter') return <Twitter size={size} className={isActive ? "text-white" : iconClass} />;
    if (type === 'gmail') return <Mail size={size} className={isActive ? "text-red-400" : iconClass} />;
    return <Inbox size={size} className="opacity-60" />;
}

function filterCardsByFolder(cards: any[], selectedFolder: string, uid?: string | null): any[] {
    if (selectedFolder === 'mine') {
        return cards.filter(c => isAssignedToMe(c, uid));
    }
    if (selectedFolder === 'unassigned') {
        return cards.filter(c => isUnassignedChat(c));
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

    const filterMenuRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    const { firestoreId, routeSegment } = useEntityRoute();
    const effectiveEntityId = firestoreId || activeEntity || '';
    const tenantPath = currentUser?.uid && effectiveEntityId ? `users/${currentUser.uid}/entities/${effectiveEntityId}` : null;

    // New Chat Modal state
    const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
    const [newContactNumber, setNewContactNumber] = useState('');
    const [newContactName, setNewContactName] = useState('');
    const [newChatChannel, setNewChatChannel] = useState('whatsapp');
    const [initialMessageText, setInitialMessageText] = useState('');
    const [isSubmittingNewChat, setIsSubmittingNewChat] = useState(false);
    const [isCreatingTest, setIsCreatingTest] = useState(false);

    const handleCreateNewChat = async () => {
        if (!newContactNumber.trim()) {
            toast.error('Ingresa un número de teléfono o identificador.');
            return;
        }
        if (!tenantPath) {
            toast.error('Sesión o entidad no disponible.');
            return;
        }

        setIsSubmittingNewChat(true);
        try {
            const cleanDigits = newContactNumber.replace(/\D/g, '');
            const cardId = `chat_${cleanDigits || Date.now()}`;
            const cardRef = doc(db, `${tenantPath}/kanban-groups/inbox/cards/${cardId}`);
            const convRef = doc(db, `${tenantPath}/conversations/${cardId}`);
            const now = Timestamp.now();

            const initialMsg = initialMessageText.trim()
                ? [
                      {
                          id: `msg_${Date.now()}`,
                          text: initialMessageText.trim(),
                          sender: 'agent',
                          timestamp: now,
                          status: 'delivered',
                      },
                  ]
                : [];

            const cardData = {
                id: cardId,
                conversationId: cardId,
                groupId: 'inbox',
                name: newContactName.trim() || newContactNumber.trim(),
                contactNumber: newContactNumber.trim(),
                contactNumberClean: cleanDigits,
                phone: newContactNumber.trim(),
                channel: newChatChannel,
                source: newChatChannel,
                primary_channel: newChatChannel,
                status: 'Nuevo Aplicante',
                unreadCount: 0,
                createdAt: now,
                updatedAt: now,
                humanTakeover: {
                    active: true,
                    activatedAt: now,
                    activatedBy: currentUser?.uid || 'agent',
                    activatedByName: currentUser?.displayName || 'Agente',
                },
                messages: initialMsg,
                lastMessage: initialMessageText.trim() || 'Conversación iniciada',
                lastMessageTimestamp: now,
            };

            await setDoc(cardRef, cardData, { merge: true });
            await setDoc(convRef, cardData, { merge: true });

            toast.success(`Conversación creada con ${newContactName || newContactNumber}.`);
            setIsNewChatModalOpen(false);
            setNewContactNumber('');
            setNewContactName('');
            setInitialMessageText('');
            setActiveConversationId(cardId);
        } catch (err) {
            console.error('Error creating chat:', err);
            toast.error('No se pudo crear la conversación.');
        } finally {
            setIsSubmittingNewChat(false);
        }
    };

    const handleCreateTestChat = async () => {
        if (!tenantPath) {
            toast.error('Sesión o entidad no disponible.');
            return;
        }
        setIsCreatingTest(true);
        try {
            const samplePhones = ['+1 415 555 2671', '+34 600 123 456', '+52 55 8765 4321'];
            const sampleNames = ['Cliente de Prueba', 'Sara Morales', 'Carlos Mendoza'];
            const sampleTexts = [
                '¡Hola! Quisiera información sobre sus paquetes y cotizaciones.',
                'Buenos días, me gustaría hablar con un asesor por favor.',
                'Hola, vi su publicación y quiero agendar una llamada.',
            ];
            const idx = Math.floor(Math.random() * samplePhones.length);
            const cardId = `test_${Date.now().toString().slice(-6)}`;
            const now = Timestamp.now();
            const cleanDigits = samplePhones[idx].replace(/\D/g, '');

            const cardRef = doc(db, `${tenantPath}/kanban-groups/inbox/cards/${cardId}`);
            const convRef = doc(db, `${tenantPath}/conversations/${cardId}`);

            const channelForTest = selectedFolder === 'all' || !selectedFolder ? 'whatsapp' : selectedFolder;

            const testCard = {
                id: cardId,
                conversationId: cardId,
                groupId: 'inbox',
                name: `${sampleNames[idx]} (Prueba)`,
                contactNumber: samplePhones[idx],
                contactNumberClean: cleanDigits,
                phone: samplePhones[idx],
                channel: channelForTest,
                source: channelForTest,
                primary_channel: channelForTest,
                status: 'Nuevo Aplicante',
                unreadCount: 1,
                createdAt: now,
                updatedAt: now,
                humanTakeover: {
                    active: false,
                },
                messages: [
                    {
                        id: `msg_${Date.now()}`,
                        text: sampleTexts[idx],
                        sender: 'user',
                        timestamp: now,
                        status: 'delivered',
                    },
                ],
                lastMessage: sampleTexts[idx],
                lastMessageTimestamp: now,
            };

            await setDoc(cardRef, testCard);
            await setDoc(convRef, testCard);

            toast.success('Mensaje de prueba generado con éxito.');
            setActiveConversationId(cardId);
        } catch (err) {
            console.error('Error generating test chat:', err);
            toast.error('No se pudo generar el mensaje de prueba.');
        } finally {
            setIsCreatingTest(false);
        }
    };

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
        const folderCards = dedupeCards(filterCardsByFolder(cards, selectedFolder, currentUser?.uid));

        return list.map(p => {
            const count = filterCardsByApiPhone(folderCards, p.id, list).length;
            return { ...p, count };
        });
    }, [ctoSlotConnections, cards, selectedFolder, currentUser?.uid]);

    const countryStats = useMemo(() => {
        const folderCards = dedupeCards(filterCardsByFolder(cards, selectedFolder, currentUser?.uid));
        const apiFilteredCards = filterCardsByApiPhone(folderCards, selectedApiPhone, availableApiPhones);
        return getCountryStatsSummary(apiFilteredCards);
    }, [cards, selectedFolder, selectedApiPhone, availableApiPhones, currentUser?.uid]);

    const statusStats = useMemo(() => {
        const folderCards = dedupeCards(filterCardsByFolder(cards, selectedFolder, currentUser?.uid));
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
    }, [cards, selectedFolder, selectedApiPhone, availableApiPhones, selectedCountry, currentUser?.uid]);

    const takeoverStats = useMemo(() => {
        const folderCards = dedupeCards(filterCardsByFolder(cards, selectedFolder, currentUser?.uid));
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
    }, [cards, selectedFolder, selectedApiPhone, availableApiPhones, selectedCountry, selectedStatus, currentUser?.uid]);

    const tabCounts = useMemo(() => {
        return {
            all: cards.reduce((acc, c) => acc + (c.unreadCount || 0), 0),
            mine: cards.filter(c => isAssignedToMe(c, currentUser?.uid)).reduce((acc, c) => acc + (c.unreadCount || 0), 0),
            unassigned: cards.filter(c => isUnassignedChat(c)).reduce((acc, c) => acc + (c.unreadCount || 0), 0),
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
    }, [cards, currentUser?.uid]);

    const conversations = useMemo(() => {
        let filtered = filterCardsByFolder(cards, selectedFolder, currentUser?.uid);
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
    }, [cards, selectedFolder, searchQuery, sortBy, filterBy, selectedCountry, selectedApiPhone, selectedStatus, selectedTakeover, availableApiPhones, currentUser?.uid]);

    const hasActiveFilters = Boolean(
        selectedCountry ||
        selectedApiPhone ||
        selectedStatus ||
        selectedTakeover ||
        filterBy !== 'all' ||
        sortBy !== 'newest'
    );

    const resetAllFilters = () => {
        setSortBy('newest');
        setFilterBy('all');
        setSelectedApiPhone(null);
        setSelectedCountry(null);
        setSelectedStatus(null);
        setSelectedTakeover(null);
    };

    return (
        <div className="w-full bg-[#0d0d0d] flex flex-row h-full flex-shrink-0 text-white overflow-hidden">
            {/* Left Vertical Channel Icons Bar (Only Icons) */}
            <aside className="w-11 bg-[#070708] border-r border-neutral-900/90 flex flex-col items-center py-2.5 gap-2 shrink-0 select-none z-10">
                {TAB_ITEMS.map((tab) => {
                    const isActive = selectedFolder === tab.id;
                    const unread = tabCounts[tab.id as keyof typeof tabCounts] || 0;

                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setSelectedFolder?.(tab.id)}
                            title={tab.label}
                            aria-label={tab.label}
                            className={`group relative flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-150 ${
                                isActive
                                    ? 'bg-neutral-800 text-white shadow-sm border border-neutral-700/80'
                                    : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-900/80 border border-transparent'
                            }`}
                        >
                            {isActive && (
                                <span className="absolute -left-[3px] top-1.5 bottom-1.5 w-[2.5px] bg-blue-500 rounded-r-full shadow-[0_0_8px_rgba(59,130,246,0.9)]" />
                            )}

                            <span className="flex items-center justify-center shrink-0">
                                {renderTabIcon(tab.type, isActive, 16)}
                            </span>

                            {unread > 0 && (
                                <span className={`absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full text-[8px] font-bold flex items-center justify-center leading-none shadow-sm ${
                                    isActive ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-blue-400 border border-blue-500/30'
                                }`}>
                                    {unread > 99 ? '99+' : unread}
                                </span>
                            )}
                        </button>
                    );
                })}
            </aside>

            {/* Main Content Column */}
            <div className="flex-1 min-w-0 flex flex-col h-full bg-[#0d0d0d] overflow-hidden">
                {/* Search & Integrated Filters Bar */}
                <div className="p-2 border-b border-neutral-900 bg-[#0d0d0d] space-y-2 overflow-visible shrink-0">
                    <div className="flex items-center justify-between gap-1.5 relative">
                        <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-600" size={12} />
                            <input
                                type="text"
                                placeholder="Buscar..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-neutral-900/80 border border-neutral-800/80 rounded-lg py-1.5 pl-7 pr-2 text-[11px] focus:outline-none focus:border-blue-500/60 transition-all placeholder:text-neutral-600"
                            />
                        </div>

                        {/* Quick New Chat Button */}
                        <button
                            type="button"
                            onClick={() => {
                                setNewContactNumber('');
                                setNewContactName('');
                                setInitialMessageText('');
                                setNewChatChannel(selectedFolder === 'all' ? 'whatsapp' : selectedFolder);
                                setIsNewChatModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white text-white hover:text-black border border-white/10 transition-all shrink-0"
                            title="Nueva Conversación"
                            aria-label="Nueva Conversación"
                        >
                            <Plus size={14} />
                        </button>

                        {/* Quick Simulate Test Chat Button */}
                        <button
                            type="button"
                            onClick={handleCreateTestChat}
                            disabled={isCreatingTest}
                            className="p-1.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border border-blue-500/30 transition-all shrink-0"
                            title="Simular Mensaje de Prueba"
                            aria-label="Simular Mensaje de Prueba"
                        >
                            {isCreatingTest ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        </button>

                        {/* Integrated Filter Button & Popover */}
                        <div className="relative shrink-0" ref={filterMenuRef}>
                            <button 
                                type="button"
                                onClick={() => setShowFilterMenu(!showFilterMenu)}
                                className={`relative p-2 rounded-lg border transition-colors ${
                                    showFilterMenu || hasActiveFilters 
                                        ? 'text-blue-400 bg-blue-500/15 border-blue-500/30 shadow-sm' 
                                        : 'text-neutral-400 bg-neutral-900/80 border-neutral-800/80 hover:text-white hover:bg-neutral-800'
                                }`}
                                title="Filtros y ordenación"
                            >
                                <Filter size={13} />
                                {hasActiveFilters && (
                                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.9)]" />
                                )}
                            </button>

                            {showFilterMenu && (
                                <div className="absolute top-full right-0 mt-1.5 w-64 max-h-[75vh] bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl z-[70] overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-800 animate-in fade-in slide-in-from-top-1 duration-150 p-2 space-y-2.5">
                                    {/* Sort by */}
                                    <div>
                                        <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest block mb-1">
                                            Ordenar por
                                        </span>
                                        <div className="grid grid-cols-2 gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setSortBy('newest')}
                                                className={`px-2 py-1 text-[11px] rounded transition-colors text-left flex items-center justify-between ${
                                                    sortBy === 'newest' ? 'bg-blue-600/20 text-blue-400 font-medium border border-blue-500/30' : 'bg-neutral-950 text-neutral-400 hover:text-white border border-neutral-800'
                                                }`}
                                            >
                                                <span>Recientes</span>
                                                {sortBy === 'newest' && <Check size={11} />}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSortBy('oldest')}
                                                className={`px-2 py-1 text-[11px] rounded transition-colors text-left flex items-center justify-between ${
                                                    sortBy === 'oldest' ? 'bg-blue-600/20 text-blue-400 font-medium border border-blue-500/30' : 'bg-neutral-950 text-neutral-400 hover:text-white border border-neutral-800'
                                                }`}
                                            >
                                                <span>Antiguos</span>
                                                {sortBy === 'oldest' && <Check size={11} />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Filter by Unread */}
                                    <div>
                                        <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest block mb-1">
                                            Mensajes
                                        </span>
                                        <div className="grid grid-cols-2 gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setFilterBy('all')}
                                                className={`px-2 py-1 text-[11px] rounded transition-colors text-left flex items-center justify-between ${
                                                    filterBy === 'all' ? 'bg-blue-600/20 text-blue-400 font-medium border border-blue-500/30' : 'bg-neutral-950 text-neutral-400 hover:text-white border border-neutral-800'
                                                }`}
                                            >
                                                <span>Todos</span>
                                                {filterBy === 'all' && <Check size={11} />}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setFilterBy('unread')}
                                                className={`px-2 py-1 text-[11px] rounded transition-colors text-left flex items-center justify-between ${
                                                    filterBy === 'unread' ? 'bg-blue-600/20 text-blue-400 font-medium border border-blue-500/30' : 'bg-neutral-950 text-neutral-400 hover:text-white border border-neutral-800'
                                                }`}
                                            >
                                                <span>No leídos</span>
                                                {filterBy === 'unread' && <Check size={11} />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Número API (WhatsApp / Todos) */}
                                    {(selectedFolder === 'whatsapp' || selectedFolder === 'all') && (
                                        <div>
                                            <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest block mb-1">
                                                Línea / Número API
                                            </label>
                                            <select
                                                value={selectedApiPhone || ''}
                                                onChange={(e) => setSelectedApiPhone(e.target.value || null)}
                                                className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1.5 text-[11px] text-neutral-300 focus:outline-none focus:border-blue-500 transition-colors"
                                            >
                                                <option value="">Todos los números API</option>
                                                {availableApiPhones.map((p) => (
                                                    <option key={p.id} value={p.id}>
                                                        {p.label} ({p.count})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}

                                    {/* País */}
                                    <div>
                                        <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest block mb-1">
                                            País ({countryStats.total})
                                        </label>
                                        <select
                                            value={selectedCountry || ''}
                                            onChange={(e) => setSelectedCountry(e.target.value || null)}
                                            className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1.5 text-[11px] text-neutral-300 focus:outline-none focus:border-blue-500 transition-colors"
                                        >
                                            <option value="">Todos los países</option>
                                            {countryStats.byCountry.map((stat) => (
                                                <option key={stat.iso} value={stat.iso}>
                                                    {stat.country} ({stat.count})
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Estatus Lead */}
                                    <div>
                                        <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest block mb-1">
                                            Estatus Lead ({statusStats.total})
                                        </label>
                                        <select
                                            value={selectedStatus || ''}
                                            onChange={(e) => setSelectedStatus(e.target.value || null)}
                                            className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1.5 text-[11px] text-neutral-300 focus:outline-none focus:border-blue-500 transition-colors"
                                        >
                                            <option value="">Todos los estatus</option>
                                            {statusStats.byStatus.map((st) => (
                                                <option key={st.status} value={st.status}>
                                                    {st.status} ({st.count})
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Atención Humana vs Bot SI */}
                                    <div>
                                        <label className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest block mb-1">
                                            Atención ({takeoverStats.total})
                                        </label>
                                        <select
                                            value={selectedTakeover || ''}
                                            onChange={(e) => setSelectedTakeover(e.target.value ? (e.target.value as 'human' | 'bot') : null)}
                                            className="w-full bg-neutral-950 border border-neutral-800 rounded px-2 py-1.5 text-[11px] text-neutral-300 focus:outline-none focus:border-blue-500 transition-colors"
                                        >
                                            <option value="">Toda la atención</option>
                                            <option value="human">Control Humano (Agente) ({takeoverStats.human})</option>
                                            <option value="bot">Bot SI Atendiendo ({takeoverStats.bot})</option>
                                        </select>
                                    </div>

                                    {/* Reset all */}
                                    {hasActiveFilters && (
                                        <div className="pt-1 border-t border-neutral-800">
                                            <button
                                                type="button"
                                                onClick={resetAllFilters}
                                                className="w-full py-1.5 text-[10px] font-bold text-blue-400 hover:text-blue-300 uppercase tracking-widest text-center bg-blue-500/10 hover:bg-blue-500/20 rounded transition-colors"
                                            >
                                                Limpiar todos los filtros
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Active filter badges / chips */}
                    {hasActiveFilters && (
                        <div className="flex items-center gap-1 flex-wrap pt-0.5">
                            {selectedApiPhone && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-neutral-800 border border-neutral-700 text-neutral-300">
                                    <span className="truncate max-w-[100px]">{availableApiPhones.find(p => p.id === selectedApiPhone)?.label || selectedApiPhone}</span>
                                    <button type="button" onClick={() => setSelectedApiPhone(null)} className="hover:text-white">✕</button>
                                </span>
                            )}
                            {selectedCountry && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-neutral-800 border border-neutral-700 text-neutral-300">
                                    <span>{countryStats.byCountry.find(c => c.iso === selectedCountry)?.country || selectedCountry}</span>
                                    <button type="button" onClick={() => setSelectedCountry(null)} className="hover:text-white">✕</button>
                                </span>
                            )}
                            {selectedStatus && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-neutral-800 border border-neutral-700 text-neutral-300">
                                    <span>{selectedStatus}</span>
                                    <button type="button" onClick={() => setSelectedStatus(null)} className="hover:text-white">✕</button>
                                </span>
                            )}
                            {selectedTakeover && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-neutral-800 border border-neutral-700 text-neutral-300">
                                    <span>{selectedTakeover === 'human' ? 'Agente' : 'Bot SI'}</span>
                                    <button type="button" onClick={() => setSelectedTakeover(null)} className="hover:text-white">✕</button>
                                </span>
                            )}
                            {filterBy === 'unread' && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-blue-500/15 border border-blue-500/30 text-blue-400">
                                    <span>No leídos</span>
                                    <button type="button" onClick={() => setFilterBy('all')} className="hover:text-white">✕</button>
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={resetAllFilters}
                                className="text-[9px] text-neutral-500 hover:text-white underline ml-0.5"
                            >
                                Limpiar
                            </button>
                        </div>
                    )}
                </div>

            {/* Conversation List */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-800 hover:scrollbar-thumb-neutral-700">
                <div className="divide-y divide-neutral-900/40">
                    {loading ? (
                        <div className="p-4 text-center text-neutral-700 text-[10px] animate-pulse">Cargando...</div>
                    ) : conversations.length === 0 ? (
                        <div className="p-6 text-center text-neutral-500 flex flex-col items-center justify-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 mb-1">
                                <Inbox size={22} className="stroke-1 text-neutral-400" />
                            </div>
                            <div>
                                <p className="text-[12px] font-medium text-white">
                                    {selectedCountry || selectedApiPhone || selectedStatus || selectedTakeover || searchQuery || filterBy === 'unread'
                                        ? 'No hay conversaciones con los filtros seleccionados'
                                        : 'Sin conversaciones en este canal'}
                                </p>
                                <p className="text-[11px] text-neutral-500 mt-0.5 max-w-xs">
                                    Inicia un nuevo chat con un número o genera un mensaje de prueba para ver el flujo.
                                </p>
                            </div>
                            <div className="flex flex-col w-full gap-2 mt-1">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setNewContactNumber('');
                                        setNewContactName('');
                                        setInitialMessageText('');
                                        setNewChatChannel(selectedFolder === 'all' ? 'whatsapp' : selectedFolder);
                                        setIsNewChatModalOpen(true);
                                    }}
                                    className="w-full px-3 py-2 rounded-xl bg-white hover:bg-neutral-200 text-black text-[11px] font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm"
                                >
                                    <Plus size={13} />
                                    <span>Iniciar Nueva Conversación</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={handleCreateTestChat}
                                    disabled={isCreatingTest}
                                    className="w-full px-3 py-2 rounded-xl bg-blue-600/15 hover:bg-blue-600/25 text-blue-400 border border-blue-500/30 text-[11px] font-semibold transition-all flex items-center justify-center gap-1.5"
                                >
                                    {isCreatingTest ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                                    <span>Simular Mensaje de Prueba</span>
                                </button>
                            </div>
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

            {/* Modal: Iniciar Nueva Conversación */}
            <Dialog open={isNewChatModalOpen} onOpenChange={setIsNewChatModalOpen}>
                <DialogContent className="bg-[#0c0c0c] border border-white/15 text-white sm:max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-light tracking-tight text-white flex items-center gap-2">
                            <Plus className="w-5 h-5 text-blue-400" />
                            Nueva Conversación
                        </DialogTitle>
                        <DialogDescription className="text-xs text-neutral-400">
                            Inicia un chat directo con un contacto o número telefónico desde cualquier canal.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3.5 py-3">
                        {/* Canal */}
                        <div>
                            <label className="text-xs text-neutral-400 font-medium block mb-1.5">
                                Canal de Salida
                            </label>
                            <div className="grid grid-cols-4 gap-2">
                                {[
                                    { id: 'whatsapp', label: 'WhatsApp', icon: WhatsappIcon },
                                    { id: 'messenger', label: 'Facebook', icon: Facebook },
                                    { id: 'instagram', label: 'Instagram', icon: Instagram },
                                    { id: 'telegram', label: 'Telegram', icon: Send },
                                ].map((ch) => {
                                    const Icon = ch.icon;
                                    const isSel = newChatChannel === ch.id;
                                    return (
                                        <button
                                            key={ch.id}
                                            type="button"
                                            onClick={() => setNewChatChannel(ch.id)}
                                            className={`flex flex-col items-center justify-center p-2.5 rounded-xl border text-[11px] font-medium transition-all ${
                                                isSel
                                                    ? 'bg-blue-600/20 border-blue-500/50 text-white'
                                                    : 'bg-white/[0.03] border-white/8 text-neutral-400 hover:text-white hover:bg-white/[0.06]'
                                            }`}
                                        >
                                            <Icon className="w-4 h-4 mb-1" />
                                            <span>{ch.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Número o ID */}
                        <div>
                            <label className="text-xs text-neutral-400 font-medium block mb-1.5">
                                Número de Teléfono / Identificador
                            </label>
                            <Input
                                placeholder="Ej: +1 415 555 2671 o +52 1 55..."
                                value={newContactNumber}
                                onChange={(e) => setNewContactNumber(e.target.value)}
                                className="bg-black/60 border-white/15 text-white text-sm rounded-xl focus:border-white/30"
                                autoFocus
                            />
                        </div>

                        {/* Nombre del Contacto */}
                        <div>
                            <label className="text-xs text-neutral-400 font-medium block mb-1.5">
                                Nombre del Contacto (Opcional)
                            </label>
                            <Input
                                placeholder="Ej: Juan Pérez"
                                value={newContactName}
                                onChange={(e) => setNewContactName(e.target.value)}
                                className="bg-black/60 border-white/15 text-white text-sm rounded-xl focus:border-white/30"
                            />
                        </div>

                        {/* Mensaje inicial */}
                        <div>
                            <label className="text-xs text-neutral-400 font-medium block mb-1.5">
                                Primer Mensaje (Opcional)
                            </label>
                            <Input
                                placeholder="Ej: ¡Hola! Te escribo para dar seguimiento a tu solicitud..."
                                value={initialMessageText}
                                onChange={(e) => setInitialMessageText(e.target.value)}
                                className="bg-black/60 border-white/15 text-white text-sm rounded-xl focus:border-white/30"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCreateNewChat();
                                }}
                            />
                        </div>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setIsNewChatModalOpen(false)}
                            className="text-neutral-400 hover:text-white hover:bg-white/5 text-xs rounded-xl"
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            onClick={handleCreateNewChat}
                            disabled={isSubmittingNewChat || !newContactNumber.trim()}
                            className="bg-white hover:bg-neutral-200 text-black text-xs font-semibold px-4 rounded-xl flex items-center gap-1.5 disabled:opacity-50"
                        >
                            {isSubmittingNewChat ? (
                                <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    <span>Creando...</span>
                                </>
                            ) : (
                                <span>Iniciar Chat</span>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

