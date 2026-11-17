'use client';

import React, { useState, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Users, Shield, User,
    ArrowLeft, Search, Home, Key, Network, ToggleLeft, Settings, FlaskConical,
    WalletCards, Zap, ChevronDown, CreditCard
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

import { useAuth } from '@/contexts/AuthContext';

// Entity Switcher Imports
import { db, auth, storage } from '@/lib/firebase';
import { collection, onSnapshot, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signOut } from 'firebase/auth';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LogOut, X, Briefcase, Camera, Loader2, Save, ExternalLink, Copy, CheckCircle2, Calendar, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import CancelRenewalButton from '@/components/subscriptions/CancelRenewalButton';

const SIDEBAR_ITEMS = [
    { id: 'public-profile', label: "View Public Profile", icon: User, bg: "bg-white/10", color: "text-white", href: "/perfil" },
    { id: 'home', label: "Home", icon: Home, bg: "bg-[#A8C7FA]", color: "text-[#062E6F]" },
    { id: 'profile', label: "Personal info", icon: User, bg: "bg-[#6DD58C]", color: "text-[#00391B]" },
    { id: 'security', label: "Security & sign-in", icon: Shield, bg: "bg-[#71BCE1]", color: "text-[#00344F]" },
    { id: 'password', label: "Google password", icon: Key, bg: "bg-[#8AB4F8]", color: "text-[#174EA6]" },
    { id: 'third-party', label: "Third-party apps & services", icon: Network, bg: "bg-[#6CC6EB]", color: "text-[#004A70]" },
    { id: 'privacy', label: "Data & privacy", icon: ToggleLeft, bg: "bg-[#C589E8]", color: "text-[#491671]" },
    { id: 'team', label: "People & sharing", icon: Users, bg: "bg-[#F88CCF]", color: "text-[#630043]" },
    { id: 'billing', label: "Subscriptions", icon: WalletCards, bg: "bg-[#FCAD70]", color: "text-[#5B2100]" },
];

const normalizePlanName = (plan: string | null, priceUSD: number | null) => {
    const normalized = plan ? plan.toLowerCase() : '';
    if (normalized.includes('pro')) return 'pro';
    if (normalized.includes('starter')) return 'starter';
    if (normalized.includes('enterprise')) return 'enterprise';
    if (priceUSD === 19.99) return 'starter';
    if (priceUSD === 99.99) return 'pro';
    return normalized || 'plan';
};

const ActiveSubCard = ({
    details,
    userId,
    entityId,
    onSubscriptionChange,
}: {
    details: any;
    userId: string;
    entityId?: string | null;
    onSubscriptionChange: () => void;
}) => {
    const router = useRouter();
    const expiresAtDate = details.expiresAt ? new Date(details.expiresAt) : null;
    const expiresAtStr = expiresAtDate ? expiresAtDate.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A';

    // Calculate remaining days
    const totalDays = 30;
    const daysRemaining = expiresAtDate ? Math.max(0, Math.ceil((expiresAtDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))) : 0;
    const daysElapsed = Math.max(0, totalDays - daysRemaining);
    const progressPercent = Math.min(100, Math.max(0, (daysElapsed / totalDays) * 100));

    const normalizedPlan = normalizePlanName(details.plan || null, typeof details.priceUSD === 'number' ? details.priceUSD : null);
    const planName = normalizedPlan === 'plan' ? (details.plan || 'Plan') : normalizedPlan;
    const isEnterprise = planName.toLowerCase().includes('enterprise');
    const isPro = planName.toLowerCase().includes('pro');
    const cancelAtPeriodEnd = !!details.cancelAtPeriodEnd;
    const canUpgrade = !isEnterprise;

    const displayPrice = typeof details.priceUSD === 'number' ? details.priceUSD : isPro ? 99.99 : 19.99;
    const features = isPro
        ? ['Acceso ilimitado a Bóvedas', 'Soporte prioritario 24/7', 'Módulos SI Avanzados (CTO, COO)', 'Multisig y Conexiones ilimitadas']
        : ['1 Bóveda activa', 'Acceso a herramientas esenciales', 'Soporte base', 'Módulo financiero básico'];

    const handleCopySignature = () => {
        if (details.paymentSignature) {
            navigator.clipboard.writeText(details.paymentSignature);
            toast.success('Firma de pago copiada al portapapeles');
        }
    };

    const isCard = details.paymentMethod === 'card_stripe' || details.paymentMethod === 'card';

    return (
        <div className="w-full max-w-2xl bg-gradient-to-b from-[#1C1D21] to-[#121316] border border-white/5 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
            {/* Ambient Accent Light */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 blur-3xl rounded-full pointer-events-none" />

            {/* Header: Plan & Status */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/5">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                        <ShieldCheck className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-xl font-semibold tracking-wide text-white capitalize">{planName.replace('-monthly', '')} Plan</h3>
                            <span className="px-2.5 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-wider rounded-full animate-pulse">
                                Activo
                            </span>
                            {cancelAtPeriodEnd && (
                                <span className="px-2.5 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-bold uppercase tracking-wider rounded-full">
                                    Sin renovación
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                            {isCard
                                ? 'Suscripción recurrente gestionada con Tarjeta (Stripe)'
                                : 'Suscripción gestionada a través de Blockchain / Solana'}
                        </p>
                    </div>
                </div>
                <div className="text-left sm:text-right">
                    <span className="text-2xl font-bold tracking-tight text-white">
                        ${displayPrice.toFixed(2)}
                    </span>
                    <span className="text-xs text-gray-400 uppercase tracking-widest font-semibold ml-1">/ mes</span>
                </div>
            </div>

            {/* Subscription Progress Indicator */}
            <div className="py-6 border-b border-white/5">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm font-medium text-gray-200">Tiempo de Suscripción restante</span>
                    </div>
                    <span className="text-sm font-semibold text-emerald-400">{daysRemaining} días restantes</span>
                </div>
                <div className="w-full bg-[#202124] h-2.5 rounded-full overflow-hidden border border-white/5">
                    <div
                        className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-1000"
                        style={{ width: `${100 - progressPercent}%` }}
                    />
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-2.5 font-medium">
                    <span>Activado: {details.activatedAt ? new Date(details.activatedAt).toLocaleDateString('es-ES') : 'N/A'}</span>
                    <span>Vence el: <span className="text-gray-200 font-semibold">{expiresAtStr}</span></span>
                </div>
            </div>

            {/* Payment & Transaction Credentials */}
            <div className="py-6 border-b border-white/5 space-y-4">
                <h4 className="text-xs font-bold text-white/40 uppercase tracking-widest">Detalles de la Transacción</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-[#17181C] border border-white/5 p-4 rounded-2xl flex flex-col justify-between gap-1">
                        <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Método de Pago</span>
                        <span className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-1.5 mt-1">
                            {isCard ? (
                                <>
                                    <CreditCard className="w-4 h-4 text-blue-400" /> Tarjeta (Stripe)
                                </>
                            ) : (
                                <>
                                    Solana ({String(details.paymentMethod || 'SOL').toUpperCase()})
                                </>
                            )}
                        </span>
                    </div>
                    <div className="bg-[#17181C] border border-white/5 p-4 rounded-2xl flex flex-col justify-between gap-1 relative group">
                        <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                            {isCard ? 'ID de Pago Stripe' : 'Firma de Pago (Signature)'}
                        </span>
                        <div className="flex items-center justify-between gap-2 mt-1">
                            <span className="text-xs text-gray-300 font-mono">
                                {isCard
                                    ? (details.stripePaymentIntentId ? `${details.stripePaymentIntentId.slice(0, 12)}...` : 'Stripe Auto')
                                    : (details.paymentSignature ? `${details.paymentSignature.slice(0, 8)}...${details.paymentSignature.slice(-8)}` : 'N/A')}
                            </span>
                            {details.paymentSignature && !isCard && (
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={handleCopySignature}
                                        className="p-1 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors"
                                        title="Copiar firma"
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                    </button>
                                    <a
                                        href={`https://solscan.io/tx/${details.paymentSignature}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="p-1 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors"
                                        title="Ver en Solscan"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Perks & Features */}
            <div className="pt-6 space-y-4">
                <h4 className="text-xs font-bold text-white/40 uppercase tracking-widest">Beneficios Incluidos</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {features.map((feature, i) => (
                        <div key={i} className="flex items-start gap-2.5 text-sm text-gray-200">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            <span className="leading-snug">{feature}</span>
                        </div>
                    ))}
                </div>
            </div>

            {cancelAtPeriodEnd && (
                <p className="mt-6 text-xs text-amber-300/80 leading-relaxed">
                    Renovación cancelada. Acceso hasta el vencimiento. Los pagos en blockchain no se reembolsan.
                </p>
            )}

            <div className="mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-t border-white/5">
                <div className="text-xs text-white/40 max-w-sm">
                    {canUpgrade
                        ? 'Para subir a Pro o Enterprise: elige el plan y paga con Phantom.'
                        : 'Gestiona tu plan desde suscripciones.'}
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                    {canUpgrade && (
                        <button
                            type="button"
                            onClick={() => router.push('/subscriptions/upgrade')}
                            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-full text-xs font-semibold uppercase tracking-wider text-white transition-all"
                        >
                            Cambiar plan
                        </button>
                    )}
                    {!cancelAtPeriodEnd && (
                        <CancelRenewalButton
                            userId={userId}
                            entityId={entityId}
                            expiresAt={details.expiresAt}
                            onSuccess={onSubscriptionChange}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

const CONFIG_TAB_IDS = new Set(
    SIDEBAR_ITEMS.map((item) => item.id).filter((id) => id !== 'public-profile' && id !== 'home')
);

function ConfigurationPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { currentUser, loading: authLoading, activeEntity, activeEntityRoute, setActiveEntity } = useAuth();
    const [activeTab, setActiveTab] = useState('billing');
    const [searchQuery, setSearchQuery] = useState('');
    const [entities, setEntities] = useState<any[]>([]);
    const [subDetails, setSubDetails] = useState<any>(null);
    const [loadingSub, setLoadingSub] = useState(true);

    const fetchSubDetails = React.useCallback(async () => {
        if (!currentUser || !activeEntity) return;
        setLoadingSub(true);
        try {
            const entitySubRef = doc(db, `users/${currentUser.uid}/entities/${activeEntity}/subscriptions/current`);
            const entitySubSnap = await getDoc(entitySubRef);

            if (entitySubSnap.exists()) {
                setSubDetails(entitySubSnap.data());
                return;
            }

            const globalSubRef = doc(db, `users/${currentUser.uid}/subscriptions/current`);
            const globalSubSnap = await getDoc(globalSubRef);

            if (globalSubSnap.exists()) {
                setSubDetails(globalSubSnap.data());
            } else {
                setSubDetails(null);
            }
        } catch (err) {
            console.error('Error fetching sub details:', err);
        } finally {
            setLoadingSub(false);
        }
    }, [currentUser, activeEntity]);

    React.useEffect(() => {
        if (!authLoading && !currentUser) {
            router.replace('/login');
            return;
        }
        fetchSubDetails();
    }, [fetchSubDetails, authLoading, currentUser, router]);

    React.useEffect(() => {
        setActiveEntity('life');
        localStorage.setItem('roosevelt_active_entity', 'life');
    }, [setActiveEntity]);

    React.useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && CONFIG_TAB_IDS.has(tab)) {
            setActiveTab(tab);
        }
    }, [searchParams]);

    React.useEffect(() => {
        if (entities.length > 0 && activeEntity) {
            const currentEnt = entities.find(e => e.id.toLowerCase() === activeEntity.toLowerCase());
            const isPersonal = activeEntity === 'life' || currentEnt?.type === 'persona';
            if (!isPersonal && activeTab === 'billing') {
                setActiveTab('profile');
            }
        }
    }, [activeEntity, entities, activeTab]);

    const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({
        subscriptions: true,
    });

    const hasActiveSubscription =
        !!subDetails &&
        subDetails.status === 'active' &&
        (subDetails.expiresAt ? new Date(subDetails.expiresAt) > new Date() : true);

    // Profile Settings State
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [profileData, setProfileData] = useState({
        contactEmail: '',
        phone: '',
        website: '',
        address: ''
    });

    React.useEffect(() => {
        if (currentUser) {
            const q = collection(db, `users/${currentUser.uid}/entities`);
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const ents = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                setEntities(ents);
            });
            return () => unsubscribe();
        }
    }, [currentUser]);

    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !currentUser || !activeEntity) return;

        setIsUploadingPhoto(true);
        try {
            const imageRef = storageRef(storage, `users/${currentUser.uid}/entities/${activeEntity}/avatar_${Date.now()}`);
            await uploadBytes(imageRef, file);
            const url = await getDownloadURL(imageRef);

            const rootRef = doc(db, `users/${currentUser.uid}/entities/${activeEntity}`);
            await updateDoc(rootRef, { logoUrl: url });

            toast.success('Logo empresarial / Avatar actualizado');
        } catch (error) {
            console.error("Storage upload error", error);
            toast.error('Error al subir la imagen al Servidor');
        } finally {
            setIsUploadingPhoto(false);
        }
    };

    React.useEffect(() => {
        if (!currentUser || !activeEntity) return;
        const fetchProfile = async () => {
            const ref = doc(db, `users/${currentUser.uid}/entities/${activeEntity}/settings/profile`);
            const snap = await getDoc(ref);
            if (snap.exists()) {
                setProfileData({ ...profileData, ...snap.data() });
            } else {
                setProfileData({ contactEmail: '', phone: '', website: '', address: '' });
            }
        };
        fetchProfile();
    }, [currentUser, activeEntity]);

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser || !activeEntity) return;
        setIsSavingProfile(true);
        try {
            const ref = doc(db, `users/${currentUser.uid}/entities/${activeEntity}/settings/profile`);
            await setDoc(ref, {
                ...profileData,
                updatedAt: new Date().toISOString()
            }, { merge: true });
            toast.success('Bóveda actualizada correctamente');
        } catch (error: any) {
            console.error("Error saving profile", error);
            toast.error('Error al actualizar datos');
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleLogout = async () => {
        await signOut(auth);
        router.push('/login');
    };

    if (authLoading || !currentUser) {
        return (
            <div className="h-screen bg-black flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            </div>
        );
    }

    const userId = currentUser.uid;

    return (
        <div className="h-screen overflow-hidden bg-black text-white selection:bg-blue-500/30 font-sans flex relative">

            {/* Ambient Background */}
            <div className="absolute inset-0 z-0 pointer-events-none">
                <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-blue-600/5 blur-[120px] rounded-full mix-blend-screen" />
                <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-indigo-600/5 blur-[100px] rounded-full mix-blend-screen" />
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay" />
            </div>

            {/* Left Sidebar */}
            <aside className="w-64 sm:w-72 h-full shrink-0 border-r border-white/5 bg-black/50 backdrop-blur-xl relative z-10 hidden md:flex flex-col">
                <div className="p-6 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                        <Settings className="w-4 h-4 text-white" />
                    </div>
                    <h1 className="text-xl font-medium tracking-wide">Settings</h1>
                </div>

                <div className="px-4 pb-4">
                    <button
                        onClick={() => router.push(`/home/${activeEntityRoute || activeEntity || 'gateway'}`)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all font-medium"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Back to Dashboard</span>
                    </button>
                </div>

                <nav className="flex-1 px-3 space-y-1 overflow-y-auto no-scrollbar pb-6 mt-4">
                    {SIDEBAR_ITEMS.filter((item) => {
                        if (item.id === 'billing') {
                            const isPersonal = activeEntity === 'life' ||
                                entities.find(e => e.id.toLowerCase() === activeEntity?.toLowerCase())?.type === 'persona';
                            return isPersonal;
                        }
                        return true;
                    }).map((item) => {
                        const isActive = activeTab === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => {
                                    if (item.href) {
                                        router.push(item.href);
                                    } else {
                                        setActiveTab(item.id);
                                    }
                                }}
                                className={`w-full flex items-center gap-4 px-4 py-3 rounded-full transition-all text-[15px] font-medium ${isActive
                                        ? 'bg-[#3C4043] text-white'
                                        : 'text-[#E8EAED] hover:bg-[#3C4043]/50'
                                    }`}
                            >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${item.bg}`}>
                                    <item.icon className={`w-4 h-4 ${item.color} ${isActive ? 'opacity-100' : ''}`} />
                                </div>
                                <span className="tracking-wide text-left leading-snug">{item.label}</span>
                            </button>
                        );
                    })}
                </nav>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 h-full overflow-y-auto relative z-10">
                {/* Top Right Identity Switcher */}
                <div className="absolute top-8 right-8 z-[2000]">
                    <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                            <button className="relative focus:outline-none group">
                                <div className="absolute inset-[-4px] rounded-full border border-blue-500/0 group-hover:border-blue-500/40 transition-all duration-500" />
                                <Avatar className="w-10 h-10 border border-white/10 shadow-2xl transition-transform group-hover:scale-110 active:scale-95">
                                    <AvatarImage src={entities.find(e => e.id === activeEntity)?.logoUrl || (entities.find(e => e.id === activeEntity)?.type === 'persona' ? currentUser?.photoURL : '')} />
                                    <AvatarFallback className="bg-gradient-to-br from-indigo-600 to-blue-700 text-white font-bold text-xs">
                                        {entities.find(e => e.id === activeEntity)?.name?.[0] || currentUser?.displayName?.[0] || 'U'}
                                    </AvatarFallback>
                                </Avatar>
                            </button>
                        </DropdownMenu.Trigger>

                        <DropdownMenu.Portal>
                            <DropdownMenu.Content
                                align="end"
                                sideOffset={12}
                                className="w-[340px] bg-[#1A1C1E] border border-white/5 rounded-[2rem] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.5)] backdrop-blur-3xl animate-in fade-in slide-in-from-top-4 duration-300 z-[3000] overflow-hidden p-0"
                            >
                                <div className="flex justify-between items-center px-6 pt-6 mb-4">
                                    <div className="flex-1 text-center">
                                        <p className="text-[11px] font-bold text-white/40 tracking-wider lowercase">{currentUser?.email}</p>
                                    </div>
                                    <DropdownMenu.Item className="focus:outline-none cursor-pointer">
                                        <X className="w-5 h-5 text-white/40 hover:text-white transition-colors" />
                                    </DropdownMenu.Item>
                                </div>

                                <div className="flex flex-col items-center px-8 pb-6 text-center border-b border-white/5">
                                    <div className="relative mb-4">
                                        <Avatar className="w-20 h-20 border border-white/10 shadow-2xl">
                                            <AvatarImage src={entities.find(e => e.id === activeEntity)?.logoUrl || (entities.find(e => e.id === activeEntity)?.type === 'persona' ? currentUser?.photoURL : '')} />
                                            <AvatarFallback className="bg-neutral-800 text-xl font-bold uppercase">
                                                {entities.find(e => e.id === activeEntity)?.name?.[0] || currentUser?.displayName?.[0] || 'U'}
                                            </AvatarFallback>
                                        </Avatar>
                                    </div>
                                    <h3 className="text-xl font-light text-white mb-2">Hi, {currentUser?.displayName?.split(' ')[0] || 'there'}!</h3>
                                    <p className="text-xs text-blue-400 font-medium">Active Entity: {entities.find(e => e.id === activeEntity)?.name || activeEntity}</p>
                                </div>

                                {/* Entities List (Switcher) */}
                                <div className="max-h-[200px] overflow-y-auto no-scrollbar p-2">
                                    <p className="text-[9px] font-bold text-white/30 tracking-widest uppercase px-4 py-2">Switch Entity</p>
                                    {entities.map(ent => (
                                        <DropdownMenu.Item
                                            key={ent.id}
                                            onSelect={() => {
                                                setActiveEntity(ent.id);
                                                localStorage.setItem('roosevelt_active_entity', ent.id);
                                            }}
                                            className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 cursor-pointer outline-none transition-all group"
                                        >
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${activeEntity === ent.id ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/50 group-hover:bg-white/10'}`}>
                                                {ent.type === 'persona' ? <User className="w-4 h-4" /> : <Briefcase className="w-4 h-4" />}
                                            </div>
                                            <div className="flex-1 text-left">
                                                <span className={`block text-sm font-medium ${activeEntity === ent.id ? 'text-white' : 'text-white/70 group-hover:text-white'}`}>{ent.name || ent.id}</span>
                                                <span className="block text-[10px] text-white/30 uppercase tracking-widest">{ent.type || 'Entity'}</span>
                                            </div>
                                        </DropdownMenu.Item>
                                    ))}
                                </div>

                                {/* Footer Logout */}
                                <div className="p-2 border-t border-white/5 bg-black/20">
                                    <DropdownMenu.Item
                                        onClick={handleLogout}
                                        className="w-full bg-white/[0.03] hover:bg-red-500/10 rounded-xl flex items-center gap-4 cursor-pointer outline-none transition-all px-4 py-3 group"
                                    >
                                        <LogOut className="w-5 h-5 text-white/40 group-hover:text-red-500" />
                                        <span className="text-[11px] font-bold text-white/60 group-hover:text-red-500">Sign out</span>
                                    </DropdownMenu.Item>
                                </div>
                            </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                </div>

                <div className="max-w-5xl mx-auto px-6 py-12 md:py-20 lg:px-12">

                    {/* Header Avatar & Search */}
                    <div className="flex flex-col items-center mb-16">
                        <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={handleImageUpload} />
                        <motion.div
                            onClick={() => fileInputRef.current?.click()}
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className={`w-24 h-24 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 border border-white/10 p-1 mb-6 relative group cursor-pointer ${isUploadingPhoto ? 'animate-pulse' : ''}`}
                        >
                            <div className="w-full h-full rounded-full bg-black flex items-center justify-center overflow-hidden relative">
                                {(() => {
                                    const currentEnt = entities.find(e => e.id === activeEntity);
                                    const photoUrl = currentEnt?.logoUrl || (currentEnt?.type === 'persona' ? currentUser?.photoURL : null);

                                    if (photoUrl) {
                                        return <img src={photoUrl} alt="Avatar" className="w-full h-full object-cover" />;
                                    }
                                    return (
                                        <div className="text-3xl font-light text-white/50 tracking-widest uppercase">
                                            {currentEnt?.name?.[0] || 'E'}
                                        </div>
                                    );
                                })()}
                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                                    {isUploadingPhoto ? (
                                        <Loader2 className="w-6 h-6 animate-spin text-white/80" />
                                    ) : (
                                        <span className="text-[10px] font-bold text-white/80 uppercase tracking-widest text-center px-2 leading-tight">Change<br />Photo</span>
                                    )}
                                </div>
                            </div>
                        </motion.div>

                        <h2 className="text-3xl font-light mb-2 tracking-wide">
                            {entities.find(e => e.id === activeEntity)?.name || 'Cargando Entidad...'}
                        </h2>
                        <p className="text-[11px] uppercase tracking-[0.2em] text-blue-400 font-bold mb-10">
                            {entities.find(e => e.id === activeEntity)?.type === 'persona'
                                ? currentUser?.email
                                : `BÓVEDA EMPRESARIAL · ${activeEntity}`
                            }
                        </p>

                        {/* Search Bar */}
                        <div className="w-full max-w-2xl relative group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                            <input
                                type="text"
                                placeholder="Search settings, billing, or security..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-6 text-sm text-white focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all font-light placeholder:text-gray-600"
                            />
                        </div>
                    </div>

                    {/* Dynamic Tab Content */}
                    <AnimatePresence mode="wait">
                        {activeTab === 'billing' && (
                            <motion.div
                                key="billing"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.3 }}
                                className="w-full max-w-4xl mx-auto space-y-8"
                            >
                                <div className="mb-8">
                                    <h3 className="text-xl font-medium text-white mb-2">Subscriptions</h3>
                                    <p className="text-sm text-gray-400 leading-relaxed font-light">
                                        View and manage your Roosevelt plan. Payments are handled on the subscriptions page.
                                    </p>
                                </div>

                                <div className="flex flex-col gap-4">

                                    {/* Subscriptions */}
                                    <div className="flex flex-col rounded-[24px] bg-[#202124] transition-colors border border-transparent hover:border-white/5 overflow-hidden">
                                        <div
                                            onClick={() => {
                                                setExpandedModules((p) => ({ ...p, subscriptions: !p.subscriptions }));
                                            }}
                                            className="flex items-center justify-between p-6 cursor-pointer hover:bg-[#2A2B2E] transition-colors"
                                        >
                                            <div className="flex items-start gap-5">
                                                <div className="mt-1">
                                                    <Zap className="w-6 h-6 text-green-400" />
                                                </div>
                                                <div>
                                                    <h4 className="text-[15px] font-medium text-white mb-1">Active Subscriptions</h4>
                                                    <p className="text-sm text-gray-400 leading-relaxed max-w-2xl">
                                                        {hasActiveSubscription
                                                            ? 'Your current plan and billing period.'
                                                            : 'Activate a plan to unlock premium modules.'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="px-4 flex items-center gap-3">
                                                {!loadingSub && !hasActiveSubscription && (
                                                    <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
                                                        Activate
                                                    </span>
                                                )}
                                                <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${expandedModules.subscriptions ? 'rotate-180' : ''}`} />
                                            </div>
                                        </div>

                                        <AnimatePresence>
                                            {expandedModules.subscriptions && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="p-6 pt-0 md:pl-[84px]">
                                                        {loadingSub ? (
                                                                <div className="flex items-center gap-3 text-gray-400 py-4">
                                                                    <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                                                                    <span className="text-sm font-medium">Cargando detalles de suscripción...</span>
                                                                </div>
                                                            ) : hasActiveSubscription && userId ? (
                                                                <ActiveSubCard
                                                                    details={subDetails}
                                                                    userId={userId}
                                                                    entityId={activeEntity}
                                                                    onSubscriptionChange={fetchSubDetails}
                                                                />
                                                            ) : (
                                                                <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#1A1C1E] p-8 text-center">
                                                                    <CreditCard className="w-10 h-10 text-blue-400 mx-auto mb-4" />
                                                                    <h4 className="text-lg font-medium text-white mb-2">No hay suscripción activa</h4>
                                                                    <p className="text-sm text-gray-400 mb-6">
                                                                        Elige un plan en la página de suscripciones para activar tu acceso.
                                                                    </p>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => router.push('/subscriptions')}
                                                                        className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-full transition-all"
                                                                    >
                                                                        Ir a suscripciones
                                                                    </button>
                                                                </div>
                                                            )}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {activeTab === 'profile' && (
                            <motion.div
                                key="profile"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.3 }}
                                className="w-full max-w-4xl mx-auto space-y-8"
                            >
                                <div className="mb-8">
                                    <h3 className="text-xl font-medium text-white mb-2">Personal & Business Info</h3>
                                    <p className="text-sm text-gray-400 leading-relaxed font-light">
                                        Administra los datos privados de la identidad actual: <span className="text-white font-medium">{entities.find(e => e.id === activeEntity)?.name}</span>. Todo se guarda seguro en su sub-bóveda exclusiva.
                                    </p>
                                </div>

                                <form onSubmit={handleSaveProfile} className="space-y-6">
                                    <div className="p-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl space-y-8">

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Email de Contacto Privado</label>
                                                <input
                                                    type="email"
                                                    value={profileData.contactEmail}
                                                    onChange={e => setProfileData({ ...profileData, contactEmail: e.target.value })}
                                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-sm focus:border-blue-500/50 focus:outline-none transition-colors"
                                                    placeholder="ceo@empresa.com"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Teléfono (WhatsApp/Llamadas)</label>
                                                <input
                                                    type="tel"
                                                    value={profileData.phone}
                                                    onChange={e => setProfileData({ ...profileData, phone: e.target.value })}
                                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-sm focus:border-blue-500/50 focus:outline-none transition-colors"
                                                    placeholder="+1 (555) 000-0000"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Website Oficial</label>
                                            <input
                                                type="url"
                                                value={profileData.website}
                                                onChange={e => setProfileData({ ...profileData, website: e.target.value })}
                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-sm focus:border-blue-500/50 focus:outline-none transition-colors"
                                                placeholder="https://roosevelt.system"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Dirección de Operaciones</label>
                                            <textarea
                                                rows={3}
                                                value={profileData.address}
                                                onChange={e => setProfileData({ ...profileData, address: e.target.value })}
                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-sm focus:border-blue-500/50 focus:outline-none transition-colors resize-none"
                                                placeholder="123 Financial District..."
                                            />
                                        </div>

                                    </div>

                                    <div className="flex justify-end">
                                        <button
                                            type="submit"
                                            disabled={isSavingProfile}
                                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium px-8 py-4 rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2"
                                        >
                                            {isSavingProfile ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                            <span>{isSavingProfile ? 'Sincronizando...' : 'Guardar Información'}</span>
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        )}

                        {activeTab !== 'billing' && activeTab !== 'profile' && (
                            <motion.div
                                key="placeholder"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="w-full max-w-4xl mx-auto flex flex-col items-center justify-center py-20 opacity-50"
                            >
                                <FlaskConical className="w-12 h-12 text-gray-500 mb-6" />
                                <h3 className="text-lg font-medium text-gray-400 tracking-wide">Section under construction</h3>
                                <p className="text-sm text-gray-600 mt-2 font-light">The `{activeTab}` settings module is currently being built.</p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                </div>
            </main>
        </div>
    );
}

export default function ConfigurationPage() {
    return (
        <Suspense fallback={<motion.div className="h-screen bg-black" />}>
            <ConfigurationPageContent />
        </Suspense>
    );
}
