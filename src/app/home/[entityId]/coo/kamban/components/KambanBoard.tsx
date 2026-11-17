import React, { useState, useMemo, useEffect, useRef } from 'react';
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
import { Plus } from 'lucide-react';
import { useKambanBoard } from '../hooks/useKambanBoard';
import { KambanHeader } from './KambanHeader';
import KambanColumn from './KambanColumn';
import Card from './Card';
import ConversationModal from './ConversationModal';
import { useSidebar } from '@/components/SidebarContext';
import { SelectContactModal } from './SelectContactModal';
import { CreateClientModal } from './CreateClientModal';
import { useRouter } from 'next/navigation';
import { collection, addDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';

import { useAuth } from '@/contexts/AuthContext';
import { resolveCardChannel } from '@/lib/omnichannel/resolveCardChannel';
import { getContactHeaderNames } from '@/lib/omnichannel/contactHeaderInfo';
import { isInboxGroup } from '@/lib/kanban/botNodeGroups';
export default function KambanBoard({
    boardMode = 'all',
    botId,
}: {
    boardMode?: 'bot' | 'all';
    botId?: string;
}) {
    const { currentUser, activeEntity, activeEntityRoute } = useAuth();
    const isLocked = boardMode === 'bot';
    const getTenantPath = () => {
        if (!currentUser?.uid || !activeEntity) return '';
        return `users/${currentUser.uid}/entities/${activeEntity}`;
    };

  const [searchTerm, setSearchTerm] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | 'unassigned'>('all');
  const [isCompact, setIsCompact] = useState(true);

  const [isGlobalSelectContactOpen, setIsGlobalSelectContactOpen] = useState(false);
  const [isGlobalCreateClientOpen, setIsGlobalCreateClientOpen] = useState(false);
  const [contacts, setContacts] = useState<any[]>([]);
  const [isSyncingBotGroups, setIsSyncingBotGroups] = useState(false);
  const hasAttemptedAutoSync = useRef(false);
  const router = useRouter();

  const { isCollapsed, toggleSidebar } = useSidebar();
  const { groups, cards, loading, handleDragEnd, handleUpdateColor, handleAddGroup } = useKambanBoard(searchTerm, boardMode, botId);

  useEffect(() => {
    const tenantPath = getTenantPath();
    if (!tenantPath) return;

    const unsubscribe = onSnapshot(collection(db, `${tenantPath}/contacts`), (snapshot) => {
      setContacts(snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      })));
    });

    return () => unsubscribe();
  }, [currentUser?.uid, activeEntity]);

  const resolveCardChannelForBoard = (card: any) => {
    const ch = resolveCardChannel(card);
    if (ch === 'instagram_comments') return 'instagram';
    return ch;
  };

  const onAddGroup = async () => {
    const name = window.prompt('New group name:');
    if (name) await handleAddGroup(name);
  };

  const handleGlobalAddCard = async (contact?: any) => {
    // Adds to the first group (Inbox)
    const firstGroup = groups[0];
    if (!firstGroup) {
      toast.error("Crea una bandeja primero");
      return;
    }
    try {
      const cardData: any = {
        contactName: contact?.name || 'New Contact',
        contactNumber: contact?.phone || '',
        email: contact?.email || '',
        clientId: contact?.clientId || '',
        lastMessage: 'Conversation started...',
        channel: contact ? 'CRM Link' : 'Manual',
        source: 'manual',
        groupId: firstGroup.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        messages: [],
      };
      await addDoc(collection(db, `${getTenantPath()}/kanban-groups/${firstGroup.id}/cards`), cardData);
      toast.success(contact ? `Contact "${contact.name}" added.` : 'New conversation created.');
      setIsGlobalSelectContactOpen(false);
    } catch (error) {
      console.error('Error adding card:', error);
      toast.error('Error adding contact.');
    }
  };

  const filteredCards = useMemo(() => {
    return cards.filter(card => {
      const matchesSearch = !searchTerm ||
        card.contactName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        card.lastMessage?.toLowerCase().includes(searchTerm.toLowerCase());

      if (!matchesSearch) return false;

      if (filter === 'unread') return card.unreadCount > 0;
      if (filter === 'unassigned') return !card.assignedTo;

      return true;
    });
  }, [cards, searchTerm, filter]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = (event: DragStartEvent) => {
    if (isLocked) return;
    setActiveId(event.active.id as string);
  };

  const handleDragEndWrapper = async (event: Parameters<typeof handleDragEnd>[0]) => {
    setActiveId(null);
    if (isLocked) return;
    await handleDragEnd(event);
  };

  const handleCardClick = (card: any) => {
    setSelectedCard(card);
    setIsModalOpen(true);
  };

  const handleSyncBotGroups = async () => {
    if (!currentUser?.uid || !activeEntity) return;
    setIsSyncingBotGroups(true);
    try {
      const res = await fetch('/api/kanban/sync-bot-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.uid,
          entityId: activeEntity,
          botId: botId || '00000003',
          relocateCards: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      toast.success(
        `Kanban sincronizado: +${data.groups?.created || 0} grupos, ${data.relocation?.moved || 0} tarjetas movidas`
      );
    } catch (error: any) {
      console.error('[KambanBoard] sync bot groups failed:', error);
      toast.error(error?.message || 'No se pudo sincronizar con el chatbot');
    } finally {
      setIsSyncingBotGroups(false);
    }
  };

  const handleExportAllVCF = () => {
    if (!cards || cards.length === 0) {
      toast.error("No hay contactos para exportar.");
      return;
    }

    let vcfContent = '';

    cards.forEach((card) => {
      vcfContent += 'BEGIN:VCARD\n';
      vcfContent += 'VERSION:3.0\n';

      const { whatsappName, botName } = getContactHeaderNames(card);
      const fullName = (botName || whatsappName || 'No Name').trim();
      const parts = fullName.split(/\s+/);
      let firstName = '';
      let lastName = '';
      if (parts.length > 1) {
        lastName = parts.pop() || '';
        firstName = parts.join(' ');
      } else {
        firstName = parts[0] || '';
      }

      vcfContent += `N:${lastName};${firstName};;;\n`;
      vcfContent += `FN:${fullName}\n`;

      if (card.company || card.organization) {
        vcfContent += `ORG:${card.company || card.organization}\n`;
      }

      if (card.title || card.role) {
        vcfContent += `TITLE:${card.title || card.role}\n`;
      }

      const rawPhone = card.contactNumber || '';
      if (rawPhone) {
        let cleanPhone = rawPhone.replace(/[^\d+]/g, '');
        if (cleanPhone) {
          if (!cleanPhone.startsWith('+')) {
            cleanPhone = '+' + cleanPhone;
          }
          vcfContent += `TEL;TYPE=CELL,VOICE:${cleanPhone}\n`;
        }
      }

      if (card.email) {
        vcfContent += `EMAIL;TYPE=PREF,INTERNET:${card.email}\n`;
      }

      if (card.address) {
        vcfContent += `ADR;TYPE=WORK:;;${card.address}\n`;
      }

      let note = '';
      if (card.lastMessage) {
        note += `Ultimo mensaje: ${card.lastMessage}`;
      }
      if (card.channel) {
        note += note ? ` - Canal: ${card.channel}` : `Canal: ${card.channel}`;
      }
      if (note) {
        vcfContent += `NOTE:${note}\n`;
      }

      vcfContent += 'END:VCARD\n';
    });

    const blob = new Blob([vcfContent], { type: 'text/vcard;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `todos_los_contactos.vcf`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(`✅ ${cards.length} contactos exportados a vCard`);
  };

  useEffect(() => {
    if (loading || hasAttemptedAutoSync.current || !currentUser?.uid || !activeEntity) return;
    const syncBotId = botId || '00000003';
    const hasBotGroups = groups.some((g) => g.autoManaged && (botId ? g.botId === botId : g.botId === syncBotId));
    const hasInbox = groups.some((g) => isInboxGroup(g));
    if (hasBotGroups && hasInbox) return;
    hasAttemptedAutoSync.current = true;
    handleSyncBotGroups();
  }, [loading, groups, currentUser?.uid, activeEntity, botId]);

  const activeCard = useMemo(() => cards.find(c => c.id === activeId), [cards, activeId]);

  const channelStats = useMemo(() => {
    const stats = {
      whatsapp: 0, instagram: 0, messenger: 0, web: 0, facebook: 0,
      snapchat: 0, x: 0, tiktok: 0, telegram: 0, gmail: 0, others: 0
    };
    cards.forEach(card => {
      const channel = resolveCardChannelForBoard(card);

      if (channel === 'whatsapp') stats.whatsapp++;
      else if (channel === 'instagram') stats.instagram++;
      else if (channel === 'messenger') stats.messenger++;
      else if (channel === 'web') stats.web++;
      else if (channel === 'snapchat') stats.snapchat++;
      else if (channel === 'x') stats.x++;
      else if (channel === 'tiktok') stats.tiktok++;
      else if (channel === 'telegram') stats.telegram++;
      else if (channel === 'gmail') stats.gmail++;
      else stats.others++;
    });
    return stats;
  }, [cards]);

  const dropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.5' } } }),
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0a0a0a] overflow-hidden">
      <KambanHeader
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        filter={filter}
        setFilter={setFilter}
        channelStats={channelStats}
        isSidebarCollapsed={isCollapsed}
        toggleSidebar={toggleSidebar}
        onNewChat={() => setIsGlobalSelectContactOpen(true)}
        onSettings={() => router.push(`/home/${activeEntityRoute || activeEntity}/cto/integrations`)}
        onSyncBotGroups={handleSyncBotGroups}
        isSyncingBotGroups={isSyncingBotGroups}
        onExportAll={handleExportAllVCF}
        locked={isLocked}
      />

      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEndWrapper}
        >
          <div className="flex min-h-full w-full md:min-w-max p-2 pt-1 pb-4 gap-2 overflow-x-auto snap-x snap-mandatory no-scrollbar">
            {groups.map(group => (
              <KambanColumn
                key={group.id}
                group={group}
                allGroups={groups}
                cards={filteredCards.filter(c => c.groupId === group.id)}
                onCardClick={handleCardClick}
                onUpdateColor={handleUpdateColor}
                contacts={contacts}
                isCompact={isCompact}
                locked={isLocked}
              />
            ))}

            {boardMode !== 'bot' && (
            <button
              onClick={onAddGroup}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl border border-dashed border-white/5 text-neutral-500 hover:text-neutral-300 hover:bg-white/5 transition-all h-fit w-72 flex-shrink-0"
            >
              <Plus size={16} />
              <span className="text-[13px] font-medium">Add group</span>
            </button>
            )}
          </div>

          <DragOverlay dropAnimation={dropAnimation}>
            {activeCard ? <Card card={activeCard} isOverlay /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      <ConversationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        card={selectedCard}
        groupName={groups.find(g => g.id === selectedCard?.groupId)?.name}
        groups={groups}
        allConversations={cards}
        onSelectConversation={(card) => setSelectedCard(card)}
        stats={{ totalConversations: cards.length, totalGroups: groups.length }}
      />

      {/* Global Modals */}
      <SelectContactModal
        isOpen={isGlobalSelectContactOpen}
        onClose={() => setIsGlobalSelectContactOpen(false)}
        onSelect={(contact) => handleGlobalAddCard(contact)}
        onAddNew={() => {
          setIsGlobalSelectContactOpen(false);
          setIsGlobalCreateClientOpen(true);
        }}
      />

      <CreateClientModal
        isOpen={isGlobalCreateClientOpen}
        onClose={() => setIsGlobalCreateClientOpen(false)}
        groups={groups}
        initialGroupId={groups[0]?.id}
      />
    </div>
  );
}

