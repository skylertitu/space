'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search, Zap, ArrowRight, Settings2, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { getWhatsAppIntegrationHealth } from '@/lib/omnichannel/whatsappIntegrationStatus';
import { useAuth } from '@/contexts/AuthContext';
import { useEntityRoute } from '@/hooks/useEntityRoute';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

import { subscribeSlotConnections, type SlotConnections, type NumberSlot } from '@/lib/whatsapp/numbers';
import { getGmailConnectionState, getGoogleLoginEmail, readGmailBootstrap } from '@/lib/integrations/gmailAutoConnect';
import { Category, Integration, INTEGRATIONS, CATEGORIES } from './config';
import { WhatsAppCloudAPIModal } from './components/whatsapp_cloud_api/WhatsAppCloudAPIModal';
import MessengerModal from './components/messenger/MessengerModal';
import InstagramModal from './components/instagram/InstagramModal';
import TelegramModal from './components/telegram/TelegramModal';
import TwitterModal from './components/twitter/TwitterModal';
import GmailModal from './components/gmail/GmailModal';
import GeminiModal from './components/gemini/GeminiModal';
import StripeModal from './components/stripe/StripeModal';

export default function IntegrationsPage() {
    const { currentUser } = useAuth();
    const { firestoreId, routeSegment, entityName } = useEntityRoute();

    const [selectedCategory, setSelectedCategory] = useState<Category>('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [connectedIntegrations, setConnectedIntegrations] = useState<Record<string, any>>({});
    const [rawIntegrationDocs, setRawIntegrationDocs] = useState<Record<string, any>>({});
    const [slotConnections, setSlotConnections] = useState<SlotConnections>({
        general: { connected: false },
        support: { connected: false },
        broadcast: { connected: false },
    });
    const [loading, setLoading] = useState(true);
    const [gmailBootstrapPending, setGmailBootstrapPending] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeIntegration, setActiveIntegration] = useState<Integration | null>(null);

    useEffect(() => {
        if (!currentUser || !firestoreId) return;

        const integrationsRef = collection(db, `users/${currentUser.uid}/entities/${firestoreId}/integrations`);
        const q = query(integrationsRef);

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data: Record<string, any> = {};
            const raw: Record<string, any> = {};
            snapshot.docs.forEach((d) => {
                const docData = d.data();
                if (d.id === '_init') return;
                raw[d.id] = docData;

                if (d.id === 'whatsapp_internal' && (docData.status === 'Internal' || docData.status === 'Connected' || docData.status === 'Error')) {
                    data.whatsapp = { ...(data.whatsapp || {}), ...docData };
                } else if (docData.status === 'Connected' || docData.status === 'Error' || docData.status === 'Disconnected') {
                    if (d.id === 'whatsapp') {
                        const phone = docData.phoneNumberId || docData.phone_number_id;
                        const token = docData.accessToken || docData.token || docData.access_token;
                        if (!phone && !token) return;
                        data.whatsapp = { ...(data.whatsapp || {}), ...docData };
                    } else {
                        data[d.id] = docData;
                    }
                }
            });
            setConnectedIntegrations(data);
            setRawIntegrationDocs(raw);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser, firestoreId]);

    useEffect(() => {
        if (!currentUser?.uid || !firestoreId) return;
        const tenantPath = `users/${currentUser.uid}/entities/${firestoreId}`;
        const unsub = subscribeSlotConnections(tenantPath, setSlotConnections);
        return () => unsub();
    }, [currentUser?.uid, firestoreId]);

    useEffect(() => {
        const bootstrap = readGmailBootstrap();
        setGmailBootstrapPending(!!bootstrap && bootstrap.userId === currentUser?.uid);
    }, [currentUser?.uid, connectedIntegrations.gmail]);

    const whatsappNumberCount = (['general', 'support', 'broadcast'] as NumberSlot[])
        .filter((s) => slotConnections[s]?.connected).length;

    const whatsappHealth = getWhatsAppIntegrationHealth(
        rawIntegrationDocs.whatsapp,
        rawIntegrationDocs.whatsapp_internal
    );

    const gmailConnectionState = getGmailConnectionState(currentUser, connectedIntegrations.gmail);
    const googleLoginEmail = getGoogleLoginEmail(currentUser);

    const connectedCount = useMemo(
        () =>
            INTEGRATIONS.filter((item) =>
                isIntegrationConnected(item.id, connectedIntegrations[item.id], item.id === 'whatsapp' ? whatsappHealth : undefined)
            ).length,
        [connectedIntegrations, whatsappHealth]
    );

    const filteredIntegrations = INTEGRATIONS.filter((item) => {
        const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
        const matchesSearch =
            item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.category.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    const handleConnect = async (integration: Integration) => {
        if (!['whatsapp', 'messenger', 'instagram', 'telegram', 'x_twitter', 'gmail', 'gemini', 'stripe'].includes(integration.id)) {
            toast.info(`${integration.name}: Esta integración estará disponible próximamente en elizmey.`);
            return;
        }
        setActiveIntegration(integration);
        setIsModalOpen(true);
    };

    return (
        <div className="min-h-screen bg-[#050505] text-white relative overflow-y-auto">
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute -top-32 right-0 h-80 w-80 rounded-full bg-blue-600/8 blur-[120px]" />
                <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-violet-600/8 blur-[100px]" />
            </div>

            <main className="relative z-10 w-full px-5 py-8 md:px-10 md:py-12 lg:px-14">
                {/* Header */}
                <header className="mb-10">
                    <div className="mb-6 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                        <div className="max-w-xl">
                            <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em] text-blue-400/80">
                                <Zap className="h-3 w-3 fill-current" />
                                Master Connect
                            </div>
                            <h1 className="text-3xl font-extralight tracking-tight text-white md:text-4xl">
                                Integraciones
                            </h1>
                            <p className="mt-2 text-sm leading-relaxed text-white/40">
                                {entityName ? (
                                    <>
                                        Empresa: <span className="text-white/70">{entityName}</span>
                                        {' · '}
                                        Ruta: <span className="font-mono text-white/55">/home/{routeSegment}</span>
                                    </>
                                ) : (
                                    <>
                                        Conecta canales para{' '}
                                        <span className="font-mono text-white/55">/home/{routeSegment}</span>
                                    </>
                                )}
                            </p>
                        </div>

                        <div className="flex items-center gap-3 self-start md:self-auto">
                            <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-center">
                                <p className="text-[9px] font-bold uppercase tracking-widest text-white/35">Activas</p>
                                <p className="mt-0.5 text-2xl font-light text-white">
                                    {loading ? '—' : connectedCount}
                                    <span className="ml-1 text-sm text-white/30">/ {INTEGRATIONS.length}</span>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Toolbar */}
                    <div className="flex flex-col gap-4 rounded-[28px] border border-white/6 bg-white/[0.02] p-4 backdrop-blur-sm md:flex-row md:items-center md:justify-between">
                        <div className="relative min-w-0 flex-1 md:max-w-sm">
                            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
                            <input
                                type="text"
                                placeholder="Buscar por nombre o categoría…"
                                className="h-11 w-full rounded-xl border border-white/8 bg-black/40 pl-10 pr-4 text-sm text-white placeholder:text-white/25 focus:border-white/20 focus:outline-none"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                            {CATEGORIES.map((cat) => (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => setSelectedCategory(cat)}
                                    className={`shrink-0 rounded-full px-4 py-2 text-[11px] font-medium transition-all ${
                                        selectedCategory === cat
                                            ? 'bg-white text-black'
                                            : 'text-white/45 hover:bg-white/5 hover:text-white'
                                    }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>
                </header>

                {/* Grid */}
                {filteredIntegrations.length === 0 ? (
                    <div className="rounded-[28px] border border-dashed border-white/10 py-20 text-center">
                        <p className="text-sm text-white/40">No hay integraciones que coincidan con tu búsqueda.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                        <AnimatePresence mode="popLayout">
                            {filteredIntegrations.map((integration) => (
                                <IntegrationCard
                                    key={integration.id}
                                    integration={integration}
                                    activeEntity={firestoreId}
                                    routeSegment={routeSegment}
                                    isConnected={isIntegrationConnected(
                                        integration.id,
                                        connectedIntegrations[integration.id],
                                        integration.id === 'whatsapp' ? whatsappHealth : undefined
                                    )}
                                    integrationData={connectedIntegrations[integration.id]}
                                    whatsappHealth={integration.id === 'whatsapp' ? whatsappHealth : undefined}
                                    whatsappNumberCount={integration.id === 'whatsapp' ? whatsappNumberCount : undefined}
                                    gmailConnectionState={integration.id === 'gmail' ? gmailConnectionState : undefined}
                                    googleLoginEmail={integration.id === 'gmail' ? googleLoginEmail : undefined}
                                    gmailBootstrapPending={integration.id === 'gmail' ? gmailBootstrapPending : false}
                                    gmailAccountCount={
                                        integration.id === 'gmail'
                                            ? connectedIntegrations.gmail?.accountCount ??
                                              connectedIntegrations.gmail?.accounts?.length ??
                                              0
                                            : 0
                                    }
                                    onConnect={() => handleConnect(integration)}
                                />
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </main>

            {/* Modals */}
            {activeIntegration?.id === 'whatsapp' && (
                <WhatsAppCloudAPIModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    activeIntegration={activeIntegration}
                />
            )}
            {activeIntegration?.id === 'messenger' && (
                <MessengerModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    activeEntity={firestoreId}
                    currentUser={currentUser}
                />
            )}
            {activeIntegration?.id === 'instagram' && (
                <InstagramModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    activeEntity={firestoreId}
                    currentUser={currentUser}
                />
            )}
            {activeIntegration?.id === 'telegram' && (
                <TelegramModal
                    isOpen={isModalOpen}
                    onClose={() => {
                        setIsModalOpen(false);
                        setActiveIntegration(null);
                    }}
                    activeEntity={firestoreId}
                    currentUser={currentUser}
                />
            )}
            {activeIntegration?.id === 'x_twitter' && (
                <TwitterModal
                    isOpen={isModalOpen}
                    onClose={() => {
                        setIsModalOpen(false);
                        setActiveIntegration(null);
                    }}
                    activeEntity={firestoreId}
                    currentUser={currentUser}
                />
            )}
            {activeIntegration?.id === 'gmail' && (
                <GmailModal
                    isOpen={isModalOpen}
                    onClose={() => {
                        setIsModalOpen(false);
                        setActiveIntegration(null);
                    }}
                    activeEntity={firestoreId}
                    currentUser={currentUser}
                />
            )}
            {activeIntegration?.id === 'gemini' && (
                <GeminiModal
                    isOpen={isModalOpen}
                    onClose={() => {
                        setIsModalOpen(false);
                        setActiveIntegration(null);
                    }}
                    activeEntity={firestoreId}
                    currentUser={currentUser}
                />
            )}
            {activeIntegration?.id === 'stripe' && (
                <StripeModal
                    isOpen={isModalOpen}
                    onClose={() => {
                        setIsModalOpen(false);
                        setActiveIntegration(null);
                    }}
                    activeEntity={firestoreId}
                    currentUser={currentUser}
                />
            )}
        </div>
    );
}

function isIntegrationConnected(
    integrationId: string,
    integrationData?: any,
    whatsappHealth?: ReturnType<typeof getWhatsAppIntegrationHealth>
) {
    if (!integrationData && integrationId !== 'whatsapp') return false;
    if (integrationId === 'whatsapp') {
        const health = whatsappHealth || getWhatsAppIntegrationHealth(integrationData);
        return health.level === 'ready' || health.level === 'partial';
    }
    return integrationData?.status === 'Connected';
}

function getIntegrationStatusLabel(
    integrationId: string,
    integrationData?: any,
    whatsappHealth?: ReturnType<typeof getWhatsAppIntegrationHealth>,
    gmailConnectionState?: ReturnType<typeof getGmailConnectionState>,
    gmailBootstrapPending?: boolean
) {
    if (integrationId === 'whatsapp' && whatsappHealth) {
        if (whatsappHealth.level === 'ready') return 'Listo';
        if (whatsappHealth.level === 'partial') return 'Incompleto';
        return 'Offline';
    }
    if (integrationId === 'gmail' && gmailConnectionState === 'pending_authorization') {
        return gmailBootstrapPending ? 'Autorizando…' : 'Falta autorizar';
    }
    return isIntegrationConnected(integrationId, integrationData) ? 'Activo' : 'Offline';
}

function IntegrationCard({
    integration,
    activeEntity,
    routeSegment,
    isConnected,
    integrationData,
    whatsappHealth,
    whatsappNumberCount,
    gmailConnectionState,
    googleLoginEmail,
    gmailBootstrapPending,
    gmailAccountCount,
    onConnect,
}: {
    integration: Integration;
    activeEntity: string;
    routeSegment: string;
    isConnected: boolean;
    integrationData?: any;
    whatsappHealth?: ReturnType<typeof getWhatsAppIntegrationHealth>;
    whatsappNumberCount?: number;
    gmailConnectionState?: ReturnType<typeof getGmailConnectionState>;
    googleLoginEmail?: string | null;
    gmailBootstrapPending?: boolean;
    gmailAccountCount?: number;
    onConnect: () => void;
}) {
    const gmailPending = integration.id === 'gmail' && gmailConnectionState === 'pending_authorization';
    const statusLabel = getIntegrationStatusLabel(
        integration.id,
        integrationData,
        whatsappHealth,
        gmailConnectionState,
        gmailBootstrapPending
    );
    const statusReady = integration.id === 'whatsapp' && whatsappHealth?.canSend;
    const statusPartial = integration.id === 'whatsapp' && whatsappHealth?.level === 'partial';

    const accentColor = integration.color;

    return (
        <motion.article
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25 }}
            className={`group relative flex h-full min-h-[280px] flex-col overflow-hidden rounded-[28px] border bg-[#0a0a0a]/80 p-6 transition-all duration-300 hover:bg-[#0d0d0d] ${
                statusReady
                    ? 'border-emerald-500/25'
                    : statusPartial || gmailPending
                      ? 'border-amber-500/25'
                      : isConnected
                        ? 'border-white/12'
                        : 'border-white/6 hover:border-white/12'
            }`}
            style={{
                boxShadow: isConnected || statusReady ? `0 0 0 1px ${accentColor}10` : undefined,
            }}
        >
            {/* Accent line */}
            <div
                className="absolute inset-x-0 top-0 h-px opacity-60"
                style={{ background: `linear-gradient(90deg, transparent, ${accentColor}55, transparent)` }}
            />

            <div className="mb-4 flex items-start justify-between gap-3">
                <div className="shrink-0 transition-transform duration-300 group-hover:scale-105">
                    {integration.icon}
                </div>

                <div className="flex flex-col items-end gap-1.5">
                    <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-wider ${
                            statusReady
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                : statusPartial || gmailPending
                                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                                  : isConnected
                                    ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                                    : 'border-white/8 bg-white/[0.03] text-white/35'
                        }`}
                    >
                        <span
                            className={`h-1.5 w-1.5 rounded-full ${
                                statusReady
                                    ? 'bg-emerald-400'
                                    : statusPartial || gmailPending
                                      ? `bg-amber-400${gmailBootstrapPending ? ' animate-pulse' : ''}`
                                      : isConnected
                                        ? 'bg-blue-400'
                                        : 'bg-white/25'
                            }`}
                        />
                        {statusLabel}
                    </span>
                    <span className="text-[9px] uppercase tracking-widest text-white/25">{integration.category}</span>
                </div>
            </div>

            <h3 className="mb-1.5 text-lg font-medium text-white md:text-xl">{integration.name}</h3>
            <p className="mb-4 flex-grow text-[13px] leading-relaxed text-white/40">
                {gmailPending
                    ? `Cuenta Google detectada${googleLoginEmail ? ` (${googleLoginEmail})` : ''}. Falta autorizar Gmail para enviar correos.`
                    : integration.id === 'whatsapp' && whatsappHealth && isConnected
                      ? whatsappHealth.label
                      : integration.description}
            </p>

            {/* Meta chips */}
            <div className="mb-4 flex min-h-[24px] flex-wrap gap-1.5">
                {integration.id === 'gmail' && (gmailAccountCount ?? 0) > 0 && (
                    <span className="rounded-full border border-blue-500/20 bg-blue-500/8 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-blue-400/90">
                        {gmailAccountCount} {gmailAccountCount === 1 ? 'cuenta' : 'cuentas'}
                    </span>
                )}
                {gmailPending && googleLoginEmail && (
                    <span className="rounded-full border border-amber-500/20 bg-amber-500/8 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-400/90">
                        Google detectado
                    </span>
                )}
                {integration.id === 'whatsapp' && (whatsappNumberCount ?? 0) > 0 && (
                    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/8 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-emerald-400/90">
                        {whatsappNumberCount} {whatsappNumberCount === 1 ? 'número' : 'números'}
                    </span>
                )}
                {integration.id === 'whatsapp' && whatsappHealth?.phoneNumberId && (
                    <span className="rounded-full border border-white/8 bg-white/[0.03] px-2 py-0.5 font-mono text-[9px] text-white/35">
                        {whatsappHealth.phoneNumberId}
                    </span>
                )}
                {integration.popular && !isConnected && !gmailPending && (
                    <span className="rounded-full border border-white/10 bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-black">
                        Popular
                    </span>
                )}
            </div>

            {/* WhatsApp quick links — inside card, not full-width banner */}
            {integration.id === 'whatsapp' && statusReady && (
                <div className="mb-3 flex gap-2">
                    <Link
                        href={`/home/${routeSegment}/coo/omnichannel`}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/8 py-2 text-[9px] font-bold uppercase tracking-wider text-emerald-400 transition-colors hover:bg-emerald-500/15"
                    >
                        Omnicanal
                        <ExternalLink className="h-3 w-3 opacity-60" />
                    </Link>
                    <Link
                        href={`/home/${routeSegment}/cmo/broadcast/list`}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-blue-500/20 bg-blue-500/8 py-2 text-[9px] font-bold uppercase tracking-wider text-blue-400 transition-colors hover:bg-blue-500/15"
                    >
                        Difusiones
                        <ExternalLink className="h-3 w-3 opacity-60" />
                    </Link>
                </div>
            )}

            <button
                type="button"
                onClick={onConnect}
                className={`mt-auto flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[10px] font-bold uppercase tracking-[0.15em] transition-all ${
                    isConnected
                        ? 'border border-white/10 text-white/70 hover:border-white/20 hover:bg-white/5'
                        : gmailPending
                          ? 'border border-amber-500/25 bg-amber-500/12 text-amber-300 hover:bg-amber-500/20'
                          : 'bg-white text-black hover:bg-white/90'
                }`}
            >
                {isConnected ? (
                    <>
                        <Settings2 className="h-3.5 w-3.5" />
                        Ajustes
                    </>
                ) : gmailPending ? (
                    <>
                        {gmailBootstrapPending ? 'Esperando…' : 'Autorizar Gmail'}
                        <ArrowRight className="h-3 w-3" />
                    </>
                ) : (
                    <>
                        Conectar
                        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                    </>
                )}
            </button>
        </motion.article>
    );
}
