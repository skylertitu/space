import React, { useState, useRef, useEffect, useMemo } from 'react';
import { MoreVertical, Send, Mail, Smile, Image as ImageIcon, FileText, Loader2, User, XCircle, Ban, Mic, X, Plus, ChevronLeft, Bot, Hand, Zap, RefreshCw, AlertCircle, ExternalLink, MousePointer2, List } from 'lucide-react';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { useConversationLogic } from '../../whatsapp/components/ConversationModal/hooks/useConversationLogic';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { doc, updateDoc, Timestamp, collection, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { getContactHeaderNames, getContactPhoneDisplay } from '@/lib/omnichannel/contactHeaderInfo';
import { isHumanTakeoverActive } from '@/lib/omnichannel/humanTakeover';
import { CountryFlag } from '@/components/CountryFlag';
import { groupMessagesByDate } from '../../whatsapp/components/ConversationModal/utils';
import { isBroadcastTemplatePlaceholder } from '@/app/home/[entityId]/cmo/broadcast/list/lib/resolveBroadcastMessageText';

interface ChatAreaProps {
    card: any;
    groups: any[];
    groupName: string;
    allConversations: any[];
    onBack?: () => void;
    /** When set, colors broadcast vs manual agent vs client replies distinctly. */
    messageColorMode?: 'broadcast';
    /** Explicit tenant path for multi-tenant slug routes. */
    tenantPath?: string;
    /** Full merged history for broadcast results (bypasses thin subscription). */
    messagesOverride?: unknown[];
}

function isBroadcastMessage(msg: any): boolean {
    if (
        msg?.metadata?.source === 'broadcast' ||
        msg?.source === 'broadcast' ||
        msg?.isBroadcast === true
    ) {
        return true;
    }
    return isBroadcastTemplatePlaceholder(String(msg?.text || ''));
}

function isAgentMessage(msg: any): boolean {
    return msg?.sender === 'agent';
}

function isUserMessage(msg: any): boolean {
    return msg?.sender === 'user';
}

function displayMessageText(msg: any): string {
    return String(msg?.text || '');
}

function getChatBubbleClasses(msg: any, messageColorMode?: 'broadcast'): string {
    const base = 'px-3.5 py-2 rounded-2xl relative font-normal';
    if (isAgentMessage(msg)) {
        if (isBroadcastMessage(msg)) {
            return `${base} bg-violet-600 text-white rounded-br-none shadow-lg shadow-violet-900/25`;
        }
        if (messageColorMode === 'broadcast') {
            return `${base} bg-blue-600 text-white rounded-br-none shadow-lg`;
        }
        return `${base} bg-blue-600 text-white rounded-br-none shadow-lg`;
    }
    if (messageColorMode === 'broadcast' && !isAgentMessage(msg)) {
        return `${base} bg-white text-neutral-900 rounded-bl-none shadow-sm`;
    }
    return `${base} bg-[#1e1e1e] text-neutral-200 rounded-bl-none shadow-sm shadow-black/50`;
}

export default function ChatArea({ card, groups, groupName, allConversations, onBack, messageColorMode, tenantPath, messagesOverride }: ChatAreaProps) {
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [showAttachments, setShowAttachments] = useState(false);
    const [takeoverLoading, setTakeoverLoading] = useState(false);
    const moreMenuRef = useRef<HTMLDivElement>(null);
    const attachmentsRef = useRef<HTMLDivElement>(null);
    const mediaInputRef = useRef<HTMLInputElement>(null);
    const docInputRef = useRef<HTMLInputElement>(null);

    // --- Audio Recording State --- //
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<BlobPart[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const formatRecordingTime = (seconds: number) => {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const startRecording = async () => {
        if (!isHumanTakeoverActive(logic.liveCardData || card) || logic.liveCardData?.isBlocked) return;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunksRef.current.push(event.data);
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const audioFile = new File([audioBlob], `Audio-${Date.now()}.webm`, { type: 'audio/webm' });


                logic.setSelectedFile(audioFile);
                logic.setFilePreviewUrl(URL.createObjectURL(audioFile));

                // stream.getTracks().forEach(track => track.stop());
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
            setRecordingTime(0);
            timerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
        } catch (error) {
            console.error('Error al acceder al micrófono:', error);
            toast.error('No se pudo acceder al micrófono para grabar.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            if (timerRef.current) clearInterval(timerRef.current);
        }
    };

    const cancelRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            audioChunksRef.current = []; // Discard
            setIsRecording(false);
            if (timerRef.current) clearInterval(timerRef.current);
        }
    };

    const { currentUser, activeEntity, activeEntityRoute } = useAuth();

    // Close menus when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
                setShowMoreMenu(false);
            }
            if (attachmentsRef.current && !attachmentsRef.current.contains(event.target as Node)) {
                setShowAttachments(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const logic = useConversationLogic({
        isOpen: true,
        onClose: () => { },
        card: card,
        groupName: groupName,
        groups: groups,
        allConversations: allConversations,
        tenantPath,
        messagesOverride,
    });

    // Reset unread ONLY when the user actively opens a different conversation (card?.id changes).
    // card?.unreadCount and liveCardData?.unreadCount are intentionally excluded from deps:
    // if the user already has the chat open, new messages should still show the unread badge
    // until they scroll down or re-open the conversation.
    // The window-focus listener is removed for the same reason — focusing the browser window
    // should not silently clear unread counts.
    useEffect(() => {
        const groupId = logic.liveCardData?.groupId || card?.groupId;
        const cardId = card?.id;
        const uid = currentUser?.uid;
        const entity = activeEntity;
        const unreadCount = logic.liveCardData?.unreadCount || card?.unreadCount || 0;

        if (!cardId || !groupId || !uid || !entity || unreadCount === 0) return;

        const cardRef = doc(db, `users/${uid}/entities/${entity}/kanban-groups/${groupId}/cards/${cardId}`);
        updateDoc(cardRef, { unreadCount: 0, lastReadAt: Timestamp.now() }).catch((err: any) => {
            if (err.code !== 'not-found' && !err.message?.includes('No document')) {
                console.error("[ChatArea] Error clearing unread count:", err);
            }
        });
    }, [card?.id, card?.groupId, logic.liveCardData?.groupId, logic.liveCardData?.unreadCount, currentUser?.uid, activeEntity]);

    const [integrationStatus, setIntegrationStatus] = useState<string | null>(null);

    // Fetch current integration status
    useEffect(() => {
        if (!currentUser || !activeEntity || !card) return;
        const source = (card.channel || card.source || card.primary_channel || '').toLowerCase();
        let provider = source.includes('messenger') ? 'messenger' : 
                       source.includes('instagram') ? 'instagram' :
                       source.includes('whatsapp') ? 'whatsapp' : source;
        
        if (provider === 'whatsapp' && !integrationStatus) {
            // Check both possible WhatsApp IDs
            const integrationsRef = collection(db, `users/${currentUser.uid}/entities/${activeEntity}/integrations`);
            const unsubscribe = onSnapshot(integrationsRef, (snapshot) => {
                const wa = snapshot.docs.find(d => d.id === 'whatsapp' || d.id === 'whatsapp_internal');
                if (wa) setIntegrationStatus(wa.data().status);
            });
            return () => unsubscribe();
        } else if (provider) {
            const integrationRef = doc(db, `users/${currentUser.uid}/entities/${activeEntity}/integrations/${provider}`);
            const unsubscribe = onSnapshot(integrationRef, (docSnap) => {
                if (docSnap.exists()) {
                    setIntegrationStatus(docSnap.data().status);
                }
            });
            return () => unsubscribe();
        }
    }, [card?.id, currentUser?.uid, activeEntity]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (logic.messagesEndRef.current) {
            logic.messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
        }
    }, [card?.id, logic.liveCardData?.messages?.length]);

    const liveCard = logic.liveCardData || card;
    const { whatsappName, botName } = getContactHeaderNames(liveCard);
    const contactName = whatsappName;
    const displayInitial = (botName || whatsappName).charAt(0).toUpperCase();

    const phoneDisplay = useMemo(
        () => getContactPhoneDisplay(liveCard),
        [
            liveCard?.contactNumber,
            liveCard?.contactNumberClean,
            liveCard?.phone,
            liveCard?.channel,
            liveCard?.source,
            liveCard?.primary_channel,
        ]
    );

    const groupedMessages = useMemo(
        () => groupMessagesByDate(logic.resolvedMessages as any[]),
        [logic.resolvedMessages]
    );

    const handleSelectFile = (file: File | null | undefined) => {
        if (!file) return;
        if (logic.filePreviewUrl) URL.revokeObjectURL(logic.filePreviewUrl);
        logic.setSelectedFile(file);
        logic.setFilePreviewUrl(URL.createObjectURL(file));
    };

    const handleMediaFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        handleSelectFile(e.target.files?.[0]);
        e.target.value = '';
        setShowAttachments(false);
    };

    const handleDocFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        handleSelectFile(e.target.files?.[0]);
        e.target.value = '';
        setShowAttachments(false);
    };

    const humanControl = isHumanTakeoverActive(logic.liveCardData || card);
    const inputDisabled = logic.liveCardData?.isBlocked || !humanControl;

    const getCardRef = () => {
        const groupId = logic.liveCardData?.groupId || card?.groupId;
        const cardId = card?.id;
        if (!currentUser?.uid || !activeEntity || !groupId || !cardId) return null;
        return doc(db, `users/${currentUser.uid}/entities/${activeEntity}/kanban-groups/${groupId}/cards/${cardId}`);
    };

    const handleTakeover = async () => {
        const cardRef = getCardRef();
        if (!cardRef || !currentUser) return;
        setTakeoverLoading(true);
        try {
            await updateDoc(cardRef, {
                humanTakeover: {
                    active: true,
                    activatedAt: Timestamp.now(),
                    activatedBy: currentUser.uid,
                    activatedByName: currentUser.displayName || currentUser.email || 'Agente',
                },
            });
            toast.success('Tomaste el control del chat');
        } catch (err) {
            console.error('[ChatArea] Takeover error:', err);
            toast.error('No se pudo tomar el chat');
        } finally {
            setTakeoverLoading(false);
        }
    };

    const handleReleaseBot = async () => {
        const cardRef = getCardRef();
        if (!cardRef || !currentUser) return;
        setTakeoverLoading(true);
        try {
            await updateDoc(cardRef, {
                'humanTakeover.active': false,
                'humanTakeover.releasedAt': Timestamp.now(),
                'humanTakeover.releasedBy': currentUser.uid,
            });
            toast.success('El bot retomará la conversación');
        } catch (err) {
            console.error('[ChatArea] Release bot error:', err);
            toast.error('No se pudo devolver el chat al bot');
        } finally {
            setTakeoverLoading(false);
        }
    };

    const handleCloseConversation = async () => {
        if (!card?.id || !currentUser?.uid || !activeEntity) return;

        const isConfirmed = window.confirm("¿Estás seguro de que deseas eliminar permanentemente esta conversación? Esta acción no se puede deshacer.");
        if (!isConfirmed) return;

        const loadingToast = toast.loading("Eliminando conversación...");

        try {
            const tenantPath = `users/${currentUser.uid}/entities/${activeEntity}`;

            // 1. Direct Deletion (using prop groupId)
            const directCardRef = doc(db, `${tenantPath}/kanban-groups/${card.groupId}/cards/${card.id}`);
            const { deleteDoc, getDocs, collection } = await import('firebase/firestore');
            await deleteDoc(directCardRef);

            // 2. Brute Force Search (Safety Net)
            const groupsSnap = await getDocs(collection(db, `${tenantPath}/kanban-groups`));
            const deletePromises: Promise<any>[] = [];

            const cleanPhone = card.contactNumberClean || card.contactNumber?.replace(/\D/g, '');

            for (const groupDoc of groupsSnap.docs) {
                const cardsRef = collection(db, `${tenantPath}/kanban-groups/${groupDoc.id}/cards`);
                const cardsSnap = await getDocs(cardsRef);

                cardsSnap.docs.forEach(cDoc => {
                    const data = cDoc.data();
                    const cPhone = data.contactNumberClean || data.contactNumber?.replace(/\D/g, '');

                    if (cDoc.id === card.id || (cleanPhone && cPhone === cleanPhone)) {
                        deletePromises.push(deleteDoc(cDoc.ref));
                    }
                });
            }

            await Promise.all(deletePromises);

            toast.success('Conversación eliminada de todas las carpetas.', { id: loadingToast });
            setShowMoreMenu(false);
        } catch (error) {
            console.error("Error deleting conversation: ", error);
            toast.error('Hubo un error al intentar eliminar la conversación.', { id: loadingToast });
        }
    };

    const handleBlockContact = () => {
        logic.handleToggleBlock();
        setShowMoreMenu(false);
    };

    const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const items = Array.from(event.clipboardData?.items || []);
        const imageItem = items.find(item => item.type.startsWith('image/'));

        if (!imageItem) return;

        const file = imageItem.getAsFile();
        if (!file) return;

        event.preventDefault();

        if (logic.filePreviewUrl) {
            URL.revokeObjectURL(logic.filePreviewUrl);
        }

        logic.setSelectedFile(file);
        logic.setFilePreviewUrl(URL.createObjectURL(file));
    };

    const getMessageAttachment = (msg: any) => {
        const metadata = msg?.metadata || {};
        const attachments = Array.isArray(metadata.attachments) ? metadata.attachments : [];
        const firstAttachment = attachments[0] || null;

        const fileUrl =
            msg?.fileUrl ||
            msg?.attachmentUrl ||
            msg?.mediaUrl ||
            msg?.url ||
            metadata?.url ||
            metadata?.fileUrl ||
            firstAttachment?.url ||
            firstAttachment?.payload?.url ||
            null;

        const rawType =
            msg?.fileType ||
            msg?.type ||
            metadata?.mimeType ||
            metadata?.fileType ||
            firstAttachment?.mimeType ||
            firstAttachment?.type ||
            '';

        const normalizedType =
            rawType?.startsWith?.('image/') ? rawType :
            rawType === 'image' ? 'image/*' :
            rawType === 'video' ? 'video/*' :
            rawType === 'audio' ? 'audio/*' :
            rawType === 'file' || rawType === 'document' ? 'application/octet-stream' :
            rawType || '';

        const fileName =
            msg?.fileName ||
            metadata?.filename ||
            metadata?.fileName ||
            firstAttachment?.name ||
            (normalizedType.startsWith('image/') ? 'Imagen' : 'Archivo');

        return {
            fileUrl,
            fileType: normalizedType,
            fileName
        };
    };

    const source = (card.channel || card.source || card.primary_channel || '').toLowerCase();

    return (
        <div className="flex-1 flex flex-col h-full relative">

            {/* Header */}
            <div className="min-h-14 py-2.5 border-b border-neutral-800 bg-[#111] flex items-center justify-between px-3 flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    {onBack && (
                        <button 
                            onClick={onBack}
                            className="md:hidden p-2 -ml-1 text-blue-500 hover:bg-blue-500/10 rounded-full transition-all active:scale-90 flex-shrink-0"
                        >
                            <ChevronLeft size={24} />
                        </button>
                    )}
                    {(() => {
                        const photoUrl = card?.photoUrl || card?.profilePictureUrl || card?.profilePicUrl || card?.avatarUrl || card?.picture || card?.photo || card?.profilePic || null;
                        return (
                            <div className="w-12 h-12 bg-[#26282e] border border-neutral-700/60 rounded-full flex items-center justify-center font-bold text-white text-lg shadow-sm flex-shrink-0 overflow-hidden relative">
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
                                    {displayInitial}
                                </span>
                            </div>
                        );
                    })()}
                    <div className="min-w-0 flex flex-col gap-1">
                        <div className="flex items-baseline gap-x-2 gap-y-0.5 min-w-0 flex-wrap">
                            <h2 className="font-semibold text-white tracking-tight text-[15px] leading-tight truncate">
                                {whatsappName}
                            </h2>
                            <span className="text-neutral-600 text-[12px] leading-none flex-shrink-0">|</span>
                            {botName ? (
                                <span
                                    className="text-[14px] text-sky-300/95 font-medium leading-tight truncate"
                                    title="Nombre indicado en la conversación"
                                >
                                    {botName}
                                </span>
                            ) : (
                                <span className="text-[13px] text-neutral-500 italic leading-tight truncate">
                                    En espera del nombre
                                </span>
                            )}
                        </div>

                        {phoneDisplay ? (
                            <div className="flex items-center gap-1.5 min-w-0 text-[11px] leading-none">
                                <CountryFlag iso={phoneDisplay.iso} country={phoneDisplay.country} size="sm" />
                                <span className="text-neutral-300 truncate">{phoneDisplay.country}</span>
                                <span className="text-neutral-600 flex-shrink-0">·</span>
                                <span className="text-neutral-500 font-mono truncate">{phoneDisplay.formatted}</span>
                            </div>
                        ) : null}

                        {(liveCard?.presence === 'typing' || liveCard?.presence === 'recording') && (
                            <div className="flex items-center text-[10px] text-blue-400 min-h-[14px]">
                                {liveCard?.presence === 'typing' ? (
                                    <span className="italic animate-pulse font-medium">Escribiendo...</span>
                                ) : (
                                    <span className="italic animate-pulse font-medium flex items-center gap-1">
                                        <Mic size={10} /> Grabando audio...
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center space-x-1 text-neutral-500">
                    <button className="p-1.5 hover:bg-neutral-800 rounded transition-colors" title="Mark as Unread">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    </button>
                    <div className="relative" ref={moreMenuRef}>
                        <button
                            onClick={() => setShowMoreMenu(!showMoreMenu)}
                            className={`p-2 transition-colors rounded-md ${showMoreMenu ? 'text-white bg-neutral-800' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
                            title="More Actions"
                        >
                            <MoreVertical size={20} />
                        </button>

                        {/* More Menu Popover */}
                        {showMoreMenu && (
                            <div className="absolute top-full right-0 mt-2 w-52 bg-neutral-900 border border-neutral-800 rounded-lg shadow-2xl z-[70] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                <div className="p-1">
                                    <button
                                        className="w-full flex items-center px-3 py-2.5 text-xs text-neutral-300 hover:bg-neutral-800 transition-colors rounded-md group text-left"
                                        onClick={handleCloseConversation}
                                    >
                                        <XCircle size={14} className="mr-3 text-neutral-500 group-hover:text-yellow-500" />
                                        Finalizar Conversación
                                    </button>
                                    <button
                                        className={`w-full flex items-center px-3 py-2.5 text-xs transition-colors rounded-md group text-left ${logic.liveCardData?.isBlocked ? 'text-green-400 hover:bg-green-500/10' : 'text-red-400 hover:bg-red-500/10'}`}
                                        onClick={handleBlockContact}
                                    >
                                        <Ban size={14} className={`mr-3 group-hover:text-current ${logic.liveCardData?.isBlocked ? 'text-green-500' : 'text-red-500'}`} />
                                        {logic.liveCardData?.isBlocked ? 'Desbloquear Contacto' : 'Bloquear Contacto'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Connectivity Status Banner */}
            {integrationStatus && integrationStatus !== 'Connected' && integrationStatus !== 'Internal' && (
                <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between group animate-in slide-in-from-top duration-300">
                    <div className="flex items-center gap-2">
                        <AlertCircle size={14} className="text-amber-500 animate-pulse" />
                        <span className="text-[10px] font-bold text-amber-500/80 uppercase tracking-widest">
                            Conexión Recalibrándose — El canal podría estar offline
                        </span>
                    </div>
                    <button 
                        onClick={() => window.open(`/home/${activeEntityRoute || activeEntity}/cto/integrations`, '_blank')}
                        className="text-[9px] font-black underline uppercase text-amber-500 hover:text-amber-400 transition-colors"
                    >
                        Ver Integraciones <ExternalLink size={10} className="inline ml-1" />
                    </button>
                </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 bg-[#0a0a0a] space-y-3 no-scrollbar">
                {Object.entries(groupedMessages).map(([date, msgs], dateIdx) => (
                    <React.Fragment key={date}>
                        <div className="text-center text-[10px] text-neutral-600 my-4 uppercase tracking-widest font-normal opacity-60">{date}</div>

                        {(msgs as any[]).map((msg: any, msgIdx: number) => {
                            const prevMsg = (msgs as any[])[msgIdx - 1];
                            const EXPIRE_THRESHOLD = 48 * 60 * 60 * 1000; // 48 hours
                            const attachment = getMessageAttachment(msg);
                            const isAgentButtons = msg.sender === 'agent' && (msg.type === 'buttons' || msg.type === 'quick_reply');
                            const isAgentList = msg.sender === 'agent' && msg.type === 'list';
                            const isAgentMedia = msg.sender === 'agent' && (
                                msg.type === 'media' ||
                                msg.type === 'image' ||
                                msg.type === 'video' ||
                                msg.type === 'audio' ||
                                msg.type === 'document'
                            );
                            const shouldRenderPlainText = !!msg.text && !isAgentButtons && !isAgentList && !isAgentMedia;

                            const showGapMarker = prevMsg && msg.timestamp?.toDate && prevMsg.timestamp?.toDate &&
                                (msg.timestamp.toDate().getTime() - prevMsg.timestamp.toDate().getTime() > EXPIRE_THRESHOLD);

                            const isEmail = source.includes('gmail');

                            return (
                                <React.Fragment key={msgIdx}>
                                    {showGapMarker && (
                                        <div className="flex justify-center my-6">
                                            <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] px-4 py-1.5 rounded-full font-normal uppercase tracking-widest shadow-lg backdrop-blur-sm">
                                                No hubo respuesta y terminó la conversación
                                            </div>
                                        </div>
                                    )}
                                    <div className={`flex ${msg.sender === 'agent' ? 'justify-end' : 'justify-start'} mb-1`}>
                                        {msg.sender !== 'agent' && (
                                            <div className="w-8 h-8 rounded-full bg-neutral-800 mr-2 flex-shrink-0 self-end mb-1 flex items-center justify-center text-[11px] font-normal text-neutral-400 border border-white/5 shadow-inner">
                                                {contactName.charAt(0).toUpperCase()}
                                            </div>
                                        )}

                                        <div className={`${isEmail ? 'max-w-[90%]' : 'max-w-[75%]'} group ${msg.sender === 'agent' ? 'flex flex-col items-end' : 'flex flex-col items-start'}`}>
                                            
                                            {/* Specialized Email Card Design (Incoming & Outgoing) */}
                                            {isEmail || (msg.platform === 'gmail' || msg.metadata?.platform === 'gmail') ? (
                                                <div className={`${msg.sender === 'agent' ? 'bg-[#121212] border-blue-500/20 shadow-blue-900/10' : 'bg-[#181818] border-white/10 shadow-2xl'} border rounded-2xl overflow-hidden w-full transition-all hover:border-white/20`}>
                                                    {/* Email Header */}
                                                    <div className={`${msg.sender === 'agent' ? 'bg-blue-600/10 border-blue-500/10' : 'bg-white/[0.03] border-white/5'} border-b px-4 py-2.5 flex items-center justify-between`}>
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center border ${msg.sender === 'agent' ? 'bg-blue-500/20 border-blue-400/30' : 'bg-red-500/10 border-red-500/20'}`}>
                                                                <Mail size={12} className={msg.sender === 'agent' ? 'text-blue-400' : 'text-red-500'} />
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className={`text-[9px] font-normal uppercase tracking-widest leading-none mb-1 ${msg.sender === 'agent' ? 'text-blue-400' : 'text-neutral-500'}`}>
                                                                    {msg.sender === 'agent' ? 'Outgoing Email' : 'Incoming Email'}
                                                                </span>
                                                                <span className="text-white text-[12px] font-normal truncate max-w-[200px] sm:max-w-[400px]">
                                                                    {msg.subject || msg.metadata?.subject || msg.text?.split(' -- ')[0] || 'Sin Asunto'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="text-[10px] text-neutral-500 font-medium">
                                                            #{msg.metadata?.threadId?.slice(-6) || msg.whatsappMessageId?.slice(-6) || 'N/A'}
                                                        </div>
                                                    </div>

                                                    {/* Email Content */}
                                                    <div className="p-5">
                                                        {attachment.fileUrl && (
                                                            <div className="mb-4">
                                                                {attachment.fileType?.startsWith('image/') ? (
                                                                    <img src={attachment.fileUrl} alt={attachment.fileName} className="max-w-full rounded-xl border border-white/10 shadow-lg" />
                                                                ) : (
                                                                    <a href={attachment.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-3 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors">
                                                                        <FileText size={16} className="text-blue-400" />
                                                                        <span className="text-xs text-white/80 font-medium">{attachment.fileName || 'Descargar Adjunto'}</span>
                                                                    </a>
                                                                )}
                                                            </div>
                                                        )}
                                                        <p className="text-[14px] text-neutral-300 leading-relaxed whitespace-pre-wrap font-light">
                                                            {msg.text?.includes(' -- ') && msg.sender !== 'agent' ? msg.text.split(' -- ').slice(1).join(' -- ') : msg.text}
                                                        </p>
                                                    </div>

                                                    {/* Footer / Meta */}
                                                    <div className="bg-black/20 px-4 py-2 flex items-center gap-4 text-[9px] font-normal text-neutral-600 border-t border-white/5">
                                                        <span className="flex items-center gap-1 font-medium">
                                                            {msg.sender === 'agent' ? <Zap size={10} className="text-blue-500" /> : <User size={10} className="text-neutral-500" />} 
                                                            {msg.sender === 'agent' ? 'Tú (Agente)' : (msg.metadata?.from || contactName)}
                                                        </span>
                                                        <span className="opacity-40">|</span>
                                                        <span>{msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Ahora'}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                /* Standard Chat Bubble for other platforms or agent replies (e.g. WhatsApp, etc.) */
                                                <div className={getChatBubbleClasses(msg, messageColorMode)}>

                                                    {/* File Support */}
                                                    {attachment.fileUrl && !isAgentMedia && (
                                                        <div className="mb-2">
                                                            {attachment.fileType?.startsWith('image/') ? (
                                                                <img src={attachment.fileUrl} alt={attachment.fileName} className="max-w-full rounded-xl max-h-52 border border-white/10" />
                                                            ) : (
                                                                <a href={attachment.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline text-[11px] opacity-80 hover:opacity-100 bg-black/20 p-2 rounded-lg">
                                                                    <FileText size={14} className="text-blue-400" /> {attachment.fileName || 'Archivo'}
                                                                </a>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Interactive Content */}
                                                    {isAgentButtons && (
                                                        <div className="mb-2 space-y-2 min-w-[200px]">
                                                            {msg.metadata?.header && msg.metadata.header.type !== 'none' && (
                                                                <div className="mb-2 pb-2 border-b border-white/10">
                                                                    {msg.metadata.header.type === 'text' && <div className="font-normal text-[11px] uppercase tracking-wide opacity-80">{msg.metadata.header.text}</div>}
                                                                    {msg.metadata.header.type === 'image' && msg.metadata.header.url && <img src={msg.metadata.header.url} alt="header" className="rounded-lg w-full max-h-32 object-cover" />}
                                                                </div>
                                                            )}
                                                            {msg.text && <p className="text-[13px] leading-snug whitespace-pre-wrap mb-2 font-normal">{msg.text}</p>}
                                                            <div className="flex flex-col gap-1.5 pt-1">
                                                                {(msg.metadata?.buttons || msg.buttons || []).map((btn: any, idx: number) => (
                                                                    <div key={idx} className="bg-white/10 border border-white/20 rounded-xl px-4 py-2 flex items-center justify-between text-[11px] font-normal shadow-sm hover:bg-white/20 transition-colors cursor-default group/btn">
                                                                        {btn.text || btn.reply?.title || btn.title || btn}
                                                                        <MousePointer2 size={10} className="text-blue-200 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {isAgentList && (
                                                        <div className="mb-1 min-w-[200px]">
                                                            {msg.text && <p className="text-[13px] leading-snug whitespace-pre-wrap mb-3 font-normal">{msg.text}</p>}
                                                            <div className="bg-black/30 border border-white/10 rounded-xl overflow-hidden">
                                                                <div className="px-4 py-3 flex items-center justify-between border-b border-white/5 transition-colors cursor-pointer group/list">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="w-6 h-6 bg-blue-500/20 rounded-lg flex items-center justify-center border border-blue-500/30">
                                                                            <List size={14} className="text-blue-400" />
                                                                        </div>
                                                                        <span className="text-[12px] font-normal tracking-tight text-white/90">{msg.metadata?.buttonText || 'Ver opciones'}</span>
                                                                    </div>
                                                                    <ExternalLink size={12} className="text-neutral-500 group-hover/list:text-blue-400 transition-colors" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {shouldRenderPlainText && (
                                                        <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap font-normal selection:bg-blue-400/30">
                                                            {displayMessageText(msg)}
                                                        </p>
                                                    )}

                                                    {isAgentMedia && (
                                                        <div className="mb-1 min-w-[200px]">
                                                            {attachment.fileUrl && (
                                                                attachment.fileType?.startsWith('image/') ? (
                                                                    <div className="mb-2 relative group cursor-pointer overflow-hidden rounded-xl border border-white/10 shadow-lg">
                                                                        <img src={attachment.fileUrl} alt={attachment.fileName || 'media'} className="w-full max-h-64 object-cover transition-transform duration-500 group-hover:scale-110" />
                                                                    </div>
                                                                ) : (
                                                                    <a href={attachment.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 underline text-[11px] opacity-80 hover:opacity-100 bg-black/20 p-2 rounded-lg mb-2">
                                                                        <FileText size={14} className="text-blue-400" /> {attachment.fileName || 'Archivo'}
                                                                    </a>
                                                                )
                                                            )}
                                                            {msg.text && <p className="text-[13px] leading-snug whitespace-pre-wrap font-normal">{msg.text}</p>}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Status and Time Under the bubble/card */}
                                            <div className="flex items-center mt-1 text-[9px] text-neutral-600 px-1 font-normal">
                                                {msg.sender === 'agent' && isBroadcastMessage(msg) && (
                                                    <span className="text-violet-400 mr-1.5 font-normal">Campaña</span>
                                                )}
                                                <span>{msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                                {msg.sender === 'agent' && (
                                                    msg.status === 'sending' ? (
                                                        <Loader2 size={10} className="ml-1 animate-spin text-neutral-500" />
                                                    ) : msg.status === 'failed' ? (
                                                        <div
                                                            className="ml-2 flex items-center gap-1 bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded cursor-pointer hover:bg-red-500/20 transition-colors border border-red-500/20"
                                                            onClick={(e) => { e.stopPropagation(); logic.retryMessage?.(msg); }}
                                                        >
                                                            <AlertCircle size={10} />
                                                            <span className="text-[8px] font-normal uppercase tracking-tighter">Error</span>
                                                            <RefreshCw size={10} className="ml-0.5" />
                                                        </div>
                                                    ) : (
                                                        <span className={`ml-1 flex items-center ${msg.status === 'read' ? 'text-blue-400' : 'text-neutral-600'}`}>
                                                            {msg.status === 'sent' && <span>✓</span>}
                                                            {(msg.status === 'delivered' || msg.status === 'read' || !msg.status) && <span>✓✓</span>}
                                                        </span>
                                                    )
                                                )}
                                            </div>
                                        </div>

                                        {msg.sender === 'agent' && (
                                            <div className="w-6 h-6 rounded-full bg-neutral-800 ml-2 flex-shrink-0 self-end mb-1 ring-1 ring-neutral-700/50 flex items-center justify-center text-neutral-500">
                                                <User size={14} />
                                            </div>
                                        )}
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </React.Fragment>
                ))}
                
                <div ref={logic.messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="bg-[#0b141a] border-t border-neutral-800/80 flex-shrink-0 relative">
                {/* Takeover control bar */}
                {!logic.liveCardData?.isBlocked && (
                    <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-white/[0.06] bg-transparent">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors duration-300 ${humanControl ? 'bg-white/10 text-white' : 'bg-blue-500/15 text-blue-400'}`}>
                                {humanControl ? <Hand size={15} /> : <Bot size={15} />}
                            </div>
                            <span className={`text-[13px] font-medium truncate transition-colors duration-300 ${humanControl ? 'text-white/90' : 'text-blue-300/90'}`}>
                                {humanControl ? 'Tú tienes el control' : 'El bot está atendiendo'}
                            </span>
                        </div>

                        <button
                            type="button"
                            disabled={takeoverLoading}
                            onClick={humanControl ? handleReleaseBot : handleTakeover}
                            className={`
                                group flex items-center gap-3 pl-1 pr-3.5 py-1 rounded-full border backdrop-blur-md
                                transition-all duration-300 shrink-0 disabled:opacity-60
                                ${humanControl
                                    ? 'bg-white/[0.06] border-white/25 hover:bg-white/10 hover:border-white/35'
                                    : 'bg-blue-500/[0.08] border-blue-500/40 hover:bg-blue-500/15 hover:border-blue-500/55 shadow-[0_0_24px_rgba(59,130,246,0.12)]'}
                            `}
                        >
                            {takeoverLoading ? (
                                <Loader2 size={16} className={`animate-spin mx-2 ${humanControl ? 'text-white' : 'text-blue-400'}`} />
                            ) : (
                                <>
                                    <div
                                        className={`
                                            relative w-11 h-6 rounded-full transition-colors duration-300
                                            ${humanControl ? 'bg-white/25' : 'bg-blue-500'}
                                        `}
                                    >
                                        <div
                                            className={`
                                                absolute top-0.5 w-5 h-5 rounded-full shadow-md transition-all duration-300
                                                ${humanControl
                                                    ? 'left-0.5 bg-white'
                                                    : 'left-[22px] bg-white'}
                                            `}
                                        />
                                    </div>
                                    <span className={`text-[12px] font-semibold tracking-wide transition-colors duration-300 ${humanControl ? 'text-white' : 'text-blue-300'}`}>
                                        {humanControl ? 'Devolver al bot' : 'Tomar el chat'}
                                    </span>
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* File Preview Overlay */}
                {logic.filePreviewUrl && humanControl && (
                    <div className="absolute bottom-full left-4 mb-4 bg-[#1f2c34] border border-neutral-700/50 rounded-2xl shadow-2xl p-3 z-50 w-72 animate-in fade-in slide-in-from-bottom-4">
                        <div className="relative">
                            {logic.selectedFile?.type.startsWith('image/') ? (
                                <img src={logic.filePreviewUrl} alt="Preview" className="w-full h-40 object-cover rounded-xl" />
                            ) : logic.selectedFile?.type.startsWith('video/') ? (
                                <video src={logic.filePreviewUrl} className="w-full h-40 object-cover rounded-xl" controls />
                            ) : (
                                <div className="w-full h-20 bg-neutral-800 rounded-xl flex items-center justify-center gap-3 px-4">
                                    <FileText className="text-purple-400" size={24} />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[11px] font-medium text-white truncate">{logic.selectedFile?.name}</div>
                                        <div className="text-[10px] text-neutral-500">{(logic.selectedFile?.size || 0) / 1024 > 1024 ? `${((logic.selectedFile?.size || 0) / (1024 * 1024)).toFixed(1)} MB` : `${((logic.selectedFile?.size || 0) / 1024).toFixed(1)} KB`}</div>
                                    </div>
                                </div>
                            )}
                            <button onClick={logic.handleCancelPreview} className="absolute -top-2 -right-2 bg-neutral-950 text-white rounded-full p-1 border border-neutral-700 hover:bg-red-500 transition-colors"><X className="w-3 h-3" /></button>
                        </div>
                        {logic.uploading && (
                            <div className="mt-3 space-y-1.5">
                                <div className="flex justify-between text-[10px] text-neutral-500 px-1"><span>Subiendo...</span><span>{logic.progress}%</span></div>
                                <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden"><div className="bg-blue-500 h-full transition-all" style={{ width: `${logic.progress}%` }} /></div>
                            </div>
                        )}
                        {!logic.uploading && (
                            <Button size="sm" className="w-full mt-3 h-9 bg-blue-600 hover:bg-blue-500 text-[11px] font-semibold rounded-lg" onClick={logic.handleDisplayFileSend}>
                                Enviar
                            </Button>
                        )}
                    </div>
                )}

                <div className="p-4 pb-4">
                    <div className={`flex items-center gap-2 bg-[#1f2c34] rounded-[32px] px-2 py-2 min-h-[68px] border border-neutral-700/30 relative transition-opacity ${inputDisabled ? 'opacity-50' : ''}`}>
                        {logic.liveCardData?.isBlocked && (
                            <div className="absolute inset-0 bg-[#1f2c34]/90 backdrop-blur-[1px] z-20 flex items-center justify-center gap-3 rounded-[32px]">
                                <Ban size={14} className="text-red-500" />
                                <span className="text-[11px] text-neutral-400 font-medium">Contacto bloqueado</span>
                                <button onClick={logic.handleToggleBlock} className="text-blue-400 hover:text-blue-300 text-[11px] font-semibold">Desbloquear</button>
                            </div>
                        )}

                        {!humanControl && !logic.liveCardData?.isBlocked && (
                            <div className="absolute inset-0 bg-[#1f2c34]/75 backdrop-blur-[1px] z-10 flex items-center justify-center rounded-[32px] pointer-events-none">
                                <span className="text-[13px] text-neutral-500 font-medium">Toma el chat para escribir</span>
                            </div>
                        )}

                        {/* Attachments (+) */}
                        <div className="relative shrink-0" ref={attachmentsRef}>
                            <button
                                type="button"
                                disabled={inputDisabled}
                                onClick={() => setShowAttachments(!showAttachments)}
                                className={`w-12 h-12 flex items-center justify-center rounded-full transition-colors ${showAttachments ? 'text-blue-400' : 'text-neutral-400 hover:text-white'}`}
                            >
                                <Plus size={26} className={showAttachments ? 'rotate-45 transition-transform duration-200' : 'transition-transform duration-200'} />
                            </button>
                            {showAttachments && humanControl && (
                                <div className="absolute bottom-full left-0 mb-3 flex flex-col gap-4 py-1 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                    <button
                                        type="button"
                                        onClick={() => docInputRef.current?.click()}
                                        className="flex items-center gap-3 group"
                                    >
                                        <div className="w-11 h-11 rounded-full bg-[#7f66ff] flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                                            <FileText size={20} className="text-white" />
                                        </div>
                                        <span className="text-[14px] text-white font-normal whitespace-nowrap drop-shadow-sm">Documento</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => mediaInputRef.current?.click()}
                                        className="flex items-center gap-3 group"
                                    >
                                        <div className="w-11 h-11 rounded-full bg-[#007bfc] flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                                            <ImageIcon size={20} className="text-white" />
                                        </div>
                                        <span className="text-[14px] text-white font-normal whitespace-nowrap drop-shadow-sm">Fotos y videos</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Emoji */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <button
                                    type="button"
                                    disabled={inputDisabled}
                                    className="w-12 h-12 flex items-center justify-center rounded-full text-neutral-400 hover:text-white shrink-0 disabled:opacity-40"
                                >
                                    <Smile size={26} />
                                </button>
                            </PopoverTrigger>
                            <PopoverContent side="top" align="start" className="p-0 border-none bg-transparent shadow-none z-[110]">
                                <EmojiPicker onEmojiClick={logic.onEmojiClick} theme={Theme.DARK} width={320} height={380} />
                            </PopoverContent>
                        </Popover>

                        {/* Text input */}
                        <div className="flex-1 flex flex-col min-w-0 py-2">
                            {logic.activePlatform === 'Gmail' && humanControl && (
                                <div className="mb-1.5 px-1 border-b border-neutral-700/40 pb-1.5">
                                    <div className="flex items-center gap-2">
                                        <Mail size={13} className="text-blue-400/70 shrink-0" />
                                        <input
                                            type="text"
                                            placeholder="Asunto del correo..."
                                            className="flex-1 bg-transparent border-none focus:outline-none text-white text-[12px] placeholder:text-neutral-600"
                                            value={logic.gmailSubject || ''}
                                            onChange={(e) => logic.setGmailSubject?.(e.target.value)}
                                        />
                                    </div>
                                </div>
                            )}
                            <textarea
                                disabled={inputDisabled}
                                className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-white resize-none max-h-40 min-h-[52px] text-[17px] placeholder:text-neutral-500 leading-relaxed py-2.5 px-2 disabled:cursor-not-allowed"
                                placeholder={logic.liveCardData?.isBlocked ? 'Bloqueado' : 'Escribe un mensaje'}
                                rows={1}
                                value={logic.newMessage}
                                onChange={(e) => logic.setNewMessage(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey && humanControl) {
                                        e.preventDefault();
                                        logic.handleSendMessage();
                                    }
                                }}
                                onPaste={humanControl ? handlePaste : undefined}
                            />
                        </div>

                        {/* Send / Mic */}
                        <div className="flex items-center shrink-0 pr-1">
                            <input ref={mediaInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleMediaFileChange} />
                            <input ref={docInputRef} type="file" accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,audio/*" className="hidden" onChange={handleDocFileChange} />
                            <input {...logic.getInputProps()} className="hidden" />

                            {isRecording ? (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[11px] text-red-400 font-mono tabular-nums">{formatRecordingTime(recordingTime)}</span>
                                    <button type="button" onClick={cancelRecording} className="w-9 h-9 flex items-center justify-center text-neutral-500 hover:text-red-400"><X size={18} /></button>
                                    <button type="button" onClick={stopRecording} className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-500 shadow-lg"><Send size={20} className="translate-x-[1px]" /></button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    disabled={inputDisabled || logic.isSending}
                                    onClick={logic.newMessage.trim() ? logic.handleSendMessage : startRecording}
                                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${logic.newMessage.trim() ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-md shadow-blue-600/20' : 'text-neutral-400 hover:text-white'}`}
                                >
                                    {logic.isSending ? <Loader2 size={22} className="animate-spin" /> : logic.newMessage.trim() ? <Send size={22} className="translate-x-[1px]" /> : <Mic size={24} />}
                                </button>
                            )}
                        </div>
                    </div>

                    <p className="text-[10px] text-neutral-600 mt-2 px-2">Shift + Enter para nueva línea</p>
                </div>
            </div>
        </div>
    );
}
