"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { 
    Search, 
    Table as TableIcon, 
    Calendar as CalendarIcon, 
    Plus, 
    MoreHorizontal, 
    Megaphone,
    ChevronDown,
    Loader2,
    Clock,
    Users
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useEntityRoute } from "@/hooks/useEntityRoute";
import { toast } from "sonner";

// Modularized Component Imports
import SidebarFilters from "./components/SidebarFilters";
import BroadcastsTable from "./components/BroadcastsTable";
import DeleteBroadcastModal from "./components/DeleteBroadcastModal";
import CampaignResults from "./components/CampaignResults";
import LaunchConfirmModal from "./components/LaunchConfirmModal";
import CreateBroadcastAside from "./components/CreateBroadcastAside";

// Firestore + campaign backend
import { db } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import type { Broadcast, BroadcastRecipient } from "./lib/types";
import {
    createBroadcast,
    subscribeBroadcasts,
    subscribeRecipients,
    deleteBroadcast as deleteBroadcastDoc,
    renameBroadcast,
    launchBroadcast,
    finalizeBroadcast,
} from "./lib/broadcastService";

export type { Broadcast } from "./lib/types";

type SortColumn = "status" | "broadcastTime" | "name";
type SortOrder = "asc" | "desc" | null;

export default function BroadcastsListPage() {
    const { currentUser } = useAuth();
    const { firestoreId: entityId, routeSegment } = useEntityRoute();

    // Layout states
    const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
    const [isRightSidebarOpen, setIsRightSidebarOpen] = useState<boolean>(false);
    const [sidebarMode, setSidebarMode] = useState<"create" | "view" | "edit">("create");
    const [viewMode, setViewMode] = useState<"Table" | "Calendar">("Table");
    const [selectedFilter, setSelectedFilter] = useState<string>("All");
    const [searchQuery, setSearchQuery] = useState<string>("");

    // Sorting state
    const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
    const [sortOrder, setSortOrder] = useState<SortOrder>(null);

    // Row Actions Dropdown state
    const [activeRowMenuId, setActiveRowMenuId] = useState<string | null>(null);

    // Modal target states
    const [deleteTarget, setDeleteTarget] = useState<Broadcast | null>(null);
    const [launchTarget, setLaunchTarget] = useState<Broadcast | null>(null);
    const [launching, setLaunching] = useState(false);
    const [resultsBroadcast, setResultsBroadcast] = useState<Broadcast | null>(null);
    const [resultsRecipients, setResultsRecipients] = useState<BroadcastRecipient[]>([]);
    const [resultsRecipientsLoading, setResultsRecipientsLoading] = useState(false);

    // Selected campaign for viewing
    const [selectedCampaignForEdit, setSelectedCampaignForEdit] = useState<Broadcast | null>(null);

    // Data table state (loaded from Firestore)
    const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);

    // Tenant path
    const tenantPath = currentUser?.uid && entityId
        ? `users/${currentUser.uid}/entities/${entityId}`
        : "";

    // Subscribe to persisted broadcasts (realtime).
    useEffect(() => {
        if (!tenantPath) return;
        const unsub = subscribeBroadcasts(tenantPath, setBroadcasts);
        return () => unsub();
    }, [tenantPath]);

    // Auto-close campaigns stuck in "Sending" when every recipient is already sent/failed.
    const finalizeTriedRef = useRef<Set<string>>(new Set());
    useEffect(() => {
        if (!currentUser?.uid || !entityId) return;
        broadcasts
            .filter((b) => b.status === "Sending")
            .forEach((b) => {
                if (finalizeTriedRef.current.has(b.id)) return;
                finalizeTriedRef.current.add(b.id);
                finalizeBroadcast(currentUser.uid!, entityId, b.id).catch(() => {
                    finalizeTriedRef.current.delete(b.id);
                });
            });
    }, [broadcasts, currentUser?.uid, entityId]);

    // Row menu click outside listener
    const rowMenuRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (rowMenuRef.current && !rowMenuRef.current.contains(event.target as Node)) {
                const isToggle = (event.target as HTMLElement).closest(".actions-toggle-btn");
                if (!isToggle) setActiveRowMenuId(null);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Subscribe to results recipients list (if results view is open)
    useEffect(() => {
        if (!tenantPath || !resultsBroadcast) {
            setResultsRecipients([]);
            setResultsRecipientsLoading(false);
            return;
        }
        setResultsRecipientsLoading(true);
        const unsub = subscribeRecipients(tenantPath, resultsBroadcast.id, (list) => {
            setResultsRecipients(list);
            setResultsRecipientsLoading(false);
        });
        return () => unsub();
    }, [tenantPath, resultsBroadcast]);

    // Sorting implementation
    const handleSort = (column: SortColumn) => {
        if (sortColumn === column) {
            if (sortOrder === "asc") setSortOrder("desc");
            else if (sortOrder === "desc") {
                setSortColumn(null);
                setSortOrder(null);
            } else setSortOrder("asc");
        } else {
            setSortColumn(column);
            setSortOrder("asc");
        }
    };

    // Filter categories
    const categories = [
        { name: "All", dotColor: "bg-blue-500" },
        { name: "Draft", dotColor: "bg-neutral-400" },
        { name: "Scheduled", dotColor: "bg-amber-500" },
        { name: "Sending", dotColor: "bg-emerald-500" },
        { name: "Completed", dotColor: "bg-green-500" },
        { name: "Failed", dotColor: "bg-rose-500" }
    ];

    // Filter and Sort Broadcasts
    const aggregateStats = useMemo(() => {
        const totals = { campaigns: broadcasts.length, recipients: 0, replied: 0, failed: 0, completed: 0 };
        broadcasts.forEach((b) => {
            totals.recipients += b.stats?.total ?? b.recipients ?? 0;
            totals.replied += b.stats?.replied ?? 0;
            totals.failed += b.stats?.failed ?? 0;
            if (b.status === "Completed") totals.completed += 1;
        });
        return totals;
    }, [broadcasts]);

    const processedBroadcasts = useMemo(() => {
        let list = [...broadcasts];

        // Search filter
        if (searchQuery.trim() !== "") {
            const query = searchQuery.toLowerCase();
            list = list.filter(b => 
                (b.name || "").toLowerCase().includes(query) ||
                (b.labels || "").toLowerCase().includes(query)
            );
        }

        // Status tab filter
        if (selectedFilter !== "All") {
            list = list.filter(b => b.status === selectedFilter);
        }

        // Sort
        if (sortColumn && sortOrder) {
            list.sort((a, b) => {
                let valA = a[sortColumn] || "";
                let valB = b[sortColumn] || "";

                if (sortColumn === "broadcastTime") {
                    const timeA = a.broadcastTime ? new Date(a.broadcastTime).getTime() : 0;
                    const timeB = b.broadcastTime ? new Date(b.broadcastTime).getTime() : 0;
                    return sortOrder === "asc" ? timeA - timeB : timeB - timeA;
                }

                valA = valA.toString().toLowerCase();
                valB = valB.toString().toLowerCase();

                if (valA < valB) return sortOrder === "asc" ? -1 : 1;
                if (valA > valB) return sortOrder === "asc" ? 1 : -1;
                return 0;
            });
        }

        return list;
    }, [broadcasts, searchQuery, selectedFilter, sortColumn, sortOrder]);

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "Draft":
                return <Badge className="bg-[#1b1c24] text-neutral-400 border-white/5 hover:bg-[#1b1c24]">Draft</Badge>;
            case "Scheduled":
                return <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/10">Scheduled</Badge>;
            case "Sending":
                return <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10 animate-pulse">Sending</Badge>;
            case "Completed":
                return <Badge className="bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/10">Completed</Badge>;
            case "Failed":
                return <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/10">Failed</Badge>;
            default:
                return <Badge className="bg-neutral-800 text-neutral-400">{status}</Badge>;
        }
    };

    // Action handlers
    const handleOpenAddSidebar = () => {
        setSelectedCampaignForEdit(null);
        setSidebarMode("create");
        setIsRightSidebarOpen(true);
    };

    const handleViewBroadcast = (broadcast: Broadcast) => {
        setSelectedCampaignForEdit(broadcast);
        setSidebarMode("view");
        setIsRightSidebarOpen(true);
        setActiveRowMenuId(null);
    };

    const EDITABLE_STATUSES = ["Draft", "Scheduled"];

    const handleEditBroadcast = (broadcast: Broadcast) => {
        if (!EDITABLE_STATUSES.includes(broadcast.status)) {
            toast.error("Solo puedes editar campañas en borrador o programadas.");
            return;
        }
        setSelectedCampaignForEdit(broadcast);
        setSidebarMode("edit");
        setIsRightSidebarOpen(true);
        setActiveRowMenuId(null);
    };

    const handleClone = async (broadcast: Broadcast) => {
        setActiveRowMenuId(null);
        if (!tenantPath || !broadcast.segmentConfig || !broadcast.message) {
            toast.error("No se puede clonar esta campaña.");
            return;
        }
        try {
            await createBroadcast(tenantPath, {
                name: `${broadcast.name} (Copia)`,
                labels: broadcast.labels,
                channel: broadcast.channel,
                segment: broadcast.segment,
                segmentConfig: broadcast.segmentConfig,
                message: broadcast.message,
                botId: broadcast.botId,
                botName: broadcast.botName,
                deliverySpeed: broadcast.deliverySpeed,
                sendImmediately: true,
                scheduleAt: null,
            });
            toast.success("Campaña clonada.");
        } catch (e: any) {
            toast.error(`Error al clonar: ${e.message}`);
        }
    };

    const handleDeleteClick = (broadcast: Broadcast) => {
        setDeleteTarget(broadcast);
        setActiveRowMenuId(null);
    };

    const confirmDelete = async () => {
        if (deleteTarget && tenantPath) {
            try {
                await deleteBroadcastDoc(tenantPath, deleteTarget.id);
                toast.success("Campaña eliminada.");
            } catch (e: any) {
                toast.error(`Error al eliminar: ${e.message}`);
            }
            setDeleteTarget(null);
        }
    };

    const handleRequestLaunch = (broadcast: Broadcast) => {
        setActiveRowMenuId(null);
        setLaunchTarget(broadcast);
    };

    const confirmLaunch = async () => {
        if (!launchTarget || !currentUser?.uid) return;
        setLaunching(true);
        try {
            const result = await launchBroadcast(currentUser.uid, entityId, launchTarget.id);
            if (result.ok) {
                toast.success(
                    `Campaña iniciada: ${result.summary?.sent || 0} enviados, ${result.summary?.failed || 0} fallidos.`
                );
                setLaunchTarget(null);
            } else {
                toast.error(result.error || "Error al iniciar la campaña.");
            }
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setLaunching(false);
        }
    };

    const handleResumeBroadcast = async (broadcast: Broadcast) => {
        if (!currentUser?.uid) return;
        setActiveRowMenuId(null);
        toast.loading("Reanudando campaña...", { id: `resume-${broadcast.id}` });
        try {
            const result = await launchBroadcast(currentUser.uid, entityId, broadcast.id, {
                resume: true,
            });
            if (result.ok) {
                toast.success(
                    `Campaña reanudada: ${result.summary?.sent || 0} enviados, ${result.summary?.failed || 0} fallidos.`,
                    { id: `resume-${broadcast.id}` }
                );
            } else {
                toast.error(result.error || "No se pudo reanudar.", { id: `resume-${broadcast.id}` });
            }
        } catch (e: any) {
            toast.error(e.message, { id: `resume-${broadcast.id}` });
        }
    };

    const handleViewResults = (broadcast: Broadcast) => {
        setActiveRowMenuId(null);
        setResultsBroadcast(broadcast);
    };

    const handleRename = async (broadcast: Broadcast, name: string) => {
        if (!tenantPath) return;
        try {
            await renameBroadcast(tenantPath, broadcast.id, name);
        } catch (e: any) {
            toast.error(`Error al renombrar: ${e.message}`);
        }
    };

    const handleCreateSuccess = (message: string) => {
        toast.success(message);
        setIsRightSidebarOpen(false);
    };

    return (
        <div className="flex h-screen w-screen bg-[#07080a] text-white font-outfit font-normal antialiased tracking-tight overflow-hidden">
            {/* Side Navigation Menu */}
            <SidebarFilters
                isSidebarOpen={isSidebarOpen}
                setIsSidebarOpen={setIsSidebarOpen}
            />

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col p-4 overflow-hidden relative">
                {/* Header Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 shrink-0">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                        <Input
                            type="text"
                            placeholder="Search broadcasts..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-[#13151a] border-white/5 pl-9 text-xs py-2 focus:ring-1 focus:ring-blue-500"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex items-center bg-[#13151a] p-1 rounded-lg border border-white/5">
                            <button
                                onClick={() => setViewMode("Table")}
                                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-normal transition-all ${
                                    viewMode === "Table"
                                        ? "bg-white/5 text-violet-300"
                                        : "text-neutral-400 hover:text-white"
                                }`}
                            >
                                <TableIcon className="w-3.5 h-3.5" />
                                <span>Table</span>
                            </button>
                            <button
                                onClick={() => setViewMode("Calendar")}
                                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-normal transition-all ${
                                    viewMode === "Calendar"
                                        ? "bg-white/5 text-violet-300"
                                        : "text-neutral-400 hover:text-white"
                                }`}
                            >
                                <CalendarIcon className="w-3.5 h-3.5" />
                                <span>Calendar</span>
                            </button>
                        </div>

                        <Button 
                            onClick={handleOpenAddSidebar}
                            className="bg-violet-600/80 hover:bg-violet-600/90 text-white font-normal text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 active:scale-95 transition-all"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Broadcast</span>
                        </Button>

                        <button className="p-2 border border-white/5 bg-[#13151a] text-neutral-400 hover:text-white rounded-lg hover:bg-white/5 transition-all">
                            <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Summary stats */}
                <div className="flex items-center gap-6 px-1 mb-3 shrink-0 text-[11px]">
                    {[
                        { label: "Campañas", value: aggregateStats.campaigns },
                        { label: "Destinatarios", value: aggregateStats.recipients },
                        { label: "Completadas", value: aggregateStats.completed },
                        { label: "Respuestas", value: aggregateStats.replied },
                        { label: "Fallos", value: aggregateStats.failed },
                    ].map((s) => (
                        <div key={s.label} className="flex items-baseline gap-1.5">
                            <span className="text-neutral-500">{s.label}</span>
                            <span className="text-white font-normal tabular-nums">{s.value}</span>
                        </div>
                    ))}
                </div>

                {/* Status Filter Tabs */}
                <div className="flex items-center gap-1.5 mb-3 px-1 overflow-x-auto no-scrollbar shrink-0">
                    {categories.map((cat) => {
                        const count = broadcasts.filter(b => cat.name === "All" || b.status === cat.name).length;
                        return (
                            <button
                                key={cat.name}
                                onClick={() => setSelectedFilter(cat.name)}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-normal border transition-all duration-200",
                                    selectedFilter === cat.name
                                        ? "bg-white/5 border-white/10 text-white shadow-sm"
                                        : "bg-transparent border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.02]"
                                )}
                            >
                                <span className={cn("w-1.5 h-1.5 rounded-full", cat.dotColor)} />
                                <span>{cat.name}</span>
                                <span className="text-[10px] text-neutral-500 bg-white/5 px-1.5 py-0.5 rounded-full font-mono">
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Content / Table Component */}
                <div className="flex-1 overflow-auto custom-scrollbar relative">
                    {viewMode === "Table" ? (
                        <BroadcastsTable 
                            processedBroadcasts={processedBroadcasts}
                            sortColumn={sortColumn}
                            sortOrder={sortOrder}
                            handleSort={handleSort}
                            getStatusBadge={getStatusBadge}
                            handleViewBroadcast={handleViewBroadcast}
                            handleEditBroadcast={handleEditBroadcast}
                            activeRowMenuId={activeRowMenuId}
                            setActiveRowMenuId={setActiveRowMenuId}
                            rowMenuRef={rowMenuRef}
                            handleClone={handleClone}
                            handleDeleteClick={handleDeleteClick}
                            onLaunch={handleRequestLaunch}
                            onResume={handleResumeBroadcast}
                            onViewResults={handleViewResults}
                            handleRename={handleRename}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-center text-neutral-500 border border-white/5 rounded-xl bg-[#0b0c10]/40">
                            <CalendarIcon className="w-10 h-10 mb-3 text-neutral-600" />
                            <p className="text-sm font-normal text-neutral-400">Calendar View is not active</p>
                            <p className="text-xs text-neutral-600 mt-1">Switch to Table view to manage campaigns.</p>
                        </div>
                    )}
                </div>
            </main>

            {/* Campaign Creator / Editor Side panel */}
            <CreateBroadcastAside
                isOpen={isRightSidebarOpen}
                onClose={() => setIsRightSidebarOpen(false)}
                sidebarMode={sidebarMode}
                initialData={selectedCampaignForEdit}
                tenantPath={tenantPath}
                entityId={entityId}
                currentUser={currentUser}
                onSuccess={handleCreateSuccess}
                onRequestEdit={
                    sidebarMode === "view" &&
                    selectedCampaignForEdit &&
                    EDITABLE_STATUSES.includes(selectedCampaignForEdit.status)
                        ? () => setSidebarMode("edit")
                        : undefined
                }
            />

            {/* Custom Delete Confirmation Modal */}
            {deleteTarget && (
                <DeleteBroadcastModal 
                    deleteTarget={deleteTarget}
                    setDeleteTarget={setDeleteTarget}
                    confirmDelete={confirmDelete}
                />
            )}

            {/* Launch confirmation */}
            {launchTarget && (
                <LaunchConfirmModal
                    broadcast={launchTarget}
                    launching={launching}
                    onCancel={() => setLaunchTarget(null)}
                    onConfirm={confirmLaunch}
                />
            )}

            {/* Per-recipient results */}
            {resultsBroadcast && (
                <CampaignResults
                    broadcast={resultsBroadcast}
                    recipients={resultsRecipients}
                    recipientsLoading={resultsRecipientsLoading}
                    tenantPath={tenantPath}
                    onClose={() => setResultsBroadcast(null)}
                />
            )}
        </div>
    );
}
