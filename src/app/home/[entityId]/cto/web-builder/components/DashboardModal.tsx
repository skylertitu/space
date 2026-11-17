import React, { useState, useRef } from "react";
import { X, LayoutGrid, Clock, Trash2, Globe, ExternalLink, Plus, Pencil, Check, Sparkles, Search, Layers, Rocket, Monitor, Box, Filter } from "lucide-react";
import { WebProject } from "../types";
import { motion, AnimatePresence } from "framer-motion";

interface DashboardModalProps {
    show: boolean;
    setShow: (show: boolean) => void;
    projects: WebProject[];
    activeProjectId: string | null;
    handleSwitchProject: (id: string) => void;
    deleteProject: (id: string) => void;
    handleNewProject: () => void;
    updateProject?: (id: string, updates: Partial<WebProject>) => Promise<void>;
}

export const DashboardModal = ({
    show, setShow, projects, activeProjectId,
    handleSwitchProject, deleteProject, handleNewProject, updateProject
}: DashboardModalProps) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    if (!show) return null;

    const startEdit = (e: React.MouseEvent, proj: WebProject) => {
        e.stopPropagation();
        setEditingId(proj.id);
        setEditingName(proj.name);
        setTimeout(() => inputRef.current?.select(), 50);
    };

    const confirmEdit = async (e: React.MouseEvent | React.KeyboardEvent) => {
        e.stopPropagation();
        if (!editingId || !editingName.trim()) return;
        if (updateProject) {
            await updateProject(editingId, { name: editingName.trim() });
        }
        setEditingId(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') confirmEdit(e);
        if (e.key === 'Escape') setEditingId(null);
    };

    const filteredProjects = projects.filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 sm:p-4 md:p-12 bg-black/95 sm:bg-black/85 backdrop-blur-2xl animate-in fade-in duration-500">
            {/* Background Orbs */}
            <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none animate-pulse sm:block hidden" />
            <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none animate-pulse duration-700 sm:block hidden" />

            <motion.div 
                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="w-full sm:max-w-6xl bg-[#070708]/90 border border-white/10 rounded-[2rem] sm:rounded-[2.5rem] shadow-[0_32px_128px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[80vh] sm:max-h-[85vh] relative backdrop-blur-3xl"
            >
                {/* Header Section */}
                <div className="px-6 sm:px-8 pt-8 pb-6 flex flex-col gap-5 relative border-b border-white/5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <div className="relative group shrink-0">
                                <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 group-hover:opacity-40 transition-opacity" />
                                <div className="relative w-11 h-11 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-2xl border border-white/10">
                                    <Rocket className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                                </div>
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent truncate">
                                    My Projects
                                </h2>
                                <p className="text-[8px] sm:text-[9px] text-gray-500 font-bold uppercase tracking-[0.25em] mt-1 flex items-center gap-2 truncate">
                                    <Sparkles className="w-2.5 h-2.5 text-blue-500" />
                                    Manage your digital ecosystem
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 sm:gap-3">
                            <button
                                onClick={handleNewProject}
                                className="group relative flex-1 sm:flex-none px-4 sm:px-6 py-3 bg-white text-black font-black rounded-xl hover:scale-105 active:scale-95 transition-all text-[9px] sm:text-[10px] uppercase tracking-[0.15em] shadow-lg shadow-white/5 overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-blue-50 to-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                <span className="relative flex items-center justify-center gap-2">
                                    <Plus className="w-3.5 h-3.5 stroke-[3]" /> New Project
                                </span>
                            </button>
                            <button 
                                onClick={() => setShow(false)} 
                                className="w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all group shrink-0"
                            >
                                <X className="w-5 h-5 text-gray-500 group-hover:text-white transition-colors" />
                            </button>
                        </div>
                    </div>

                    {/* Search Bar */}
                    <div className="flex items-center gap-2">
                        <div className="flex-1 relative group">
                            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                                <Search className="w-3.5 h-3.5 text-gray-600 group-focus-within:text-blue-500 transition-colors" />
                            </div>
                            <input 
                                type="text"
                                placeholder="Search projects..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full bg-white/[0.03] border border-white/5 rounded-xl py-2.5 pl-11 pr-11 text-[11px] text-white placeholder:text-gray-600 outline-none focus:border-blue-500/40 focus:bg-white/[0.06] transition-all"
                            />
                            <div className="absolute inset-y-0 right-2 flex items-center">
                                <button className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-blue-500 transition-colors rounded-lg hover:bg-white/5">
                                    <Filter className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                        <div className="hidden sm:flex px-4 py-2.5 bg-white/[0.03] border border-white/5 rounded-xl items-center gap-2.5 shrink-0">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                {projects.length} {projects.length === 1 ? 'Project' : 'Projects'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6 sm:p-8 custom-scrollbar bg-black/10">
                    {filteredProjects.length === 0 ? (
                        <div className="py-20 flex flex-col items-center justify-center text-center">
                            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-5 border border-white/5">
                                <Box className="w-8 h-8 text-gray-700" />
                            </div>
                            <h3 className="text-[11px] font-black text-white uppercase tracking-widest mb-1.5">No results found</h3>
                            <p className="text-[10px] text-gray-600 max-w-[180px] leading-relaxed">Try different search terms or create a new site.</p>
                            <button onClick={handleNewProject} className="mt-5 text-[10px] text-blue-500 font-bold hover:text-blue-400 transition-colors uppercase tracking-[0.2em]">
                                Create Project →
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                            <AnimatePresence mode="popLayout">
                                {filteredProjects.map((proj, idx) => (
                                    <motion.div
                                        layout
                                        initial={{ opacity: 0, y: 15 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ delay: idx * 0.04 }}
                                        key={proj.id}
                                        onClick={() => { if (editingId !== proj.id) { handleSwitchProject(proj.id); setShow(false); } }}
                                        className={`group relative bg-[#0d0d0f]/60 border rounded-2xl sm:rounded-[1.75rem] p-4 sm:p-5 flex flex-col gap-3 sm:gap-5 transition-all cursor-pointer hover:-translate-y-1.5 ${activeProjectId === proj.id
                                            ? 'border-blue-500/40 shadow-[0_15px_40px_rgba(59,130,246,0.1)] ring-1 ring-blue-500/20'
                                            : 'border-white/5 hover:border-white/10 hover:bg-[#121216] shadow-xl'
                                            }`}
                                    >
                                        {/* Glow effect on hover */}
                                        <div className="absolute inset-0 bg-blue-500/[0.03] opacity-0 group-hover:opacity-100 rounded-[1.75rem] transition-opacity pointer-events-none" />

                                        {/* Card Header: Icon & Actions */}
                                        <div className="flex items-center justify-between relative z-10">
                                            <div className={`w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg sm:rounded-xl transition-all duration-300 ${activeProjectId === proj.id 
                                                ? 'bg-blue-600 shadow-[0_0_15px_rgba(59,130,246,0.35)]' 
                                                : 'bg-white/5 group-hover:bg-white/10'}`}>
                                                <Monitor className={`w-4 h-4 sm:w-5 sm:h-5 ${activeProjectId === proj.id ? 'text-white' : 'text-gray-500 group-hover:text-blue-400'} transition-colors duration-300`} />
                                            </div>
                                            
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-1.5 group-hover:translate-x-0">
                                                <button
                                                    onClick={(e) => startEdit(e, proj)}
                                                    className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-gray-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all"
                                                    title="Rename"
                                                >
                                                    <Pencil className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); deleteProject(proj.id); }}
                                                    className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Card Body: Title */}
                                        <div className="flex-1 relative z-10 -mt-1">
                                            {editingId === proj.id ? (
                                                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                    <input
                                                        ref={inputRef}
                                                        value={editingName}
                                                        onChange={e => setEditingName(e.target.value)}
                                                        onKeyDown={handleKeyDown}
                                                        className="flex-1 min-w-0 bg-white/5 border border-blue-500/40 rounded-lg px-3 py-1 text-[10px] text-white font-bold outline-none"
                                                        autoFocus
                                                    />
                                                    <button
                                                        onClick={confirmEdit}
                                                        className="w-7 h-7 flex items-center justify-center bg-blue-600 rounded-lg text-white hover:bg-blue-500 transition-all active:scale-90"
                                                    >
                                                        <Check className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="space-y-0.5">
                                                    <h3 className="text-[12px] sm:text-[13px] font-black tracking-tight text-white group-hover:text-blue-400 transition-colors truncate">
                                                        {proj.name}
                                                    </h3>
                                                    <p className="text-[8px] sm:text-[9px] text-gray-600 font-bold uppercase tracking-[0.15em]">
                                                        {proj.repoName || "Local only"}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Card Footer: Metadata */}
                                        <div className="flex items-center justify-between border-t border-white/5 pt-3 sm:pt-4 relative z-10">
                                            <div className="flex items-center gap-1.5 px-2 py-0.5 sm:py-1 bg-white/[0.03] rounded-lg border border-white/5">
                                                <Clock className="w-2.5 h-2.5 text-gray-600" />
                                                <span className="text-[8px] sm:text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                                                    {new Date(proj.lastModified).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                </span>
                                            </div>
                                            
                                            {activeProjectId === proj.id ? (
                                                <span className="text-[8px] sm:text-[9px] font-black text-blue-500 uppercase tracking-tight flex items-center gap-1">
                                                    <div className="w-1 h-1 rounded-full bg-blue-500 animate-pulse" />
                                                    Active
                                                </span>
                                            ) : (
                                                <div className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full bg-white/5 text-gray-600 group-hover:text-white group-hover:bg-blue-600 transition-all shadow-sm">
                                                    <ExternalLink className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

