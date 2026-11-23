'use client';

import { useEffect, useState } from 'react';
import { collection, getCountFromServer, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useEntityRoute } from '@/hooks/useEntityRoute';

const WINDOW_DAYS = 30;

type ReplySample = { ms: number; bot: boolean };

type CampaignRow = {
    id: string;
    name: string;
    status: string;
    sent: number;
    replied: number;
    failed: number;
};

type Summary = {
    conversations: number;
    waiting: number;
    humanReplies: number;
    botReplies: number;
    medianAll: number | null;
    medianHuman: number | null;
    medianBot: number | null;
    contacts: number;
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    failed: number;
    campaigns: CampaignRow[];
    whatsapp: number;
    messenger: number;
    instagram: number;
    telegram: number;
};

const EMPTY: Summary = {
    conversations: 0,
    waiting: 0,
    humanReplies: 0,
    botReplies: 0,
    medianAll: null,
    medianHuman: null,
    medianBot: null,
    contacts: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    replied: 0,
    failed: 0,
    campaigns: [],
    whatsapp: 0,
    messenger: 0,
    instagram: 0,
    telegram: 0,
};

function toMillis(value: unknown): number | null {
    if (value == null) return null;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? null : parsed;
    }
    if (typeof value === 'object') {
        const stamp = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
        if (typeof stamp.toDate === 'function') {
            const date = stamp.toDate();
            return date instanceof Date ? date.getTime() : null;
        }
        const seconds = stamp.seconds ?? stamp._seconds;
        if (typeof seconds === 'number') return seconds * 1000;
    }
    return null;
}

function asNumber(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

function median(values: number[]): number | null {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function formatDuration(ms: number | null): string {
    if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
    const minutes = Math.round(ms / 60000);
    if (minutes < 1) return '< 1 min';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours < 48) return rest ? `${hours} h ${rest} min` : `${hours} h`;
    return `${Math.floor(hours / 24)} d`;
}

function isBroadcast(message: Record<string, unknown>): boolean {
    if (message.isBroadcast === true || message.source === 'broadcast') return true;
    const meta = message.metadata;
    return Boolean(meta && typeof meta === 'object' && (meta as { source?: string }).source === 'broadcast');
}

function isBotReply(message: Record<string, unknown>): boolean {
    if (message.nodeId) return true;
    const id = String(message.messageId || '');
    if (id.startsWith('bot_')) return true;
    const meta = message.metadata;
    if (meta && typeof meta === 'object' && (meta as { nodeId?: string }).nodeId) return true;
    return false;
}

function responseSamples(messages: unknown[], since: number): ReplySample[] {
    const timed = (Array.isArray(messages) ? messages : [])
        .map((item) => {
            const message = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
            return { message, at: toMillis(message.timestamp) };
        })
        .filter((item): item is { message: Record<string, unknown>; at: number } => item.at != null)
        .sort((a, b) => a.at - b.at);

    const samples: ReplySample[] = [];
    let waitingSince: number | null = null;
    for (const { message, at } of timed) {
        if (message.sender === 'user') {
            if (at >= since && waitingSince == null) waitingSince = at;
            continue;
        }
        if (message.sender !== 'agent' || isBroadcast(message)) continue;
        if (waitingSince == null) continue;
        samples.push({ ms: Math.max(0, at - waitingSince), bot: isBotReply(message) });
        waitingSince = null;
    }
    return samples;
}

function isWaiting(messages: unknown[]): boolean {
    const timed = (Array.isArray(messages) ? messages : [])
        .map((item) => {
            const message = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
            return { message, at: toMillis(message.timestamp) ?? 0 };
        })
        .filter((item) => !isBroadcast(item.message))
        .sort((a, b) => a.at - b.at);
    const last = timed[timed.length - 1];
    return Boolean(last && last.message.sender === 'user');
}

function channelOf(data: Record<string, unknown>): 'whatsapp' | 'messenger' | 'instagram' | 'telegram' {
    const raw = `${data.primary_channel || ''} ${data.channel || ''} ${data.source || ''}`.toLowerCase();
    if (raw.includes('instagram')) return 'instagram';
    if (raw.includes('messenger') || raw.includes('facebook')) return 'messenger';
    if (raw.includes('telegram')) return 'telegram';
    return 'whatsapp';
}

function campaignStatus(status: unknown): string {
    const value = String(status || '').toLowerCase();
    if (value === 'draft') return 'Borrador';
    if (value === 'scheduled') return 'Programada';
    if (value === 'sending') return 'Enviando';
    if (value === 'completed') return 'Completada';
    if (value === 'failed') return 'Fallida';
    return status ? String(status) : 'Sin estado';
}

function rollStats(stats: Record<string, unknown> | undefined) {
    const replied = asNumber(stats?.replied);
    const readOnly = asNumber(stats?.read);
    const deliveredOnly = asNumber(stats?.delivered);
    return {
        sent: asNumber(stats?.sent),
        failed: asNumber(stats?.failed),
        replied,
        read: readOnly + replied,
        delivered: deliveredOnly + readOnly + replied,
    };
}

export default function AnalyticsPage() {
    const { currentUser } = useAuth();
    const { firestoreId } = useEntityRoute();
    const [summary, setSummary] = useState<Summary>(EMPTY);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!currentUser?.uid || !firestoreId) return;
        let cancelled = false;
        const tenant = `users/${currentUser.uid}/entities/${firestoreId}`;
        const since = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;

        (async () => {
            try {
                const conversationsRef = collection(db, `${tenant}/conversations`);
                const [contactsCount, broadcastsSnap, conversationsSnap] = await Promise.all([
                    getCountFromServer(collection(db, `${tenant}/contacts`)).catch(() => null),
                    getDocs(collection(db, `${tenant}/broadcasts`)),
                    getDocs(query(conversationsRef, orderBy('updatedAt', 'desc'), limit(300))).catch(() =>
                        getDocs(query(conversationsRef, limit(300)))
                    ),
                ]);

                const samples: ReplySample[] = [];
                let conversations = 0;
                let waiting = 0;
                const channels = { whatsapp: 0, messenger: 0, instagram: 0, telegram: 0 };

                conversationsSnap.forEach((docSnap) => {
                    const data = docSnap.data();
                    const messages = Array.isArray(data.messages) ? data.messages : [];
                    const updated = toMillis(data.updatedAt) ?? toMillis(data.createdAt);
                    const inWindow = (updated != null && updated >= since) || messages.some((item) => {
                        const at = toMillis((item as { timestamp?: unknown })?.timestamp);
                        return at != null && at >= since;
                    });
                    if (inWindow) {
                        conversations += 1;
                        channels[channelOf(data)] += 1;
                    }
                    if (isWaiting(messages)) waiting += 1;
                    samples.push(...responseSamples(messages, since));
                });

                let sent = 0;
                let delivered = 0;
                let read = 0;
                let replied = 0;
                let failed = 0;
                const campaigns: CampaignRow[] = [];

                broadcastsSnap.forEach((docSnap) => {
                    const data = docSnap.data();
                    const rolled = rollStats(data.stats);
                    const created = toMillis(data.createdAt) ?? toMillis(data.launchedAt);
                    const inWindow = created == null || created >= since;
                    if (inWindow) {
                        sent += rolled.sent;
                        delivered += rolled.delivered;
                        read += rolled.read;
                        replied += rolled.replied;
                        failed += rolled.failed;
                    }
                    campaigns.push({
                        id: docSnap.id,
                        name: String(data.name || 'Campaña'),
                        status: campaignStatus(data.status),
                        sent: rolled.sent,
                        replied: rolled.replied,
                        failed: rolled.failed,
                        created: created ?? 0,
                    } as CampaignRow & { created: number });
                });

                campaigns.sort((a, b) => ((b as CampaignRow & { created: number }).created - (a as CampaignRow & { created: number }).created));

                const human = samples.filter((sample) => !sample.bot);
                const bot = samples.filter((sample) => sample.bot);

                if (!cancelled) {
                    setSummary({
                        conversations,
                        waiting,
                        humanReplies: human.length,
                        botReplies: bot.length,
                        medianAll: median(samples.map((sample) => sample.ms)),
                        medianHuman: median(human.map((sample) => sample.ms)),
                        medianBot: median(bot.map((sample) => sample.ms)),
                        contacts: contactsCount?.data().count ?? 0,
                        sent,
                        delivered,
                        read,
                        replied,
                        failed,
                        campaigns: campaigns.slice(0, 6).map(({ id, name, status, sent: rowSent, replied: rowReplied, failed: rowFailed }) => ({
                            id,
                            name,
                            status,
                            sent: rowSent,
                            replied: rowReplied,
                            failed: rowFailed,
                        })),
                        ...channels,
                    });
                }
            } catch (error) {
                console.error('[metricas]', error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [currentUser?.uid, firestoreId]);

    const show = (value: number) => (loading ? '—' : value.toLocaleString('es-ES'));
    const replyBase = Math.max(summary.sent, 1);
    const funnel = [
        { label: 'Enviados', value: summary.sent },
        { label: 'Entregados', value: summary.delivered },
        { label: 'Leídos', value: summary.read },
        { label: 'Respondieron', value: summary.replied },
        { label: 'Fallos', value: summary.failed },
    ];
    const funnelMax = Math.max(summary.sent, summary.failed, 1);

    return (
        <div className="flex h-screen w-full max-w-full bg-[#07080a] text-white font-outfit font-normal antialiased tracking-tight overflow-hidden">
            <main className="flex-1 flex flex-col p-6 overflow-auto">
                <div className="mb-4 shrink-0">
                    <h1 className="text-2xl sm:text-3xl font-normal text-white tracking-tight">Métricas</h1>
                    <p className="mt-1 text-xs text-neutral-500">Últimos {WINDOW_DAYS} días de esta cuenta. La primera respuesta no cuenta los mensajes de campaña.</p>
                </div>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-1 mb-6 shrink-0 text-[11px]">
                    {[
                        { label: 'Conversaciones', value: show(summary.conversations) },
                        { label: 'Esperando', value: show(summary.waiting) },
                        { label: 'Primera respuesta', value: loading ? '—' : formatDuration(summary.medianAll) },
                        { label: 'Contactos', value: show(summary.contacts) },
                        { label: 'Enviados', value: show(summary.sent) },
                        { label: 'Respuestas', value: show(summary.replied) },
                        { label: 'Fallos', value: show(summary.failed) },
                    ].map((item) => (
                        <div key={item.label} className="flex items-baseline gap-1.5">
                            <span className="text-neutral-500">{item.label}</span>
                            <span className="text-white tabular-nums">{item.value}</span>
                        </div>
                    ))}
                </div>

                <div className="grid gap-4 lg:grid-cols-2 mb-6">
                    <section className="rounded-xl border border-white/5 bg-[#0b0c10]/40 p-4">
                        <h2 className="text-sm font-normal">Quién respondió</h2>
                        <p className="mt-1 text-[11px] text-neutral-500">Persona y bot, por separado. No hay agentes con nombre.</p>
                        <div className="mt-4 space-y-3 text-xs">
                            <div className="flex items-end justify-between border-b border-white/5 pb-3">
                                <div>
                                    <p>Persona</p>
                                    <p className="text-neutral-500">{show(summary.humanReplies)} respuestas · {loading ? '—' : formatDuration(summary.medianHuman)}</p>
                                </div>
                            </div>
                            <div className="flex items-end justify-between border-b border-white/5 pb-3">
                                <div>
                                    <p>Bot</p>
                                    <p className="text-neutral-500">{show(summary.botReplies)} respuestas · {loading ? '—' : formatDuration(summary.medianBot)}</p>
                                </div>
                            </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-neutral-400">
                            <span>WhatsApp {show(summary.whatsapp)}</span>
                            <span>Messenger {show(summary.messenger)}</span>
                            <span>Instagram {show(summary.instagram)}</span>
                            <span>Telegram {show(summary.telegram)}</span>
                        </div>
                    </section>

                    <section className="rounded-xl border border-white/5 bg-[#0b0c10]/40 p-4">
                        <h2 className="text-sm font-normal">Campañas</h2>
                        <p className="mt-1 text-[11px] text-neutral-500">
                            {loading
                                ? 'Calculando envíos.'
                                : `${summary.replied.toLocaleString('es-ES')} respuestas de ${summary.sent.toLocaleString('es-ES')} enviados (${Math.round((summary.replied / replyBase) * 100)}%).`}
                        </p>
                        <div className="mt-4 space-y-3">
                            {funnel.map((row) => (
                                <div key={row.label}>
                                    <div className="mb-1 flex items-center justify-between text-[11px] text-neutral-400">
                                        <span>{row.label}</span>
                                        <span className="tabular-nums text-neutral-200">{show(row.value)}</span>
                                    </div>
                                    <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                                        <div
                                            className="h-full rounded-full bg-violet-400/80"
                                            style={{ width: row.value <= 0 ? '0%' : `${Math.round((row.value / funnelMax) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                <section>
                    <h2 className="text-sm font-normal mb-3">Últimas campañas</h2>
                    <div className="overflow-hidden rounded-xl border border-white/5 bg-[#0b0c10]/40">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-[#13151a]/30 text-[10px] uppercase tracking-[0.15em] text-neutral-500">
                                <tr>
                                    <th className="px-4 py-3 font-normal">Campaña</th>
                                    <th className="px-4 py-3 font-normal">Estado</th>
                                    <th className="px-4 py-3 text-right font-normal">Enviados</th>
                                    <th className="px-4 py-3 text-right font-normal">Respuestas</th>
                                    <th className="px-4 py-3 text-right font-normal">Fallos</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.campaigns.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-6 text-neutral-500">
                                            {loading ? 'Cargando campañas.' : 'Esta cuenta todavía no tiene campañas.'}
                                        </td>
                                    </tr>
                                ) : (
                                    summary.campaigns.map((campaign) => (
                                        <tr key={campaign.id} className="border-t border-white/5">
                                            <td className="px-4 py-3">{campaign.name}</td>
                                            <td className="px-4 py-3 text-neutral-400">{campaign.status}</td>
                                            <td className="px-4 py-3 text-right tabular-nums">{campaign.sent}</td>
                                            <td className="px-4 py-3 text-right tabular-nums">{campaign.replied}</td>
                                            <td className="px-4 py-3 text-right tabular-nums">{campaign.failed}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    <p className="mt-3 text-[11px] text-neutral-600">
                        La espera cuenta las conversaciones abiertas ahora. La satisfacción no se pide al cerrar un chat, así que no hay una nota de ese tipo.
                    </p>
                </section>
            </main>
        </div>
    );
}
