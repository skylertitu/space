'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Search, Filter, Trash2, List, LayoutGrid, Tag } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ContactFiltersProps {
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    viewMode: 'list' | 'grid';
    setViewMode: (mode: 'list' | 'grid') => void;
    isChatOpen: boolean;
    isFilterOpen: boolean;
    setIsFilterOpen: (open: boolean) => void;
    activeFiltersCount: number;
    clearAllFilters: () => void;
    availableStages: string[];
    selectedStages: string[];
    setSelectedStages: (stages: string[] | ((prev: string[]) => string[])) => void;
    availableSources: string[];
    selectedSources: string[];
    setSelectedSources: (sources: string[] | ((prev: string[]) => string[])) => void;
    availableTags: string[];
    selectedTags: string[];
    setSelectedTags: (tags: string[] | ((prev: string[]) => string[])) => void;
    filteredCount: number;
    selectedCount: number;
    handleBulkDelete: () => void;
    openBulkTag: () => void;
    currentView: 'all' | 'Prospecting' | 'In Progress' | 'Closed';
    setCurrentView: (view: 'all' | 'Prospecting' | 'In Progress' | 'Closed') => void;
    onSaveAudience?: () => void;
}

export const ContactFilters: React.FC<ContactFiltersProps> = ({
    searchQuery,
    setSearchQuery,
    viewMode,
    setViewMode,
    isChatOpen,
    isFilterOpen,
    setIsFilterOpen,
    activeFiltersCount,
    clearAllFilters,
    availableStages,
    selectedStages,
    setSelectedStages,
    availableSources,
    selectedSources,
    setSelectedSources,
    availableTags,
    selectedTags,
    setSelectedTags,
    filteredCount,
    selectedCount,
    handleBulkDelete,
    openBulkTag,
    currentView,
    setCurrentView,
    onSaveAudience,
}) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-4 relative z-10"
        >
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
                <div className="relative group w-full">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 group-focus-within:text-blue-500 transition-colors" />
                    <Input
                        id="crm-search-input"
                        type="text"
                        placeholder="Search database..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-12 pr-12 bg-white/5 border-white/10 h-10 sm:h-12 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 text-white font-medium placeholder:text-neutral-600 text-xs sm:text-sm rounded-xl sm:rounded-[1.25rem] transition-all shadow-inner"
                    />
                    <Dialog open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                        <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 text-neutral-400 hover:text-blue-400 transition-all rounded-lg">
                                <Filter className="w-4 h-4" />
                                {activeFiltersCount > 0 && (
                                    <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full border-2 border-black" />
                                )}
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-[#0a0a0a] border-white/5 text-white w-[95vw] sm:max-w-2xl rounded-[2rem] p-6 backdrop-blur-3xl">
                            <DialogHeader>
                                <DialogTitle className="text-2xl font-bold tracking-tight uppercase flex items-center justify-between text-white">
                                    <span className="flex items-center">
                                        <Filter className="w-6 h-6 mr-3 text-blue-500" />
                                        Advanced Filters
                                    </span>
                                    {activeFiltersCount > 0 && (
                                        <Button
                                            variant="ghost"
                                            onClick={clearAllFilters}
                                            className="text-xs text-red-400 hover:text-red-300 font-bold uppercase tracking-wider"
                                        >
                                            Clear All
                                        </Button>
                                    )}
                                </DialogTitle>
                                <DialogDescription className="text-neutral-500 font-medium">
                                    Refine your contact list with precision filters
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-8 py-6 max-h-[60vh] overflow-y-auto px-1 custom-scrollbar">
                                {/* Stage Filter */}
                                <div>
                                    <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 mb-4 block">
                                        Stage / Status
                                    </Label>
                                    <div className="flex flex-wrap gap-2">
                                        {availableStages.map(stage => (
                                            <Button
                                                key={stage}
                                                variant={selectedStages.includes(stage) ? "default" : "outline"}
                                                size="sm"
                                                onClick={() => {
                                                    setSelectedStages(prev =>
                                                        prev.includes(stage)
                                                            ? prev.filter(s => s !== stage)
                                                            : [...prev, stage]
                                                    );
                                                }}
                                                className={cn(
                                                    "h-10 px-5 text-xs font-semibold rounded-2xl transition-all",
                                                    selectedStages.includes(stage)
                                                        ? "bg-blue-600 text-white shadow-xl shadow-blue-600/20 border-blue-500"
                                                        : "bg-white/5 text-neutral-400 border-white/5 hover:border-blue-500/50 hover:text-white"
                                                )}
                                            >
                                                {stage}
                                            </Button>
                                        ))}
                                    </div>
                                </div>

                                {/* Source Filter */}
                                <div>
                                    <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 mb-4 block">
                                        Source / Origin
                                    </Label>
                                    <div className="flex flex-wrap gap-2">
                                        {availableSources.map(source => (
                                            <Button
                                                key={source}
                                                variant={selectedSources.includes(source) ? "default" : "outline"}
                                                size="sm"
                                                onClick={() => {
                                                    setSelectedSources(prev =>
                                                        prev.includes(source)
                                                            ? prev.filter(s => s !== source)
                                                            : [...prev, source]
                                                    );
                                                }}
                                                className={cn(
                                                    "h-10 px-5 text-xs font-semibold rounded-2xl transition-all",
                                                    selectedSources.includes(source)
                                                        ? "bg-blue-600 text-white shadow-xl shadow-blue-600/20 border-blue-500"
                                                        : "bg-white/5 text-neutral-400 border-white/5 hover:border-blue-500/50 hover:text-white"
                                                )}
                                            >
                                                {source}
                                            </Button>
                                        ))}
                                    </div>
                                </div>

                                {/* Tags Filter */}
                                {availableTags.length > 0 && (
                                    <div>
                                        <Label className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500 mb-4 block">
                                            Tags / Categories
                                        </Label>
                                        <div className="flex flex-wrap gap-2">
                                            {availableTags.map(tag => (
                                                <Button
                                                    key={tag}
                                                    variant={selectedTags.includes(tag) ? "default" : "outline"}
                                                    size="sm"
                                                    onClick={() => {
                                                        setSelectedTags(prev =>
                                                            prev.includes(tag)
                                                                ? prev.filter(t => t !== tag)
                                                                : [...prev, tag]
                                                        );
                                                    }}
                                                    className={cn(
                                                        "h-10 px-5 text-xs font-semibold rounded-2xl transition-all",
                                                        selectedTags.includes(tag)
                                                            ? "bg-blue-600 text-white shadow-xl shadow-blue-600/20 border-blue-500"
                                                            : "bg-white/5 text-neutral-400 border-white/5 hover:border-blue-500/50 hover:text-white"
                                                    )}
                                                >
                                                    {tag}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <DialogFooter className="mt-6 flex-col gap-2 sm:flex-col">
                                {onSaveAudience && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={onSaveAudience}
                                        className="w-full h-12 rounded-[1.25rem] border-white/10 bg-white/5 text-white uppercase tracking-widest text-xs"
                                    >
                                        Guardar audiencia
                                    </Button>
                                )}
                                <Button
                                    onClick={() => setIsFilterOpen(false)}
                                    className="bg-blue-600 hover:bg-blue-500 w-full h-12 rounded-[1.25rem] font-bold shadow-xl shadow-blue-600/20 uppercase tracking-widest text-xs"
                                >
                                    Apply Changes
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <div className="flex items-center justify-between gap-3 w-full">
                {/* Relocated Tabs */}
                {!isChatOpen && (
                    <div className="flex items-center gap-1.5 p-1 bg-white/5 rounded-2xl border border-white/5 overflow-x-auto no-scrollbar max-w-full">
                        {(['all', 'Prospecting', 'In Progress', 'Closed'] as const).map((view) => (
                            <button
                                key={view}
                                onClick={() => setCurrentView(view)}
                                className={cn(
                                    "px-4 py-2 rounded-[0.85rem] text-[10px] font-bold transition-all uppercase tracking-widest whitespace-nowrap",
                                    currentView === view 
                                        ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20" 
                                        : "text-neutral-500 hover:text-neutral-300"
                                )}
                            >
                                {view === 'all' ? 'All' : view}
                            </button>
                        ))}
                    </div>
                )}

                <div className="flex items-center gap-2 shrink-0">
                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setViewMode('list')}
                            className={`h-8 w-8 transition-all rounded-lg ${viewMode === 'list' ? 'bg-blue-600 text-white shadow-lg' : 'text-neutral-500 hover:text-neutral-300'}`}
                        >
                            <List className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setViewMode('grid')}
                            className={`h-8 w-8 transition-all rounded-lg ${viewMode === 'grid' ? 'bg-blue-600 text-white shadow-lg' : 'text-neutral-500 hover:text-neutral-300'}`}
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </Button>
                    </div>

                    {!isChatOpen && selectedCount > 0 && (
                        <>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={openBulkTag}
                                className="text-white h-10 px-3 w-auto bg-blue-600/80 hover:bg-blue-600 rounded-xl flex gap-2 items-center transition-all shadow-lg shadow-blue-900/20"
                            >
                                <Tag className="w-4 h-4" />
                                <span className="text-[10px] font-bold uppercase tracking-widest sm:block hidden">Tag ({selectedCount})</span>
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleBulkDelete}
                                className="text-white h-10 px-3 w-auto bg-red-600/80 hover:bg-red-600 rounded-xl flex gap-2 items-center transition-all shadow-lg shadow-red-900/20"
                            >
                                <Trash2 className="w-4 h-4" />
                                <span className="text-[10px] font-bold uppercase tracking-widest sm:block hidden">({selectedCount})</span>
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </motion.div>
    );
};
