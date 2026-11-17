import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle, CheckCircle2, ChevronLeft, Settings, Copy, ShieldCheck, QrCode, Lock, Circle, Phone, Plus, Trash2, Pencil, Loader2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Integration } from '../../config';
import { useAuth } from '@/contexts/AuthContext';
import { useEntityRoute } from '@/hooks/useEntityRoute';
import { db } from '@/lib/firebase';
import { doc, setDoc, deleteDoc, onSnapshot, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { claimIntegration } from '@/lib/integrations/claimClient';
import { metaLoginOptions } from '@/lib/integrations/metaLogin';
import { getWhatsAppIntegrationHealth } from '@/lib/omnichannel/whatsappIntegrationStatus';
import { WhatsAppReadinessPanel } from './WhatsAppReadinessPanel';
import {
    subscribeSlotConnections,
    saveSlotConnection,
    disconnectSlot,
    SLOTS,
    type NumberSlot,
    type SlotConnections,
} from '@/lib/whatsapp/numbers';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    activeIntegration: Integration | null;
}

export function WhatsAppCloudAPIModal({ isOpen, onClose, activeIntegration }: Props) {
    const { currentUser } = useAuth();
    const { firestoreId: activeEntity, routeSegment } = useEntityRoute();

    const [step, setStep] = useState<number>(1);
    const [isEditing, setIsEditing] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [updatedAt, setUpdatedAt] = useState<any>(null);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [tempConfig, setTempConfig] = useState<any>(null);

    // Multi-number (slot) management
    const [slotConnections, setSlotConnections] = useState<SlotConnections>({
        general: { connected: false },
        support: { connected: false },
        broadcast: { connected: false },
    });
    const [editingSlot, setEditingSlot] = useState<NumberSlot | null>(null);
    const [slotForm, setSlotForm] = useState({ phoneNumberId: '', wabaId: '', accessToken: '', displayPhoneNumber: '' });
    const [slotSaving, setSlotSaving] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Meta Wizard States
    const [wizardPath, setWizardPath] = useState<'new' | 'existing' | null>(null);
    const [connectionMode, setConnectionMode] = useState<'meta' | 'manual'>('meta');
    const [accountAction, setAccountAction] = useState<'new' | 'existing'>('new');
    const [phoneStatus, setPhoneStatus] = useState<'new' | 'personal' | 'none' | null>(null);
    const [bspChoice, setBspChoice] = useState<'internal' | 'other' | null>(null);
    const [showGuide, setShowGuide] = useState(false);
    const [clickCount, setClickCount] = useState(0);
    const [devMode, setDevMode] = useState(false);
    const [webhookMeta, setWebhookMeta] = useState<{
        verifyToken: string;
        globalWebhookUrl: string;
        tenantWebhookUrl: string;
        recommendedCallbackUrl: string;
        recommendedVerifyToken: string;
    } | null>(null);
    const [savingVerifyToken, setSavingVerifyToken] = useState(false);


    const [waConfig, setWaConfig] = useState({
        phoneNumberId: '',
        wabaId: '',
        accessToken: '',
        displayPhoneNumber: '',
        verifyToken: Math.random().toString(36).substring(7),
        appId: process.env.NEXT_PUBLIC_META_APP_ID || '',
    });

    // Validations
    const validateField = (name: string, value: string) => {
        let error = '';
        const bareValue = value.replace(/\s/g, '');

        switch (name) {
            case 'phoneNumberId':
            case 'wabaId':
                if (value.includes(' ')) error = 'No se permiten espacios';
                break;
            case 'displayPhoneNumber':
                if (!value.startsWith('+') && value.length > 0) error = 'Debe empezar con +';
                else if (value.replace(/\D/g, '').length < 10 && value.length > 0) error = 'Mínimo 10 dígitos';
                break;
            case 'accessToken':
                if (value.length > 0 && !value.startsWith('EAA')) error = 'Debe empezar con EAA';
                else if (value.length > 0 && value.includes(' ')) error = 'No se permiten espacios';
                break;
        }
        setFormErrors(prev => ({ ...prev, [name]: error }));
        return error === '';
    };

    // Facebook SDK Initialization
    useEffect(() => {
        const appId = process.env.NEXT_PUBLIC_META_APP_ID;
        if (!appId) return;

        (window as any).fbAsyncInit = function () {
            (window as any).FB.init({
                appId: appId,
                cookie: true,
                xfbml: true,
                version: 'v21.0'
            });
        };

        (function (d, s, id) {
            var js, fjs = d.getElementsByTagName(s)[0];
            if (d.getElementById(id)) return;
            js = d.createElement(s) as HTMLScriptElement;
            js.id = id;
            js.src = "https://connect.facebook.net/en_US/sdk.js";
            fjs.parentNode?.insertBefore(js, fjs);
        }(document, 'script', 'facebook-jssdk'));
    }, []);

    // Firestore Sync
    useEffect(() => {
        if (!isOpen || !currentUser || !activeEntity) return;
        setInitialLoading(true);

        const configRef = doc(db, `users/${currentUser.uid}/entities/${activeEntity}/integrations/whatsapp`);
        const internalConfigRef = doc(db, `users/${currentUser.uid}/entities/${activeEntity}/integrations/whatsapp_internal`);

        let unsubInternal: any = null;

        const unsub = onSnapshot(configRef, (snap) => {
            if (snap.exists()) {
                if (unsubInternal) { unsubInternal(); unsubInternal = null; }
                const data = snap.data();
                if ((data.status === 'Connected' || data.status === 'Internal') && data.phoneNumberId) {
                    setStep(4);
                    setUpdatedAt(data.updatedAt);
                    setWaConfig(prev => ({ ...prev, ...data, displayPhoneNumber: data.displayPhoneNumber || '' }));
                }
                setTimeout(() => setInitialLoading(false), 500);
            } else {
                // Fallback to internal if standard doesn't exist
                if (!unsubInternal) {
                    unsubInternal = onSnapshot(internalConfigRef, (internalSnap) => {
                        if (internalSnap.exists()) {
                            const data = internalSnap.data();
                            if ((data.status === 'Connected' || data.status === 'Internal') && data.phoneNumberId) {
                                setStep(4);
                                setUpdatedAt(data.updatedAt);
                                setWaConfig(prev => ({ ...prev, ...data, displayPhoneNumber: data.displayPhoneNumber || '' }));
                            }
                        } else {
                            setStep(1);
                        }
                        setTimeout(() => setInitialLoading(false), 500);
                    });
                } else {
                    setStep(1);
                    setTimeout(() => setInitialLoading(false), 500);
                }
            }
        });

        return () => {
            unsub();
            if (unsubInternal) unsubInternal();
        };
    }, [isOpen, currentUser, activeEntity]);

    useEffect(() => {
        if (!isOpen || !currentUser?.uid || !activeEntity || step !== 4) return;

        const loadWebhookMeta = async () => {
            try {
                const res = await fetch(
                    `/api/whatsapp/webhook-config?userId=${encodeURIComponent(currentUser.uid)}&entityId=${encodeURIComponent(activeEntity)}&origin=${encodeURIComponent(window.location.origin)}`
                );
                const data = await res.json();
                if (!res.ok) return;
                setWebhookMeta({
                    verifyToken: data.tenant?.verifyToken || data.verifyToken,
                    globalWebhookUrl: data.globalWebhookUrl,
                    tenantWebhookUrl: data.tenantWebhookUrl,
                    recommendedCallbackUrl: data.recommended?.callbackUrl,
                    recommendedVerifyToken: data.recommended?.verifyToken,
                });
                if (data.tenant?.verifyToken) {
                    setWaConfig((prev) => ({ ...prev, verifyToken: data.tenant.verifyToken }));
                }
            } catch (e) {
                console.error('[WhatsApp] webhook-config load failed', e);
            }
        };

        loadWebhookMeta();
    }, [isOpen, currentUser?.uid, activeEntity, step]);

    // Subscribe to all WhatsApp numbers (slots). The current/legacy connection
    // surfaces automatically under the "General" slot, so nothing existing breaks.
    useEffect(() => {
        if (!isOpen || !currentUser?.uid || !activeEntity) return;
        const tenantPath = `users/${currentUser.uid}/entities/${activeEntity}`;
        const unsub = subscribeSlotConnections(tenantPath, setSlotConnections);
        return () => unsub();
    }, [isOpen, currentUser?.uid, activeEntity]);

    if (!activeIntegration || activeIntegration.id !== 'whatsapp') return null;

    const whatsappHealth = getWhatsAppIntegrationHealth(waConfig);
    const connectedSlotCount = (['general', 'support', 'broadcast'] as NumberSlot[])
        .filter((s) => slotConnections[s]?.connected).length;

    const tenantWebhookUrl = webhookMeta?.tenantWebhookUrl
        || (currentUser?.uid && activeEntity
            ? `${typeof window !== 'undefined' ? window.location.origin : 'https://www.itsroosevelt.com'}/api/whatsapp/webhook?u=${currentUser.uid}&e=${activeEntity}`
            : null);
    const globalWebhookUrl = webhookMeta?.globalWebhookUrl
        || `${typeof window !== 'undefined' ? window.location.origin : 'https://www.itsroosevelt.com'}/api/whatsapp/webhook`;
    const displayVerifyToken = waConfig.verifyToken || webhookMeta?.verifyToken || webhookMeta?.recommendedVerifyToken || 'vg37e';

    const saveWhatsAppConfig = async () => {
        if (!currentUser || !activeEntity) return;

        // Final validation before save
        const errors = {
            phoneNumberId: validateField('phoneNumberId', waConfig.phoneNumberId) ? '' : formErrors.phoneNumberId,
            wabaId: validateField('wabaId', waConfig.wabaId) ? '' : formErrors.wabaId,
            displayPhoneNumber: validateField('displayPhoneNumber', waConfig.displayPhoneNumber) ? '' : formErrors.displayPhoneNumber,
            accessToken: validateField('accessToken', waConfig.accessToken) ? '' : formErrors.accessToken,
        };

        if (Object.values(errors).some(e => e !== '') || !waConfig.phoneNumberId) {
            toast.error("Revisa los campos marcados en rojo.");
            return;
        }

        const _unused_toastId = toast.loading("Verificando credenciales...", { id: "wa-config" });

        try {
            const validationRes = await fetch('/api/whatsapp/validate-phone-id', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phoneNumberId: waConfig.phoneNumberId,
                    userId: currentUser.uid,
                    entityId: activeEntity
                })
            });
            const validationData = await validationRes.json();

            if (!validationData.valid) {
                toast.error(validationData.message || "El número ya está vinculado a otra cuenta.", { id: "wa-config" });
                return;
            }
        } catch (error) {
            console.error("Validation error:", error);
            toast.error("Hubo un problema verificando el número.", { id: "wa-config" });
            return;
        }

        toast.loading("Guardando configuración...", { id: "wa-config" });
        try {
            const configRef = doc(db, `users/${currentUser.uid}/entities/${activeEntity}/integrations/whatsapp`);
            await setDoc(configRef, {
                ...waConfig,
                verifyToken: (waConfig.verifyToken || 'vg37e').trim(),
                status: 'Connected',
                provider: 'whatsapp',
                updatedAt: new Date(),
            }, { merge: true });

            await fetch('/api/whatsapp/validate-phone-id', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phoneNumberId: waConfig.phoneNumberId,
                    userId: currentUser.uid,
                    entityId: activeEntity,
                }),
            });

            const claim = await claimIntegration('whatsapp', currentUser.uid, activeEntity);
            if (!claim.ok) {
                await updateDoc(configRef, { status: 'Disconnected' });
                toast.error(claim.message, { id: "wa-config" });
                return;
            }

            toast.success("¡WhatsApp conectado!", { id: "wa-config" });
            setIsEditing(false);
            setStep(4);
        } catch (error) {
            console.error(error);
            toast.error("Error al guardar.", { id: "wa-config" });
        }
    };

    const handleConnectFacebook = async () => {
        const facebookAppId = process.env.NEXT_PUBLIC_META_APP_ID;
        if (!facebookAppId) {
            toast.error("Error: NEXT_PUBLIC_META_APP_ID no está configurado en las variables de entorno.");
            toast.error("Error: NEXT_PUBLIC_META_APP_ID no configurado en Vercel.");
            return;
        }

        if (devMode) {
            setStep(4);
            return;
        }

        const FB = (window as any).FB;
        if (!FB) {
            toast.error("El SDK de Meta no está listo. Verifica tu AdBlocker o recarga la página.");
            return;
        }

        toast.loading("Abriendo Meta Auth Portal...", { id: "meta-auth" });

        FB.login((response: any) => {
            const processAuth = async () => {
                if (response.authResponse) {
                    const accessToken = response.authResponse.accessToken;
                    const userId = response.authResponse.userID;

                    toast.loading("Obteniendo detalles de la cuenta...", { id: "meta-auth" });

                    // 1. Fetch WABA and Phone Number details from Meta
                    FB.api('/me/whatsapp_business_accounts', (wabaRes: any) => {
                        console.log("[Meta API] /me/whatsapp_business_accounts response:", wabaRes);
                        if (wabaRes && wabaRes.data && wabaRes.data.length > 0) {
                            const wabaId = wabaRes.data[0].id; // We take the first one for simplicity or let user choose (future)

                            FB.api(`/${wabaId}/phone_numbers`, async (phoneRes: any) => {
                                console.log(`[Meta API] /${wabaId}/phone_numbers response:`, phoneRes);
                                if (phoneRes && phoneRes.data && phoneRes.data.length > 0) {
                                    const phone = phoneRes.data[0];
                                    const phoneNumberId = phone.id;
                                    const displayPhoneNumber = phone.display_phone_number;

                                    toast.loading("Validando exclusividad en Roosevelt...", { id: "meta-auth" });

                                    // 2. Validate uniqueness across all Roosevelt tenants
                                    try {
                                        const validationRes = await fetch('/api/whatsapp/validate-phone-id', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                phoneNumberId: phoneNumberId,
                                                userId: currentUser?.uid,
                                                entityId: activeEntity
                                            })
                                        });

                                        const validationData = await validationRes.json();

                                        if (!validationData.valid) {
                                            toast.error(validationData.message || "Este número ya está siendo usado por otro usuario de Roosevelt.", { id: "meta-auth" });
                                            return;
                                        }

                                        // 3. Save full configuration if valid
                                        const configRef = doc(db, `users/${currentUser?.uid}/entities/${activeEntity}/integrations/whatsapp`);
                                        const configDoc = {
                                            status: 'Connected',
                                            provider: 'whatsapp',
                                            accessToken: accessToken,
                                            metaUserId: userId,
                                            phoneNumberId: phoneNumberId,
                                            wabaId: wabaId,
                                            displayPhoneNumber: displayPhoneNumber,
                                            verifyToken: waConfig.verifyToken,
                                            updatedAt: new Date(),
                                        };

                                        await setDoc(configRef, configDoc, { merge: true });
                                        await fetch('/api/whatsapp/validate-phone-id', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                phoneNumberId,
                                                userId: currentUser?.uid,
                                                entityId: activeEntity,
                                            }),
                                        });
                                        toast.success("¡Vinculación oficial completada!", { id: "meta-auth" });
                                        setStep(4);
                                    } catch (err) {
                                        console.error("Duplicate check error:", err);
                                        toast.error("Error validando el número. Intenta de nuevo.", { id: "meta-auth" });
                                    }
                                } else {
                                    toast.error("No se encontraron números de teléfono vinculados a esta cuenta de Meta.", { id: "meta-auth" });
                                }
                            });
                        } else {
                            toast.error("No se encontraron Cuentas de WhatsApp Business (WABA) en este perfil.", { id: "meta-auth" });
                        }
                    });
                } else {
                    console.warn("FB Login cancelled or failed:", response);
                    toast.error("La conexión con Meta falló o fue cancelada.", { id: "meta-auth" });
                }
            };

            processAuth();
        }, metaLoginOptions('whatsapp'));
    };

    const handleDeleteConfig = async () => {

        if (!currentUser || !activeEntity) return;
        if (!confirm("¿Seguro que quieres desconectar WhatsApp?")) return;

        const _unused_toastId = toast.loading("Desconectando...", { id: "wa-config" });
        try {
            const configRef = doc(db, `users/${currentUser.uid}/entities/${activeEntity}/integrations/whatsapp`);
            const internalConfigRef = doc(db, `users/${currentUser.uid}/entities/${activeEntity}/integrations/whatsapp_internal`);

            await Promise.all([
                deleteDoc(configRef),
                deleteDoc(internalConfigRef)
            ]);

            // Turn off any active chatbots
            const botsRef = collection(db, `users/${currentUser.uid}/entities/${activeEntity}/chatbots`);

            // Handle both true and 'true' just in case
            const qReal = query(botsRef, where('isActive', '==', true));
            const qStr = query(botsRef, where('isActive', '==', 'true'));

            const [snapsReal, snapsStr] = await Promise.all([getDocs(qReal), getDocs(qStr)]);

            const updatePromises: Promise<void>[] = [];
            snapsReal.forEach(bot => updatePromises.push(updateDoc(bot.ref, { isActive: false })));
            snapsStr.forEach(bot => updatePromises.push(updateDoc(bot.ref, { isActive: false })));

            await Promise.all(updatePromises);

            setWaConfig({
                phoneNumberId: '', wabaId: '', accessToken: '', displayPhoneNumber: '',
                verifyToken: Math.random().toString(36).substring(7),
                appId: process.env.NEXT_PUBLIC_META_APP_ID || '',
            });
            setStep(1);
            setIsEditing(false);
            toast.success("Desconectado.", { id: "wa-config" });
        } catch (error) {
            console.error(error);
            toast.error("Error al desconectar.", { id: "wa-config" });
        }
    };

    // Open the editor for a given slot. "General" reuses the primary edit flow so
    // the legacy `integrations/whatsapp` doc (used by webhook + omnichannel) stays authoritative.
    const openSlotEditor = (slot: NumberSlot) => {
        if (slot === 'general') {
            setTempConfig({ ...waConfig });
            setIsEditing(true);
            return;
        }
        const conn = slotConnections[slot];
        setSlotForm({
            phoneNumberId: conn.phoneNumberId || '',
            wabaId: conn.wabaId || '',
            accessToken: conn.accessToken || '',
            displayPhoneNumber: conn.displayPhoneNumber || '',
        });
        setEditingSlot(slot);
    };

    const handleSaveSlot = async () => {
        if (!editingSlot || editingSlot === 'general' || !currentUser?.uid || !activeEntity) return;
        if (!slotForm.phoneNumberId.trim() || !slotForm.accessToken.trim()) {
            toast.error('Necesitas Phone Number ID y Access Token.');
            return;
        }
        if (!slotForm.accessToken.trim().startsWith('EAA')) {
            toast.error('El Access Token debe empezar con EAA.');
            return;
        }
        setSlotSaving(true);
        const tenantPath = `users/${currentUser.uid}/entities/${activeEntity}`;
        toast.loading('Verificando número...', { id: 'wa-slot' });
        try {
            const vr = await fetch('/api/whatsapp/validate-phone-id', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phoneNumberId: slotForm.phoneNumberId.trim(),
                    userId: currentUser.uid,
                    entityId: activeEntity,
                }),
            });
            const vd = await vr.json();
            if (!vd.valid) {
                toast.error(vd.message || 'Ese número ya está en uso.', { id: 'wa-slot' });
                setSlotSaving(false);
                return;
            }
            await saveSlotConnection(tenantPath, editingSlot, {
                phoneNumberId: slotForm.phoneNumberId.trim(),
                wabaId: slotForm.wabaId.trim(),
                accessToken: slotForm.accessToken.trim(),
                displayPhoneNumber: slotForm.displayPhoneNumber.trim(),
            });
            toast.success('Número conectado.', { id: 'wa-slot' });
            setEditingSlot(null);
        } catch (error) {
            console.error(error);
            toast.error('No se pudo guardar el número.', { id: 'wa-slot' });
        } finally {
            setSlotSaving(false);
        }
    };

    const handleDisconnectSlot = async (slot: NumberSlot) => {
        if (slot === 'general' || !currentUser?.uid || !activeEntity) return;
        if (!confirm('¿Desconectar este número?')) return;
        const tenantPath = `users/${currentUser.uid}/entities/${activeEntity}`;
        try {
            await disconnectSlot(tenantPath, slot);
            toast.success('Número desconectado.');
        } catch (error) {
            console.error(error);
            toast.error('No se pudo desconectar.');
        }
    };

    const renderManualForm = () => (
        <div className="flex-1 flex flex-col pt-2 overflow-y-auto pr-2 no-scrollbar">
            <div className="space-y-5 mb-8 text-left">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <div className="flex justify-between px-1">
                            <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500">PHONE ID (15 DÍGITOS)</label>
                            <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer" className="text-[8px] text-blue-500 font-bold uppercase italic tracking-tighter">¿DÓNDE ENCONTRARLO?</a>
                        </div>
                        <input
                            type="text" placeholder="Ej: 676837795516836"
                            value={waConfig.phoneNumberId}
                            onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9]/g, '');
                                setWaConfig({ ...waConfig, phoneNumberId: val });
                                validateField('phoneNumberId', val);
                            }}
                            className={`w-full h-11 bg-white/[0.02] border ${formErrors.phoneNumberId ? 'border-red-500/50 bg-red-500/5' : 'border-white/10'} rounded-xl px-4 text-xs text-white focus:border-blue-500/50 transition-all outline-none font-light`}
                        />
                        {formErrors.phoneNumberId && <p className="text-[8px] text-red-500 mt-1 font-bold italic pl-1">{formErrors.phoneNumberId}</p>}
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between px-1">
                            <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500">TU NÚMERO DE TELÉFONO</label>
                            <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer" className="text-[8px] text-blue-500 font-bold uppercase italic tracking-tighter">EXPLORADOR API</a>
                        </div>
                        <input
                            type="text" placeholder="Ej: +1 385 888 2799"
                            value={waConfig.displayPhoneNumber}
                            onChange={(e) => {
                                setWaConfig({ ...waConfig, displayPhoneNumber: e.target.value });
                                validateField('displayPhoneNumber', e.target.value);
                            }}
                            className={`w-full h-11 bg-white/[0.02] border ${formErrors.displayPhoneNumber ? 'border-red-500/50 bg-red-500/5' : 'border-white/10'} rounded-xl px-4 text-xs text-white focus:border-blue-500/50 transition-all outline-none`}
                        />
                        {formErrors.displayPhoneNumber && <p className="text-[8px] text-red-500 mt-1 font-bold italic pl-1">{formErrors.displayPhoneNumber}</p>}
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between px-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500">WABA ID (WHATSAPP BUSINESS ACCOUNT)</label>
                        <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer" className="text-[8px] text-blue-500 font-bold uppercase italic tracking-tighter">¿DÓNDE ENCONTRARLO?</a>
                    </div>
                    <input
                        type="text" placeholder="Ej: 25304791939521"
                        value={waConfig.wabaId}
                        onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, '');
                            setWaConfig({ ...waConfig, wabaId: val });
                            validateField('wabaId', val);
                        }}
                        className={`w-full h-11 bg-white/[0.02] border ${formErrors.wabaId ? 'border-red-500/50 bg-red-500/5' : 'border-white/10'} rounded-xl px-4 text-xs text-white focus:border-blue-500/50 transition-all outline-none font-light`}
                    />
                    {formErrors.wabaId && <p className="text-[8px] text-red-500 mt-1 font-bold italic pl-1">{formErrors.wabaId}</p>}
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between px-1">
                        <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500">ACCESS TOKEN (PERMANENTE)</label>
                        <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer" className="text-[8px] text-blue-500 font-bold uppercase italic tracking-tighter">GENERAR EN META</a>
                    </div>
                    <textarea
                        placeholder="Ej: EAARnTi3ZAPNYBR..."
                        value={waConfig.accessToken}
                        onChange={(e) => {
                            setWaConfig({ ...waConfig, accessToken: e.target.value });
                            validateField('accessToken', e.target.value);
                        }}
                        className={`w-full h-24 bg-white/[0.02] border ${formErrors.accessToken ? 'border-red-500/50 bg-red-500/5' : 'border-white/10'} rounded-xl px-4 py-3 text-[10px] text-white focus:border-blue-500/50 transition-all outline-none font-mono resize-none`}
                    />
                    {formErrors.accessToken && <p className="text-[8px] text-red-500 mt-1 font-bold italic pl-1">{formErrors.accessToken}</p>}
                </div>
            </div>


            {isEditing ? (
                <div className="grid grid-cols-2 gap-4">
                    <button
                        onClick={() => {
                            setWaConfig(tempConfig);
                            setIsEditing(false);
                            setFormErrors({});
                        }}
                        className="h-14 bg-white/5 hover:bg-white/10 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl transition-all"
                    >
                        CANCELAR
                    </button>
                    <button
                        onClick={saveWhatsAppConfig}
                        className="h-14 bg-blue-600 hover:bg-blue-500 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl transition-all shadow-lg shadow-blue-600/20"
                    >
                        GUARDAR CAMBIOS
                    </button>
                </div>
            ) : (
                <button
                    onClick={saveWhatsAppConfig}
                    className="w-full h-14 bg-blue-600 hover:bg-blue-500 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                >
                    GUARDAR Y CONECTAR
                </button>
            )}
        </div>
    );

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/80 backdrop-blur-xl"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }}
                        className="relative w-full max-w-[95vw] md:max-w-4xl bg-[#0a0a0a] border border-white/10 rounded-[24px] md:rounded-[32px] shadow-2xl overflow-hidden flex flex-col md:flex-row h-[85vh] md:h-[600px]"
                    >
                        {/* Left Branding */}
                        <div className="hidden md:flex w-[35%] bg-black p-10 flex-col border-r border-white/5 relative overflow-hidden shrink-0">
                            <div className="absolute top-0 right-0 w-full h-[500px] bg-primary/20 blur-[120px] pointer-events-none rounded-full -translate-y-1/2 translate-x-1/4" />
                            <div className="relative z-10 h-full flex flex-col">
                                <div className="p-5 bg-white/5 border border-white/10 rounded-2xl w-fit mb-8 backdrop-blur-md shadow-2xl">
                                    {activeIntegration.icon}
                                </div>
                                <h1 className="text-3xl font-extralight text-white tracking-tighter mb-4 leading-none">
                                    {activeIntegration.name === 'WhatsApp Business (Cloud API)' ? 'WhatsApp' : activeIntegration.name}
                                    <span className="block text-primary font-bold text-xs mt-2 tracking-[0.4em] uppercase opacity-50">Cloud API</span>
                                </h1>
                                <p className="text-[11px] text-white/40 font-light leading-relaxed mb-10 tracking-wide max-w-[200px]">
                                    Conecta la infraestructura de Meta directamente a Roosevelt para una comunicación autónoma y escalable.
                                </p>

                                <div className="mt-auto">
                                    <div className="bg-white/5 rounded-2xl p-5 border border-white/10 backdrop-blur-sm group hover:border-primary/30 transition-all duration-500">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(37,99,235,0.8)]" />
                                            <span className="text-[9px] text-white/80 font-bold uppercase tracking-[0.2em]">Conexión Cifrada</span>
                                        </div>
                                        <p className="text-[10px] text-white/30 leading-relaxed font-light">
                                            La sincronización de llaves se realiza bajo estándares militares en los nodos oficiales de Meta.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Content */}
                        <div className="flex-1 p-5 md:p-8 overflow-y-auto no-scrollbar relative flex flex-col h-full bg-[#0a0a0a]">
                            <div className="flex justify-between items-center mb-6 md:mb-8 h-10 shrink-0 relative z-50">
                                <div className="w-20">
                                    {(step > 1 && step < 4) ? (
                                        <button
                                            onClick={() => {
                                                if (step === 2) setWizardPath(null);
                                                setStep(step - 1);
                                            }}
                                            className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors text-[10px] md:text-xs font-bold uppercase tracking-widest"
                                        >
                                            <ChevronLeft className="w-3.5 h-3.5 md:w-4 md:h-4" /> Atrás
                                        </button>
                                    ) : isEditing ? (
                                        <button
                                            onClick={() => {
                                                setWaConfig(tempConfig);
                                                setIsEditing(false);
                                                setFormErrors({});
                                            }}
                                            className="flex items-center gap-1.5 text-neutral-500 hover:text-white transition-colors text-[9px] font-black uppercase tracking-widest"
                                        >
                                            <ChevronLeft className="w-3 h-3" /> Cancelar
                                        </button>
                                    ) : <div />}
                                </div>

                                {step === 1 && !isEditing && (
                                    <div className="flex bg-white/5 p-1 rounded-full border border-white/10 backdrop-blur-md">
                                        <button
                                            onClick={() => setConnectionMode('meta')}
                                            className={`px-4 md:px-6 py-1 md:py-1.5 rounded-full text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] transition-all ${connectionMode === 'meta' ? 'bg-white/10 text-white shadow-lg' : 'text-white/30 hover:text-white/60'}`}
                                        >
                                            Wizard
                                        </button>
                                        <button
                                            onClick={() => setConnectionMode('manual')}
                                            className={`px-4 md:px-6 py-1 md:py-1.5 rounded-full text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] transition-all ${connectionMode === 'manual' ? 'bg-white/10 text-white shadow-lg' : 'text-white/30 hover:text-white/60'}`}
                                        >
                                            Manual
                                        </button>
                                    </div>
                                )}

                                <div className="flex items-center gap-1.5">
                                    {step === 4 && !isEditing && (
                                        <button
                                            onClick={() => {
                                                setTempConfig({ ...waConfig });
                                                setIsEditing(true);
                                            }}
                                            className="p-2 hover:bg-white/5 rounded-full transition-colors text-neutral-400 hover:text-blue-500"
                                        ><Settings className="w-4 h-4" /></button>
                                    )}
                                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors"><X className="w-5 h-5 text-neutral-500 hover:text-white" /></button>
                                </div>
                            </div>

                            <AnimatePresence mode="wait">
                                {initialLoading ? (
                                    <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 text-center">
                                        <div className="w-10 h-10 md:w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
                                        <p className="text-[10px] text-neutral-500 font-medium uppercase tracking-widest">Verificando conexión...</p>
                                    </motion.div>
                                ) : (step === 1 || isEditing) ? (
                                    <motion.div key={isEditing ? "edit" : "step1"} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="flex-1 flex flex-col font-sans">

                                        {isEditing || connectionMode === 'manual' ? (
                                            <>
                                                <div className="mb-4 md:mb-6">
                                                    <h3 className="text-xl md:text-2xl font-extralight text-white tracking-tighter mb-1">{isEditing ? 'Configuración de Nodo' : 'Mapeo Manual de WhatsApp'}</h3>
                                                    <p className="text-[9px] md:text-[10px] text-white/30 uppercase tracking-[0.3em] font-bold">Inyección Directa de Credenciales</p>
                                                </div>
                                                {renderManualForm()}
                                            </>
                                        ) : (
                                            <>
                                                <div className="mb-6 md:mb-10">
                                                    <h3 className="text-2xl md:text-3xl font-extralight text-white tracking-tighter mb-2">Conectar Canal</h3>
                                                    <div className="flex items-center gap-3 md:gap-4">
                                                        <div className="h-[1px] w-8 md:w-12 bg-primary/50" />
                                                        <p className="text-[9px] md:text-[10px] text-white/20 uppercase tracking-[0.4em] font-bold">Autonomous Protocol 01</p>
                                                    </div>
                                                </div>

                                                <div className="space-y-3 md:space-y-4 flex-1">
                                                    <button
                                                        onClick={() => setAccountAction('new')}
                                                        className={`w-full text-left p-4 md:p-6 rounded-[20px] md:rounded-[24px] border transition-all duration-500 flex items-center gap-4 md:gap-6 ${accountAction === 'new' ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20 shadow-[0_0_30px_rgba(37,99,235,0.05)]' : 'border-white/5 hover:border-white/10 bg-white/[0.02]'}`}
                                                    >
                                                        <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center shrink-0 transition-all ${accountAction === 'new' ? 'bg-primary text-white' : 'bg-white/5 text-white/20'}`}>
                                                            {accountAction === 'new' ? <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 shadow-glow" /> : <Circle className="w-4 h-4 md:w-5 md:h-5" />}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-white text-[10px] md:text-[11px] mb-1 uppercase tracking-[0.2em]">Crea y conecta cuenta</p>
                                                            <p className="text-[9px] md:text-[10px] text-white/30 font-light leading-relaxed">Nuevo despliegue en la infraestructura de Meta Business.</p>
                                                        </div>
                                                    </button>
                                                    <button
                                                        onClick={() => setAccountAction('existing')}
                                                        className={`w-full text-left p-4 md:p-6 rounded-[20px] md:rounded-[24px] border transition-all duration-500 flex items-center gap-4 md:gap-6 ${accountAction === 'existing' ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20 shadow-[0_0_30px_rgba(37,99,235,0.05)]' : 'border-white/5 hover:border-white/10 bg-white/[0.02]'}`}
                                                    >
                                                        <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center shrink-0 transition-all ${accountAction === 'existing' ? 'bg-primary text-white' : 'bg-white/5 text-white/20'}`}>
                                                            {accountAction === 'existing' ? <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 shadow-glow" /> : <Circle className="w-4 h-4 md:w-5 md:h-5" />}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-white text-[10px] md:text-[11px] mb-1 uppercase tracking-[0.2em]">Vincular cuenta activa</p>
                                                            <p className="text-[9px] md:text-[10px] text-white/30 font-light leading-relaxed">Migración o vinculación de WABA existente (Cualquier BSP).</p>
                                                        </div>
                                                    </button>
                                                </div>

                                                <div className="flex flex-col gap-4 md:gap-6 mt-8 md:mt-12">
                                                    <button
                                                        onClick={() => {
                                                            setWizardPath(accountAction === 'new' ? 'new' : 'existing');
                                                            setStep(2);
                                                        }}
                                                        className="bg-white/5 hover:bg-white/10 text-white px-8 md:px-10 h-11 md:h-12 rounded-full text-[9px] md:text-[10px] font-bold uppercase tracking-[0.3em] transition-all border border-white/10 backdrop-blur-md shadow-xl w-fit group"
                                                    >
                                                        <span className="flex items-center gap-3">
                                                            Sincronizar <CheckCircle2 className="w-3 h-3 group-hover:scale-110 transition-transform" />
                                                        </span>
                                                    </button>

                                                    <div className="flex items-center gap-3 md:gap-4">
                                                        <button onClick={handleConnectFacebook} className="text-[8px] md:text-[9px] text-white/40 font-bold uppercase tracking-[0.2em] hover:text-primary transition-colors">Direct OAuth Link</button>
                                                        <span className="w-1 h-1 rounded-full bg-white/10" />
                                                        <button className="text-[8px] md:text-[9px] text-white/40 font-bold uppercase tracking-[0.2em] hover:text-white transition-colors">Meta Dev Portal</button>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </motion.div>
                                ) : (step === 2 && wizardPath === 'new') ? (
                                    <motion.div key="new-eligibility" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col text-left font-sans">
                                        <div className="flex items-center gap-6 mb-12">
                                            <div className="flex items-center gap-3">
                                                <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-glow" />
                                                <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-white">Elegibilidad</span>
                                            </div>
                                            <div className="h-[1px] w-8 bg-white/10" />
                                            <div className="flex items-center gap-3 opacity-30">
                                                <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                                                <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-white/50">Privilegios</span>
                                            </div>
                                        </div>

                                        <h3 className="text-3xl font-extralight text-white tracking-tighter mb-4">Verificación de Nodo</h3>
                                        <p className="text-[11px] text-white/30 font-light mb-10 leading-relaxed max-w-md uppercase tracking-wider">Confirma la naturaleza del número de teléfono para asignar el protocolo de enrutamiento adecuado.</p>

                                        <div className="space-y-3 mb-10">
                                            {['new', 'personal', 'none'].map((status) => (
                                                <button
                                                    key={status}
                                                    onClick={() => setPhoneStatus(status as any)}
                                                    className={`w-full text-left py-4 px-6 rounded-2xl border transition-all duration-300 flex items-center justify-between ${phoneStatus === status ? 'border-primary/50 bg-primary/10' : 'border-white/5 hover:border-white/10 bg-white/[0.02]'}`}
                                                >
                                                    <span className={`text-[11px] uppercase tracking-widest transition-all ${phoneStatus === status ? 'text-white font-bold' : 'text-white/40 font-light'}`}>
                                                        {status === 'new' && 'NÚMERO VIRGEN (SIN REGISTRO)'}
                                                        {status === 'personal' && 'CUENTA PERSONAL ACTIVA'}
                                                        {status === 'none' && 'SOLICITAR NÚMERO VIRTUAL'}
                                                    </span>
                                                    {phoneStatus === status && <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-glow" />}
                                                </button>
                                            ))}
                                        </div>

                                        <div className="flex items-center justify-between mt-auto">
                                            <button
                                                onClick={() => setStep(3)}
                                                disabled={!phoneStatus}
                                                className="px-10 h-12 rounded-full text-[10px] font-bold uppercase tracking-[0.3em] bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-white shadow-xl disabled:opacity-20"
                                            >
                                                Protocolo 02
                                            </button>
                                            <button className="text-[9px] text-white/20 font-bold uppercase tracking-[0.3em] hover:text-white transition-colors">Omitir Verificación</button>
                                        </div>
                                    </motion.div>
                                ) : (step === 3 && wizardPath === 'new') ? (
                                    <motion.div key="new-meta" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col text-left font-sans">
                                        <div className="flex items-center gap-6 mb-12">
                                            <div className="flex items-center gap-3">
                                                <CheckCircle2 className="w-4 h-4 text-primary" />
                                                <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/50">Elegibilidad</span>
                                            </div>
                                            <div className="h-[1px] w-8 bg-primary/30" />
                                            <div className="flex items-center gap-3">
                                                <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-glow" />
                                                <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-white">Privilegios</span>
                                            </div>
                                        </div>

                                        <h3 className="text-3xl font-extralight text-white tracking-tighter mb-4">Meta Auth Portal</h3>
                                        <p className="text-[11px] text-white/30 font-light mb-10 leading-relaxed uppercase tracking-wider">Sincronización de privilegios con Meta Business Manager.</p>

                                        <div className="bg-white/[0.03] border border-white/5 rounded-[24px] p-8 mb-10 backdrop-blur-sm">
                                            <div className="flex items-start gap-4">
                                                <div className="p-2 bg-primary/10 rounded-lg"><ShieldCheck className="w-5 h-5 text-primary" /></div>
                                                <div>
                                                    <p className="text-[10px] text-white/80 font-bold mb-4 uppercase tracking-[0.2em] italic">Pre-requisitos de despliegue:</p>
                                                    <ul className="text-[11px] text-white/40 space-y-3 font-light">
                                                        <li className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-white/20" /> Identidad Legal de Empresa</li>
                                                        <li className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-white/20" /> Dirección Fiscal Verificable</li>
                                                        <li className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-white/20" /> Perímetro de Negocio en Meta</li>
                                                    </ul>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-6">
                                            <button onClick={handleConnectFacebook} className="px-8 h-12 rounded-full text-[10px] font-bold uppercase tracking-[0.3em] bg-primary hover:bg-primary/80 transition-all text-white shadow-[0_0_20px_rgba(37,99,235,0.3)]">Acceder a Meta</button>
                                            <button onClick={() => { setConnectionMode('manual'); setStep(1); }} className="text-[9px] text-white/40 font-bold uppercase tracking-[0.3em] hover:text-white transition-colors">Conectar Manualmente</button>
                                        </div>
                                    </motion.div>
                                ) : (step === 2 && wizardPath === 'existing') ? (
                                    <motion.div key="existing-choice" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col text-left font-sans">
                                        <h3 className="text-3xl font-extralight text-white tracking-tighter mb-4 italic">Protocolo de Migración</h3>
                                        <p className="text-[11px] text-white/30 font-light mb-10 uppercase tracking-widest">Identifica el núcleo de origen para la transferencia de datos.</p>

                                        <div className="space-y-4 mb-10">
                                            {['internal', 'other'].map((opt) => (
                                                <button
                                                    key={opt}
                                                    onClick={() => setBspChoice(opt as any)}
                                                    className={`w-full text-left p-6 rounded-[24px] border transition-all flex items-start gap-5 ${bspChoice === opt ? 'border-primary/50 bg-primary/5' : 'border-white/5 hover:border-white/10 bg-white/[0.02]'}`}
                                                >
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${bspChoice === opt ? 'bg-primary text-white' : 'bg-white/5 text-white/20'}`}>
                                                        {bspChoice === opt ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-3 h-3" />}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-white text-[11px] mb-1 uppercase tracking-[0.2em]">{opt === 'internal' ? 'Cuenta Nativa Roosevelt' : 'BSP Externo (Cloud API)'}</p>
                                                        {opt === 'other' && (
                                                            <p className="text-[10px] text-white/30 font-light leading-relaxed">Transferencia de WABA desde proveedores como Vonage, Twilio o Messagebird.</p>
                                                        )}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>

                                        <button
                                            onClick={() => setStep(3)}
                                            disabled={!bspChoice}
                                            className="px-10 h-14 rounded-full text-[10px] font-bold uppercase tracking-[0.3em] bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-white shadow-xl disabled:opacity-10 w-fit"
                                        >
                                            Iniciar Traspaso
                                        </button>
                                    </motion.div>
                                ) : (step === 3 && wizardPath === 'existing') ? (
                                    <motion.div key="existing-migrate" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col text-left font-sans">
                                        <h3 className="text-3xl font-extralight text-white tracking-tighter mb-4">Migración de Infraestructura</h3>
                                        <p className="text-[11px] text-white/30 font-light mb-10 uppercase tracking-widest italic">Sincronización de plantillas y calificación de calidad.</p>

                                        <div className="bg-white/5 border border-white/10 rounded-[28px] p-8 mb-10">
                                            <div className="flex items-start gap-4">
                                                <div className="p-2 bg-primary/20 rounded-lg"><AlertCircle className="w-5 h-5 text-primary" /></div>
                                                <p className="text-[11px] text-white/40 leading-relaxed font-light">
                                                    Este proceso moverá de forma íntegra tu identidad comercial, límites de mensajería y plantillas aprobadas hacia el control autónomo de Roosevelt.
                                                </p>
                                            </div>
                                        </div>

                                        <div className="space-y-6 mb-12">
                                            <div className="group transition-all">
                                                <p className="text-[10px] text-white font-bold mb-1 uppercase tracking-[0.2em]">01. Reset Security Flow</p>
                                                <p className="text-[10px] text-white/20 font-light leading-relaxed uppercase">Desactivar 2FA en el Business Manager de Meta antes de iniciar.</p>
                                            </div>
                                            <div className="group transition-all">
                                                <p className="text-[10px] text-white font-bold mb-1 uppercase tracking-[0.2em]">02. Approval Status</p>
                                                <p className="text-[10px] text-white/20 font-light leading-relaxed uppercase">Verificar que el nombre y estado de WABA estén aprobados por Meta.</p>
                                            </div>
                                            <div className="group transition-all border-b border-white/5 pb-6">
                                                <p className="text-[10px] text-white font-bold mb-1 uppercase tracking-[0.2em]">03. Popup Permissions</p>
                                                <p className="text-[10px] text-white/20 font-light leading-relaxed uppercase">Permitir ventanas emergentes para el handshake oficial de Meta.</p>
                                            </div>
                                        </div>

                                        <button
                                            onClick={handleConnectFacebook}
                                            className="bg-primary hover:bg-primary/80 text-white w-fit px-12 h-14 rounded-full text-[10px] font-bold uppercase tracking-[0.3em] transition-all flex items-center gap-4 shadow-[0_0_30px_rgba(37,99,235,0.2)]"
                                        >
                                            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M22.675 0h-21.35c-.732 0-1.325.593-1.325 1.325v21.351c0 .731.593 1.324 1.325 1.324h11.495v-9.294h-3.128v-3.622h3.128v-2.671c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12v9.293h6.116c.73 0 1.323-.593 1.323-1.325v-21.35c0-.732-.593-1.325-1.325-1.325z" /></svg>
                                            Authorize Meta Migration
                                        </button>
                                    </motion.div>
                                ) : (

                                    <motion.div key="connected" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="flex-1 flex flex-col text-left pt-0 pb-6 font-sans">
                                        {/* Header */}
                                        <div className="flex items-center gap-4 mb-6">
                                            <div className="w-12 h-12 bg-green-500/10 rounded-2xl flex items-center justify-center relative shrink-0">
                                                <div className="absolute inset-0 rounded-2xl border border-green-500/20 animate-pulse" />
                                                <CheckCircle2 className="w-6 h-6 text-green-500" />
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="text-2xl font-extralight text-white tracking-tighter leading-none mb-1">Números de WhatsApp</h3>
                                                <p className="text-[10px] text-white/30 uppercase tracking-[0.25em] font-bold">
                                                    {connectedSlotCount} {connectedSlotCount === 1 ? 'número activo' : 'números activos'} · Red Roosevelt
                                                </p>
                                            </div>
                                        </div>

                                        <div className="w-full mb-6">
                                            <WhatsAppReadinessPanel health={whatsappHealth} entityId={activeEntity} />
                                        </div>

                                        {/* Multi-number manager */}
                                        <div className="flex items-center justify-between mb-3 px-1">
                                            <span className="text-[9px] uppercase tracking-[0.25em] text-white/50 font-bold">Números conectados</span>
                                            <span className="text-[9px] text-white/30 font-mono">{connectedSlotCount}/3</span>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                                            {SLOTS.map((slot) => {
                                                const conn = slotConnections[slot.id];
                                                const isConnected = conn?.connected;
                                                return (
                                                    <div
                                                        key={slot.id}
                                                        className={`rounded-2xl border p-4 flex flex-col gap-3 transition-all ${isConnected ? 'border-emerald-500/25 bg-emerald-500/[0.04]' : 'border-white/8 bg-white/[0.02] hover:border-white/15'}`}
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isConnected ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-white/30'}`}>
                                                                    <Phone className="w-3.5 h-3.5" />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <p className="text-[11px] font-bold text-white leading-none truncate">{slot.label}</p>
                                                                    <p className="text-[8px] uppercase tracking-widest text-white/30 mt-1">{slot.id === 'general' ? 'Principal' : 'Adicional'}</p>
                                                                </div>
                                                            </div>
                                                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isConnected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]' : 'bg-white/15'}`} />
                                                        </div>

                                                        <p className="text-[9px] text-white/30 leading-relaxed min-h-[24px]">{slot.description}</p>

                                                        {isConnected ? (
                                                            <>
                                                                <p className="text-sm text-white font-light tracking-wide truncate">{conn.displayPhoneNumber || conn.phoneNumberId}</p>
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        onClick={() => openSlotEditor(slot.id)}
                                                                        className="flex-1 h-8 rounded-lg border border-white/10 text-white/60 hover:text-white hover:bg-white/5 text-[9px] font-bold uppercase tracking-widest flex items-center justify-center gap-1 transition-all"
                                                                    >
                                                                        <Pencil className="w-3 h-3" /> Editar
                                                                    </button>
                                                                    {slot.id !== 'general' && (
                                                                        <button
                                                                            onClick={() => handleDisconnectSlot(slot.id)}
                                                                            className="h-8 w-8 rounded-lg border border-red-500/20 text-red-400/70 hover:bg-red-500/10 flex items-center justify-center transition-all shrink-0"
                                                                            title="Desconectar"
                                                                        >
                                                                            <Trash2 className="w-3 h-3" />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <button
                                                                onClick={() => openSlotEditor(slot.id)}
                                                                className="mt-auto h-8 rounded-lg border border-emerald-500/25 bg-emerald-500/5 text-emerald-400 text-[9px] font-bold uppercase tracking-widest flex items-center justify-center gap-1 hover:bg-emerald-500/10 transition-all"
                                                            >
                                                                <Plus className="w-3 h-3" /> Conectar
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <p className="text-[9px] text-white/25 leading-relaxed mb-6 px-1">
                                            Asigna un número distinto a cada propósito. Cada número mantiene su propio bot activo y sus conversaciones en Omnicanal.
                                        </p>

                                        {/* Advanced / webhook config (collapsible) */}
                                        <button
                                            type="button"
                                            onClick={() => setShowAdvanced((v) => !v)}
                                            className="w-full flex items-center justify-between px-4 h-11 rounded-2xl border border-white/8 bg-white/[0.02] hover:bg-white/5 transition-all mb-3"
                                        >
                                            <span className="flex items-center gap-2 text-[9px] uppercase tracking-[0.2em] font-bold text-white/60">
                                                <Settings className="w-3.5 h-3.5" /> Webhook y verificación
                                            </span>
                                            <ChevronDown className={`w-4 h-4 text-white/40 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                                        </button>

                                        <AnimatePresence initial={false}>
                                            {showAdvanced && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="space-y-4 pt-1">
                                                        <div className="p-5 bg-amber-500/5 border border-amber-500/20 rounded-2xl text-left space-y-2">
                                                            <p className="text-[9px] text-amber-200/90 font-bold uppercase tracking-widest">Meta Developer Console</p>
                                                            <p className="text-[10px] text-white/50 leading-relaxed">
                                                                Desactiva <strong className="text-white/70">“Adjunta un certificado de cliente”</strong> antes de verificar. Ese switch suele causar el error rojo si el servidor no está configurado para certificados.
                                                            </p>
                                                        </div>

                                                        <div className="p-5 bg-white/[0.03] border border-emerald-500/20 rounded-2xl text-left space-y-3">
                                                            <span className="text-[9px] uppercase tracking-[0.2em] text-emerald-400/80 font-bold">Opción recomendada (copiar en Meta)</span>
                                                            <p className="text-[10px] text-white/50 font-mono break-all leading-relaxed">{globalWebhookUrl}</p>
                                                            <p className="text-[9px] text-white/40">Verify token: <span className="text-white/80 font-mono">{webhookMeta?.recommendedVerifyToken || 'vg37e'}</span></p>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    navigator.clipboard.writeText(globalWebhookUrl);
                                                                    toast.success('URL global copiada');
                                                                }}
                                                                className="w-full px-3 py-2 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-[9px] font-bold uppercase tracking-widest text-emerald-100"
                                                            >
                                                                <Copy className="w-3 h-3 inline mr-1" /> Copiar URL recomendada
                                                            </button>
                                                        </div>

                                                        <div className="p-5 bg-white/[0.03] border border-white/10 rounded-2xl text-left space-y-3">
                                                            <span className="text-[9px] uppercase tracking-[0.2em] text-white/40 font-bold">Token personalizado (opcional)</span>
                                                            <input
                                                                type="text"
                                                                value={waConfig.verifyToken}
                                                                onChange={(e) => setWaConfig({ ...waConfig, verifyToken: e.target.value.trim() })}
                                                                className="w-full h-10 bg-white/[0.02] border border-white/10 rounded-xl px-3 text-xs text-white font-mono"
                                                                placeholder="vg37e"
                                                            />
                                                            <button
                                                                type="button"
                                                                disabled={savingVerifyToken || !currentUser?.uid}
                                                                onClick={async () => {
                                                                    if (!currentUser?.uid || !activeEntity) return;
                                                                    setSavingVerifyToken(true);
                                                                    try {
                                                                        const res = await fetch('/api/whatsapp/webhook-config', {
                                                                            method: 'POST',
                                                                            headers: { 'Content-Type': 'application/json' },
                                                                            body: JSON.stringify({
                                                                                userId: currentUser.uid,
                                                                                entityId: activeEntity,
                                                                                verifyToken: waConfig.verifyToken || 'vg37e',
                                                                            }),
                                                                        });
                                                                        const data = await res.json();
                                                                        if (!res.ok) throw new Error(data.error || 'Error');
                                                                        toast.success('Token guardado. Úsalo igual en Meta.');
                                                                    } catch (err: any) {
                                                                        toast.error(err.message || 'No se pudo guardar');
                                                                    } finally {
                                                                        setSavingVerifyToken(false);
                                                                    }
                                                                }}
                                                                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-[9px] font-bold uppercase tracking-widest text-white/70 disabled:opacity-40"
                                                            >
                                                                {savingVerifyToken ? 'Guardando...' : 'Guardar token en Roosevelt'}
                                                            </button>
                                                            {tenantWebhookUrl && (
                                                                <>
                                                                    <p className="text-[9px] text-white/30 pt-2">URL por tenant (solo si usas token personalizado arriba):</p>
                                                                    <p className="text-[10px] text-white/40 font-mono break-all">{tenantWebhookUrl}</p>
                                                                    <p className="text-[9px] text-red-300/80">Nunca uses “TU_UID” — debe ser tu UID real de Firebase ({currentUser?.uid?.slice(0, 8)}…).</p>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>

                                        <div className="flex items-center gap-4 pt-8 mt-auto">
                                            <button onClick={onClose} className="flex-1 h-14 bg-white/5 border border-white/10 hover:bg-white/10 text-white text-[10px] font-bold uppercase tracking-[0.3em] rounded-full transition-all">TERMINAR</button>
                                            <button onClick={handleDeleteConfig} className="flex-1 h-14 bg-red-500/5 hover:bg-red-500/10 text-red-500/50 border border-red-500/10 text-[10px] font-bold uppercase tracking-[0.3em] rounded-full transition-all">DESCONECTAR PRINCIPAL</button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>

                    {/* Inline number editor for additional slots */}
                    <AnimatePresence>
                        {editingSlot && editingSlot !== 'general' && (
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="absolute inset-0 z-[10001] flex items-center justify-center p-4"
                            >
                                <div className="absolute inset-0 bg-black/75 backdrop-blur-md" onClick={() => !slotSaving && setEditingSlot(null)} />
                                <motion.div
                                    initial={{ scale: 0.95, y: 20, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                                    className="relative w-full max-w-md bg-[#0d0d0d] border border-white/10 rounded-3xl p-6 shadow-2xl"
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <h3 className="text-lg font-light text-white tracking-tight">
                                            Número · {SLOTS.find((s) => s.id === editingSlot)?.label}
                                        </h3>
                                        <button onClick={() => !slotSaving && setEditingSlot(null)} className="p-1.5 hover:bg-white/5 rounded-full transition-colors">
                                            <X className="w-4 h-4 text-white/40" />
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-white/30 mb-5">{SLOTS.find((s) => s.id === editingSlot)?.description}</p>

                                    <div className="space-y-4">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <div className="space-y-1.5">
                                                <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Phone Number ID</label>
                                                <input
                                                    type="text" placeholder="Ej: 676837795516836"
                                                    value={slotForm.phoneNumberId}
                                                    onChange={(e) => setSlotForm({ ...slotForm, phoneNumberId: e.target.value.replace(/[^0-9]/g, '') })}
                                                    className="w-full h-11 bg-white/[0.02] border border-white/10 rounded-xl px-4 text-xs text-white focus:border-blue-500/50 transition-all outline-none font-mono"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Número visible</label>
                                                <input
                                                    type="text" placeholder="Ej: +1 385 888 2799"
                                                    value={slotForm.displayPhoneNumber}
                                                    onChange={(e) => setSlotForm({ ...slotForm, displayPhoneNumber: e.target.value })}
                                                    className="w-full h-11 bg-white/[0.02] border border-white/10 rounded-xl px-4 text-xs text-white focus:border-blue-500/50 transition-all outline-none"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500">WABA ID</label>
                                            <input
                                                type="text" placeholder="Ej: 25304791939521"
                                                value={slotForm.wabaId}
                                                onChange={(e) => setSlotForm({ ...slotForm, wabaId: e.target.value.replace(/[^0-9]/g, '') })}
                                                className="w-full h-11 bg-white/[0.02] border border-white/10 rounded-xl px-4 text-xs text-white focus:border-blue-500/50 transition-all outline-none font-mono"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Access Token (permanente)</label>
                                            <textarea
                                                placeholder="Ej: EAARnTi3ZAPNYBR..."
                                                value={slotForm.accessToken}
                                                onChange={(e) => setSlotForm({ ...slotForm, accessToken: e.target.value })}
                                                className="w-full h-20 bg-white/[0.02] border border-white/10 rounded-xl px-4 py-3 text-[10px] text-white focus:border-blue-500/50 transition-all outline-none font-mono resize-none"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex gap-3 mt-6">
                                        <button
                                            onClick={() => setEditingSlot(null)}
                                            disabled={slotSaving}
                                            className="flex-1 h-12 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={handleSaveSlot}
                                            disabled={slotSaving}
                                            className="flex-1 h-12 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-blue-600/20 disabled:opacity-40 flex items-center justify-center gap-2"
                                        >
                                            {slotSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                            Guardar número
                                        </button>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}
        </AnimatePresence>
    );
}
