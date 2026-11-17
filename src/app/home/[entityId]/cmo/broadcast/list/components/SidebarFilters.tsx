import React from "react";
import { 
    Menu, 
    Megaphone, 
    ArrowLeft, 
    Users, 
    BarChart3, 
    Search, 
    Share2, 
    Target, 
    Link2, 
    Award, 
    PenTool, 
    Calendar, 
    Gift, 
    PieChart 
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

interface SidebarFiltersProps {
    isSidebarOpen: boolean;
    setIsSidebarOpen: (open: boolean) => void;
}

export default function SidebarFilters({
    isSidebarOpen,
    setIsSidebarOpen
}: SidebarFiltersProps) {
    const params = useParams();
    const pathname = usePathname();
    const entityId = params?.entityId as string;

    const navItems = [
        { id: "broadcast", label: "Broadcasts", path: `/home/${entityId}/cmo/broadcast/list`, icon: Megaphone },
        { id: "crm", label: "Customer Relations", path: `/home/${entityId}/cmo/crm`, icon: Users },
        { id: "analytics", label: "Market Analytics", path: `/home/${entityId}/cmo/analytics`, icon: BarChart3 },
        { id: "seo", label: "SEO Engine", path: `/home/${entityId}/cmo/seo`, icon: Search },
        { id: "social", label: "Social Media", path: `/home/${entityId}/cmo/social`, icon: Share2 },
        { id: "goals", label: "Marketing Goals", path: `/home/${entityId}/cmo/goals`, icon: Target },
        { id: "affiliates", label: "Affiliate Program", path: `/home/${entityId}/cmo/affiliates`, icon: Link2 },
        { id: "brand", label: "Brand Identity", path: `/home/${entityId}/cmo/brand`, icon: Award },
        { id: "content", label: "Content Factory", path: `/home/${entityId}/cmo/content`, icon: PenTool },
        { id: "events", label: "Corporate Events", path: `/home/${entityId}/cmo/events`, icon: Calendar },
        { id: "loyalty", label: "Loyalty Programs", path: `/home/${entityId}/cmo/loyalty`, icon: Gift },
        { id: "market-share", label: "Market Share", path: `/home/${entityId}/cmo/market-share`, icon: PieChart },
    ];

    return (
        <aside className={cn(
            "absolute left-3 top-3 bottom-3 z-40 w-56 bg-[#0b0c10]/95 backdrop-blur-xl border border-white/10 rounded-2xl flex flex-col transition-all duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)] font-outfit font-normal antialiased tracking-tight",
            isSidebarOpen ? "translate-x-0 opacity-100" : "-translate-x-64 opacity-0 pointer-events-none"
        )}>
            {/* Header */}
            <div className="p-3 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setIsSidebarOpen(false)}
                        className="p-1.5 hover:bg-white/5 rounded-lg text-white/40 hover:text-white transition-colors"
                        title="Collapse sidebar"
                    >
                        <Menu className="w-4 h-4" />
                    </button>
                    <span className="font-normal text-[10px] tracking-[0.2em] text-neutral-500 uppercase">CMO / Marketing</span>
                </div>
            </div>

            {/* Navigation links */}
            <nav className="flex-1 p-2 space-y-1 overflow-y-auto custom-scrollbar">
                {navItems.map((item) => {
                    const isActive = pathname === item.path;
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.id}
                            href={item.path}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-normal transition-all duration-200",
                                isActive
                                    ? "bg-violet-600/10 text-white border border-violet-500/20"
                                    : "text-neutral-500 hover:bg-white/[0.02] hover:text-neutral-300 border border-transparent"
                            )}
                        >
                            <Icon className={cn("w-4 h-4", isActive ? "text-violet-400" : "text-neutral-600")} />
                            <span>{item.label}</span>
                        </Link>
                    );
                })}
            </nav>

            {/* Back to Workspace button at the bottom */}
            <div className="p-2 border-t border-white/5">
                <Link
                    href={`/home/${entityId}/workspace?role=cmo`}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-normal text-neutral-500 hover:bg-white/5 hover:text-neutral-300 border border-white/5 transition-all duration-200"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Volver al Workspace</span>
                </Link>
            </div>
        </aside>
    );
}
