'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';

import { AnimatePresence, Variants, motion } from 'framer-motion';

import { db } from '@/lib/firebase';
import { collection, getDocs, collectionGroup, setDoc, doc, deleteDoc, serverTimestamp, query, where, updateDoc, addDoc, onSnapshot, orderBy, runTransaction, writeBatch } from 'firebase/firestore';
import { Plus, Search, X, Users, RefreshCw, Filter, MoreHorizontal, ArrowLeft, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import ConversationModal from '../../coo/whatsapp/components/ConversationModal';
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { normalizePhoneNumber } from '@/lib/phoneUtils';
import { useRouter } from 'next/navigation';

// Modular Components
import { ContactHeader } from './components/ContactHeader';
import { ContactFilters } from './components/ContactFilters';
import { ContactList } from './components/ContactList';
import { ContactGrid } from './components/ContactGrid';
import { ContactDetailsModal } from './components/ContactDetailsModal';
import { ImportDialog } from './components/ImportDialog';
import { DuplicateManager } from './components/DuplicateManager';
import { DeleteConfirmationDialog } from './components/DeleteConfirmationDialog';

const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
};

const HEADER_MAPPING: { [key: string]: string[] } = {
    // --- Identity & Demographics ---
    name: ['name', 'nombre', 'fullname', 'nombre completo', 'full name', 'client', 'cliente'],
    email: ['email', 'correo', 'mail', 'digital mail', 'correo electrónico'],
    phone: ['phone', 'teléfono', 'telefono', 'tel', 'celular', 'mobile', 'whatsapp', 'direct line', 'contactnumber'],
    birthDate: ['birthdate', 'fecha de nacimiento', 'fecha nacimiento', 'nacimiento', 'cumpleaños', 'dob'],
    gender: ['gender', 'género', 'genero', 'sexo', 'sex', 'sexualidad'],
    maritalStatus: ['maritalstatus', 'estado civil', 'civil status', 'situación civil'],
    nationality: ['nationality', 'nacionalidad', 'pais de origen', 'país de origen', 'country of origin', 'citizen of'],
    birthPlace: ['birthplace', 'lugar de nacimiento', 'lugar nacimiento', 'city of birth', 'ciudad de nacimiento'],

    // --- Detailed Address ---
    city: ['city', 'ciudad', 'municipio'],
    state: ['state', 'provincia', 'estado', 'departamento', 'región'],
    country: ['country', 'país', 'pais', 'residence country'],
    address: ['address', 'dirección', 'direccion', 'calle', 'ubicación', 'geographic location', 'street', 'domicilio'],
    postalCode: ['postalcode', 'código postal', 'zip', 'zipcode', 'cp', 'postal code'],
    usAddress: ['usaddress', 'dirección en usa', 'direccion usa', 'hospedaje usa', 'host address', 'usa address'],

    // --- Education ---
    schoolName: ['schoolname', 'colegio', 'high school', 'escuela', 'institución secundaria', 'secundaria'],
    highSchoolProgram: ['highschoolprogram', 'programa secundaria', 'programa sec', 'bachillerato'],
    universityName: ['universityname', 'universidad', 'university'],
    profession: ['profession', 'profesión', 'profesion', 'carrera', 'carrera universitaria', 'degree', 'carrera uni'],

    // --- Study & Background Plans ---
    studyReason: ['studyreason', 'razón estudio', 'razon estudio', 'motivo de viaje', 'study purpose', '¿por qué estudiar?'],
    studyDuration: ['studyduration', 'tiempo estudio', 'duración', 'duration', 'tiempo de estudio'],
    startSemester: ['startsemester', 'semestre inicio', 'inicio clases', 'start date', 'intake', 'enero/mayo/sept'],
    preferredSchedule: ['preferredschedule', 'horario pref', 'horario preferido', 'horario', 'turno', 'mañana/tarde/noche'],
    destinationSchool: ['destinationschool', 'escuela destino', 'institución destino', 'colegio destino'],
    visaRejection: ['visarejection', 'rechazo visa', 'visa rechazada', 'negación de visa', 'has visa rejection?', 'rechazo anterior'],

    // --- Employment ---
    occupationData: ['occupationdata', 'situación laboral', 'employment status', 'estado laboral', 'tipo empleo'],
    currentEmployer: ['currentemployer', 'empresa actual', 'employer', 'current employer', 'empresa'],
    companyAddress: ['companyaddress', 'dirección empresa', 'direccion boss', 'dirección empleador'],
    companyCity: ['companycity', 'ciudad empresa', 'ciudad boss'],
    companyPhone: ['companyphone', 'teléfono empresa', 'tel boss', 'telefono empleador'],
    monthlySalary: ['monthlysalary', 'salario', 'sueldo', 'monthly salary', 'income', 'salario mensual', 'monto'],
    employmentStartDate: ['employmentstartdate', 'inicio empleo', 'fecha inicio', 'antigüedad', 'fecha contratación'],
    roleDescription: ['roledescription', 'descripción rol', 'descripción', 'job description', 'funciones'],
    otherIncome: ['otherincome', 'otros ingresos', 'fuentes extra', 'ingresos adicionales'],
    previousEmployment: ['previousemployment', 'empleo anterior?', '¿empleo anterior?', 'trabajo previo'],

    // --- Family & Sponsor ---
    hasSponsor: ['hassponsor', 'patrocinador', 'tiene sponsor', 'sponsor?', '¿tienes patrocinador?'],
    sponsorFirstName: ['sponsorname', 'nombre sponsor', 'nombre patrocinador', 'sponsor first name'],
    sponsorLastName: ['sponsorsurname', 'apellido sponsor', 'apellido patrocinador', 'sponsor last name'],
    sponsorPhone: ['sponsorphone', 'teléfono sponsor', 'telefono sponsor', 'celular sponsor'],
    sponsorRelation: ['sponsorrelationship', 'relación sponsor', 'parentesco', 'relacion con patrocinador', 'sponsor relation'],
    motherName: ['mothername', 'madre', 'nombre madre', 'mother', 'nombre completo madre'],
    motherBirthDate: ['motherbirthdate', 'nac madre', 'fecha nac madre', 'cumpleaños madre'],
    fatherName: ['fathername', 'padre', 'nombre padre', 'father', 'nombre completo padre'],
    fatherBirthDate: ['fatherbirthdate', 'nac padre', 'fecha nac padre', 'cumpleaños padre'],

    // --- Passport & Visa ---
    passportNumber: ['passport', 'pasaporte', 'número de pasaporte', 'nro pasaporte', 'passport / id', 'passportnumber'],
    passportIssueCountry: ['passportissuecountry', 'país emisión pasaporte', 'país de emisión', 'pais emision'],
    passportIssueCity: ['passportissuecity', 'ciudad emisión pasaporte', 'ciudad de emisión', 'ciudad emision'],
    passportState: ['passportstate', 'estado/provincia pasaporte', 'estado/provincia'],
    passportIssuedDate: ['passportissueddate', 'fecha emisión pasaporte', 'passport issue date', 'fecha de emisión'],
    passportExpiryDate: ['passportexpirydate', 'fecha vencimiento pasaporte', 'vencimiento pasaporte', 'passport expiry date', 'fecha de expiración'],
    passportLost: ['passportlost', '¿has perdido tu pasaporte alguna vez?', 'pasaporte perdido', 'lost passport'],

    hasTouristVisa: ['hastouristvisa', '¿tienes visa de turista actual?', 'visa turista', 'tiene visa?'],
    visaIssuedDate: ['visaissueddate', 'emisión visa', 'fecha emisión visa', 'visa issue date'],
    visaExpiryDate: ['visaexpirydate', 'expiración visa', 'fecha vencimiento visa', 'visa expiry date'],

    // --- System & Metadata ---
    source: ['source', 'fuente', 'origen', 'fuente de contacto'],
    stage: ['stage', 'etapa', 'fase', 'status', 'estado'],
    clientType: ['clienttype', 'tipo de cliente', 'tipo cliente', 'client type'],
    interests: ['interests', 'intereses'],
    serviceType: ['servicetype', 'servicio', 'tipo de servicio'],
    paymentStatus: ['paymentstatus', 'estado de pago', 'pago'],
    backupLink: ['backuplink', 'respaldo'],
    contractLink: ['contractlink', 'contrato'],
    invoiceLink: ['invoicelink', 'factura'],
};

// Robust timestamp extractor (Firestore Timestamp | {seconds} | Date | ISO string)
const getTimeValue = (ts: any): number => {
    if (!ts) return 0;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (ts.seconds !== undefined) return ts.seconds * 1000;
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === 'string') return new Date(ts).getTime();
    return 0;
};

// Display helper for the sequential numeric ID (e.g. #000123)
export const formatContactNumber = (contact: any): string => {
    if (contact?.contactNumber !== undefined && contact?.contactNumber !== null && contact?.contactNumber !== '') {
        return `#${String(contact.contactNumber).padStart(6, '0')}`;
    }
    return contact?.clientId || '—';
};

const itemVariants: Variants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
        y: 0,
        opacity: 1,
        transition: {
            duration: 0.5,
            ease: "easeOut"
        }
    }
};

export default function ContactsPage() {
    const { currentUser, activeEntity } = useAuth();
    const getTenantPath = () => {
        if (!currentUser?.uid || !activeEntity) return '';
        return `users/${currentUser.uid}/entities/${activeEntity}`;
    };

    const [contacts, setContacts] = useState<any[]>([]);
    const [rawContacts, setRawContacts] = useState<any[]>([]); // Unprocessed contacts for duplicate detection
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedContact, setSelectedContact] = useState<any>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [isMounted, setIsMounted] = useState(false);
    const [isLoadingContacts, setIsLoadingContacts] = useState(false);

    // Add keyboard listener for Command+K
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                const searchInput = document.getElementById('crm-search-input');
                if (searchInput) {
                    searchInput.focus();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);
    const [newTag, setNewTag] = useState('');
    const [isAddingTag, setIsAddingTag] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isDuplicateManagerOpen, setIsDuplicateManagerOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<{ type: 'single' | 'bulk', id?: string }>({ type: 'single' });
    const [currentView, setCurrentView] = useState<'all' | 'Prospecting' | 'In Progress' | 'Closed'>('all');
    const [isBulkTagOpen, setIsBulkTagOpen] = useState(false);
    const [bulkTagValue, setBulkTagValue] = useState('');

    // Handle client-side mounting and localStorage
    useEffect(() => {
        setIsMounted(true);
        if (typeof window !== 'undefined') {
            const savedViewMode = localStorage.getItem('contactsViewMode');
            if (savedViewMode === 'list' || savedViewMode === 'grid') {
                setViewMode(savedViewMode);
            }
        }
    }, []);
    const [syncStatus, setSyncStatus] = useState('');

    // Auto-hide sync status after 10 seconds
    useEffect(() => {
        if (syncStatus) {
            const timer = setTimeout(() => {
                setSyncStatus('');
            }, 10000);
            return () => clearTimeout(timer);
        }
    }, [syncStatus]);

    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);

    // --- KANBAN SYNC LOGIC (Added for ConversationModal consistency) ---
    const [groups, setGroups] = useState<any[]>([]);
    const [allCards, setAllCards] = useState<any[]>([]);
    const [activeCard, setActiveCard] = useState<any>(null); // To pass to modal

    useEffect(() => {
        const groupsQuery = query(collection(db, `${getTenantPath()}/kanban-groups`), orderBy("order", "asc"));
        const unsubscribe = onSnapshot(groupsQuery, (snapshot) => {
            const groupsFromDb = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            setGroups(groupsFromDb);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const tenantPath = getTenantPath();
        if (!tenantPath) return;

        // Aislamiento multi-tenant: solo se escuchan las tarjetas de los grupos de ESTE tenant
        // (antes: collectionGroup('cards') sin filtro descargaba las tarjetas de todos los clientes).
        const cardsByGroup: Record<string, any[]> = {};
        const cardUnsubs: Record<string, () => void> = {};
        const flush = () => setAllCards(Object.values(cardsByGroup).flat());

        const unsubscribeGroups = onSnapshot(collection(db, `${tenantPath}/kanban-groups`), (groupsSnap) => {
            const liveIds = new Set(groupsSnap.docs.map(g => g.id));
            for (const id of Object.keys(cardUnsubs)) {
                if (!liveIds.has(id)) {
                    cardUnsubs[id]();
                    delete cardUnsubs[id];
                    delete cardsByGroup[id];
                }
            }
            for (const id of liveIds) {
                if (cardUnsubs[id]) continue;
                cardUnsubs[id] = onSnapshot(collection(db, `${tenantPath}/kanban-groups/${id}/cards`), (cardsSnap) => {
                    cardsByGroup[id] = cardsSnap.docs.map(d => ({ ...d.data(), id: d.id, groupId: id }));
                    flush();
                });
            }
            flush();
        });
        return () => {
            unsubscribeGroups();
            Object.values(cardUnsubs).forEach(u => u());
        };
    }, [currentUser?.uid, activeEntity]);

    useEffect(() => {
        setIsLoadingContacts(true);
        const contactsQuery = query(collection(db, `${getTenantPath()}/contacts`));
        const unsubscribe = onSnapshot(contactsQuery, (snapshot) => {
            const allContacts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Robust in-memory sort by multiple possible timestamp fields
            const sortedContacts = [...allContacts].sort((a: any, b: any) => {
                const timeA = getTimeValue(a.createdAt) || getTimeValue(a.importedAt) || getTimeValue(a.lastUpdated) || 0;
                const timeB = getTimeValue(b.createdAt) || getTimeValue(b.importedAt) || getTimeValue(b.lastUpdated) || 0;
                return timeB - timeA;
            });

            setRawContacts(sortedContacts);
            setContacts(processContacts(sortedContacts));
            setIsLoadingContacts(false);

            // Assign sequential numeric IDs to any legacy contacts missing one.
            maybeBackfillNumbers(sortedContacts);
        }, (error) => {
            console.error("Error fetching contacts:", error);
            setIsLoadingContacts(false);
            toast.error("Error al cargar contactos");
        });

        return () => unsubscribe();
    }, []);

    // Helper to find card for contact
    const findCardForContact = (contact: any) => {
        if (!contact) return null;

        // 1. Try match by ID (if stored)
        let found = allCards.find(c => c.contactId === contact.id);

        // 2. Try match by Phone (Normalized)
        if (!found && contact.phone) {
            const normalizedContactPhone = contact.phone.replace(/\D/g, '');
            found = allCards.find(c => (c.contactNumber || '').replace(/\D/g, '') === normalizedContactPhone);
        }

        // 3. Try match by ID as Card ID (Fallback)
        if (!found) {
            found = allCards.find(c => c.id === contact.id);
        }

        return found || null;
    };


    // Filter states
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [selectedStages, setSelectedStages] = useState<string[]>([]);
    const [selectedSources, setSelectedSources] = useState<string[]>([]);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    // Helpers
    const getDateString = (value: any) => {
        if (!value) return '---';
        if (typeof value === 'string') return value;
        if (value && typeof value === 'object' && 'seconds' in value) {
            return new Date(value.seconds * 1000).toLocaleDateString();
        }
        return '---';
    };

    const getDateInputValue = (value: any) => {
        if (!value) return '';
        if (typeof value === 'string') return value;
        if (value && typeof value === 'object' && 'seconds' in value) {
            return new Date(value.seconds * 1000).toISOString().split('T')[0];
        }
        return '';
    };

    const getAge = (birthDate: any) => {
        if (!birthDate) return null;
        let date: Date;
        if (typeof birthDate === 'string') {
            date = new Date(birthDate);
        } else if (birthDate && typeof birthDate === 'object' && 'seconds' in birthDate) {
            date = new Date(birthDate.seconds * 1000);
        } else {
            return null;
        }
        if (isNaN(date.getTime())) return null;
        return new Date().getFullYear() - date.getFullYear();
    };

    const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);

    // Generate a unique alphanumeric ID (e.g., RY7A2B9)
    const generateClientId = () => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = 'RY'; // Prefix for Royalty
        for (let i = 0; i < 5; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    };

    // --- SEQUENTIAL NUMERIC IDs (per entity counter) ---
    const backfillRunning = useRef(false);

    // Reserve a block of `count` sequential numbers, returns the FIRST number in the block.
    const reserveContactNumbers = async (count: number): Promise<number> => {
        const tenantPath = getTenantPath();
        if (!tenantPath || count < 1) return 0;
        const counterRef = doc(db, `${tenantPath}/counters/contactCounter`);
        const start = await runTransaction(db, async (tx) => {
            const snap = await tx.get(counterRef);
            const current = snap.exists() ? (snap.data().seq || 0) : 0;
            tx.set(counterRef, { seq: current + count, updatedAt: serverTimestamp() }, { merge: true });
            return current + 1;
        });
        return start;
    };

    // Convenience: reserve a single next number.
    const getNextContactNumber = async (): Promise<number> => {
        return reserveContactNumbers(1);
    };

    // One-time backfill: assign numeric IDs to legacy contacts that don't have one.
    const maybeBackfillNumbers = async (list: any[]) => {
        if (backfillRunning.current) return;
        const tenantPath = getTenantPath();
        if (!tenantPath) return;

        const missing = list.filter(c => c.id && (c.contactNumber === undefined || c.contactNumber === null || c.contactNumber === ''));
        if (missing.length === 0) return;

        backfillRunning.current = true;
        try {
            // Oldest contacts get the lowest numbers.
            const sorted = [...missing].sort((a, b) => {
                const ta = getTimeValue(a.createdAt) || getTimeValue(a.importedAt) || getTimeValue(a.lastUpdated) || 0;
                const tb = getTimeValue(b.createdAt) || getTimeValue(b.importedAt) || getTimeValue(b.lastUpdated) || 0;
                return ta - tb;
            });

            const start = await reserveContactNumbers(sorted.length);

            // Firestore batches cap at 500 writes; chunk to be safe.
            const CHUNK = 450;
            for (let i = 0; i < sorted.length; i += CHUNK) {
                const batch = writeBatch(db);
                const slice = sorted.slice(i, i + CHUNK);
                slice.forEach((c, j) => {
                    batch.update(doc(db, `${tenantPath}/contacts`, c.id), { contactNumber: start + i + j });
                });
                await batch.commit();
            }
        } catch (e) {
            console.error('[CRM] Error during numeric ID backfill:', e);
            backfillRunning.current = false; // allow retry on next snapshot if it failed
        }
    };

    // Helper to process contacts: deduplicate and ensure clientId
    const processContacts = (data: any[]) => {
        const seenIds = new Set();
        const seenMetaKeys = new Set();

        const filtered = data.filter(contact => {
            if (!contact.id || seenIds.has(contact.id)) return false;
            
            // VALIDATION: Prevent empty "ghost" data from Omnichannel or Kanban
            const phoneStr = String(contact.phone || '').replace(/\D/g, '');
            const hasPhone = phoneStr.length > 5;
            const hasName = contact.name && String(contact.name).trim() !== '' && String(contact.name).trim().toLowerCase() !== 'sin nombre';
            
            if (!hasPhone && !hasName) {
                // If the contact has no phone and no real name, don't show it (prevents empty ghost records)
                return false;
            }

            const normalizedSource = String(contact.source || '').trim().toLowerCase();
            const metaSenderId = String(contact.metaSenderId || '').trim();
            const isMetaContact = metaSenderId && (normalizedSource.includes('instagram') || normalizedSource.includes('messenger'));

            if (isMetaContact) {
                const metaKey = `${normalizedSource}:${metaSenderId}`;
                if (seenMetaKeys.has(metaKey)) return false;
                seenMetaKeys.add(metaKey);
            }

            seenIds.add(contact.id);
            return true;
        });

        const result = filtered.map((contact) => {
            if (!contact.clientId) {
                const derivedId = `RY${contact.id.substring(0, 5).toUpperCase()}`;
                return { ...contact, clientId: derivedId };
            }
            return contact;
        });

        return result;
    };

    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('contactsViewMode', viewMode);
        }
    }, [viewMode]);

    const smartParseDate = (value: any): string => {
        if (!value) return '';
        // 1. Excel Serial Date
        if (typeof value === 'number' && value > 20000) {
            const date = new Date((value - (25567 + 2)) * 86400 * 1000); // 25567 days from 1900 to 1970, +2 for leap year bugs
            return date.toISOString().split('T')[0];
        }

        const strVal = value.toString().trim();
        // 2. Already ISO
        if (/^\d{4}-\d{2}-\d{2}$/.test(strVal)) return strVal;

        // 3. DD/MM/YYYY or MM/DD/YYYY
        // Try to handle 19/04/2006
        const parts = strVal.split(/[\/\-]/);
        if (parts.length === 3) {
            let day = parseInt(parts[0]);
            let month = parseInt(parts[1]);
            let year = parseInt(parts[2]);

            // Handle 2-digit years heuristically
            if (year < 100) year += 2000;

            // Swap if US format seems likely (MM/DD/YYYY) - basic check
            // If first part > 12, it's definitely DAY. 
            // If second part > 12, it's definitely DAY (so first is month).
            if (month > 12 && day <= 12) {
                const temp = day; day = month; month = temp;
            }

            // Map month names (abr, ene, etc) if parsed as NaN
            if (isNaN(month)) {
                const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
                const lowerPart1 = parts[1].toLowerCase().substring(0, 3);
                const idx = monthNames.findIndex(m => m === lowerPart1);
                if (idx !== -1) month = idx + 1;
            }

            if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            }
        }
        return strVal; // Return original if unknown
    };

    const smartParseMoney = (value: any): string => {
        if (!value) return '';
        let str = value.toString();
        // remove symbols
        str = str.replace(/[^\d.,-]/g, '');
        // 1.200,00 -> 1200.00 (EU/Latam)
        // 1,200.00 -> 1200.00 (US)

        // If last separator is comma, assume decimal comma
        if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
            str = str.replace(/\./g, '').replace(',', '.');
        } else {
            // remove commas
            str = str.replace(/,/g, '');
        }
        const num = parseFloat(str);
        return isNaN(num) ? '' : num.toString();
    };

    const findBestMatch = (header: string): string | null => {
        const normalized = header.toLowerCase().trim();

        // 1. Exact & Alias Match (High Confidence)
        for (const [key, aliases] of Object.entries(HEADER_MAPPING)) {
            if (aliases.includes(normalized)) return key;
        }

        // 2. Contains Match (Medium Confidence)
        // If the header literally contains one of the aliases (e.g. "my phone number" contains "phone")
        for (const [key, aliases] of Object.entries(HEADER_MAPPING)) {
            for (const alias of aliases) {
                if (alias.length > 3 && normalized.includes(alias)) return key;
            }
        }

        // 3. Heuristic / Semantic Match (Low Confidence but Smart)
        const rules: { [key: string]: (h: string) => boolean } = {
            passportExpiryDate: (h) => (h.includes('venc') || h.includes('caduc') || h.includes('expir')) && (h.includes('pasaporte') || h.includes('doc') || h.includes('viaje')),
            passportIssuedDate: (h) => (h.includes('emis') || h.includes('fecha')) && (h.includes('pasaporte') || h.includes('doc')),
            birthDate: (h) => (h.includes('nacim') || h.includes('naci')) && (h.includes('fecha') || h.includes('date')),
            usAddress: (h) => (h.includes('usa') || h.includes('eeuu') || h.includes('estados unidos')) && (h.includes('direc') || h.includes('domicilio') || h.includes('viv')),
            monthlySalary: (h) => (h.includes('ingresc') || h.includes('sueldo') || h.includes('gananc') || h.includes('mensual')),
            motherName: (h) => h.includes('madre') && (h.includes('nomb') || h.includes('apell')),
            fatherName: (h) => h.includes('padre') && (h.includes('nomb') || h.includes('apell')),
            hasSponsor: (h) => (h.includes('patrocin') || h.includes('sponsor')) && (h.includes('tien') || h.includes('?')),
            visaRejection: (h) => (h.includes('negad') || h.includes('recha') || h.includes('denied')) && (h.includes('visa')),
        };

        for (const [key, rule] of Object.entries(rules)) {
            if (rule(normalized)) return key;
        }

        return null;
    };

    const onImportDrop = async (acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (!file) return;

        setIsSyncing(true);
        setSyncStatus(`Procesando archivo...`);

        const XLSX = await import('xlsx');
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                if (jsonData.length < 2) {
                    setSyncStatus("❌ Error: El archivo está vacío.");
                    setIsSyncing(false);
                    return;
                }

                const rawHeaders = jsonData[0].map((h: any) => h ? h.toString().trim() : '');
                const rows = jsonData.slice(1);

                let importedCount = 0;
                let skippedCount = 0;

                // Reserve a contiguous block of numeric IDs for this import batch.
                // Skipped rows simply leave gaps, which is acceptable.
                let numberCursor = await reserveContactNumbers(rows.length);

                for (const row of rows) {
                    if (!row || row.length === 0) continue;

                    const rowDataTemp: any = {};
                    rawHeaders.forEach((header: string, index: number) => {
                        if (header) rowDataTemp[header] = row[index] || '';
                    });

                    // Comprehensive & Heuristic Mapping Logic
                    const mappedContact: any = JSON.parse(JSON.stringify(newContact));
                    const extraData: any = {};
                    // No need to track usedHeaders globally if we just iterate headers

                    Object.keys(rowDataTemp).forEach(header => {
                        const originalValue = rowDataTemp[header];
                        if (!originalValue && originalValue !== 0) return; // Skip empty cells

                        const matchedKey = findBestMatch(header);
                        let isMapped = false;

                        if (matchedKey) {
                            // Smart Parse before assigning
                            let finalValue = originalValue;
                            const lowerKey = matchedKey.toLowerCase();

                            if (lowerKey.includes('date') || lowerKey.includes('birth') || lowerKey.includes('expiry') || lowerKey.includes('issued')) {
                                finalValue = smartParseDate(originalValue);
                            } else if (lowerKey.includes('salary') || lowerKey.includes('income') || lowerKey.includes('cost') || lowerKey.includes('price')) {
                                finalValue = smartParseMoney(originalValue);
                            }

                            // Only assign if empty (handle duplicates priority: first come first serve)
                            if (!mappedContact[matchedKey]) {
                                mappedContact[matchedKey] = finalValue;
                                isMapped = true;
                            }
                        }

                        // If not mapped (or field was already full), add to Extra Data
                        if (!isMapped) {
                            let uniqueHeader = header;
                            let counter = 2;
                            while (extraData[uniqueHeader]) {
                                uniqueHeader = `${header} (${counter})`;
                                counter++;
                            }
                            extraData[uniqueHeader] = originalValue;
                        }
                    });
                    // Finalize contact data
                    // Ensure the contact has standard names avoiding ghost records
                    if (!mappedContact.name && !rowDataTemp.nombre && !rowDataTemp.name) {
                        const hasPhone = (mappedContact.phone || '').toString().replace(/[^\d+]/g, '').length > 5;
                        if (!hasPhone && !mappedContact.email) {
                            // Do NOT save if there is no name, no phone, and no email
                            continue;
                        }
                    }
                    if (!mappedContact.name) mappedContact.name = rowDataTemp.name || rowDataTemp.nombre || 'Sin Nombre';

                    // Normalize phone and check duplicates
                    const phone = (mappedContact.phone || '').toString().replace(/[^\d+]/g, '');
                    // Check if phone exists in DB (simple check)
                    const isDuplicateInDB = contacts.some(c => c.phone && c.phone.replace(/[^\d+]/g, '') === phone);

                    if (phone && isDuplicateInDB) {
                        skippedCount++;
                        continue;
                    }

                    const contactId = Math.random().toString(36).substr(2, 9);
                    const finalContact = {
                        ...mappedContact,
                        phone: phone,
                        extraData: extraData,
                        id: contactId,
                        date: new Date().toISOString().split('T')[0],
                        createdAt: serverTimestamp(),
                        lastUpdated: serverTimestamp(),
                        importedFrom: 'excel',
                        clientId: generateClientId(),
                        contactNumber: numberCursor++
                    };

                    await setDoc(doc(db, `${getTenantPath()}/contacts`, contactId), sanitizeData(finalContact));
                    importedCount++;
                }

                setSyncStatus(`✅ Importación: ${importedCount} añadidos, ${skippedCount} duplicados omitidos.`);
                const querySnapshot = await getDocs(collection(db, `${getTenantPath()}/contacts`));
                const allContacts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setContacts(processContacts(allContacts));
                setTimeout(() => { setIsImportModalOpen(false); setSyncStatus(''); }, 2000);
            } catch (err) {
                console.error("Error parsing file:", err);
                setSyncStatus("❌ Error al procesar el archivo.");
            } finally {
                setIsSyncing(false);
            }
        };
        reader.readAsArrayBuffer(file);
    };
    const handleSyncWhatsAppContacts = async () => {
        setIsSyncing(true);
        setSyncStatus('Iniciando sincronización omnicanal...');
        try {
            const tenantPath = getTenantPath();
            if (!tenantPath) throw new Error("No tenant path found");

            // 1. Fetch all cards from all groups
            let allCardDocs: any[] = [];
            for (const group of groups) {
                const cardsRef = collection(db, `${tenantPath}/kanban-groups/${group.id}/cards`);
                const snap = await getDocs(cardsRef);
                snap.docs.forEach(d => allCardDocs.push({ id: d.id, ref: d.ref, ...d.data(), groupId: group.id }));
            }

            let importedCount = 0;
            let updatedCount = 0;

            // Reserve numeric IDs for potentially-new contacts (gaps are fine).
            let numberCursor = await reserveContactNumbers(allCardDocs.length);

            for (const cardData of allCardDocs) {
                // Identity Resolution
                const rawSource = (cardData.source || cardData.platform || 'OTHER').toUpperCase();
                const isMeta = rawSource.includes('MESSENGER') || rawSource.includes('INSTAGRAM') || rawSource.includes('FACEBOOK');
                
                const metaId = cardData.metaSenderId || (isMeta ? cardData.contactNumber : null);
                const rawPhone = !isMeta ? cardData.contactNumber : null;
                const phone = rawPhone ? normalizePhoneNumber(rawPhone) : null;
                const nameStr = (cardData.contactName || 'Sin Nombre').trim();

                // Skip ghost cards (no identity whatsoever)
                if (!phone && !metaId && nameStr.toLowerCase() === 'sin nombre') continue;

                // 2. DUAL SEARCH: Find existing contact by Phone OR Meta ID
                let existingContactDoc: any = null;

                if (metaId) {
                    const qMeta = query(collection(db, `${tenantPath}/contacts`), where('metaSenderId', '==', metaId));
                    const snapMeta = await getDocs(qMeta);
                    if (!snapMeta.empty) existingContactDoc = snapMeta.docs[0];
                }

                if (!existingContactDoc && phone) {
                    const qPhone = query(collection(db, `${tenantPath}/contacts`), where('phone', '==', phone));
                    const snapPhone = await getDocs(qPhone);
                    if (!snapPhone.empty) existingContactDoc = snapPhone.docs[0];
                }

                if (!existingContactDoc && cardData.email) {
                    const qEmail = query(collection(db, `${tenantPath}/contacts`), where("email", "==", cardData.email));
                    const snapEmail = await getDocs(qEmail);
                    if (!snapEmail.empty) existingContactDoc = snapEmail.docs[0];
                }

                const contactData: any = {
                    name: nameStr,
                    email: cardData.email || '',
                    source: rawSource,
                    stage: cardData.stage || 'In Progress',
                    lastUpdated: serverTimestamp(),
                    tags: Array.from(new Set([...(cardData.tags || [])])),
                    metaSenderId: metaId || null,
                    phone: phone || null,
                    kanbanCardId: cardData.id,
                    kanbanGroupId: cardData.groupId
                };

                const isGenericMetaName = (value: any) => {
                    const normalized = String(value || '').trim().toLowerCase();
                    if (!normalized) return true;
                    const isGenericKeyword = normalized === 'usuario meta' || 
                                             normalized === 'usuario' || 
                                             normalized === 'desconocido' ||
                                             normalized === 'instagram user' ||
                                             normalized === 'messenger user';
                    
                    const isSystemFallback = /^instagram [a-f0-9]+$/i.test(normalized) || 
                                             /^messenger [a-f0-9]+$/i.test(normalized) ||
                                             /^[a-z]+ [0-9]+$/i.test(normalized);
                    
                    return isGenericKeyword || isSystemFallback;
                };

                if (existingContactDoc) {
                    // UPDATE EXISTING: Guard real names from being overwritten by generics
                    const existingData = existingContactDoc.data();
                    if (isGenericMetaName(contactData.name) && !isGenericMetaName(existingData.name)) {
                        delete contactData.name;
                    }
                    
                    // Merge tags
                    contactData.tags = Array.from(new Set([...(existingData.tags || []), ...contactData.tags]));

                    await updateDoc(doc(db, `${tenantPath}/contacts`, existingContactDoc.id), contactData);
                    updatedCount++;
                } else {
                    // CREATE NEW
                    const newId = cardData.id; // Keep link to card
                    const finalData = {
                        ...contactData,
                        id: newId,
                        createdAt: serverTimestamp(),
                        date: new Date().toISOString().split('T')[0],
                        clientId: generateClientId(),
                        contactNumber: numberCursor++
                    };
                    await setDoc(doc(db, `${tenantPath}/contacts`, newId), sanitizeData(finalData));
                    importedCount++;
                }
            }

            setSyncStatus(`✅ Sincronización: ${importedCount} nuevos, ${updatedCount} actualizados.`);
            
            // Refresh View
            const querySnapshot = await getDocs(collection(db, `${getTenantPath()}/contacts`));
            const allContacts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRawContacts(allContacts);
            setContacts(processContacts(allContacts));
        } catch (error) {
            console.error('Error syncing contacts:', error);
            setSyncStatus(`❌ Error sincronizando.`);
        } finally {
            setIsSyncing(false);
        }
    };

    const [newContact, setNewContact] = useState({
        // Basic & Identity
        name: '', email: '', phone: '', source: 'Other', tags: [] as string[], stage: 'Prospecting',
        firstName: '', lastName: '', birthDate: '', gender: '' as 'man' | 'woman' | '', maritalStatus: 'single',
        nationality: '', birthCountry: '', birthCity: '', birthState: '', birthPlace: '', nationalId: '',

        // Address
        address: '', city: '', postalCode: '', state: '', country: '',
        usAddress: '',

        // Education
        schoolName: '', highSchoolProgram: '', universityName: '', profession: '',

        // Study Plans & Background
        studyReason: '', studyDuration: '', startSemester: '', preferredSchedule: '',
        destinationSchool: '', visaRejection: '',

        // Employment
        occupationData: '', currentEmployer: '', companyAddress: '', companyCity: '', companyPhone: '',
        monthlySalary: '', employmentStartDate: '', roleDescription: '', otherIncome: '', previousEmployment: '',

        // Passport & Visa
        passportNumber: '', passportIssueCountry: '', passportIssueCity: '', passportState: '',
        passportIssuedDate: '', passportExpiryDate: '', passportLost: 'no',
        hasTouristVisa: 'no', visaIssuedDate: '', visaExpiryDate: '',

        // Other
        hasOtherNationality: 'no', otherNationalityCountry: '', isPermanentResidentOther: 'no', permanentResidentCountry: '',
        spouseName: '', spouseBirthDate: '', marriageDate: '', spouseCity: '', spouseState: '', spouseCountry: '',

        // Family & Sponsor
        hasSponsor: 'no', sponsorFirstName: '', sponsorLastName: '', sponsorPhone: '', sponsorEmail: '', sponsorRelation: '',
        motherName: '', motherBirthDate: '', fatherName: '', fatherBirthDate: '',

        children: [] as any[],
        emergencyContacts: [] as any[],

        // Files
        documents: [] as any[],

        // Metadata
        clientType: 'persona' as 'persona' | 'empresa',
        interests: '', website: '',
        instagram: '', facebook: '', tiktok: '', linkedin: '', twitter: '',

        // Payment
        tdcNumber: '', tdcExpiry: '', tdcCvv: '', tddNumber: '', tddExpiry: '', tddCvv: '',
        serviceDetails: '', serviceType: '', paymentStatus: '', serviceStartDate: '', serviceDeliveryDate: '',
        backupLink: '', contractLink: '', invoiceLink: '',
        extraData: {} as any
    });

    const sanitizeData = (data: any) => {
        const sanitized = { ...data };
        Object.keys(sanitized).forEach(key => {
            if (sanitized[key] === undefined) {
                sanitized[key] = '';
            } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null && !Array.isArray(sanitized[key])) {
                sanitized[key] = sanitizeData(sanitized[key]);
            }
        });
        return sanitized;
    };

    const handleAddContact = async () => {
        try {
            const hasName = (newContact.name || '').trim();
            const hasNames = (newContact.firstName || '').trim() || (newContact.lastName || '').trim();

            if (!hasName && !hasNames) {
                toast.error("El nombre es requerido");
                return;
            }

            if (!newContact.phone) {
                toast.error("El teléfono es requerido");
                return;
            }

            // Auto-generate name from first/last if missing
            let finalName = hasName;
            if (!finalName && hasNames) {
                finalName = `${newContact.firstName || ''} ${newContact.lastName || ''}`.trim();
            }

            // Sanitize Phone
            const sanitizedPhone = normalizePhoneNumber(newContact.phone);

            // --- PREVENT DUPLICATES ---
            if (sanitizedPhone) {
                const hasDuplicate = contacts.some(c =>
                    c.phone && c.phone.replace(/[^\d+]/g, '') === sanitizedPhone
                );

                if (hasDuplicate) {
                    toast.error(`Ya existe un contacto con el número ${sanitizedPhone}`);
                    return;
                }
            }

            const contactToSave = { ...newContact, name: finalName, phone: sanitizedPhone };

            // Create contact in Firestore (let Firestore generate the ID)
            const contactRef = await addDoc(collection(db, `${getTenantPath()}/contacts`), {
                ...sanitizeData(contactToSave),
                createdAt: serverTimestamp(),
                lastUpdated: serverTimestamp()
            });

            // Get the auto-generated Firestore ID
            const contactId = contactRef.id;

            // Derive clientId from Firestore ID (same as CreateClientModal)
            const derivedClientId = `RY${contactId.substring(0, 5).toUpperCase()}`;

            // Reserve a sequential numeric ID (e.g. #000123)
            const contactNumber = await getNextContactNumber();

            // Update the contact with the clientId + numeric ID
            await updateDoc(contactRef, {
                clientId: derivedClientId,
                contactNumber: contactNumber
            });

            // Add to local state
            const createdContact = {
                id: contactId,
                ...contactToSave,
                clientId: derivedClientId,
                contactNumber: contactNumber,
                date: new Date().toISOString().split('T')[0]
            };

            setContacts(prev => {
                const newList = [createdContact, ...prev];
                const seenIds = new Set();
                return newList.filter(c => {
                    if (!c.id || seenIds.has(c.id)) return false;
                    seenIds.add(c.id);
                    return true;
                });
            });
            setRawContacts(prev => [createdContact, ...prev]);
            setIsAddModalOpen(false);
            setNewContact({
                name: '', email: '', phone: '', source: 'Other', tags: [], stage: 'Prospecting',
                firstName: '', lastName: '', birthDate: '', gender: '', maritalStatus: 'single',
                nationality: '', birthCountry: '', birthCity: '', birthState: '', birthPlace: '', nationalId: '',

                address: '', city: '', postalCode: '', state: '', country: '', usAddress: '',

                schoolName: '', highSchoolProgram: '', universityName: '', profession: '',

                studyReason: '', studyDuration: '', startSemester: '', preferredSchedule: '',
                destinationSchool: '', visaRejection: '',

                occupationData: '', currentEmployer: '', companyAddress: '', companyCity: '', companyPhone: '',
                monthlySalary: '', employmentStartDate: '', roleDescription: '', otherIncome: '', previousEmployment: '',

                passportNumber: '', passportIssueCountry: '', passportIssueCity: '', passportState: '',
                passportIssuedDate: '', passportExpiryDate: '', passportLost: 'no',
                hasTouristVisa: 'no', visaIssuedDate: '', visaExpiryDate: '',

                hasOtherNationality: 'no', otherNationalityCountry: '', isPermanentResidentOther: 'no', permanentResidentCountry: '',
                spouseName: '', spouseBirthDate: '', marriageDate: '', spouseCity: '', spouseState: '', spouseCountry: '',

                hasSponsor: 'no', sponsorFirstName: '', sponsorLastName: '', sponsorPhone: '', sponsorEmail: '', sponsorRelation: '',
                motherName: '', motherBirthDate: '', fatherName: '', fatherBirthDate: '', children: [],

                emergencyContacts: [], documents: [],
                clientType: 'persona', interests: '', website: '',
                instagram: '', facebook: '', tiktok: '', linkedin: '', twitter: '',
                tdcNumber: '', tdcExpiry: '', tdcCvv: '', tddNumber: '', tddExpiry: '', tddCvv: '',
                serviceDetails: '', serviceType: '', paymentStatus: '', serviceStartDate: '', serviceDeliveryDate: '',
                backupLink: '', contractLink: '', invoiceLink: '',
                extraData: {}
            });
        } catch (error) { toast.error("Error al guardar."); }
    };

    const handleSaveContact = async () => {
        if (!selectedContact) return;
        try {
            const sanitizedPhone = normalizePhoneNumber(selectedContact.phone);
            const contactToSave = { ...selectedContact, phone: sanitizedPhone };

            const contactRef = doc(db, `${getTenantPath()}/contacts`, selectedContact.id);
            await setDoc(contactRef, { ...sanitizeData(contactToSave), lastUpdated: serverTimestamp() }, { merge: true });

            if (sanitizedPhone) {
                // Update related cards in all groups (Iterative search to avoid collectionGroup index)
                for (const group of groups) {
                    const cardsRef = collection(db, `${getTenantPath()}/kanban-groups/${group.id}/cards`);
                    const q = query(cardsRef, where('contactNumber', '==', sanitizedPhone));
                    const cardsSnapshot = await getDocs(q);

                    for (const cardDoc of cardsSnapshot.docs) {
                        await updateDoc(cardDoc.ref, sanitizeData({
                            contactName: selectedContact.name,
                            email: selectedContact.email || '',
                            company: selectedContact.company || '',
                            city: selectedContact.city || '',
                            profession: selectedContact.profession || '',
                            lastUpdated: serverTimestamp()
                        }));
                    }
                }
            }
            toast.success('Perfil actualizado');
            setContacts(contacts.map(c => c.id === selectedContact.id ? selectedContact : c));
            setIsDetailModalOpen(false);
            setIsEditingProfile(false);
        } catch (error) { toast.error("Error al actualizar."); }
    };

    const handleOpenDetails = (contact: any) => {
        setSelectedContact(contact);
        setIsChatOpen(false);
        setIsDetailModalOpen(true);
        setIsEditingProfile(false);
    };

    const handleOpenChat = (contact: any) => {
        setIsDetailModalOpen(false);
        handleContactClick(contact);
    };

    const handleDeleteContact = async (id: string) => {
        setDeleteTarget({ type: 'single', id });
        setIsDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        try {
            const tenantPath = getTenantPath();
            if (!tenantPath) return;

            const deleteContactCascade = async (id: string) => {
                const contact = contacts.find(c => c.id === id);
                if (!contact) return;

                const phone = contact.phone;
                const metaId = contact.metaSenderId;
                const cleanPhone = phone?.replace(/\D/g, '');

                // 1. Delete Contact from CRM
                await deleteDoc(doc(db, `${tenantPath}/contacts`, id));

                // 2. Cascade Delete Kanban Cards
                const groupsSnap = await getDocs(collection(db, `${tenantPath}/kanban-groups`));
                for (const groupDoc of groupsSnap.docs) {
                    const cardsRef = collection(db, `${tenantPath}/kanban-groups/${groupDoc.id}/cards`);
                    
                    // Build queries for all possible identifiers
                    const queries = [
                        query(cardsRef, where('contactId', '==', id)),
                        query(cardsRef, where('crmId', '==', id))
                    ];
                    
                    if (phone) queries.push(query(cardsRef, where('contactNumber', '==', phone)));
                    if (cleanPhone) queries.push(query(cardsRef, where('contactNumberClean', '==', cleanPhone)));
                    if (metaId) {
                        queries.push(query(cardsRef, where('metaSenderId', '==', metaId)));
                        // Also check inside platform_ids
                        queries.push(query(cardsRef, where('platform_ids.messenger', '==', metaId)));
                        queries.push(query(cardsRef, where('platform_ids.instagram', '==', metaId)));
                        queries.push(query(cardsRef, where('platform_ids.whatsapp', '==', metaId)));
                    }

                    const snaps = await Promise.all(queries.map(q => getDocs(q)));
                    const cardRefs = Array.from(new Set(snaps.flatMap(s => s.docs.map(d => d.ref.path))))
                                         .map(path => doc(db, path));

                    if (cardRefs.length > 0) {
                        await Promise.all(cardRefs.map(ref => deleteDoc(ref)));
                        
                        // 3. Purge associated chat docs for these cards
                        for (const cardDoc of snaps.flatMap(s => s.docs)) {
                            const chatRef = doc(db, `${tenantPath}/chats/${cardDoc.id}`);
                            await deleteDoc(chatRef).catch(() => {}); // Chat might not exist
                        }
                    }
                }

                // 4. Purge Chat History by Platform ID (The main history doc)
                if (metaId) {
                    const chatRef = doc(db, `${tenantPath}/chats/${metaId}`);
                    await deleteDoc(chatRef).catch(() => {});
                    console.log(`[CRM] 💬 Purged main chat history for Meta ID: ${metaId}`);

                    // 5. Purge deduplication history
                    try {
                        const dedupRef = collection(db, `${tenantPath}/processed_messages`);
                        const q = query(dedupRef, where('senderId', '==', metaId));
                        const dedupPathSnap = await getDocs(q);
                        const batch = dedupPathSnap.docs.map(d => deleteDoc(d.ref));
                        await Promise.all(batch);
                        console.log(`[CRM] 🛡️ Purged deduplication history for Meta ID: ${metaId}`);
                    } catch (e) {
                        console.error("[CRM] Error purging dedup history:", e);
                    }
                }

                // 6. EXTRA SAFETY: Purge chat doc named after the contact ID itself
                const contactChatRef = doc(db, `${tenantPath}/chats/${id}`);
                await deleteDoc(contactChatRef).catch(() => {});
                
                // 7. BRUTE FORCE: If contact has a phone, purge that too
                if (contact.phone) {
                    const phoneChatRef = doc(db, `${tenantPath}/chats/${contact.phone}`);
                    await deleteDoc(phoneChatRef).catch(() => {});
                }

                console.log(`[CRM] 🏁 Full cascading delete completed for ${id}`);
            };

            if (deleteTarget.type === 'single' && deleteTarget.id) {
                await deleteContactCascade(deleteTarget.id);
                setContacts(prev => prev.filter(c => c.id !== deleteTarget.id));
                setSelectedContactIds(prev => prev.filter(id => id !== deleteTarget.id));
                toast.success("Contacto e historial eliminados por completo");
            } else if (deleteTarget.type === 'bulk') {
                setSyncStatus(`Eliminando ${selectedContactIds.length} contactos...`);
                for (const id of selectedContactIds) {
                    await deleteContactCascade(id);
                }
                setContacts(prev => prev.filter(c => !selectedContactIds.includes(c.id)));
                setSelectedContactIds([]);
                toast.success("Eliminación masiva completada con éxito");
            }

            setIsDeleteDialogOpen(false);
            setSyncStatus('');
        } catch (error) {
            console.error("Error in cascading delete:", error);
            toast.error("Error al realizar la eliminación total.");
            setSyncStatus('');
        }
    };

    const handleBulkDelete = async () => {
        if (selectedContactIds.length === 0) return;
        setDeleteTarget({ type: 'bulk' });
        setIsDeleteDialogOpen(true);
    };

    // Add a tag to every currently selected contact.
    const handleBulkAddTag = async () => {
        const tag = bulkTagValue.trim();
        if (!tag || selectedContactIds.length === 0) return;
        try {
            const tenantPath = getTenantPath();
            if (!tenantPath) return;
            const targets = contacts.filter(c => selectedContactIds.includes(c.id));
            const CHUNK = 450;
            for (let i = 0; i < targets.length; i += CHUNK) {
                const batch = writeBatch(db);
                targets.slice(i, i + CHUNK).forEach(c => {
                    const newTags = Array.from(new Set([...(c.tags || []), tag]));
                    batch.update(doc(db, `${tenantPath}/contacts`, c.id), { tags: newTags, lastUpdated: serverTimestamp() });
                });
                await batch.commit();
            }
            toast.success(`Etiqueta "${tag}" añadida a ${targets.length} contactos.`);
            setBulkTagValue('');
            setIsBulkTagOpen(false);
            setSelectedContactIds([]);
        } catch (e) {
            console.error('[CRM] Bulk tag error:', e);
            toast.error('Error al etiquetar contactos.');
        }
    };

    // Export contacts to an .xlsx file. Scope controls which set is exported.
    const handleExport = async (scope: 'all' | 'filtered' | 'selected' = 'filtered') => {
        try {
            let dataToExport: any[] = [];
            if (scope === 'all') dataToExport = contacts;
            else if (scope === 'selected') dataToExport = contacts.filter(c => selectedContactIds.includes(c.id));
            else dataToExport = filteredContacts;

            if (dataToExport.length === 0) {
                toast.error('No hay contactos para exportar.');
                return;
            }

            const XLSX = await import('xlsx');
            const rows = dataToExport.map(c => ({
                ID: formatContactNumber(c),
                'ID Interno': c.clientId || c.id || '',
                Nombre: c.name || '',
                Email: c.email || '',
                'Teléfono': c.phone || '',
                Fuente: c.source || '',
                Etapa: c.stage || '',
                Tags: Array.isArray(c.tags) ? c.tags.join(', ') : '',
                Ciudad: c.city || '',
                'País': c.country || '',
                'Profesión': c.profession || '',
                Pasaporte: c.passportNumber || c.passport || '',
                Nacionalidad: c.nationality || '',
                'Fecha de Creación': getDateString(c.createdAt) !== '---' ? getDateString(c.createdAt) : (c.date || ''),
            }));

            const worksheet = XLSX.utils.json_to_sheet(rows);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Contactos');
            const stamp = new Date().toISOString().split('T')[0];
            XLSX.writeFile(workbook, `contactos_${stamp}.xlsx`);
            toast.success(`${dataToExport.length} contactos exportados.`);
        } catch (e) {
            console.error('[CRM] Export error:', e);
            toast.error('Error al exportar.');
        }
    };

    const handleUpdateStage = (stage: string) => {
        if (!selectedContact) return;
        setSelectedContact({ ...selectedContact, stage });
    };

    const handleAddTag = () => {
        if (!newTag || !selectedContact) return;
        if (!selectedContact.tags.includes(newTag)) {
            setSelectedContact({ ...selectedContact, tags: [...selectedContact.tags, newTag] });
        }
        setNewTag('');
        setIsAddingTag(false);
    };

    const handleRemoveTag = (tagToRemove: string) => {
        if (!selectedContact) return;
        setSelectedContact({ ...selectedContact, tags: selectedContact.tags.filter((t: string) => t !== tagToRemove) });
    };

    // Navigation
    const router = useRouter();

    const handleContactClick = (contact: any) => {
        setSelectedContact(contact);
        const associatedCard = findCardForContact(contact);

        if (associatedCard) {
            setActiveCard(associatedCard);
            setIsChatOpen(true);
            setIsDetailModalOpen(false); // Mutual exclusivity
        } else {
            // If no card exists, valid strategy: 
            // 1. Option A: Create a temp card object (visual only)
            // 2. Option B: Create a real card in "New Leads" (automated) -> preferred for consistency?
            // For now, let's try to simulate a card or just confirm if we want to create one.
            // Simplified: If no card, we can't open the full chat history yet. 
            // We'll simulate a minimal card to allow sending a first message which might create it?
            // Actually, ConversationModal expects a real card usually.

            // Temporary Fallback: Create a mock card structure to allow modal to open
            // NOTE: Sending a message from here might require specific handling if ID doesn't exist in DB.
            const mockCard = {
                id: contact.id, // Use contact ID temporarily? Or generate new?
                contactName: contact.name,
                contactNumber: contact.phone,
                email: contact.email,
                groupId: groups[0]?.id, // Default to first group (usu. "New Leads")
                messages: [],
                notes: [],
                // Indicate this is virtual/mock
                isVirtual: true
            };
            setActiveCard(mockCard);
            setIsChatOpen(true);
            setIsDetailModalOpen(false); // Mutual exclusivity

            // Ideally: The user should send a template to start.
        }
    };

    const filteredContacts = contacts.filter(c => {
        const name = (c.name || '').toLowerCase();
        const email = (c.email || '').toLowerCase();
        const phone = (c.phone || '').replace(/\D/g, '');
        const query = searchQuery.toLowerCase();

        const id = (c.id || '').toLowerCase();
        const source = (c.source || '').toLowerCase();
        const phoneRaw = (c.phone || '').replace(/\D/g, '');
        const queryDigits = query.replace(/\D/g, '');

        const matchesSearch = !query ||
            name.includes(query) ||
            email.includes(query) ||
            phoneRaw.includes(queryDigits || query) ||
            (c.phone || '').toLowerCase().includes(query) ||
            id.includes(query) ||
            source.includes(query);

        const matchesStage = selectedStages.length === 0 || selectedStages.includes(c.stage);
        const matchesSource = selectedSources.length === 0 || selectedSources.includes(c.source);
        const matchesTags = selectedTags.length === 0 || (c.tags && c.tags.some((tag: string) => selectedTags.includes(tag)));
        const matchesView = currentView === 'all' || c.stage === currentView;

        return matchesSearch && matchesStage && matchesSource && matchesTags && matchesView;
    });

    const availableStages = Array.from(new Set(contacts.map(c => c.stage).filter(Boolean)));
    const availableSources = Array.from(new Set(contacts.map(c => c.source).filter(Boolean)));
    const availableTags = Array.from(new Set(contacts.flatMap(c => c.tags || []).filter(Boolean)));
    const activeFiltersCount = selectedStages.length + selectedSources.length + selectedTags.length;

    return (
        <div className="flex min-h-screen overflow-y-auto md:h-screen md:overflow-hidden bg-black text-white selection:bg-blue-500/30 font-sans">


            <div className="flex-1 flex flex-col min-w-0 bg-[#050505]">
                {/* Enterprise Header Bar (Metrics) */}
                <div className="min-h-16 border-b border-white/5 bg-black/50 backdrop-blur-md flex items-center justify-between px-4 sm:px-8 z-20 shrink-0 overflow-x-auto no-scrollbar">
                    <div className="flex items-center gap-4 sm:gap-8 min-w-max py-4 sm:py-0">
                        <div className="flex flex-col">
                            <span className="text-[9px] sm:text-[10px] font-medium text-neutral-500 uppercase tracking-widest">Total Database</span>
                            <span className="text-lg sm:text-xl font-medium text-white">{contacts.length}</span>
                        </div>
                        <div className="h-8 w-px bg-white/10" />
                        <div className="flex flex-col">
                            <span className="text-[9px] sm:text-[10px] font-medium text-neutral-500 uppercase tracking-widest">Active Leads</span>
                            <span className="text-lg sm:text-xl font-medium text-blue-500">{contacts.filter(c => c.stage === 'In Progress').length}</span>
                        </div>
                        <div className="h-8 w-px bg-white/10" />
                        <div className="flex flex-col">
                            <span className="text-[9px] sm:text-[10px] font-medium text-neutral-500 uppercase tracking-widest">Conversion</span>
                            <span className="text-lg sm:text-xl font-medium text-emerald-500">{contacts.length > 0 ? Math.round((contacts.filter(c => c.stage === 'Closed').length / contacts.length) * 100) : 0}%</span>
                        </div>
                    </div>

                    <div className="hidden sm:flex items-center gap-3">
                        <div className="px-3 py-1.5 rounded-md bg-neutral-900 border border-neutral-800 flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">System Live</span>
                        </div>
                    </div>
                </div>

                <main className="flex-1 overflow-y-auto scrollbar-hide custom-scrollbar p-4 sm:p-8 space-y-6 sm:space-y-8">
                    <ContactHeader
                        isChatOpen={isChatOpen}
                        handleSynckambanContacts={handleSyncWhatsAppContacts}
                        isSyncing={isSyncing}
                        isImportModalOpen={isImportModalOpen}
                        setIsImportModalOpen={setIsImportModalOpen}
                        onImportDrop={onImportDrop}
                        isAddModalOpen={isAddModalOpen}
                        setIsAddModalOpen={setIsAddModalOpen}
                        newContact={newContact}
                        setNewContact={setNewContact}
                        handleAddContact={handleAddContact}
                        setIsDuplicateManagerOpen={setIsDuplicateManagerOpen}
                        handleExport={handleExport}
                        selectedCount={selectedContactIds.length}
                        filteredCount={filteredContacts.length}
                    />

                    {syncStatus && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-4 bg-blue-600/10 border border-blue-500/30 rounded-lg text-blue-400 font-medium text-sm flex justify-between items-center"
                        >
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                                {syncStatus}
                            </div>
                            <button
                                onClick={() => setSyncStatus('')}
                                className="p-1 hover:bg-blue-500/10 rounded transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </motion.div>
                    )}



                    <ContactFilters
                        isChatOpen={isChatOpen}
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        viewMode={viewMode}
                        setViewMode={setViewMode}
                        isFilterOpen={isFilterOpen}
                        setIsFilterOpen={setIsFilterOpen}
                        activeFiltersCount={activeFiltersCount}
                        clearAllFilters={() => { setSelectedStages([]); setSelectedSources([]); setSelectedTags([]); }}
                        availableStages={availableStages}
                        selectedStages={selectedStages}
                        setSelectedStages={setSelectedStages}
                        availableSources={availableSources}
                        selectedSources={selectedSources}
                        setSelectedSources={setSelectedSources}
                        availableTags={availableTags}
                        selectedTags={selectedTags}
                        setSelectedTags={setSelectedTags}
                        filteredCount={filteredContacts.length}
                        selectedCount={selectedContactIds.length}
                        handleBulkDelete={handleBulkDelete}
                        openBulkTag={() => setIsBulkTagOpen(true)}
                        currentView={currentView}
                        setCurrentView={setCurrentView}
                    />

                    {isLoadingContacts ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="text-center">
                                <RefreshCw className="w-10 h-10 text-neutral-700 animate-spin mx-auto mb-4" />
                                <p className="text-neutral-500 font-medium text-xs uppercase tracking-widest">Consulting Core Database...</p>
                            </div>
                        </div>
                    ) : (
                        <AnimatePresence mode="wait">
                            {viewMode === 'list' ? (
                                <ContactList
                                    key="list"
                                    contacts={filteredContacts}
                                    containerVariants={containerVariants}
                                    itemVariants={itemVariants}
                                    isChatOpen={isChatOpen}
                                    handleContactClick={handleOpenChat}
                                    setSelectedContact={setSelectedContact}
                                    setIsDetailModalOpen={setIsDetailModalOpen}
                                    handleOpenDetails={handleOpenDetails}
                                    setIsEditingProfile={setIsEditingProfile}
                                    handleDeleteContact={handleDeleteContact}
                                    selectedContactIds={selectedContactIds}
                                    setSelectedContactIds={setSelectedContactIds}
                                    formatContactNumber={formatContactNumber}
                                    getDateString={getDateString}
                                />
                            ) : (
                                <ContactGrid
                                    key="grid"
                                    contacts={filteredContacts}
                                    containerVariants={containerVariants}
                                    itemVariants={itemVariants}
                                    handleContactClick={handleOpenChat}
                                    setSelectedContact={setSelectedContact}
                                    setIsDetailModalOpen={setIsDetailModalOpen}
                                    handleOpenDetails={handleOpenDetails}
                                    setIsEditingProfile={setIsEditingProfile}
                                    handleDeleteContact={handleDeleteContact}
                                    selectedContactIds={selectedContactIds}
                                    setSelectedContactIds={setSelectedContactIds}
                                    formatContactNumber={formatContactNumber}
                                    getDateString={getDateString}
                                />
                            )}
                        </AnimatePresence>
                    )}
                </main>
            </div>

            <ConversationModal
                key={selectedContact?.id || 'no-contact'}
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                card={selectedContact ? {
                    id: `temp-${selectedContact.id}`, // Temporary ID until real Kanban card is found
                    contactName: selectedContact.name || `${selectedContact.firstName || ''} ${selectedContact.lastName || ''}`.trim() || 'Sin nombre',
                    contactNumber: selectedContact.phone || selectedContact.metaSenderId || '',
                    metaSenderId: selectedContact.metaSenderId || null,
                    crmId: selectedContact.id,
                } : null}
                groups={[]}
                allConversations={contacts.map(c => ({ id: c.id, contactName: c.name, contactNumber: c.phone }))}
                onSelectConversation={(partial) => {
                    const fullContact = contacts.find(c => c.id === partial.id);
                    if (fullContact) {
                        setSelectedContact(fullContact);
                    }
                }}
                isGlobalContact={true}
                stats={{
                    totalConversations: contacts.length,
                    totalGroups: 0
                }}
                hideInternalTray={false}
                hideSidebar={true}
            />

            <ContactDetailsModal
                isOpen={isDetailModalOpen}
                onOpenChange={setIsDetailModalOpen}
                selectedContact={selectedContact}
                setSelectedContact={setSelectedContact}
                isEditingProfile={isEditingProfile}
                setIsEditingProfile={setIsEditingProfile}
                handleSaveContact={handleSaveContact}
                handleUpdateStage={handleUpdateStage}
                handleRemoveTag={handleRemoveTag}
                handleAddTag={handleAddTag}
                newTag={newTag}
                setNewTag={setNewTag}
                isAddingTag={isAddingTag}
                setIsAddingTag={setIsAddingTag}
                getDateString={getDateString}
                getDateInputValue={getDateInputValue}
                getAge={getAge}
                formatContactNumber={formatContactNumber}
                handleOpenChat={handleOpenChat}
            />

            <DuplicateManager
                isOpen={isDuplicateManagerOpen}
                onClose={() => setIsDuplicateManagerOpen(false)}
                contacts={rawContacts}
                onContactsUpdated={(updated) => {
                    setRawContacts(updated);
                    setContacts(processContacts(updated));
                }}
            />

            <DeleteConfirmationDialog
                isOpen={isDeleteDialogOpen}
                onClose={() => setIsDeleteDialogOpen(false)}
                onConfirm={confirmDelete}
                title={deleteTarget.type === 'single' ? 'Eliminar Contacto' : 'Eliminar Múltiples Contactos'}
                description={
                    deleteTarget.type === 'single'
                        ? 'Esta acción es permanente y no se puede deshacer. Todos los datos asociados a este contacto serán eliminados.'
                        : 'Esta acción es permanente y no se puede deshacer. Todos los datos asociados a estos contactos serán eliminados.'
                }
                itemCount={deleteTarget.type === 'bulk' ? selectedContactIds.length : 1}
            />

            <Dialog open={isBulkTagOpen} onOpenChange={setIsBulkTagOpen}>
                <DialogContent className="bg-[#0a0a0a] border-white/5 text-white sm:max-w-md rounded-[2rem] p-6 backdrop-blur-3xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold tracking-tight uppercase text-white">Etiquetar selección</DialogTitle>
                        <DialogDescription className="text-neutral-500 font-medium text-sm">
                            Añade una etiqueta a los {selectedContactIds.length} contactos seleccionados.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-3">
                        <Input
                            autoFocus
                            value={bulkTagValue}
                            onChange={(e) => setBulkTagValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleBulkAddTag()}
                            placeholder="Nombre de la etiqueta..."
                            className="h-12 bg-white/5 border-white/10 rounded-xl px-4 text-sm font-medium"
                        />
                        {availableTags.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {availableTags.slice(0, 12).map(tag => (
                                    <button
                                        key={tag}
                                        onClick={() => setBulkTagValue(tag)}
                                        className="px-3 py-1.5 bg-white/5 hover:bg-blue-600/20 border border-white/10 hover:border-blue-500/50 text-[10px] uppercase tracking-wider font-medium rounded-full transition-all"
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <DialogFooter className="flex flex-col sm:flex-row gap-2">
                        <Button variant="ghost" onClick={() => setIsBulkTagOpen(false)} className="text-neutral-400 hover:text-white rounded-xl px-6 w-full sm:w-auto">Cancelar</Button>
                        <Button onClick={handleBulkAddTag} disabled={!bulkTagValue.trim()} className="bg-blue-600 hover:bg-blue-500 px-8 rounded-xl font-bold shadow-lg shadow-blue-600/20 w-full sm:w-auto uppercase tracking-widest text-[10px] disabled:opacity-40">
                            Aplicar etiqueta
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

