import { useState, useMemo, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import { useFileUpload } from '@/lib/hooks/useFileUpload';
import { normalizePhoneNumber } from '@/lib/phoneUtils';
import { Timestamp, doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CardData, Message } from '../types';
import { socialPlatforms } from '../constants';
import { useAuth } from '@/contexts/AuthContext';
import { resolveWhatsAppMessagingSettings } from '@/lib/mold/whatsappMessaging';
import {
    buildWhatsAppTemplatePayload,
    isWithinWhatsAppSessionWindow,
    requiresWhatsAppTemplate,
} from '@/lib/omnichannel/whatsappSessionWindow';

interface UseMessageSenderProps {
    currentCardId: string | null;
    currentGroupId: string | null;
    liveCardData: CardData | null;
    card: any; // Fallback card props
    setLiveCardData: React.Dispatch<React.SetStateAction<CardData | null>>;
    setForcedCardId: (id: string) => void;
    setForcedGroupId: (id: string) => void;
    activePlatform: string;
}

export const useMessageSender = ({
    currentCardId,
    currentGroupId,
    liveCardData,
    card,
    setLiveCardData,
    setForcedCardId,
    setForcedGroupId,
    activePlatform
}: UseMessageSenderProps) => {
    const { currentUser, activeEntity } = useAuth();
    const [newMessage, setNewMessage] = useState('');
    const [gmailSubject, setGmailSubject] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
    const [whatsappMessaging, setWhatsappMessaging] = useState(() => resolveWhatsAppMessagingSettings());

    const { uploading, progress, uploadFile } = useFileUpload();

    useEffect(() => {
        if (!currentUser?.uid || !activeEntity) {
            setWhatsappMessaging(resolveWhatsAppMessagingSettings());
            return;
        }

        const entityRef = doc(db, `users/${currentUser.uid}/entities/${activeEntity}`);
        return onSnapshot(entityRef, (snap) => {
            setWhatsappMessaging(resolveWhatsAppMessagingSettings(snap.data()));
        });
    }, [currentUser?.uid, activeEntity]);

    const resolveRecipientId = () => {
        const platform = activePlatform.toLowerCase();
        const isMetaPlatform = platform === 'messenger' || platform === 'facebook' || platform === 'instagram';
        const cardData = liveCardData || card;

        if (isMetaPlatform) {
            const platformKey = (platform === 'messenger' || platform === 'facebook') ? 'messenger' : 'instagram';
            const recipientId = cardData?.platform_ids?.[platformKey] || cardData?.metaSenderId || '';

            if (!recipientId) {
                toast.error('No se puede enviar: no se encontró el ID del contacto de Messenger/Instagram.');
                return null;
            }

            return recipientId;
        }

        if (platform === 'gmail') {
            const recipientId = cardData?.email || cardData?.platform_ids?.gmail || cardData?.contactNumber || cardData?.contactName;
            if (!recipientId || !recipientId.includes('@')) {
                toast.error('No se puede enviar: no se encontró una dirección de correo válida.');
                return null;
            }
            return recipientId;
        }

        if (platform === 'telegram') {
            const chatId = cardData?.telegramChatId || cardData?.platform_ids?.telegram || cardData?.contactNumber;
            if (!chatId) {
                toast.error('No se puede enviar: no se encontró el Telegram Chat ID del contacto.');
                return null;
            }
            return String(chatId);
        }

        const rawPhone = liveCardData?.contactNumber || card?.contactNumber;
        const recipientId = normalizePhoneNumber(rawPhone || '');

        if (!recipientId) {
            toast.error('No se puede enviar: falta el número de teléfono del contacto.');
            return null;
        }

        return recipientId;
    };

    const conversationMessages = liveCardData?.messages || card?.messages || [];

    const isWithin24Hours = useMemo(
        () => isWithinWhatsAppSessionWindow(conversationMessages),
        [conversationMessages]
    );

    const needsTemplateMessage = useMemo(
        () => requiresWhatsAppTemplate(conversationMessages),
        [conversationMessages]
    );

    const handleSendMessage = async () => {
        if (isSending || (!newMessage.trim() && !selectedFile)) return;

        if (selectedFile) {
            await handleDisplayFileSend();
            return;
        }

        const recipientId = resolveRecipientId();
        if (!recipientId) return;

        if (
            activePlatform === 'WhatsApp' &&
            needsTemplateMessage &&
            whatsappMessaging.blockOutboundAfter24h
        ) {
            toast.error(
                'La ventana de 24 h está cerrada y tu empresa tiene bloqueados los envíos de reapertura para evitar costos de plantilla.',
                { duration: 8000 }
            );
            return;
        }

        setIsSending(true);

        const tempMsgId = Date.now().toString() + Math.random().toString(36).substring(7);
        const tempMessage: Message & { id?: string } = {
            id: tempMsgId,
            text: newMessage,
            subject: activePlatform.toLowerCase() === 'gmail' ? (gmailSubject || 'Sin Asunto') : undefined,
            sender: 'agent',
            timestamp: Timestamp.now(),
            platform: activePlatform.toLowerCase(),
            status: 'sending'
        };

        // 1. Optimistic UI Update
        setLiveCardData(prev => {
            if (!prev) return {
                ...card as any,
                id: currentCardId || 'temp',
                messages: [...(card?.messages || []), tempMessage],
                unreadCount: 0
            };
            return {
                ...prev,
                messages: [...(prev.messages || []), tempMessage],
                unreadCount: 0 // Reset unread count optimistically when sending
            };
        });

        const messageToSend = newMessage;
        setNewMessage('');

        try {
            const apiCardId = currentCardId?.startsWith('temp-') ? undefined : currentCardId;

            // 🧵 Thread Detection for Gmail
            let threadId: string | undefined;
            const messagesList = liveCardData?.messages || card?.messages || [];
            if (activePlatform.toLowerCase() === 'gmail' && messagesList.length > 0) {
                // Find the latest message that has a threadId
                const lastEmail = [...messagesList].reverse().find(m => m.metadata?.threadId || m.whatsappMessageId);
                threadId = lastEmail?.metadata?.threadId || lastEmail?.whatsappMessageId;
            }

            let payload: any = {
                message: messageToSend,
                toNumber: recipientId,
                cardId: apiCardId,
                groupId: currentGroupId,
                platform: activePlatform,
                userId: currentUser?.uid,
                entityId: activeEntity,
                ...(activePlatform.toLowerCase() === 'gmail' ? { 
                    subject: gmailSubject || 'Sin Asunto',
                    threadId: threadId 
                } : {})
            };

            if (activePlatform === 'WhatsApp' && needsTemplateMessage) {
                const templatePayload = buildWhatsAppTemplatePayload(messageToSend, whatsappMessaging);
                payload = {
                    ...payload,
                    ...templatePayload,
                };
            }

            const response = await fetch('/api/whatsapp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            let result;
            try {
                result = await response.json();
            } catch (e) {
                const text = await response.text();
                console.error('[useMessageSender] Response is not JSON:', text);
                result = { error: 'Server Error (Non-JSON)', details: text.substring(0, 500) };
            }

            if (!response.ok) {
                const errorMsg = result.error || 'Error al enviar';

                // Mostrar el error detallado en un Toast para diagnóstico rápido
                let detail = '';
                if (typeof result.details === 'object') {
                    detail = result.details?.error?.message || JSON.stringify(result.details);
                } else {
                    detail = result.details || '';
                }

                toast.error(`${errorMsg}: ${detail}`, {
                    duration: 10000, // Show for 10 seconds
                    action: {
                        label: 'Ver Detalle',
                        onClick: () => alert(JSON.stringify(result, null, 2))
                    }
                });

                // Mark message as failed
                setLiveCardData(prev => {
                    if (!prev) return null;
                    return {
                        ...prev,
                        messages: prev.messages?.map(m => (m as any).id === tempMsgId ? { ...m, status: 'failed', error: detail } : m)
                    };
                });
                setNewMessage(messageToSend);
            } else {
                // ✅ Success: update optimistic message from 'sending' → 'sent'
                setLiveCardData(prev => {
                    if (!prev) return null;
                    return {
                        ...prev,
                        messages: prev.messages?.map(m =>
                            (m as any).id === tempMsgId
                                ? { ...m, status: 'sent', kambanMessageId: result?.messageId || null }
                                : m
                        )
                    };
                });
            }
        } catch (error: any) {
            console.error('[useMessageSender] Fatal Error:', error);
            toast.error(`Error de Conexión: ${error.message}`);

            // Mark as failed in catch too
            setLiveCardData(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    messages: prev.messages?.map(m => (m as any).id === tempMsgId ? { ...m, status: 'failed' } : m)
                };
            });
            setNewMessage(messageToSend);
        } finally {
            setIsSending(false);
        }
    };

    const sendTemplateMessage = async (templateName?: string) => {
        const resolvedTemplateName = templateName || whatsappMessaging.outboundTemplateName;
        const resolvedLanguage = templateName === 'hello_world'
            ? 'en_US'
            : whatsappMessaging.outboundTemplateLanguage;
        // Platform-aware recipient ID (templates only for WhatsApp, but safeguard here)
        const platform = activePlatform.toLowerCase();
        const isMetaPlatform = platform === 'messenger' || platform === 'facebook' || platform === 'instagram';
        let phoneNumber: string;

        if (isMetaPlatform) {
            const platformKey = (platform === 'messenger' || platform === 'facebook') ? 'messenger' : 'instagram';
            const cardData = liveCardData || card;
            phoneNumber = cardData?.platform_ids?.[platformKey] || cardData?.metaSenderId || '';
        } else {
            const rawPhone = liveCardData?.contactNumber || card?.contactNumber;
            phoneNumber = normalizePhoneNumber(rawPhone || '');
        }

        if (!phoneNumber) {
            toast.error('No se puede enviar: falta el número del contacto.');
            return;
        }

        setIsSending(true);
        const tempMsg: Message = {
            text: `[PLANTILLA] ${resolvedTemplateName}`,
            sender: 'agent',
            timestamp: Timestamp.now()
        };

        setLiveCardData(prev => {
            if (!prev) return { ...card as any, id: currentCardId || 'temp', messages: [tempMsg] };
            return { ...prev, messages: [...(prev.messages || []), tempMsg] };
        });

        try {
            const response = await fetch('/api/whatsapp/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: `Plantilla enviada: ${resolvedTemplateName}`,
                    toNumber: phoneNumber,
                    cardId: currentCardId?.startsWith('temp-') ? undefined : currentCardId,
                    groupId: currentGroupId,
                    type: 'template',
                    template: { name: resolvedTemplateName, language: { code: resolvedLanguage } },
                    userId: currentUser?.uid,
                    entityId: activeEntity
                })
            });

            if (!response.ok) throw new Error(JSON.stringify(await response.json()));

            const result = await response.json();
            if (result.success) {
                toast.success('Plantilla enviada correctamente');
                if (result.cardId && result.groupId) {
                    setForcedGroupId(result.groupId);
                    setForcedCardId(result.cardId);
                }
            }
        } catch (error: any) {
            toast.error('Error al enviar plantilla');
            setLiveCardData(prev => prev ? ({ ...prev, messages: prev.messages?.filter(m => m !== tempMsg) }) : null);
        } finally {
            setIsSending(false);
        }
    };

    const handleDisplayFileSend = async () => {
        if (!selectedFile) return;
        if (!currentCardId || currentCardId.startsWith('temp-')) {
            toast.error('Envía un mensaje de texto primero para iniciar la conversación.');
            return;
        }

        const recipientId = resolveRecipientId();
        if (!recipientId || !currentGroupId) return;

        try {
            await uploadFile(selectedFile, {
                cardId: currentCardId,
                groupId: currentGroupId,
                recipientId,
                platform: activePlatform,
                caption: newMessage
            });
            if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
            setSelectedFile(null);
            setFilePreviewUrl(null);
            setNewMessage('');
        } catch (error) {
            console.error('[useMessageSender] Error sending file:', error);
        }
    };

    const onDrop = (acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (file) {
            if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
            setSelectedFile(file);
            setFilePreviewUrl(URL.createObjectURL(file));
        }
    };

    const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
        onDrop,
        accept: {
            'image/*': [],
            'video/*': [],
            'application/pdf': [],
            'audio/*': []
        },
        multiple: false
    });

    const handleCancelPreview = () => {
        if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
        setSelectedFile(null);
        setFilePreviewUrl(null);
    };

    const retryMessage = async (msgToRetry: Message & { id?: string }) => {
        if (!msgToRetry.id || !msgToRetry.text) return;
        setNewMessage(msgToRetry.text);

        // We no longer remove the failed message from UI/Firestore, 
        // as the user wants error messages to stay registered.

        // Small delay to ensure state updates before sending
        setTimeout(() => {
            handleSendMessage();
        }, 50);
    };

    return {
        newMessage,
        setNewMessage,
        gmailSubject,
        setGmailSubject,
        isSending,
        selectedFile,
        filePreviewUrl,
        setSelectedFile,
        setFilePreviewUrl,
        uploading,
        progress,
        isWithin24Hours,
        needsTemplateMessage,
        whatsappMessaging,
        handleSendMessage,
        sendTemplateMessage,
        handleDisplayFileSend,
        handleCancelPreview,
        retryMessage,
        open,
        getRootProps,
        getInputProps,
        isDragActive
    };
};
