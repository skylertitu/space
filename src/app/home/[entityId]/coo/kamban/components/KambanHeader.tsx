import { Search, Filter, MoreHorizontal, ArrowLeft, UserPlus, Download, RefreshCw, Settings, Instagram, Facebook, Globe, Ghost, MessageSquare, Twitter, Send, Music, LayoutGrid, Columns2, Check, Mail, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import WhatsappIcon from '@/components/icons/WhatsappIcon';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const KambanHeader = ({
    searchTerm,
    setSearchTerm,
    filter,
    setFilter,
    channelStats,
    isSidebarCollapsed,
    toggleSidebar,
    onNewChat,
    onSettings,
    onSyncBotGroups,
    isSyncingBotGroups,
    onExportAll,
    locked = false,
}: any) => {
    return (
        <div className="h-[52px] border-b border-white/5 bg-black/40 backdrop-blur-xl flex items-center justify-between px-4 flex-shrink-0 z-20">
            <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="flex items-center gap-3">

                    <div className="flex items-center gap-2">
                        <div className={cn(
                            "p-1.5 rounded-lg border",
                            locked ? "bg-emerald-500/10 border-emerald-500/25" : "bg-blue-500/10 border-blue-500/20"
                        )}>
                            {locked ? (
                                <Lock size={16} className="text-emerald-400" />
                            ) : (
                                <MessageSquare size={16} className="text-blue-500" />
                            )}
                        </div>
                        <h1 className="text-[14px] font-semibold text-white tracking-tight truncate hidden sm:block">
                            {locked ? 'Kamban Inamovible' : 'Inbox'}
                        </h1>
                    </div>
                </div>

                <div className="h-6 w-[1px] bg-neutral-800 mx-2 hidden lg:block" />

                {/* Stats Bar */}
                <div className="hidden md:flex items-center gap-4 py-1 px-1 overflow-x-auto no-scrollbar">
                    {/* WhatsApp */}
                    <div className="flex flex-col items-center gap-0.5 transition-all cursor-pointer group/pill hover:opacity-80">
                        <div className="relative">
                            <div className="w-1 h-1 rounded-full bg-emerald-500/50 absolute -right-0.5 -top-0.5 animate-pulse" />
                            <WhatsappIcon className="w-[14px] h-[14px] text-neutral-400 group-hover/pill:text-emerald-500/80 transition-all" />
                        </div>
                        <div className="flex flex-col items-center -space-y-0.5">
                            <span className="text-[8px] font-bold text-neutral-500 uppercase tracking-tighter group-hover/pill:text-neutral-400 transition-colors"></span>
                            <span className="text-[9px] font-bold text-neutral-300">{channelStats.whatsapp}</span>
                        </div>
                    </div>

                    {/* Instagram */}
                    <div className="flex flex-col items-center gap-0.5 transition-all cursor-pointer group/pill hover:opacity-80">
                        <Instagram size={14} className="text-neutral-500 group-hover/pill:text-pink-500/50 transition-all" />
                        <div className="flex flex-col items-center -space-y-0.5">
                            <span className="text-[8px] font-bold text-neutral-500 uppercase tracking-tighter group-hover/pill:text-neutral-400 transition-colors"></span>
                            <span className="text-[9px] font-bold text-neutral-300">{channelStats.instagram}</span>
                        </div>
                    </div>

                    {/* Messenger */}
                    <div className="flex flex-col items-center gap-0.5 transition-all cursor-pointer group/pill hover:opacity-80">
                        <Facebook size={14} className="text-neutral-500 group-hover/pill:text-blue-500/50 transition-all" />
                        <div className="flex flex-col items-center -space-y-0.5">
                            <span className="text-[8px] font-bold text-neutral-500 uppercase tracking-tighter group-hover/pill:text-neutral-400 transition-colors"></span>
                            <span className="text-[9px] font-bold text-neutral-300">{channelStats.messenger}</span>
                        </div>
                    </div>

                    {/* Web */}
                    <div className="flex flex-col items-center gap-0.5 transition-all cursor-pointer group/pill hover:opacity-80">
                        <Globe size={14} className="text-neutral-500 group-hover/pill:text-cyan-500/50 transition-all" />
                        <div className="flex flex-col items-center -space-y-0.5">
                            <span className="text-[8px] font-bold text-neutral-500 uppercase tracking-tighter group-hover/pill:text-neutral-400 transition-colors"></span>
                            <span className="text-[9px] font-bold text-neutral-300">{channelStats.web}</span>
                        </div>
                    </div>

                    {/* X */}
                    <div className="flex flex-col items-center gap-0.5 transition-all cursor-pointer group/pill hover:opacity-80">
                        <Twitter size={14} className="text-neutral-500 group-hover/pill:text-neutral-200 transition-all" />
                        <div className="flex flex-col items-center -space-y-0.5">
                            <span className="text-[8px] font-bold text-neutral-500 uppercase tracking-tighter group-hover/pill:text-neutral-400 transition-colors"></span>
                            <span className="text-[9px] font-bold text-neutral-300">{channelStats.x}</span>
                        </div>
                    </div>

                    {/* TikTok */}
                    <div className="flex flex-col items-center gap-0.5 transition-all cursor-pointer group/pill hover:opacity-80">
                        <Music size={14} className="text-neutral-500 group-hover/pill:text-neutral-200 transition-all" />
                        <div className="flex flex-col items-center -space-y-0.5">
                            <span className="text-[8px] font-bold text-neutral-500 uppercase tracking-tighter group-hover/pill:text-neutral-400 transition-colors"></span>
                            <span className="text-[9px] font-bold text-neutral-300">{channelStats.tiktok}</span>
                        </div>
                    </div>

                    {/* Telegram */}
                    <div className="flex flex-col items-center gap-0.5 transition-all cursor-pointer group/pill hover:opacity-80">
                        <Send size={14} className="text-neutral-500 group-hover/pill:text-sky-500/50 transition-all" />
                        <div className="flex flex-col items-center -space-y-0.5">
                            <span className="text-[8px] font-bold text-neutral-500 uppercase tracking-tighter group-hover/pill:text-neutral-400 transition-colors"></span>
                            <span className="text-[9px] font-bold text-neutral-300">{channelStats.telegram}</span>
                        </div>
                    </div>

                    {/* Gmail */}
                    <div className="flex flex-col items-center gap-0.5 transition-all cursor-pointer group/pill hover:opacity-80">
                        <Mail size={14} className="text-neutral-500 group-hover/pill:text-red-500/50 transition-all" />
                        <div className="flex flex-col items-center -space-y-0.5">
                            <span className="text-[8px] font-bold text-neutral-500 uppercase tracking-tighter group-hover/pill:text-neutral-400 transition-colors"></span>
                            <span className="text-[9px] font-bold text-neutral-300">{channelStats.gmail}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
                <div className="relative group/search w-16 sm:w-32 transition-all duration-300 focus-within:w-40 sm:focus-within:w-48">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-neutral-500 group-focus-within/search:text-blue-500 transition-colors" />
                    <Input
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8 pr-2 h-7 bg-black/20 border-white/5 text-[10px] placeholder:text-neutral-600 focus:bg-black/40 transition-all rounded-lg hidden sm:block"
                    />
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className={cn(
                                "absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 text-neutral-500 hover:text-white transition-all rounded-md",
                                filter !== 'all' && "text-blue-400 bg-blue-500/10 border-blue-500/20"
                            )}>
                                <Filter size={11} />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-neutral-900 border-neutral-800 text-white shadow-2xl rounded-xl p-1 w-40">
                            <DropdownMenuItem onClick={() => setFilter('all')} className="flex items-center justify-between text-[11px] rounded-lg cursor-pointer">
                                <span>All</span>
                                {filter === 'all' && <Check size={12} className="text-blue-500" />}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setFilter('unread')} className="flex items-center justify-between text-[11px] rounded-lg cursor-pointer">
                                <span>Unread</span>
                                {filter === 'unread' && <Check size={12} className="text-blue-500" />}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setFilter('unassigned')} className="flex items-center justify-between text-[11px] rounded-lg cursor-pointer">
                                <span>Unassigned</span>
                                {filter === 'unassigned' && <Check size={12} className="text-blue-500" />}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <div className="flex items-center gap-0.5">

                    {!locked && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onSyncBotGroups}
                        disabled={isSyncingBotGroups}
                        title="Crear/actualizar columnas según nodos del chatbot y reorganizar tarjetas"
                        className="h-7 px-2 text-neutral-400 hover:text-white border border-transparent hover:border-white/5 hover:bg-white/5 gap-1.5"
                    >
                        <RefreshCw size={13} className={isSyncingBotGroups ? 'animate-spin' : ''} />
                        <span className="hidden lg:inline text-[11px]">Sync bot</span>
                    </Button>
                    )}

                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={onSettings}
                        className="h-7 w-7 p-0 text-neutral-400 hover:text-white border border-transparent hover:border-white/5 hover:bg-white/5"
                    >
                        <Settings size={13} />
                    </Button>

                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={onExportAll}
                        title="Exportar todos los contactos del tablero a vCard"
                        className="h-7 px-2 text-neutral-400 hover:text-white border border-transparent hover:border-white/5 hover:bg-white/5 gap-1.5"
                    >
                        <Download size={13} />
                        <span className="hidden lg:inline text-[11px]">Exportar todo</span>
                    </Button>
                </div>

                <div className="pl-2">
                    {!locked && (
                    <Button 
                        size="sm" 
                        onClick={onNewChat}
                        className="h-8 bg-blue-600 hover:bg-blue-500 text-white gap-2 shadow-lg shadow-blue-900/20 text-[11px] px-3 font-medium rounded-lg"
                    >
                        <UserPlus size={14} />
                        <span className="hidden sm:inline">New Chat</span>
                    </Button>
                    )}
                    {locked && (
                        <span className="text-[9px] uppercase tracking-wider text-emerald-500/70 border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 rounded-lg hidden sm:inline">
                            Solo lectura
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};


