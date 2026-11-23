import React from "react";
import {
    ChevronUp,
    ChevronDown,
    MoreVertical,
    Play,
    BarChart3,
    Loader2,
    MessageSquare,
    Instagram,
    Facebook,
    Calendar,
    Clock,
    Tag,
    Globe,
    Layers,
    Bot,
    Pencil
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Broadcast } from "../page";

type SortColumn = "status" | "broadcastTime" | "name";
type SortOrder = "asc" | "desc" | null;

interface BroadcastsTableProps {
    processedBroadcasts: Broadcast[];
    sortColumn: SortColumn | null;
    sortOrder: SortOrder;
    handleSort: (column: SortColumn) => void;
    getStatusBadge: (status: Broadcast["status"]) => React.ReactNode;
    handleViewBroadcast: (broadcast: Broadcast) => void;
    handleEditBroadcast: (broadcast: Broadcast) => void;
    activeRowMenuId: string | null;
    setActiveRowMenuId: (id: string | null) => void;
    rowMenuRef: React.RefObject<HTMLDivElement>;
    handleClone: (broadcast: Broadcast) => void;
    handleDeleteClick: (broadcast: Broadcast) => void;
    onLaunch: (broadcast: Broadcast) => void;
    onResume: (broadcast: Broadcast) => void;
    onRetryFailed: (broadcast: Broadcast) => void;
    onViewResults: (broadcast: Broadcast) => void;
    handleRename: (broadcast: Broadcast, name: string) => void;
}

const LAUNCHABLE = ["Draft", "Scheduled", "Failed", "Paused"];
const HAS_RESULTS = ["Sending", "Completed", "Failed", "Paused"];
const EDITABLE = ["Draft", "Scheduled"];

export default function BroadcastsTable({
    processedBroadcasts,
    sortColumn,
    sortOrder,
    handleSort,
    getStatusBadge,
    handleViewBroadcast,
    handleEditBroadcast,
    activeRowMenuId,
    setActiveRowMenuId,
    rowMenuRef,
    handleClone,
    handleDeleteClick,
    onLaunch,
    onResume,
    onRetryFailed,
    onViewResults,
    handleRename,
}: BroadcastsTableProps) {
    const sortIcon = (col: SortColumn) =>
        sortColumn === col ? (
            sortOrder === "asc" ? <ChevronUp className="w-3.5 h-3.5 text-blue-400" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-400" />
        ) : (
            <ChevronDown className="w-3.5 h-3.5 text-neutral-500 opacity-40" />
        );

    const getMessagePreview = (broadcast: Broadcast) => {
        const msg = broadcast.message;
        if (!msg) return "";
        if (msg.kind === "text" && msg.text) {
            return msg.text.length > 60 ? msg.text.substring(0, 60) + "..." : msg.text;
        }
        if (msg.kind === "media") {
            const typeEmoji: Record<string, string> = {
                image: "📷 Imagen",
                video: "🎥 Video",
                audio: "🎵 Audio",
                document: "📄 Documento"
            };
            const prefix = typeEmoji[msg.mediaType || "image"] || "📎 Archivo";
            return msg.caption ? `${prefix}: ${msg.caption}` : prefix;
        }
        if (msg.kind === "template" && msg.templateName) {
            return `Meta Template: ${msg.templateName}`;
        }
        return "";
    };

    const renderChannelBadge = (channel: string) => {
        const norm = channel.toLowerCase();
        if (norm.includes("whatsapp")) {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 text-neutral-300 border border-white/10 text-[10px] font-normal">
                    <MessageSquare className="w-3 h-3 text-neutral-400" />
                    WhatsApp
                </span>
            );
        }
        if (norm.includes("instagram")) {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 text-neutral-300 border border-white/10 text-[10px] font-normal">
                    <Instagram className="w-3 h-3 text-neutral-400" />
                    Instagram
                </span>
            );
        }
        if (norm.includes("messenger") || norm.includes("facebook")) {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 text-neutral-300 border border-white/10 text-[10px] font-normal">
                    <Facebook className="w-3 h-3 text-neutral-400" />
                    Messenger
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700 text-[10px] font-normal">
                {channel}
            </span>
        );
    };

    const renderSegmentBadge = (broadcast: Broadcast) => {
        const label = broadcast.segment || "";
        const config = broadcast.segmentConfig;
        
        let iconElement = <Layers className="w-3 h-3 text-neutral-400" />;
        
        if (config) {
            if (config.type === "tag") {
                iconElement = <Tag className="w-3 h-3 text-amber-400" />;
            } else if (config.type === "country") {
                iconElement = <Globe className="w-3 h-3 text-blue-400" />;
            } else if (config.type === "kanban_group" || config.type === "kanban_board_column") {
                iconElement = <Calendar className="w-3 h-3 text-purple-400" />;
            }
        }

        return (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#13151a] border border-white/5 text-[10px] text-neutral-300 max-w-[150px] truncate">
                {iconElement}
                <span className="truncate">{label}</span>
            </span>
        );
    };

    const formatRelativeTime = (timeStr: string) => {
        if (!timeStr) return "—";
        try {
            const date = new Date(timeStr);
            if (isNaN(date.getTime())) return timeStr;
            
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            if (diffMs < 0) {
                // Future time (scheduled)
                const absDiffMs = Math.abs(diffMs);
                const absDiffMins = Math.floor(absDiffMs / 60000);
                const absDiffHours = Math.floor(absDiffMs / 3600000);
                if (absDiffMins < 60) return `En ${absDiffMins} min`;
                if (absDiffHours < 24) return `En ${absDiffHours}h`;
                return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
            }

            if (diffMins < 1) return "Hace un momento";
            if (diffMins < 60) return `Hace ${diffMins}m`;
            if (diffHours < 24) return `Hace ${diffHours}h`;
            if (diffDays === 1) return "Ayer";
            if (diffDays < 7) return `Hace ${diffDays}d`;
            
            return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
        } catch {
            return timeStr;
        }
    };

    return (
        <div className="border border-white/5 rounded-xl bg-[#0b0c10]/40 overflow-visible shadow-2xl backdrop-blur-sm">
            <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
                <thead>
                    <tr className="border-b border-white/5 bg-[#13151a]/30 text-[10px] font-normal uppercase tracking-[0.15em] text-neutral-500 select-none">
                        <th onClick={() => handleSort("status")} className="px-4 py-3.5 cursor-pointer hover:text-neutral-300 transition-colors">
                            <div className="flex items-center gap-1.5">Estado / Progreso {sortIcon("status")}</div>
                        </th>
                        <th onClick={() => handleSort("broadcastTime")} className="px-4 py-3.5 cursor-pointer hover:text-neutral-300 transition-colors">
                            <div className="flex items-center gap-1.5">Broadcast Time {sortIcon("broadcastTime")}</div>
                        </th>
                        <th onClick={() => handleSort("name")} className="px-4 py-3.5 cursor-pointer hover:text-neutral-300 transition-colors">
                            <div className="flex items-center gap-1.5">Name {sortIcon("name")}</div>
                        </th>
                        <th className="px-4 py-3.5">Labels</th>
                        <th className="px-4 py-3.5">Channel</th>
                        <th className="px-4 py-3.5">Segment</th>
                        <th className="px-4 py-3.5">Recipients</th>
                        <th className="px-4 py-3.5 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs text-neutral-300">
                    {processedBroadcasts.length > 0 ? (
                        processedBroadcasts.map((broadcast) => {
                            const stats = broadcast.stats;
                            const total = stats?.total ?? broadcast.recipients ?? 0;
                            const done = stats ? stats.sent + stats.failed : 0;
                            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                            const canLaunch = LAUNCHABLE.includes(broadcast.status);
                            const canViewResults = HAS_RESULTS.includes(broadcast.status);
                            const canEdit = EDITABLE.includes(broadcast.status);
                            const isSending = broadcast.status === "Sending";
                            const canRetryFailed = broadcast.status === "Completed" && (stats?.failed ?? 0) > 0;

                            // Advanced Performance Metrics
                            const deliveryRate = stats && stats.sent > 0 ? Math.round((stats.delivered / stats.sent) * 100) : 0;
                            const readRate = stats && stats.sent > 0 ? Math.round(((stats.read + stats.replied) / stats.sent) * 100) : 0;
                            const replyRate = stats && stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100) : 0;

                            return (
                                <tr
                                    key={broadcast.id}
                                    onClick={() => canViewResults && onViewResults(broadcast)}
                                    className={cn(
                                        "hover:bg-white/[0.015] active:bg-white/[0.005] transition-all relative group",
                                        canViewResults && "cursor-pointer"
                                    )}
                                >
                                    <td className="px-4 py-4 text-neutral-400 min-w-[200px]">
                                        <div className="flex flex-col gap-1.5">
                                            <div className="flex items-center gap-2">
                                                {getStatusBadge(broadcast.status)}
                                                {broadcast.botId && (
                                                    <span className="p-0.5 bg-emerald-500/10 rounded border border-emerald-500/20 text-emerald-400" title={`Bot asignado: ${broadcast.botName || 'Auto-reply'}`}>
                                                        <Bot className="w-3.5 h-3.5" />
                                                    </span>
                                                )}
                                            </div>
                                            
                                            {stats && (isSending || done > 0) ? (
                                                <div className="space-y-1 w-full max-w-[180px]">
                                                    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                                        <div
                                                            className={cn(
                                                                "h-full rounded-full transition-all duration-500 bg-gradient-to-r from-blue-600 to-violet-500",
                                                                isSending && "opacity-80"
                                                            )}
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                    <div className="flex items-center justify-between text-[9px] text-neutral-500">
                                                        <span>{pct}% ({done}/{total})</span>
                                                        {stats.failed > 0 && <span>{stats.failed} fall.</span>}
                                                    </div>
                                                    {stats.sent > 0 && (
                                                        <p className="text-[9px] text-neutral-600">
                                                            {deliveryRate}% entrega · {readRate}% lectura · {replyRate}% resp.
                                                        </p>
                                                    )}
                                                </div>
                                            ) : broadcast.status === "Scheduled" && (broadcast.scheduleAt || broadcast.broadcastTime) ? (
                                                <div className="text-[10px] text-neutral-500 flex items-center gap-1">
                                                    <Clock className="w-3 h-3 text-neutral-600" />
                                                    <span>Prog: {broadcast.scheduleAt || broadcast.broadcastTime}</span>
                                                </div>
                                            ) : null}
                                        </div>
                                    </td>
                                    
                                    <td className="px-4 py-4 text-neutral-500 font-mono text-[11px]">
                                        {formatRelativeTime(broadcast.broadcastTime)}
                                    </td>
                                    
                                    <td
                                        onClick={() => (canViewResults ? onViewResults(broadcast) : handleViewBroadcast(broadcast))}
                                        className="px-4 py-4 cursor-pointer max-w-[200px]"
                                    >
                                        <div className="flex flex-col gap-0.5">
                                            <span className="font-normal text-white group-hover:text-neutral-300 transition-colors tracking-tight">
                                                {broadcast.name}
                                            </span>
                                            <span className="text-[10px] text-neutral-500 truncate max-w-[220px]">
                                                {getMessagePreview(broadcast) || "Sin mensaje configurado"}
                                            </span>
                                        </div>
                                    </td>
                                    
                                    <td className="px-4 py-4 text-neutral-500">
                                        {broadcast.labels !== "-" ? (
                                            <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-[10px] text-neutral-400">
                                                {broadcast.labels}
                                            </span>
                                        ) : (
                                            <span className="text-neutral-700">—</span>
                                        )}
                                    </td>
                                    
                                    <td className="px-4 py-4">{renderChannelBadge(broadcast.channel)}</td>
                                    
                                    <td className="px-4 py-4">{renderSegmentBadge(broadcast)}</td>
                                    
                                    <td className="px-4 py-4 text-neutral-400 font-mono text-[11px]">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-neutral-300">{total}</span>
                                            {stats && stats.replied > 0 && (
                                                <span className="text-[9px] text-neutral-600">{stats.replied} resp.</span>
                                            )}
                                        </div>
                                    </td>
                                    
                                    <td className="px-4 py-4 text-right relative" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-end gap-1.5">
                                            {canLaunch && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onLaunch(broadcast);
                                                    }}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 text-white text-[10px] font-normal border border-violet-500/20 active:scale-95 transition-all"
                                                >
                                                    <Play className="w-3 h-3" /> Iniciar
                                                </button>
                                            )}
                                            {isSending && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onResume(broadcast);
                                                    }}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-100 text-[10px] font-normal border border-amber-500/20 active:scale-95 transition-all"
                                                >
                                                    <Play className="w-3 h-3" /> Reanudar
                                                </button>
                                            )}
                                            {canRetryFailed && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onRetryFailed(broadcast);
                                                    }}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600/15 hover:bg-red-600/25 text-red-100 text-[10px] font-normal border border-red-500/20 active:scale-95 transition-all"
                                                >
                                                    Reintentar
                                                </button>
                                            )}
                                            {canViewResults && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onViewResults(broadcast);
                                                    }}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-white/[0.08] text-neutral-400 hover:text-white hover:border-violet-500/30 text-[10px] transition-all"
                                                >
                                                    <BarChart3 className="w-3 h-3" /> Resultados
                                                </button>
                                            )}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveRowMenuId(activeRowMenuId === broadcast.id ? null : broadcast.id);
                                                }}
                                                className="p-1 text-neutral-500 hover:text-white rounded transition-colors actions-toggle-btn"
                                            >
                                                <MoreVertical className="w-4 h-4" />
                                            </button>
                                        </div>

                                        {/* Custom Row Actions Dropdown — Eliminar near top so it never gets clipped */}
                                        {activeRowMenuId === broadcast.id && (
                                            <div
                                                ref={rowMenuRef}
                                                className="absolute right-4 top-10 z-[80] bg-[#13151a] border border-white/10 rounded-lg py-1.5 w-48 shadow-[0_10px_30px_rgba(0,0,0,0.5)] text-left"
                                            >
                                                {canLaunch && (
                                                    <button
                                                        onClick={() => onLaunch(broadcast)}
                                                        className="w-full px-3 py-1.5 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors flex items-center gap-2"
                                                    >
                                                        <Play className="w-3 h-3" /> Iniciar campaña
                                                    </button>
                                                )}
                                                {isSending && (
                                                    <button
                                                        onClick={() => onResume(broadcast)}
                                                        className="w-full px-3 py-1.5 text-xs text-amber-300 hover:text-amber-200 hover:bg-amber-500/10 transition-colors flex items-center gap-2"
                                                    >
                                                        <Play className="w-3 h-3" /> Reanudar envío
                                                    </button>
                                                )}
                                                {canRetryFailed && (
                                                    <button
                                                        onClick={() => onRetryFailed(broadcast)}
                                                        className="w-full px-3 py-1.5 text-xs text-red-300 hover:text-red-200 hover:bg-red-500/10 transition-colors flex items-center gap-2"
                                                    >
                                                        Reintentar fallidos
                                                    </button>
                                                )}
                                                {canViewResults && (
                                                    <button
                                                        onClick={() => onViewResults(broadcast)}
                                                        className="w-full px-3 py-1.5 text-xs text-neutral-300 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-2"
                                                    >
                                                        <BarChart3 className="w-3 h-3" /> Ver resultados
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleDeleteClick(broadcast)}
                                                    className="w-full px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                                                >
                                                    Eliminar
                                                </button>
                                                <div className="h-px bg-white/5 my-1" />
                                                {canEdit && (
                                                    <button
                                                        onClick={() => handleEditBroadcast(broadcast)}
                                                        className="w-full px-3 py-1.5 text-xs text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 transition-colors flex items-center gap-2"
                                                    >
                                                        <Pencil className="w-3 h-3" /> Editar campaña
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => {
                                                        const newName = prompt("Editar nombre:", broadcast.name);
                                                        if (newName) handleRename(broadcast, newName);
                                                        setActiveRowMenuId(null);
                                                    }}
                                                    className="w-full px-3 py-1.5 text-xs text-neutral-300 hover:text-white hover:bg-white/5 transition-colors"
                                                >
                                                    Editar nombre
                                                </button>
                                                <button
                                                    onClick={() => handleViewBroadcast(broadcast)}
                                                    className="w-full px-3 py-1.5 text-xs text-neutral-300 hover:text-white hover:bg-white/5 transition-colors"
                                                >
                                                    Ver configuración
                                                </button>
                                                <button
                                                    onClick={() => handleClone(broadcast)}
                                                    className="w-full px-3 py-1.5 text-xs text-neutral-300 hover:text-white hover:bg-white/5 transition-colors"
                                                >
                                                    Clonar
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })
                    ) : (
                        <tr>
                            <td colSpan={8} className="px-4 py-12 text-center text-neutral-500 text-xs">
                                No hay campañas. Crea una nueva para empezar.
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
            </div>
        </div>
    );
}
