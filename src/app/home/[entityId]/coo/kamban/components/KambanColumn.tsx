'use client';

import React, { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, addDoc, doc, deleteDoc, updateDoc, serverTimestamp, writeBatch, Timestamp } from 'firebase/firestore';
import Card from './Card';
import { Plus, Trash2, MoreVertical, Palette, Upload, Download, Search, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
    DropdownMenuPortal
} from "@/components/ui/dropdown-menu";
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { toast } from 'sonner';
import { SelectContactModal } from './SelectContactModal';
import { CreateClientModal } from './CreateClientModal';
import { sortCardsByArrival } from '@/lib/omnichannel/cardSort';
import { cardMatchesColumnSearch } from '@/lib/omnichannel/columnSearch';
import { getBotNodeTypeLabel, getKanbanColumnDisplayName, isInboxGroup, type KanbanNodeDetails } from '@/lib/kanban/botNodeGroups';
import { getContactHeaderNames } from '@/lib/omnichannel/contactHeaderInfo';

// --- Types ---
interface CardData {
    id: string;
    groupId: string;
    contactName: string;
    lastMessage: string;
    channel: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    messages: any[];
}

const colors = [
    { name: 'Default', value: 'bg-[#161616]', cardColor: 'bg-[#1e1e1e]', textColor: 'text-neutral-400', pill: 'bg-neutral-800 text-neutral-200' },
    { name: 'Gray', value: 'bg-[#1f1f1f]', cardColor: 'bg-[#272727]', textColor: 'text-neutral-400', pill: 'bg-[#3a3a3a] text-neutral-200' },
    { name: 'Orange', value: 'bg-[#331c0e]', cardColor: 'bg-[#27150a]', textColor: 'text-orange-400', pill: 'bg-[#7a3b1f] text-orange-50' },
    { name: 'Yellow', value: 'bg-[#332b0e]', cardColor: 'bg-[#27210a]', textColor: 'text-yellow-400', pill: 'bg-[#7a651f] text-yellow-50' },
    { name: 'Green', value: 'bg-[#123122]', cardColor: 'bg-[#0e2419]', textColor: 'text-emerald-400', pill: 'bg-[#1a5b3d] text-emerald-50' },
    { name: 'Blue', value: 'bg-[#0c2438]', cardColor: 'bg-[#081a29]', textColor: 'text-blue-400', pill: 'bg-[#1a4a75] text-blue-50' },
    { name: 'Purple', value: 'bg-[#2f1c34]', cardColor: 'bg-[#241527]', textColor: 'text-purple-400', pill: 'bg-[#6b3576] text-purple-50' },
    { name: 'Pink', value: 'bg-[#38111e]', cardColor: 'bg-[#290c16]', textColor: 'text-pink-400', pill: 'bg-[#82193f] text-pink-50' },
    { name: 'Red', value: 'bg-[#3b1212]', cardColor: 'bg-[#2b0d0d]', textColor: 'text-rose-400', pill: 'bg-[#8c1818] text-rose-50' },
];

interface kambanColumnProps {
    group: any;
    cards: any[];
    allGroups?: any[];
    onCardClick: (card: any) => void;
    onUpdateColor?: (groupId: string, color: string) => void;
    contacts?: any[];
    isCompact?: boolean;
    locked?: boolean;
}

export const kambanColumn = ({
    group,
    cards,
    allGroups = [],
    onCardClick,
    onUpdateColor,
    contacts = [],
    isCompact,
    locked = false,
}: kambanColumnProps) => {
    const { currentUser, activeEntity } = useAuth();
    const getTenantPath = () => {
        if (!currentUser?.uid || !activeEntity) return '';
        return `users/${currentUser.uid}/entities/${activeEntity}`;
    };
    const [isSelectContactOpen, setIsSelectContactOpen] = useState(false);
    const [isCreateClientOpen, setIsCreateClientOpen] = useState(false);
    const [columnSearch, setColumnSearch] = useState('');
    const [isNodeInfoOpen, setIsNodeInfoOpen] = useState(false);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const toggleNodeInfo = () => setIsNodeInfoOpen((prev) => !prev);

    const isInbox = isInboxGroup(group);
    const nodeDetails = group.botNodeDetails as KanbanNodeDetails | undefined;
    const isBotColumn = !isInbox && !!(nodeDetails || group.autoManaged || group.botNodeId);
    const displayName = getKanbanColumnDisplayName(group);
    const nodeTypeLabel = nodeDetails?.typeLabel || getBotNodeTypeLabel(group.botNodeType);

    // Droppable for receiving cards
    const { setNodeRef } = useDroppable({
        id: group.id,
        data: { type: 'group', group },
        disabled: locked,
    });

    // --- ADD CARD ---
    const handleAddCard = async (contact?: any) => {
        try {
            const cardData: any = {
                contactName: contact?.name || 'New Contact',
                contactNumber: contact?.phone || '',
                email: contact?.email || '',
                clientId: contact?.clientId || '',
                lastMessage: 'Conversation started...',
                channel: contact ? 'CRM Link' : 'Manual',
                source: 'manual',
                groupId: group.id,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                messages: [],
            };
            await addDoc(collection(db, `${getTenantPath()}/kanban-groups/${group.id}/cards`), cardData);
            toast.success(contact ? `Contact "${contact.name}" added.` : 'New conversation created.');
            setIsSelectContactOpen(false);
        } catch (error) {
            console.error('Error adding card:', error);
            toast.error('Error adding contact.');
        }
    };

    // --- IMPORT CSV ---
    const handleImportCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            const lines = text.split('\n').filter(line => line.trim());

            if (lines.length < 2) {
                alert('CSV file is empty or has no data.');
                return;
            }

            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
            const batch = writeBatch(db);
            let importCount = 0;

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim());
                const contact: any = {};
                headers.forEach((header, index) => { if (values[index]) contact[header] = values[index]; });

                if (!contact.contactname && !contact.contactName) continue;

                const cardData = {
                    contactName: contact.contactname || contact.contactName || 'No Name',
                    contactNumber: contact.contactnumber || contact.contactNumber || contact.phone || '',
                    email: contact.email || '',
                    company: contact.company || contact.organization || '',
                    lastMessage: 'Imported from CSV',
                    channel: 'CSV Import',
                    source: 'csv',
                    groupId: group.id,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    messages: [],
                };

                const newCardRef = doc(collection(db, `${getTenantPath()}/kanban-groups/${group.id}/cards`));
                batch.set(newCardRef, cardData);
                importCount++;
            }

            try {
                await batch.commit();
                toast.success(`✅ ${importCount} contacts imported successfully`);
            } catch (error) {
                console.error('Error importing contacts:', error);
                toast.error('❌ Error importing contacts');
            }
        };

        reader.readAsText(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // --- EXPORT TO VCARD (.VCF) ---
    const handleExportVCF = () => {
        if (!cards || cards.length === 0) {
            toast.error("No hay contactos en esta columna para exportar.");
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
        const safeGroupName = (group.name || 'contactos').toLowerCase().replace(/[^a-z0-9]/g, '_');
        link.setAttribute('download', `${safeGroupName}_contactos.vcf`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast.success(`✅ ${cards.length} contactos exportados a vCard`);
    };

    // --- DELETE GROUP ---
    const handleDeleteGroup = async () => {
        if (allGroups.length <= 1) {
            toast.error("No puedes eliminar la única bandeja que queda.");
            return;
        }

        if (!window.confirm(`¿Estás seguro de eliminar "${group.name}"? Todas las conversaciones se moverán a la bandeja Inbox.`)) return;

        const inbox = allGroups.find(g => g.id === 'default_inbox') || 
                      allGroups.find(g => g.name === 'Inbox' && g.id !== group.id) ||
                      allGroups.find(g => (g.name === 'Inbox' || g.name === 'Bandeja de Entrada') && g.id !== group.id) ||
                      allGroups.find(g => g.id !== group.id);

        if (!inbox) {
            alert("No se encontró una bandeja de destino válida.");
            return;
        }

        const batch = writeBatch(db);

        cards.forEach((card) => {
            const newCardRef = doc(collection(db, `${getTenantPath()}/kanban-groups/${inbox.id}/cards`));
            const { id, groupId, ...cardData } = card;
            batch.set(newCardRef, { ...cardData, groupId: inbox.id, updatedAt: serverTimestamp() });
            batch.delete(doc(db, `${getTenantPath()}/kanban-groups/${group.id}/cards`, card.id));
        });

        batch.delete(doc(db, `${getTenantPath()}/kanban-groups`, group.id));

        try {
            await batch.commit();
            toast.success(`Columna eliminada. Conversaciones movidas a ${inbox.name}.`);
        } catch (error) {
            console.error('Error deleting group:', error);
            toast.error('Error deleting column.');
        }
    };

    const selectedColor = colors.find(c => c.value === group.color) || colors[0];
    const sortedCards = useMemo(() => sortCardsByArrival(cards), [cards]);
    const visibleCards = useMemo(() => {
        if (!columnSearch.trim()) return sortedCards;
        return sortedCards.filter((card) => cardMatchesColumnSearch(card, columnSearch));
    }, [sortedCards, columnSearch]);
    const isFiltering = columnSearch.trim().length > 0;

    return (
        <div
            ref={setNodeRef}
            data-group-id={group.id}
            className={cn(
                "flex flex-col flex-shrink-0 h-fit rounded-2xl border border-white/5 transition-all duration-300 hover:border-white/10 shadow-lg overflow-hidden pb-2 mb-8 snap-center",
                isCompact ? 'w-[85vw] sm:w-80' : 'w-[90vw] sm:w-[22rem]',
                selectedColor.value
            )}
        >
            <div className="p-3 pb-1 flex flex-col gap-2">
                {/* Fila principal del grupo */}
                <div className="flex justify-between items-center gap-2">
                    <div className="flex items-center gap-1 min-w-0 max-w-[70%]">
                        {isBotColumn && (
                            <button
                                type="button"
                                onClick={toggleNodeInfo}
                                onPointerDown={(e) => e.stopPropagation()}
                                aria-label={isNodeInfoOpen ? 'Ocultar detalles' : 'Ver detalles'}
                                className="flex-shrink-0 text-white/50 hover:text-white transition-colors"
                            >
                                <ChevronRight
                                    size={14}
                                    className={cn("transition-transform duration-200", isNodeInfoOpen && "rotate-90")}
                                />
                            </button>
                        )}
                        <div className={cn("px-2 py-0.5 rounded-md text-[11px] font-bold tracking-tight truncate text-white", selectedColor.pill)}>
                            {displayName}
                        </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <span className={cn("font-medium text-[12px] opacity-40 tabular-nums", selectedColor.textColor)}>
                            {isFiltering ? `${visibleCards.length}/${sortedCards.length}` : sortedCards.length}
                        </span>
                        {!locked && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                                    <MoreVertical size={16} />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-neutral-900 border-neutral-800 text-white shadow-2xl rounded-xl p-1 w-56">
                                <DropdownMenuItem
                                    onClick={() => {
                                        const newName = window.prompt('Editar nombre de la bandeja:', group.name);
                                        if (newName && newName !== group.name) {
                                            updateDoc(doc(db, `${getTenantPath()}/kanban-groups`, group.id), { name: newName });
                                        }
                                    }}
                                    className="cursor-pointer hover:bg-neutral-800 rounded-lg py-2"
                                >
                                    <Palette className="mr-3 text-neutral-400" size={16} />
                                    <span>Edit Name</span>
                                </DropdownMenuItem>
                                <DropdownMenuSub>
                                    <DropdownMenuSubTrigger className="hover:bg-blue-600 focus:bg-blue-600 data-[state=open]:bg-blue-600 rounded-lg transition-colors py-2">
                                        <Palette className="mr-3 text-neutral-400" size={16} />
                                        <span className="font-medium">Column Colors</span>
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuPortal>
                                        <DropdownMenuSubContent className="bg-neutral-900 border-neutral-800 text-white shadow-2xl rounded-xl p-1 ml-1 w-48">
                                            {colors.map(color => (
                                                <DropdownMenuItem
                                                    key={color.name}
                                                    onClick={() => onUpdateColor?.(group.id, color.value)}
                                                    className="hover:bg-neutral-800 focus:bg-neutral-800 rounded-lg flex items-center gap-3 py-2 cursor-pointer transition-colors"
                                                >
                                                    <div className={cn("w-3.5 h-3.5 rounded-full border border-white/10", color.cardColor.replace('/40', ''))}></div>
                                                    <span className="text-xs font-medium">{color.name}</span>
                                                    {group.color === color.value && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500" />}
                                                </DropdownMenuItem>
                                            ))}
                                        </DropdownMenuSubContent>
                                    </DropdownMenuPortal>
                                </DropdownMenuSub>
                                <DropdownMenuItem
                                    onClick={() => fileInputRef.current?.click()}
                                    className="cursor-pointer hover:bg-neutral-800 rounded-lg py-2"
                                >
                                    <Upload className="mr-3 text-neutral-400" size={16} />
                                    <span>Import CSV</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={handleExportVCF}
                                    className="cursor-pointer hover:bg-neutral-800 rounded-lg py-2"
                                >
                                    <Download className="mr-3 text-neutral-400" size={16} />
                                    <span>Exportar</span>
                                </DropdownMenuItem>
                                {allGroups.length > 1 && (
                                    <>
                                        <div className="h-px bg-neutral-800 my-1 mx-1" />
                                        <DropdownMenuItem
                                            onClick={handleDeleteGroup}
                                            className="cursor-pointer hover:bg-red-500/10 text-red-400 hover:text-red-300 rounded-lg py-2"
                                        >
                                            <Trash2 className="mr-3 text-red-400" size={16} />
                                            <span>Delete Column</span>
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        )}
                    </div>
                </div>

                {/* Detalle del nodo (colapsable con la flecha del nombre) */}
                {isBotColumn && isNodeInfoOpen && (
                    <div className="rounded-xl border border-white/10 bg-black/25 overflow-hidden">
                        <div className="flex items-center gap-2 px-2.5 py-2 border-b border-white/5">
                            <span className={cn("text-[10px] font-bold uppercase tracking-wide truncate", selectedColor.textColor)}>
                                {nodeTypeLabel}
                            </span>
                        </div>

                        <div className="px-3 pb-3 pt-2 space-y-2.5">
                                <div>
                                    <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                                        Nombre completo
                                    </p>
                                    <p className="text-[11px] text-neutral-100 leading-relaxed whitespace-pre-wrap break-words">
                                        {displayName}
                                    </p>
                                </div>

                                {!nodeDetails ? (
                                    <p className="text-[10px] text-neutral-500 leading-relaxed">
                                        Pulsa <strong className="text-neutral-400">Sync bot</strong> en el header para cargar la pregunta y respuestas de este nodo.
                                    </p>
                                ) : (
                                    <>
                                        {nodeDetails.prompt && (
                                            <div>
                                                <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-500 mb-1">
                                                    Pregunta / mensaje del bot
                                                </p>
                                                <p className="text-[11px] text-neutral-200 leading-relaxed whitespace-pre-wrap">
                                                    {nodeDetails.prompt}
                                                </p>
                                            </div>
                                        )}

                                        {nodeDetails.expectedAnswers && nodeDetails.expectedAnswers.length > 0 && (
                                            <div>
                                                <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                                                    Respuestas esperadas
                                                </p>
                                                <ul className="space-y-1">
                                                    {nodeDetails.expectedAnswers.map((answer, idx) => (
                                                        <li
                                                            key={`${answer}-${idx}`}
                                                            className="text-[11px] text-neutral-300 bg-white/[0.04] border border-white/5 rounded-lg px-2 py-1.5 leading-snug"
                                                        >
                                                            {answer}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {nodeDetails.notes && nodeDetails.notes.length > 0 && (
                                            <div className="space-y-1 pt-0.5">
                                                {nodeDetails.notes.map((note, idx) => (
                                                    <p key={idx} className="text-[10px] text-neutral-500 leading-relaxed">
                                                        {note}
                                                    </p>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                        </div>
                    </div>
                )}

                <div className="relative px-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-600 pointer-events-none" size={12} />
                    <input
                        type="text"
                        value={columnSearch}
                        onChange={(e) => setColumnSearch(e.target.value)}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Buscar tarjeta..."
                        className="w-full bg-black/30 border border-white/10 rounded-lg py-1.5 pl-7 pr-2 text-[11px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-blue-500/40 transition-colors"
                    />
                </div>
            </div>

            {/* Hidden CSV input */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleImportCSV}
                style={{ display: 'none' }}
            />

            {/* Cards */}
            <div className="p-2 space-y-1 min-h-[100px]">
                <SortableContext items={visibleCards.map(c => c.id)} strategy={verticalListSortingStrategy}>
                    {visibleCards.map((card) => (
                        <Card
                            key={card.id}
                            card={card}
                            groupId={group.id}
                            onClick={(e: any) => onCardClick(card)}
                            cardColor={selectedColor.cardColor}
                            contacts={contacts}
                            isCompact={isCompact}
                            dragDisabled={locked}
                        />
                    ))}
                </SortableContext>

                {visibleCards.length === 0 && (
                    <div className={cn("flex flex-col items-center justify-center py-6 px-4 text-center rounded-xl border border-dashed border-white/5 opacity-40")}>
                        <span className="text-[10px] font-medium">
                            {isFiltering ? 'Sin resultados' : 'Empty'}
                        </span>
                    </div>
                )}

                {/* Bottom Add Link */}
                {!locked && (
                <button
                    onClick={() => setIsSelectContactOpen(true)}
                    className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded-xl text-neutral-500 hover:text-neutral-300 hover:bg-white/5 transition-all mt-1 group-hover:opacity-100",
                        cards.length > 0 ? "opacity-40" : "opacity-100"
                    )}
                >
                    <Plus size={14} />
                    <span className="text-[12px] font-medium">New conversation</span>
                </button>
                )}
            </div>

            {/* Modals */}
            <SelectContactModal
                isOpen={isSelectContactOpen}
                onClose={() => setIsSelectContactOpen(false)}
                onSelect={(contact) => handleAddCard(contact)}
                onAddNew={() => {
                    setIsSelectContactOpen(false);
                    setIsCreateClientOpen(true);
                }}
            />

            <CreateClientModal
                isOpen={isCreateClientOpen}
                onClose={() => setIsCreateClientOpen(false)}
                groups={allGroups}
                initialGroupId={group.id}
            />
        </div>
    );
};

export default kambanColumn;
