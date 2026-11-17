"use client";

import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Search, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useEntityRoute } from "@/hooks/useEntityRoute";
import type { Broadcast, BroadcastRecipient, RecipientStatus } from "../lib/types";
import { useBroadcastConversationCards } from "../lib/useBroadcastConversationCards";
import { resolveBroadcastRecipientText } from "../lib/resolveBroadcastMessageText";
import { recipientQualifiesAsReplied } from "../lib/broadcastReplyUtils";
import type { ResolvedBroadcastCard } from "../lib/resolveBroadcastRecipientCard";
import BroadcastRecipientChat from "./BroadcastRecipientChat";
import ResizeHandle from "./ResizeHandle";

const LAYOUT_STORAGE_KEY = "broadcast-campaign-results-layout";
const DEFAULT_CONTACTS_WIDTH = 280;
const DEFAULT_STATS_WIDTH = 360;
const MIN_CONTACTS_WIDTH = 220;
const MIN_STATS_WIDTH = 260;
const MIN_CHAT_WIDTH = 280;
const HANDLE_WIDTH = 6; // w-1.5 = 6px

interface CampaignResultsProps {
    broadcast: Broadcast;
    recipients: BroadcastRecipient[];
    recipientsLoading?: boolean;
    tenantPath: string;
    onClose: () => void;
}

const STATUS_LABELS: Record<RecipientStatus, string> = {
    pending: "Pendiente",
    sent: "Enviado",
    delivered: "Entregado",
    read: "Leído",
    replied: "Respondió",
    failed: "Falló",
};

function formatTs(ts: any): string {
    if (!ts) return "—";
    try {
        const date =
            typeof ts?.toDate === "function"
                ? ts.toDate()
                : ts?.seconds
                  ? new Date(ts.seconds * 1000)
                  : new Date(ts);
        if (isNaN(date.getTime())) return "—";
        return date.toLocaleString("es-ES", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return "—";
    }
}

function pct(n: number, d: number): number {
    return d > 0 ? Math.round((n / d) * 100) : 0;
}

export default function CampaignResults({
    broadcast,
    recipients,
    recipientsLoading,
    tenantPath,
    onClose,
}: CampaignResultsProps) {
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<RecipientStatus | "all">("all");
    const [selectedRecipient, setSelectedRecipient] = useState<BroadcastRecipient | null>(null);
    const [resolvedCard, setResolvedCard] = useState<ResolvedBroadcastCard | null>(null);
    const [resolvingChat, setResolvingChat] = useState(false);
    const [replyPreviews, setReplyPreviews] = useState<Record<string, string>>({});
    const [visible, setVisible] = useState(true);
    const [contactsWidth, setContactsWidth] = useState(DEFAULT_CONTACTS_WIDTH);
    const [statsWidth, setStatsWidth] = useState(DEFAULT_STATS_WIDTH);
    const layoutRef = useRef<HTMLDivElement>(null);
    const layoutLoadedRef = useRef(false);
    const { currentUser } = useAuth();
    const { firestoreId } = useEntityRoute();

    // Silently persist real outbound text into /conversations for this campaign (no UI button).
    useEffect(() => {
        if (!currentUser?.uid || !firestoreId || !broadcast.id) return;
        if (!["Completed", "Sending", "Failed"].includes(broadcast.status)) return;

        fetch("/api/whatsapp/broadcast/backfill-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userId: currentUser.uid,
                entityId: firestoreId,
                broadcastId: broadcast.id,
            }),
        }).catch(() => undefined);
    }, [broadcast.id, broadcast.status, currentUser?.uid, firestoreId]);

    const { groups, cards, loading: cardsLoading, resolveCardForRecipient, getGroupName } =
        useBroadcastConversationCards(tenantPath);

    const confirmedReplied = useMemo(
        () => recipients.filter((r) => recipientQualifiesAsReplied(r)),
        [recipients]
    );

    const stats = useMemo(() => {
        const s = { total: recipients.length, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0, pending: 0 };
        recipients.forEach((r) => {
            if (recipientQualifiesAsReplied(r)) s.replied++;
            else if (r.status === "failed") s.failed++;
            else if (r.status === "pending") s.pending++;
            else if (r.status === "read") s.read++;
            else if (r.status === "delivered") s.delivered++;
            else if (r.status === "sent") s.sent++;
            else s.pending++;
        });
        return s;
    }, [recipients]);

    const reached = stats.sent + stats.delivered + stats.read + stats.replied;
    const deliveredTotal = stats.delivered + stats.read + stats.replied;
    const readTotal = stats.read + stats.replied;
    const deliveryRate = pct(deliveredTotal, reached);
    const readRate = pct(readTotal, deliveredTotal || reached);
    const responseRate = pct(stats.replied, reached);

    const filtered = useMemo(() => {
        return recipients.filter((r) => {
            const matchesStatus =
                statusFilter === "all" ||
                (statusFilter === "replied"
                    ? recipientQualifiesAsReplied(r)
                    : r.status === statusFilter);
            const q = search.toLowerCase();
            return (
                matchesStatus &&
                (!q ||
                    (r.name || "").toLowerCase().includes(q) ||
                    (r.phone || "").includes(q) ||
                    (r.country || "").toLowerCase().includes(q))
            );
        });
    }, [recipients, search, statusFilter]);

    // Resolve chat card when a recipient is selected (loads real conversation from Firestore).
    useEffect(() => {
        if (!selectedRecipient) {
            setResolvedCard(null);
            return;
        }

        let cancelled = false;
        setResolvingChat(true);
        resolveCardForRecipient(selectedRecipient)
            .then((card) => {
                if (!cancelled) setResolvedCard(card);
            })
            .finally(() => {
                if (!cancelled) setResolvingChat(false);
            });

        return () => {
            cancelled = true;
        };
    }, [selectedRecipient, resolveCardForRecipient]);

    // Preload last reply preview for contacts who responded.
    const previewsLoadedRef = useRef<string>("");
    useEffect(() => {
        if (!tenantPath || cardsLoading) return;
        const key = recipients.map((r) => `${r.id}:${r.status}`).join("|");
        if (previewsLoadedRef.current === key) return;
        previewsLoadedRef.current = key;

        const replied = confirmedReplied;
        replied.forEach((r) => {
            if (r.replyText?.trim()) {
                setReplyPreviews((prev) => ({ ...prev, [r.id]: r.replyText!.trim() }));
                return;
            }
            resolveCardForRecipient(r).then((card) => {
                if (card.lastUserReply) {
                    setReplyPreviews((prev) => ({ ...prev, [r.id]: card.lastUserReply! }));
                }
            });
        });
    }, [recipients, confirmedReplied, tenantPath, cardsLoading, resolveCardForRecipient]);

    // Auto-select first contact who replied so the chat isn't empty on open.
    useEffect(() => {
        if (selectedRecipient || recipients.length === 0) return;
        const first =
            confirmedReplied[0] ||
            recipients.find((r) => r.status === "read") ||
            recipients[0];
        if (first) setSelectedRecipient(first);
    }, [recipients, confirmedReplied, selectedRecipient]);

    const activeGroupName = resolvedCard?.groupId ? getGroupName(resolvedCard.groupId) : "";

    const messagePreview = useMemo(() => {
        const msg = broadcast.message;
        if (!msg) return "Sin mensaje";
        if (msg.kind === "text") return msg.text || "Texto";
        if (msg.kind === "template") {
            if (msg.templateBody?.trim()) {
                const sample = recipients[0];
                if (sample) {
                    return resolveBroadcastRecipientText(broadcast, sample);
                }
                return msg.templateBody;
            }
            return msg.templateName || "Plantilla";
        }
        if (msg.kind === "media") return msg.caption || msg.mediaType || "Media";
        return "—";
    }, [broadcast, recipients]);

    const filterChips: (RecipientStatus | "all")[] = [
        "all",
        "replied",
        "read",
        "delivered",
        "sent",
        "failed",
        "pending",
    ];

    const clampPanelWidths = useCallback((contacts: number, stats: number) => {
        const containerW = layoutRef.current?.clientWidth ?? 1200;
        const maxContacts = Math.max(MIN_CONTACTS_WIDTH, containerW * 0.45);
        const maxStats = Math.max(MIN_STATS_WIDTH, containerW * 0.5);
        let nextContacts = Math.min(Math.max(contacts, MIN_CONTACTS_WIDTH), maxContacts);
        let nextStats = Math.min(Math.max(stats, MIN_STATS_WIDTH), maxStats);

        const reserved = nextContacts + nextStats + MIN_CHAT_WIDTH + HANDLE_WIDTH * 2;
        if (reserved > containerW) {
            const overflow = reserved - containerW;
            const statsShrink = Math.min(overflow, nextStats - MIN_STATS_WIDTH);
            nextStats -= statsShrink;
            const remaining = overflow - statsShrink;
            if (remaining > 0) {
                nextContacts = Math.max(MIN_CONTACTS_WIDTH, nextContacts - remaining);
            }
        }

        return { contacts: nextContacts, stats: nextStats };
    }, []);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as { contacts?: number; stats?: number };
            const clamped = clampPanelWidths(
                parsed.contacts ?? DEFAULT_CONTACTS_WIDTH,
                parsed.stats ?? DEFAULT_STATS_WIDTH
            );
            setContactsWidth(clamped.contacts);
            setStatsWidth(clamped.stats);
        } catch {
            /* ignore */
        } finally {
            layoutLoadedRef.current = true;
        }
    }, [clampPanelWidths]);

    useEffect(() => {
        if (!layoutLoadedRef.current) return;
        localStorage.setItem(
            LAYOUT_STORAGE_KEY,
            JSON.stringify({ contacts: contactsWidth, stats: statsWidth })
        );
    }, [contactsWidth, statsWidth]);

    const resizeContacts = useCallback(
        (delta: number) => {
            setContactsWidth((prev) => clampPanelWidths(prev + delta, statsWidth).contacts);
        },
        [clampPanelWidths, statsWidth]
    );

    const resizeStats = useCallback(
        (delta: number) => {
            setStatsWidth((prev) => clampPanelWidths(contactsWidth, prev + delta).stats);
        },
        [clampPanelWidths, contactsWidth]
    );

    return (
        <AnimatePresence onExitComplete={onClose}>
            {visible && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[55] bg-black/50"
                        onClick={() => setVisible(false)}
                    />

                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 32, stiffness: 320 }}
                        onAnimationComplete={(def) => {
                            if (def === "exit") onClose();
                        }}
                        className="fixed inset-x-0 bottom-0 z-[60] flex flex-col bg-[#09090b] border-t border-white/[0.06] font-outfit font-normal antialiased tracking-tight"
                        style={{ height: "calc(100vh - 40px)" }}
                    >
                        {/* Collapse handle */}
                        <button
                            type="button"
                            onClick={() => setVisible(false)}
                            className="group flex flex-col items-center pt-2 pb-1.5 shrink-0 w-full hover:bg-white/[0.02]"
                        >
                            <div className="w-9 h-0.5 rounded-full bg-neutral-600 group-hover:bg-neutral-400 transition-colors" />
                            <span className="flex items-center gap-1 text-[10px] text-neutral-500 group-hover:text-neutral-300 mt-1">
                                <ChevronDown className="w-3 h-3" />
                                Ocultar
                            </span>
                        </button>

                        {/* Main: resizable contacts | chat | stats */}
                        <div ref={layoutRef} className="flex-1 min-h-0 flex overflow-hidden">
                            {/* Contacts sidebar — left */}
                            <div
                                style={{ width: contactsWidth }}
                                className="shrink-0 min-w-0 flex flex-col bg-[#0a0a0c]"
                            >
                                <div className="px-3 py-2.5 border-b border-white/[0.06] shrink-0 space-y-2">
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-neutral-600" />
                                        <Input
                                            placeholder="Buscar contacto..."
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            className="w-full bg-transparent border-white/[0.08] pl-8 text-[11px] h-8 rounded-md text-neutral-300 placeholder:text-neutral-600"
                                        />
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {filterChips.map((chip) => (
                                            <button
                                                key={chip}
                                                type="button"
                                                onClick={() => setStatusFilter(chip)}
                                                className={cn(
                                                    "px-2 py-0.5 rounded text-[9px] whitespace-nowrap transition-colors",
                                                    statusFilter === chip
                                                        ? "bg-violet-600/20 text-white border border-violet-500/30"
                                                        : "text-neutral-500 hover:text-neutral-300 border border-transparent"
                                                )}
                                            >
                                                {chip === "all" ? "Todos" : STATUS_LABELS[chip as RecipientStatus]}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                                    <div className="px-3 py-1.5 flex items-center justify-between sticky top-0 bg-[#0a0a0c] z-10">
                                        <span className="text-[9px] text-neutral-600 uppercase tracking-[0.18em]">
                                            Contactos ({filtered.length})
                                        </span>
                                        {(recipientsLoading || cardsLoading) && (
                                            <Loader2 className="w-3 h-3 animate-spin text-neutral-600" />
                                        )}
                                    </div>

                                    {filtered.length === 0 ? (
                                        <p className="text-[11px] text-neutral-600 text-center py-10 px-3">Sin resultados</p>
                                    ) : (
                                        <div>
                                            {filtered.map((r) => {
                                                const isSelected = selectedRecipient?.id === r.id;
                                                return (
                                                    <button
                                                        key={r.id}
                                                        type="button"
                                                        onClick={() => setSelectedRecipient(r)}
                                                        className={cn(
                                                            "w-full text-left px-3 py-2 border-b border-white/[0.04] transition-colors",
                                                            isSelected
                                                                ? "bg-violet-600/[0.1] border-l-2 border-l-violet-500"
                                                                : "hover:bg-white/[0.02] border-l-2 border-l-transparent"
                                                        )}
                                                    >
                                                        <div className="flex items-start justify-between gap-1.5">
                                                            <div className="min-w-0">
                                                                <p className="text-[11px] font-normal text-white truncate">
                                                                    {r.name}
                                                                </p>
                                                                <p className="text-[9px] text-neutral-500 font-mono mt-0.5 truncate">
                                                                    {r.phone}
                                                                </p>
                                                            </div>
                                                            <span className="text-[8px] text-neutral-500 shrink-0 leading-tight text-right max-w-[64px]">
                                                                {STATUS_LABELS[r.status] || r.status}
                                                            </span>
                                                        </div>
                                                        {r.status === "failed" && r.error && (
                                                            <p className="text-[8px] text-neutral-600 mt-1 truncate">
                                                                {r.error}
                                                            </p>
                                                        )}
                                                        {recipientQualifiesAsReplied(r) && !replyPreviews[r.id] && !r.replyText && (
                                                            <p className="text-[8px] text-amber-600/80 mt-1">
                                                                Sin respuesta guardada
                                                            </p>
                                                        )}
                                                        {replyPreviews[r.id] && (
                                                            <p className="text-[9px] text-neutral-400 mt-1 line-clamp-2 italic">
                                                                «{replyPreviews[r.id]}»
                                                            </p>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <ResizeHandle onResize={resizeContacts} />

                            {/* Chat — center */}
                            <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden bg-[#111111]">
                                <BroadcastRecipientChat
                                    key={resolvedCard?.id || selectedRecipient?.id || "empty"}
                                    broadcast={broadcast}
                                    recipient={selectedRecipient}
                                    card={resolvedCard}
                                    groups={groups}
                                    allConversations={cards}
                                    groupName={activeGroupName}
                                    tenantPath={tenantPath}
                                    loading={resolvingChat || cardsLoading}
                                />
                            </div>

                            <ResizeHandle onResize={resizeStats} />

                            {/* Stats panel — right */}
                            <div
                                style={{ width: statsWidth }}
                                className="shrink-0 min-w-0 flex flex-col bg-[#0a0a0c] overflow-y-auto custom-scrollbar"
                            >
                                <div className="px-4 py-3 border-b border-white/[0.06] shrink-0">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <h2 className="text-sm font-normal text-white truncate tracking-tight">{broadcast.name}</h2>
                                            <p className="text-[10px] text-neutral-500 mt-0.5 truncate">
                                                {broadcast.channel} · {broadcast.segment || "Sin segmento"}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setVisible(false)}
                                            className="p-1 text-neutral-500 hover:text-white shrink-0"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-neutral-600 mt-2 line-clamp-3 leading-relaxed">{messagePreview}</p>
                                    <p className="text-[9px] text-neutral-600 mt-1.5 leading-relaxed">
                                        Vista del historial en omnicanal — solo lectura.
                                    </p>
                                </div>

                                <div className="p-4 space-y-4">
                                    {/* Primary totals */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                                            <p className="text-[9px] text-neutral-500 uppercase tracking-wider">Destinatarios</p>
                                            <p className="text-xl text-white tabular-nums mt-1">{stats.total}</p>
                                        </div>
                                        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                                            <p className="text-[9px] text-neutral-500 uppercase tracking-wider">Alcanzados</p>
                                            <p className="text-xl text-white tabular-nums mt-1">{reached}</p>
                                            <p className="text-[9px] text-neutral-600 mt-0.5">{pct(reached, stats.total)}% del total</p>
                                        </div>
                                    </div>

                                    {/* Funnel breakdown */}
                                    <div className="space-y-2">
                                        <p className="text-[9px] text-neutral-600 uppercase tracking-[0.18em]">Embudo</p>
                                        {[
                                            { label: "Enviados", value: stats.sent, color: "bg-blue-500" },
                                            { label: "Entregados", value: stats.delivered, color: "bg-sky-500" },
                                            { label: "Leídos", value: stats.read, color: "bg-violet-500" },
                                            { label: "Respondieron", value: stats.replied, color: "bg-emerald-500" },
                                        ].map((row) => (
                                            <div key={row.label} className="flex items-center gap-2">
                                                <span className="text-[10px] text-neutral-500 w-[76px] shrink-0">{row.label}</span>
                                                <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                                    <div
                                                        className={cn("h-full rounded-full transition-all duration-500", row.color)}
                                                        style={{ width: `${pct(row.value, stats.total)}%` }}
                                                    />
                                                </div>
                                                <span className="text-[10px] text-neutral-300 tabular-nums w-6 text-right">{row.value}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Rates */}
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="rounded-lg border border-white/[0.06] px-2.5 py-2 text-center">
                                            <p className="text-[8px] text-neutral-500 uppercase">Entrega</p>
                                            <p className="text-base text-white tabular-nums mt-0.5">{deliveryRate}%</p>
                                        </div>
                                        <div className="rounded-lg border border-white/[0.06] px-2.5 py-2 text-center">
                                            <p className="text-[8px] text-neutral-500 uppercase">Lectura</p>
                                            <p className="text-base text-white tabular-nums mt-0.5">{readRate}%</p>
                                        </div>
                                        <div className="rounded-lg border border-white/[0.06] px-2.5 py-2 text-center">
                                            <p className="text-[8px] text-neutral-500 uppercase">Respuesta</p>
                                            <p className="text-base text-violet-300 tabular-nums mt-0.5">{responseRate}%</p>
                                        </div>
                                    </div>

                                    {/* Issues */}
                                    {(stats.failed > 0 || stats.pending > 0) && (
                                        <div className="grid grid-cols-2 gap-2">
                                            {stats.failed > 0 && (
                                                <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2">
                                                    <p className="text-[9px] text-red-400/80 uppercase">Fallidos</p>
                                                    <p className="text-lg text-red-300 tabular-nums mt-0.5">{stats.failed}</p>
                                                </div>
                                            )}
                                            {stats.pending > 0 && (
                                                <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2">
                                                    <p className="text-[9px] text-amber-400/80 uppercase">Pendientes</p>
                                                    <p className="text-lg text-amber-300 tabular-nums mt-0.5">{stats.pending}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Overall progress */}
                                    <div className="pt-1 border-t border-white/[0.06]">
                                        <div className="flex items-center justify-between text-[10px] mb-1.5">
                                            <span className="text-neutral-500">Progreso de envío</span>
                                            <span className="text-neutral-400 tabular-nums">
                                                {stats.total > 0 ? Math.round(((reached + stats.failed) / stats.total) * 100) : 0}%
                                            </span>
                                        </div>
                                        <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-violet-500 transition-all duration-500"
                                                style={{
                                                    width: `${stats.total > 0 ? Math.round(((reached + stats.failed) / stats.total) * 100) : 0}%`,
                                                }}
                                            />
                                        </div>
                                        <p className="text-[9px] text-neutral-600 mt-2">
                                            {broadcast.status}
                                            {broadcast.launchedAt && ` · ${formatTs(broadcast.launchedAt)}`}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
