import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Merge, Trash2, AlertTriangle, CheckCircle2, RefreshCw, Users, Mail, MessageCircle, Instagram, Send, Phone } from "lucide-react";

const getPlatformIcon = (source: string) => {
    const s = (source || "").toUpperCase();
    if (s.includes("GMAIL")) return <Mail className="w-3 h-3 text-red-400" />;
    if (s.includes("MESSENGER")) return <MessageCircle className="w-3 h-3 text-blue-400" />;
    if (s.includes("WHATSAPP")) return <MessageCircle className="w-3 h-3 text-emerald-400" />;
    if (s.includes("TELEGRAM")) return <Send className="w-3 h-3 text-sky-400" />;
    if (s.includes("INSTAGRAM")) return <Instagram className="w-3 h-3 text-pink-400" />;
    return <Users className="w-3 h-3 text-neutral-500" />;
};
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { db } from '@/lib/firebase';
import { deleteDoc, doc, updateDoc, serverTimestamp, collection, collectionGroup, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface DuplicateManagerProps {
    isOpen: boolean;
    onClose: () => void;
    contacts: any[];
    onContactsUpdated: (updatedContacts: any[]) => void;
}

export const DuplicateManager: React.FC<DuplicateManagerProps> = ({
    isOpen,
    onClose,
    contacts,
    onContactsUpdated
}) => {
    const { currentUser, activeEntity } = useAuth();
    const getTenantPath = () => {
        if (!currentUser?.uid || !activeEntity) return '';
        return `users/${currentUser.uid}/entities/${activeEntity}`;
    };

    const [analyzing, setAnalyzing] = useState(false);
    const [duplicates, setDuplicates] = useState<any[]>([]); // Array of groups
    const [selectedGroupIndex, setSelectedGroupIndex] = useState<number | null>(null);
    const [processing, setProcessing] = useState(false);

    // NEW: Manual merge mode
    const [mode, setMode] = useState<'auto' | 'integrations' | 'manual'>('auto');
    const [selectedForMerge, setSelectedForMerge] = useState<string[]>([]);

    const [exactDuplicates, setExactDuplicates] = useState<any[]>([]);
    const [integrationGroups, setIntegrationGroups] = useState<any[]>([]);

    const analyzeDuplicates = () => {
        setAnalyzing(true);
        setTimeout(() => {
            const exact: any[] = [];
            const integrations: any[] = [];
            const processedIds = new Set();

            // 1. EXACT MATCHES (Phone or Email)
            contacts.forEach(contact => {
                if (processedIds.has(contact.id)) return;
                
                const normalizedPhone = contact.phone ? contact.phone.replace(/\D/g, "") : "";
                const normalizedEmail = contact.email ? contact.email.toLowerCase().trim() : "";

                const matches = contacts.filter(c => {
                    if (c.id === contact.id) return false;
                    if (processedIds.has(c.id)) return false;
                    
                    const cPhone = c.phone ? c.phone.replace(/\D/g, "") : "";
                    const cEmail = c.email ? c.email.toLowerCase().trim() : "";

                    const phoneMatch = normalizedPhone && cPhone && normalizedPhone === cPhone;
                    const emailMatch = normalizedEmail && cEmail && normalizedEmail === cEmail;
                    
                    return phoneMatch || emailMatch;
                });

                if (matches.length > 0) {
                    const group = [contact, ...matches];
                    exact.push(group);
                    group.forEach(g => processedIds.add(g.id));
                }
            });

            // 2. INTEGRATION MATCHES (Name similarity across different sources)
            contacts.forEach(contact => {
                if (processedIds.has(contact.id)) return;
                const name = (contact.name || "").toLowerCase().trim();
                if (name.length < 3 || name === "sin nombre" || name.includes("usuario")) return;

                const matches = contacts.filter(c => {
                    if (c.id === contact.id) return false;
                    if (processedIds.has(c.id)) return false;
                    const cName = (c.name || "").toLowerCase().trim();
                    if (cName.length < 3) return false;

                    // Match if one name contains the other and sources are different
                    const nameMatch = cName.includes(name) || name.includes(cName);
                    const differentSource = (contact.source || "other").toLowerCase() !== (c.source || "other").toLowerCase();
                    
                    return nameMatch && differentSource;
                });

                if (matches.length > 0) {
                    const group = [contact, ...matches];
                    integrations.push(group);
                    group.forEach(g => processedIds.add(g.id));
                }
            });

            setExactDuplicates(exact);
            setIntegrationGroups(integrations);
            setAnalyzing(false);
        }, 500);
    };

    // Auto-analyze on open or when contacts change
    React.useEffect(() => {
        if (isOpen) analyzeDuplicates();
    }, [isOpen, contacts]);

    const handleMerge = async (group: any[], primaryContactId: string) => {
        if (!primaryContactId || processing) return;
        setProcessing(true);

        try {
            const primaryContact = group.find(c => c.id === primaryContactId);
            const others = group.filter(c => c.id !== primaryContactId);

            // Merge Data strategy:
            // 1. Tags: Union
            // 2. Empty fields in primary: Fill from others
            const mergedTags = new Set(primaryContact.tags || []);
            const updates: any = {};

            others.forEach(other => {
                (other.tags || []).forEach((t: string) => mergedTags.add(t));

                if (!primaryContact.email && other.email) updates.email = other.email;
                if (!primaryContact.company && other.company) updates.company = other.company;
                if (!primaryContact.address && other.address) updates.address = other.address;
                if (!primaryContact.phone && other.phone) updates.phone = other.phone;
                
                // ✅ Merge Platform Identifiers
                if (!primaryContact.telegramChatId && other.telegramChatId) updates.telegramChatId = other.telegramChatId;
                if (!primaryContact.metaSenderId && other.metaSenderId) updates.metaSenderId = other.metaSenderId;
                if (!primaryContact.instagramId && other.instagramId) updates.instagramId = other.instagramId;
                
                // Merge platform_ids object
                const mergedPlatformIds = { ...(primaryContact.platform_ids || {}), ...(other.platform_ids || {}) };
                updates.platform_ids = mergedPlatformIds;
                // Add more fields as needed
            });

            updates.tags = Array.from(mergedTags);
            updates.lastUpdated = serverTimestamp();

            // Execute Updates
            // 1. Update Primary (if it still exists)
            const primaryRef = doc(db, `${getTenantPath()}/contacts`, primaryContactId);
            const primarySnap = await getDocs(query(collection(db, `${getTenantPath()}/contacts`), where('__name__', '==', primaryContactId)));

            if (primarySnap.empty) {
                toast.error("El contacto principal ya no existe.");
                analyzeDuplicates(); // Refresh
                setProcessing(false);
                return;
            }

            await updateDoc(primaryRef, updates);

            // 2. Delete Others (only if they exist)
            for (const other of others) {
                const otherRef = doc(db, `${getTenantPath()}/contacts`, other.id);
                // We try a silent delete to be fast, but verify first if possible
                await deleteDoc(otherRef).catch(err => console.error("Error deleting duplicate:", err));
            }

            // --- DEEP MERGE: kanban DATA (HYBRID: ID + PHONE) ---
            const allContactIds = group.map(c => c.id);
            const allPhones = group.map(c => c.phone ? c.phone.replace(/\D/g, '') : '').filter(Boolean);

            // Also get last 10 digits (to handle different country code formats)
            const allPhonesLast10 = allPhones.map(p => p.slice(-10)).filter(p => p.length === 10);

            const cardsToMerge: any[] = [];

            console.log('[DuplicateManager] Searching for kanban cards...');
            console.log('  Contact IDs:', allContactIds);
            console.log('  Phones (full):', allPhones);
            console.log('  Phones (last 10):', allPhonesLast10);

            if (allContactIds.length > 0 || allPhones.length > 0) {
                // 1. Fetch all groups first (infallible method, no index needed)
                const groupsSnapshot = await getDocs(collection(db, `${getTenantPath()}/kanban-groups`));

                for (const groupDoc of groupsSnapshot.docs) {
                    const cardsSnapshot = await getDocs(collection(db, `${getTenantPath()}/kanban-groups`, groupDoc.id, 'cards'));
                    cardsSnapshot.forEach(docSnap => {
                        const cardData = docSnap.data() as any;

                        console.log(`  Checking card: ${cardData.contactName}, contactId=${cardData.contactId}, phone=${cardData.contactNumber}`);

                        // PRIORITY 1: Search by contactId (new system)
                        if (cardData.contactId && allContactIds.includes(cardData.contactId)) {
                            console.log(`    ✅ FOUND by contactId: ${cardData.contactId}`);
                            cardsToMerge.push({ id: docSnap.id, ref: docSnap.ref, ...cardData });
                            return; // Found by ID, no need to check phone
                        }

                        // FALLBACK: Search by phone (legacy system)
                        const cardPhone = (cardData.contactNumber || '').replace(/\D/g, '');
                        const cardPhoneLast10 = cardPhone.slice(-10);

                        // Match by full phone OR last 10 digits
                        const phoneMatch = allPhones.includes(cardPhone) ||
                            (cardPhoneLast10.length === 10 && allPhonesLast10.includes(cardPhoneLast10));

                        if (cardPhone && phoneMatch) {
                            console.log(`    ✅ FOUND by phone: ${cardPhone} (matched: ${allPhones.includes(cardPhone) ? 'full' : 'last 10'})`);
                            cardsToMerge.push({ id: docSnap.id, ref: docSnap.ref, ...cardData });
                        }
                    });
                }
            }

            console.log(`[DuplicateManager] Found ${cardsToMerge.length} cards to merge`);

            if (cardsToMerge.length > 0) {
                // Determine primary card (prefer one with more messages or first one)
                const sortedCards = [...cardsToMerge].sort((a, b) => (b.messages?.length || 0) - (a.messages?.length || 0));
                const primaryCard = sortedCards[0];
                const secondaryCards = sortedCards.slice(1);

                const mergedMessages = [...(primaryCard.messages || [])];
                const mergedNotes = [...(primaryCard.notes || [])];
                const mergedCheckIns = [...(primaryCard.checkIns || [])];
                const mergedPayments = [...(primaryCard.paymentMethods || [])];

                secondaryCards.forEach(card => {
                    if (card.messages) mergedMessages.push(...card.messages);
                    if (card.notes) mergedNotes.push(...card.notes);
                    if (card.checkIns) mergedCheckIns.push(...card.checkIns);
                    if (card.paymentMethods) mergedPayments.push(...card.paymentMethods);
                });

                // Helper to get consistent milliseconds from any timestamp format
                const getMs = (ts: any) => {
                    if (!ts) return 0;
                    if (typeof ts.toMillis === 'function') return ts.toMillis();
                    if (ts.seconds !== undefined) return ts.seconds * 1000;
                    if (ts instanceof Date) return ts.getTime();
                    if (typeof ts === 'string') return new Date(ts).getTime();
                    return 0;
                };

                // Dedup by content+time and Sort Messages
                const uniqueMessagesMap = new Map();
                mergedMessages.forEach(m => {
                    const key = `${m.sender}-${m.text}-${getMs(m.timestamp)}`;
                    uniqueMessagesMap.set(key, m);
                });

                const finalMessages = Array.from(uniqueMessagesMap.values())
                    .sort((a, b) => getMs(a.timestamp) - getMs(b.timestamp));

                // IMPORTANT: Update primary card with merged data AND link to primary contact
                await updateDoc(primaryCard.ref, {
                    contactId: primaryContactId, // ← CRITICAL: Link to primary contact
                    contactName: primaryContact.name, // SYNC NAME
                    email: primaryContact.email || primaryCard.email || '', // Sync email
                    messages: finalMessages,
                    notes: Array.from(new Map(mergedNotes.map(n => [n.id || JSON.stringify(n), n])).values()),
                    checkIns: Array.from(new Map(mergedCheckIns.map(c => [c.id || JSON.stringify(c), c])).values()),
                    paymentMethods: Array.from(new Map(mergedPayments.map(p => [p.id || JSON.stringify(p), p])).values()),
                    updatedAt: serverTimestamp()
                });

                // Delete secondary cards if any
                for (const sCard of secondaryCards) {
                    await deleteDoc(sCard.ref);
                }
            }

            toast.success(`Fusionado exitosamente. ${others.length} duplicados y su historial unificado.`);

            // Remove group from UI
            const newContacts = contacts.filter(c => !others.find(o => o.id === c.id));
            // Update the primary in list locally
            const updatedPrimary = { ...primaryContact, ...updates };
            const finalContacts = newContacts.map(c => c.id === primaryContactId ? updatedPrimary : c);

            onContactsUpdated(finalContacts);
            setDuplicates(prev => prev.filter((_, idx) => idx !== selectedGroupIndex));
            setSelectedGroupIndex(null);
            
            // ✅ Success Feedback and Auto-Close
            toast.success(`Fusión Exitosa: ${others.length} duplicados unificados en ${primaryContact.name}.`);
            setTimeout(() => {
                onClose();
            }, 1000);

        } catch (error: any) {
            console.error("Merge error:", error);
            toast.error(`Error en la fusión: ${error.message || 'Error desconocido'}`);
        } finally {
            setProcessing(false);
        }
    };

    // Handler for manual merge
    const handleManualMerge = () => {
        if (selectedForMerge.length < 2) {
            toast.error('Selecciona al menos 2 contactos para fusionar');
            return;
        }
        
        // When merging manually, we want to make sure the user knows which one is primary.
        // We'll use the first one selected as default, or we could show a selection UI.
        // For now, let's just make sure handleMerge is called with clear feedback.
        const group = contacts.filter(c => selectedForMerge.includes(c.id));
        const primaryId = selectedForMerge[0]; 
        handleMerge(group, primaryId);
    };

    // Toggle contact selection
    const toggleContactSelection = (contactId: string) => {
        setSelectedForMerge(prev =>
            prev.includes(contactId)
                ? prev.filter(id => id !== contactId)
                : [...prev, contactId]
        );
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="bg-[#0b141a] border-neutral-800 text-white sm:max-w-5xl p-0 overflow-hidden outline-none max-h-[85vh]">
                <DialogHeader className="p-3 border-b border-white/5 bg-neutral-900/50">
                    <DialogTitle className="text-[12px] font-black uppercase tracking-widest flex items-center gap-2">
                        <Merge className="text-blue-500 w-3 h-3" />
                        Gestor de Duplicados
                    </DialogTitle>
                </DialogHeader>

                {/* Mode Tabs */}
                {/* Mode Tabs */}
                <div className="px-6 pt-4 flex gap-2 border-b border-white/5">
                    <Button
                        variant={mode === "auto" ? "default" : "ghost"}
                        onClick={() => { setMode("auto"); setSelectedGroupIndex(null); }}
                        className={cn(
                            "rounded-t-lg rounded-b-none h-8 text-[11px] uppercase tracking-wider font-bold",
                            mode === "auto" ? "bg-blue-600 hover:bg-blue-700" : "hover:bg-white/5"
                        )}
                    >
                        <RefreshCw className="w-3 h-3 mr-2" />
                        Auto ({exactDuplicates.length})
                    </Button>
                    <Button
                        variant={mode === "integrations" ? "default" : "ghost"}
                        onClick={() => { setMode("integrations"); setSelectedGroupIndex(null); }}
                        className={cn(
                            "rounded-t-lg rounded-b-none h-8 text-[11px] uppercase tracking-wider font-bold",
                            mode === "integrations" ? "bg-purple-600 hover:bg-purple-700" : "hover:bg-white/5"
                        )}
                    >
                        <Merge className="w-3 h-3 mr-2" />
                        Integraciones ({integrationGroups.length})
                    </Button>
                    <Button
                        variant={mode === "manual" ? "default" : "ghost"}
                        onClick={() => { setMode("manual"); setSelectedGroupIndex(null); }}
                        className={cn(
                            "rounded-t-lg rounded-b-none h-8 text-[11px] uppercase tracking-wider font-bold",
                            mode === "manual" ? "bg-blue-600 hover:bg-blue-700" : "hover:bg-white/5"
                        )}
                    >
                        <Users className="w-3 h-3 mr-2" />
                        Fusión Manual
                    </Button>
                </div>

                <div className="p-6 h-[500px] overflow-y-auto custom-scrollbar">
                    {mode !== "manual" ? (
                        <div className="flex gap-6">
                            {/* Groups List */}
                            <div className="w-1/3 border-r border-white/5 pr-6 space-y-4">
                                <div className="flex justify-between items-center mb-4">
                                    <span className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
                                        {(mode === "auto" ? exactDuplicates : integrationGroups).length} Grupos Encontrados
                                    </span>
                                    <Button variant="ghost" size="sm" onClick={analyzeDuplicates} disabled={analyzing}>
                                        <RefreshCw className={`w-4 h-4 ${analyzing ? "animate-spin" : ""}`} />
                                    </Button>
                                </div>

                                {(mode === "auto" ? exactDuplicates : integrationGroups).length === 0 && !analyzing && (
                                    <div className="text-center py-10 text-neutral-500 text-sm">
                                        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500/50" />
                                        <p>Todo limpio. No se encontraron {mode === "auto" ? "duplicados" : "integraciones"}.</p>
                                    </div>
                                )}

                                {(mode === "auto" ? exactDuplicates : integrationGroups).map((group, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => setSelectedGroupIndex(idx)}
                                        className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedGroupIndex === idx ? "bg-blue-500/10 border-blue-500/50" : "bg-neutral-900/50 border-white/5 hover:border-white/10"}`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <Badge variant="outline" className="bg-neutral-950 text-neutral-400 border-neutral-800">
                                                {group.length} Contactos
                                            </Badge>
                                            {mode === "integrations" && (
                                                <Badge className="bg-purple-600/20 text-purple-400 border-purple-500/30 text-[8px] uppercase font-black">
                                                    Sugerencia Multicanal
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="font-medium text-sm truncate">{group[0].name}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Badge variant="secondary" className="bg-white/5 text-[9px] px-1 h-4">{group[0].source}</Badge>
                                            <p className="text-[10px] text-neutral-500 truncate">{group[0].phone || group[0].email}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Merge Area */}
                            <div className="flex-1 pl-2">
                                {selectedGroupIndex !== null && (mode === "auto" ? exactDuplicates : integrationGroups)[selectedGroupIndex] ? (
                                    <MergeView
                                        group={(mode === "auto" ? exactDuplicates : integrationGroups)[selectedGroupIndex]}
                                        onMerge={(primaryId) => handleMerge((mode === "auto" ? exactDuplicates : integrationGroups)[selectedGroupIndex], primaryId)}
                                        processing={processing}
                                    />
                                ) : (
                                    <div className="h-full flex items-center justify-center text-neutral-600 text-sm">
                                        Selecciona un grupo para revisar
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* Manual Mode */
                        <div className="space-y-4">
                        <div className="bg-blue-600/10 border border-blue-500/20 p-2.5 rounded-lg flex items-center gap-3">
                            <Users className="w-4 h-4 text-blue-500 shrink-0" />
                            <p className="text-[10px] text-blue-200/80 font-bold uppercase tracking-wider leading-relaxed">
                                Selecciona 2+ contactos. Se unificarán chats y datos sin pérdida. El primer seleccionado conserva el nombre.
                            </p>
                        </div>

                            {selectedForMerge.length > 0 && (
                                <div className="flex items-center justify-between p-3 bg-neutral-900/50 rounded-lg border border-white/5">
                                    <span className="text-sm text-neutral-400">
                                        {selectedForMerge.length} contacto(s) seleccionado(s)
                                    </span>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setSelectedForMerge([])}
                                            className="h-7 text-[10px] font-bold uppercase"
                                        >
                                            Limpiar
                                        </Button>
                                        <Button
                                            onClick={handleManualMerge}
                                            disabled={selectedForMerge.length < 2 || processing}
                                            className="bg-blue-600 hover:bg-blue-500 text-white h-7 text-[10px] font-black uppercase tracking-tighter"
                                        >
                                            {processing ? (
                                                <RefreshCw className="w-3 h-3 animate-spin mr-2" />
                                            ) : (
                                                <Merge className="w-3 h-3 mr-2" />
                                            )}
                                            Fusionar Seleccionados
                                        </Button>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 gap-2 max-h-[350px] overflow-y-auto custom-scrollbar pr-2">
                                {contacts.map((contact, contactIdx) => (
                                    <div
                                        key={`${contact.id}-${contactIdx}`}
                                        onClick={() => toggleContactSelection(contact.id)}
                                        className={cn(
                                            "flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer",
                                            selectedForMerge.includes(contact.id)
                                                ? "bg-blue-500/10 border-blue-500/50"
                                                : "bg-neutral-900/30 border-white/5 hover:bg-neutral-900/50 hover:border-white/10"
                                        )}
                                    >
                                        <div className="flex flex-col items-center">
                                            <Checkbox
                                                checked={selectedForMerge.includes(contact.id)}
                                                onCheckedChange={() => toggleContactSelection(contact.id)}
                                                className="border-neutral-600 mb-1"
                                            />
                                            {selectedForMerge[0] === contact.id && (
                                                <span className="text-[8px] font-black text-blue-500 uppercase leading-none">Principal</span>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="font-medium text-sm text-white truncate">{contact.name || 'Sin Nombre'}</p>
                                                {selectedForMerge[0] === contact.id && (
                                                    <Badge className="bg-blue-600 text-[8px] px-1 h-3 border-none">NOMBRE QUE SE CONSERVARÁ</Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-neutral-400">
                                                <span className="truncate">{contact.phone || 'Sin teléfono'}</span>
                                                {contact.email && (
                                                    <>
                                                        <span>•</span>
                                                        <span className="truncate">{contact.email}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        {contact.tags && contact.tags.length > 0 && (
                                            <div className="flex gap-1">
                                                {contact.tags.slice(0, 2).map((tag: string) => (
                                                    <Badge key={tag} variant="outline" className="text-[9px] px-1.5 py-0 bg-neutral-800 border-neutral-700">
                                                        {tag}
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

const MergeView = ({ group, onMerge, processing }: { group: any[], onMerge: (id: string) => void, processing: boolean }) => {
    const [primaryIndex, setPrimaryIndex] = useState<number>(0); // Use index instead of ID

    return (
        <div className="space-y-6">
            <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-lg flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-200/80 leading-relaxed">
                    Selecciona el <strong>Contacto Principal</strong>. Los datos de los otros contactos (como etiquetas faltantes) se fusionarán en el principal, y los duplicados serán <strong>eliminados permanentemente</strong>.
                </p>
            </div>

            <div className="space-y-3">
                {group.map((contact, idx) => (
                    <div
                        key={`${contact.id}-${idx}`} // Use composite key for duplicates
                        onClick={() => setPrimaryIndex(idx)}
                        className={`relative p-4 rounded-xl border transition-all cursor-pointer ${primaryIndex === idx ? 'bg-blue-600/10 border-blue-500 ring-1 ring-blue-500' : 'bg-neutral-900 border-white/5 hover:bg-neutral-800'}`}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${primaryIndex === idx ? 'border-blue-500 bg-blue-500' : 'border-neutral-600'}`}>
                                    {primaryIndex === idx && <div className="w-2 h-2 bg-white rounded-full" />}
                                </div>
                                <div>
                                    <p className="font-medium text-sm text-white flex items-center gap-2">{getPlatformIcon(contact.source)}{contact.name}<Badge variant="secondary" className="bg-white/10 text-[8px] px-1.5 h-4 uppercase font-bold tracking-wider">{contact.source || "Other"}</Badge></p>
                                    <p className="text-xs text-neutral-400">{contact.phone || contact.email || "Sin datos de contacto"}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] font-medium text-neutral-500 uppercase">Tags</span>
                                <div className="flex gap-1 justify-end mt-1">
                                    {(contact.tags || []).slice(0, 3).map((t: string) => (
                                        <div key={t} className="w-2 h-2 rounded-full bg-neutral-600" title={t} />
                                    ))}
                                    {(contact.tags?.length || 0) > 3 && <span className="text-[10px] text-neutral-500">+{contact.tags.length - 3}</span>}
                                </div>
                            </div>
                        </div>
                        {primaryIndex === idx && (
                            <Badge className="absolute -top-2 -right-2 bg-blue-600 hover:bg-blue-600 border-none text-[10px]">
                                PRINCIPAL
                            </Badge>
                        )}
                    </div>
                ))}
            </div>

            <div className="pt-6 border-t border-white/5 flex justify-end gap-3">
                <Button
                    onClick={() => onMerge(group[primaryIndex].id)}
                    disabled={processing}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-medium"
                >
                    {processing ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Merge className="w-4 h-4 mr-2" />}
                    Fusionar y Eliminar Duplicados
                </Button>
            </div>
        </div>
    );
};


