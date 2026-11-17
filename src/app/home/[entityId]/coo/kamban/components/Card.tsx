
'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, deleteDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import WhatsappIcon from '@/components/icons/WhatsappIcon';
import { Trash2, GripVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import {
  MessageCircle,
  Instagram,
  Facebook,
  Linkedin,
  Youtube,
  Twitter,
  Globe2,
  FileSpreadsheet, Mail, Send
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { resolveCardChannel } from '@/lib/omnichannel/resolveCardChannel';
import { ConversationContactMeta } from '../../omnichannel/components/ConversationContactMeta';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { toast } from 'sonner';

const Card = ({ card, groupId, onClick, cardColor = 'bg-neutral-800', contacts = [], isCompact, dragDisabled = false }: any) => {
  const { currentUser, activeEntity } = useAuth();
  const getTenantPath = () => {
    if (!currentUser?.uid || !activeEntity) return '';
    return `users/${currentUser.uid}/entities/${activeEntity}`;
  };
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: { type: 'CARD', card: { ...card, groupId } },
    disabled: dragDisabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleOpenDeleteDialog = (e) => {
    e.stopPropagation();
    setIsDeleteDialogOpen(true);
  };

  const handleCloseDeleteDialog = () => {
    setIsDeleteDialogOpen(false);
    setDeleteConfirmation('');
  };

  const handleDeleteCard = async () => {
    const confirmation = deleteConfirmation.trim().toLowerCase();
    if (confirmation === 'delete' || confirmation === 'borrar') {
      try {
        const tenantPath = getTenantPath();
        if (!tenantPath) {
          toast.error("Error: No se pudo determinar la entidad actual.");
          return;
        }

        toast.loading("Eliminando tarjeta...", { id: 'delete-card' });

        // 1. Direct Deletion Attempt
        const directCardRef = doc(db, `${tenantPath}/kanban-groups/${groupId}/cards/${card.id}`);
        await deleteDoc(directCardRef);

        // 2. Brute Force Search (Safety Net)
        // If the card was moved or mapped incorrectly, we look everywhere for its ID or clean phone
        const { getDocs, collection } = await import('firebase/firestore');
        const groupsSnap = await getDocs(collection(db, `${tenantPath}/kanban-groups`));

        const deletePromises: Promise<any>[] = [];
        const cleanPhone = card.contactNumberClean || card.contactNumber?.replace(/\D/g, '');

        for (const groupDoc of groupsSnap.docs) {
          const cardsRef = collection(db, `${tenantPath}/kanban-groups/${groupDoc.id}/cards`);
          const cardsSnap = await getDocs(cardsRef);

          cardsSnap.docs.forEach(cDoc => {
            const data = cDoc.data();
            const cPhone = data.contactNumberClean || data.contactNumber?.replace(/\D/g, '');

            // Delete if ID matches OR if phone matches (if user wants to "eliminar todo" for that contact)
            if (cDoc.id === card.id || (cleanPhone && cPhone === cleanPhone)) {
              console.log(`[Card] 🗑️ Deleting card ${cDoc.id} from group ${groupDoc.id}`);
              deletePromises.push(deleteDoc(cDoc.ref));
            }
          });
        }

        await Promise.all(deletePromises);

        // 3. Clear Contact References (Data Integrity)
        const telegramId = card.telegramChatId || (card.platform_ids?.telegram);
        if (card.crmId || card.contactId || cleanPhone || telegramId) {
          try {
            const contactsRef = collection(db, `${tenantPath}/contacts`);
            let contactDocId = card.crmId || card.contactId;

            if (!contactDocId && cleanPhone) {
              const { query, where, getDocs } = await import('firebase/firestore');
              const q = query(contactsRef, where('phone', '==', `+${cleanPhone}`));
              const snap = await getDocs(q);
              if (!snap.empty) contactDocId = snap.docs[0].id;
            }

            if (!contactDocId && telegramId) {
              const { query, where, getDocs } = await import('firebase/firestore');
              const q = query(contactsRef, where('telegramChatId', '==', String(telegramId)));
              const snap = await getDocs(q);
              if (!snap.empty) contactDocId = snap.docs[0].id;
              else if (typeof telegramId === 'string' && telegramId.startsWith('tg_')) contactDocId = telegramId;
              else contactDocId = `tg_${telegramId}`;
            }

            if (contactDocId) {
              // FULL CASCADE DELETE FROM KANBAN
              await deleteDoc(doc(db, `${tenantPath}/contacts/${contactDocId}`));
              console.log(`[Card] 🗑️ Full Cascade: Deleted contact ${contactDocId}`);
              
              // Purge main chat history
              const chatRef = doc(db, `${tenantPath}/chats/${contactDocId}`);
              await deleteDoc(chatRef).catch(() => {});
              
              if (card.metaSenderId) {
                const metaChatRef = doc(db, `${tenantPath}/chats/${card.metaSenderId}`);
                await deleteDoc(metaChatRef).catch(() => {});
                
                // NEW: Purge message deduplication history to allow immediate restart
                try {
                  const { collection, getDocs, where, query } = await import('firebase/firestore');
                  const dedupRef = collection(db, `${tenantPath}/processed_messages`);
                  const q = query(dedupRef, where('senderId', '==', card.metaSenderId));
                  const snap = await getDocs(q);
                  const batch = snap.docs.map(d => deleteDoc(d.ref));
                  await Promise.all(batch);
                } catch (e) { console.error("Dedup purge failed:", e); }
              }
              
              if (telegramId) {
                const tgChatRef = doc(db, `${tenantPath}/chats/${telegramId}`);
                await deleteDoc(tgChatRef).catch(() => {});
              }
              
              // Also purge specific chat archive for this card
              const cardChatRef = doc(db, `${tenantPath}/chats/${card.id}`);
              await deleteDoc(cardChatRef).catch(() => {});
              console.log(`[Card] 💬 Chat history purged.`);
            }
          } catch (err) {
            console.error("[Card] Error unlinking contact:", err);
          }
        }

        toast.success("Tarjeta eliminada de todas las bandejas", { id: 'delete-card' });
        handleCloseDeleteDialog();
      } catch (error) {
        console.error("Error deleting card: ", error);
        toast.error("Error al eliminar la tarjeta", { id: 'delete-card' });
      }
    }
  };

  const resolvedChannel = (() => {
    const ch = resolveCardChannel(card);
    if (ch === 'instagram_comments') return 'instagram';
    return ch;
  })();

  const renderChannelIcon = () => {
    if (resolvedChannel === 'gmail') return <Mail size={12} className="text-red-500 flex-shrink-0" />;
    if (resolvedChannel === 'instagram') return <Instagram size={12} className="text-pink-500 flex-shrink-0" />;
    if (resolvedChannel === 'messenger') return <Facebook size={12} className="text-blue-600 flex-shrink-0" />;
    if (resolvedChannel === 'web') return <Globe2 size={12} className="text-cyan-400 flex-shrink-0" />;
    if (resolvedChannel === 'telegram') return <Send size={12} className="text-sky-500 flex-shrink-0" />;
    return <WhatsappIcon className="w-3 h-3 text-emerald-500 fill-current flex-shrink-0" />;
  };

  return (
    <TooltipProvider>
      <div
        ref={setNodeRef}
        style={style}
        data-card-id={card.id}
        {...attributes}
        className={cn(
          "group relative p-2.5 sm:p-3 rounded-xl border border-white/5 transition-all duration-200 select-none mb-1.5 sm:mb-2 shadow-sm",
          cardColor || "bg-[#181818]/50",
          "hover:bg-white/5 hover:border-white/10",
          isDragging && "opacity-60 ring-1 ring-blue-500/40"
        )}
      >
        <div className="flex items-start gap-1.5 min-w-0">
          {!dragDisabled && (
          <button
            type="button"
            aria-label="Arrastrar tarjeta"
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "mt-0.5 p-1 rounded-md text-neutral-600 hover:text-neutral-300 hover:bg-white/5 flex-shrink-0 touch-none",
              "cursor-grab active:cursor-grabbing"
            )}
          >
            <GripVertical size={14} />
          </button>
          )}

          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={onClick}
          >
            <div className="flex items-start gap-2 min-w-0">
              <div className="pt-0.5">{renderChannelIcon()}</div>

              <div className="flex-1 min-w-0">
                <ConversationContactMeta
                  card={card}
                  compact
                  highlight={card.unreadCount > 0}
                />
                {card.lastMessage && (
                  <p className={cn(
                    'text-[10px] truncate mt-1 leading-snug',
                    card.unreadCount > 0 ? 'text-neutral-300 font-medium' : 'text-neutral-500'
                  )}>
                    {card.lastMessage}
                  </p>
                )}
              </div>

              <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                {card.unreadCount > 0 && (
                  <span className="bg-blue-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full min-w-[1rem] text-center leading-none">
                    {card.unreadCount}
                  </span>
                )}

                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); handleOpenDeleteDialog(e); }}
                    className="h-6 w-6 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-full"
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-neutral-900 border-neutral-700 text-white">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Escribe 'delete' o 'borrar' para confirmar la eliminación.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              className="bg-neutral-800 border-neutral-600 focus:ring-blue-500"
              placeholder="delete / borrar..."
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDeleteDialog}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={handleDeleteCard}
              disabled={
                deleteConfirmation.trim().toLowerCase() !== 'delete' &&
                deleteConfirmation.trim().toLowerCase() !== 'borrar'
              }
            >
              Borrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

export default Card;


