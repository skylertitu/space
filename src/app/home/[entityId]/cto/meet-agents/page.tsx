"use client";

import React, { useState, useEffect } from "react";
import { Video, UserPlus, Monitor, Clock, Shield, Sparkles, MessageSquare, Bot, Settings, Trash2, Plus, Power, PowerOff, Edit3, Globe, Calendar, BarChart3 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useEntityRoute } from "@/hooks/useEntityRoute";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, doc, setDoc, deleteDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "sonner";

interface MeetAgent {
    id: string;
    name: string;
    purpose: 'sales' | 'support' | 'onboarding' | 'custom';
    language: string;
    status: 'active' | 'inactive' | 'busy';
    personality: string;
    knowledgeBase: string;
    meetingsCompleted: number;
    successRate: number;
    createdAt: any;
}

const PURPOSE_CONFIG = {
    sales: { label: 'Sales Closer', color: 'text-green-400 bg-green-500/10 border-green-500/20', icon: BarChart3 },
    support: { label: 'Tech Support', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', icon: Shield },
    onboarding: { label: 'Onboarding', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20', icon: UserPlus },
    custom: { label: 'Custom Agent', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: Bot },
};

// Demo agents for when Firestore isn't connected
const DEMO_AGENTS: MeetAgent[] = [
    { id: 'demo-1', name: 'Sales Navigator', purpose: 'sales', language: 'Spanish', status: 'active', personality: 'Professional and persuasive', knowledgeBase: 'CRM + Product Catalog', meetingsCompleted: 47, successRate: 82, createdAt: new Date() },
    { id: 'demo-2', name: 'Support Alpha', purpose: 'support', language: 'English', status: 'active', personality: 'Patient and thorough', knowledgeBase: 'Technical Documentation', meetingsCompleted: 128, successRate: 94, createdAt: new Date() },
    { id: 'demo-3', name: 'Onboarding Guide', purpose: 'onboarding', language: 'Spanish', status: 'inactive', personality: 'Friendly and clear', knowledgeBase: 'Platform Walkthrough', meetingsCompleted: 23, successRate: 91, createdAt: new Date() },
];

function CreateAgentModal({ isOpen, onClose, onSave }: { isOpen: boolean; onClose: () => void; onSave: (agent: Partial<MeetAgent>) => void }) {
    const [form, setForm] = useState({
        name: '',
        purpose: 'sales' as MeetAgent['purpose'],
        language: 'Spanish',
        personality: '',
        knowledgeBase: '',
    });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                onClick={e => e.stopPropagation()}
                className="bg-[#111] border border-white/10 rounded-3xl p-8 w-full max-w-lg mx-4 shadow-2xl"
            >
                <h2 className="text-xl font-medium mb-6 flex items-center gap-2">
                    <Bot className="w-5 h-5 text-blue-400" />
                    Create New Agent
                </h2>

                <div className="space-y-5">
                    <div>
                        <label className="text-[10px] text-neutral-600 uppercase font-bold tracking-wider block mb-2">Agent Name</label>
                        <input
                            value={form.name}
                            onChange={e => setForm({ ...form, name: e.target.value })}
                            placeholder="e.g., Sales Navigator"
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-500/50"
                        />
                    </div>

                    <div>
                        <label className="text-[10px] text-neutral-600 uppercase font-bold tracking-wider block mb-2">Purpose</label>
                        <div className="grid grid-cols-2 gap-2">
                            {Object.entries(PURPOSE_CONFIG).map(([key, config]) => (
                                <button
                                    key={key}
                                    onClick={() => setForm({ ...form, purpose: key as any })}
                                    className={`p-3 rounded-xl border text-left text-xs transition-all ${
                                        form.purpose === key ? `${config.color} border-current` : 'bg-white/5 border-white/5 text-neutral-500'
                                    }`}
                                >
                                    <config.icon className="w-4 h-4 mb-1" />
                                    {config.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] text-neutral-600 uppercase font-bold tracking-wider block mb-2">Language</label>
                        <select
                            value={form.language}
                            onChange={e => setForm({ ...form, language: e.target.value })}
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-500/50"
                        >
                            <option value="Spanish">Spanish</option>
                            <option value="English">English</option>
                            <option value="Portuguese">Portuguese</option>
                            <option value="French">French</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-[10px] text-neutral-600 uppercase font-bold tracking-wider block mb-2">SI Personality</label>
                        <textarea
                            value={form.personality}
                            onChange={e => setForm({ ...form, personality: e.target.value })}
                            placeholder="e.g., Professional, persuasive, data-driven..."
                            rows={2}
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-500/50 resize-none"
                        />
                    </div>

                    <div>
                        <label className="text-[10px] text-neutral-600 uppercase font-bold tracking-wider block mb-2">Knowledge Base</label>
                        <input
                            value={form.knowledgeBase}
                            onChange={e => setForm({ ...form, knowledgeBase: e.target.value })}
                            placeholder="e.g., CRM + Product Manual V2"
                            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-500/50"
                        />
                    </div>
                </div>

                <div className="flex gap-3 mt-8">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-neutral-400 text-sm hover:bg-white/10 transition-all">
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            if (!form.name.trim()) { toast.error('Agent name is required'); return; }
                            onSave({ ...form, status: 'inactive', meetingsCompleted: 0, successRate: 0 });
                            onClose();
                        }}
                        className="flex-1 py-3 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-all"
                    >
                        Create Agent
                    </button>
                </div>
            </motion.div>
        </div>
    );
}

export default function MeetAgentsPage() {
    const { currentUser } = useAuth();
    const { firestoreId: entityId } = useEntityRoute();

    const [agents, setAgents] = useState<MeetAgent[]>(DEMO_AGENTS);
    const [selectedAgent, setSelectedAgent] = useState<MeetAgent | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isLive, setIsLive] = useState(false);

    // Load agents from Firestore
    useEffect(() => {
        if (!currentUser?.uid || !entityId) return;

        const agentsRef = collection(db, `users/${currentUser.uid}/entities/${entityId}/meet-agents`);
        const q = query(agentsRef);

        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as MeetAgent));
                setAgents(data);
                setIsLive(true);
            }
        }, () => {
            setIsLive(false);
        });

        return () => unsubscribe();
    }, [currentUser, entityId]);

    const handleCreateAgent = async (agentData: Partial<MeetAgent>) => {
        const newId = `agent_${Date.now()}`;
        const newAgent: MeetAgent = {
            id: newId,
            name: agentData.name || 'New Agent',
            purpose: agentData.purpose || 'custom',
            language: agentData.language || 'Spanish',
            status: 'inactive',
            personality: agentData.personality || '',
            knowledgeBase: agentData.knowledgeBase || '',
            meetingsCompleted: 0,
            successRate: 0,
            createdAt: new Date(),
        };

        if (currentUser?.uid && entityId) {
            try {
                await setDoc(doc(db, `users/${currentUser.uid}/entities/${entityId}/meet-agents/${newId}`), {
                    ...newAgent,
                    createdAt: serverTimestamp(),
                });
                toast.success(`Agent "${newAgent.name}" created`);
            } catch {
                toast.error('Failed to save agent to database');
                setAgents(prev => [...prev, newAgent]);
            }
        } else {
            setAgents(prev => [...prev, newAgent]);
            toast.success(`Agent "${newAgent.name}" created (offline mode)`);
        }
    };

    const handleToggleAgent = async (agent: MeetAgent) => {
        const newStatus = agent.status === 'active' ? 'inactive' : 'active';
        
        if (currentUser?.uid && entityId && isLive) {
            try {
                await updateDoc(doc(db, `users/${currentUser.uid}/entities/${entityId}/meet-agents/${agent.id}`), { status: newStatus });
            } catch {
                toast.error('Failed to update agent status');
            }
        } else {
            setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, status: newStatus } : a));
        }
        toast.success(`${agent.name} is now ${newStatus}`);
    };

    const handleDeleteAgent = async (agent: MeetAgent) => {
        if (currentUser?.uid && entityId && isLive) {
            try {
                await deleteDoc(doc(db, `users/${currentUser.uid}/entities/${entityId}/meet-agents/${agent.id}`));
                toast.success(`Agent "${agent.name}" deleted`);
            } catch {
                toast.error('Failed to delete agent');
            }
        } else {
            setAgents(prev => prev.filter(a => a.id !== agent.id));
            toast.success(`Agent "${agent.name}" removed`);
        }
        if (selectedAgent?.id === agent.id) setSelectedAgent(null);
    };

    // Stats
    const activeAgents = agents.filter(a => a.status === 'active').length;
    const totalMeetings = agents.reduce((sum, a) => sum + a.meetingsCompleted, 0);
    const avgSuccess = agents.length > 0 ? Math.round(agents.reduce((sum, a) => sum + a.successRate, 0) / agents.length) : 0;

    return (
        <div className="flex min-h-screen bg-[#0a0a0a] text-white">
            <div className="flex-1 flex flex-col p-6 md:p-10 overflow-y-auto">
                {/* Header */}
                <div className="mb-8 flex flex-col md:flex-row justify-between items-start gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-teal-400 text-xs font-bold tracking-[0.2em] uppercase mb-3">
                            <Sparkles className="w-3 h-3 fill-current" />
                            <span>SI Meeting Agents</span>
                            {!isLive && (
                                <span className="ml-2 px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-full text-[9px]">
                                    DEMO
                                </span>
                            )}
                        </div>
                        <h1 className="text-3xl md:text-4xl font-medium tracking-tight">Virtual Meet Agents</h1>
                        <p className="text-neutral-500 mt-2 text-sm max-w-lg">
                            SI-powered bots with avatars that join your meetings to close sales, provide support, and onboard users 24/7.
                        </p>
                    </div>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="bg-teal-600 hover:bg-teal-500 px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-teal-600/20 text-sm font-medium"
                    >
                        <Plus className="w-4 h-4" /> New Agent
                    </button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    {[
                        { icon: Bot, label: "Total Agents", value: agents.length.toString(), color: "text-blue-400 bg-blue-500/10" },
                        { icon: Power, label: "Active Now", value: activeAgents.toString(), color: "text-green-400 bg-green-500/10" },
                        { icon: Video, label: "Meetings Total", value: totalMeetings.toString(), color: "text-purple-400 bg-purple-500/10" },
                        { icon: Shield, label: "Avg Success Rate", value: `${avgSuccess}%`, color: "text-teal-400 bg-teal-500/10" },
                    ].map((stat, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl flex items-center gap-4"
                        >
                            <div className={`p-2.5 rounded-xl ${stat.color}`}>
                                <stat.icon className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-[10px] text-neutral-600 uppercase font-bold tracking-wider">{stat.label}</p>
                                <p className="text-xl font-medium">{stat.value}</p>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Main Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-y-auto">
                    {/* Agent List */}
                    <div className="lg:col-span-1 rounded-[24px] bg-white/[0.02] border border-white/5 flex flex-col overflow-y-auto">
                        <div className="px-5 py-4 border-b border-white/5">
                            <h2 className="text-sm font-medium">All Agents</h2>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar">
                            {agents.map((agent) => {
                                const config = PURPOSE_CONFIG[agent.purpose];
                                return (
                                    <motion.div
                                        key={agent.id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        onClick={() => setSelectedAgent(agent)}
                                        className={`p-4 rounded-2xl border cursor-pointer transition-all group ${
                                            selectedAgent?.id === agent.id
                                                ? 'bg-white/5 border-teal-500/30'
                                                : 'border-white/5 hover:border-white/10 hover:bg-white/[0.02]'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
                                                agent.status === 'active'
                                                    ? 'bg-gradient-to-br from-teal-500 to-blue-600'
                                                    : 'bg-white/10'
                                            }`}>
                                                {agent.name[0]}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-sm font-medium truncate">{agent.name}</h3>
                                                <p className="text-[10px] text-neutral-600">{config.label} • {agent.language}</p>
                                            </div>
                                            <div className={`w-2 h-2 rounded-full ${
                                                agent.status === 'active' ? 'bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]' :
                                                agent.status === 'busy' ? 'bg-amber-400' : 'bg-neutral-700'
                                            }`} />
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Agent Details */}
                    <div className="lg:col-span-2 rounded-[24px] bg-white/[0.02] border border-white/5 flex flex-col overflow-y-auto">
                        {selectedAgent ? (
                            <div className="flex-1 p-6 overflow-y-auto no-scrollbar">
                                <div className="flex items-start justify-between mb-8">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-medium ${
                                            selectedAgent.status === 'active'
                                                ? 'bg-gradient-to-br from-teal-500 to-blue-600'
                                                : 'bg-white/10'
                                        }`}>
                                            {selectedAgent.name[0]}
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-medium">{selectedAgent.name}</h2>
                                            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] uppercase font-bold tracking-wider mt-2 border ${PURPOSE_CONFIG[selectedAgent.purpose].color}`}>
                                                {PURPOSE_CONFIG[selectedAgent.purpose].label}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleToggleAgent(selectedAgent)}
                                            className={`px-4 py-2 rounded-xl flex items-center gap-2 text-sm transition-all border ${
                                                selectedAgent.status === 'active'
                                                    ? 'bg-green-500/10 border-green-500/30 text-green-400'
                                                    : 'bg-white/5 border-white/10 text-neutral-400'
                                            }`}
                                        >
                                            {selectedAgent.status === 'active' ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                                            {selectedAgent.status === 'active' ? 'Active' : 'Activate'}
                                        </button>
                                        <button
                                            onClick={() => handleDeleteAgent(selectedAgent)}
                                            className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-all"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {/* Agent Config */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                    {[
                                        { label: 'Language', value: selectedAgent.language, icon: Globe },
                                        { label: 'Meetings Completed', value: selectedAgent.meetingsCompleted.toString(), icon: Calendar },
                                        { label: 'Success Rate', value: `${selectedAgent.successRate}%`, icon: BarChart3 },
                                        { label: 'Knowledge Base', value: selectedAgent.knowledgeBase || 'Not configured', icon: MessageSquare },
                                    ].map((field) => (
                                        <div key={field.label} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                                            <div className="flex items-center gap-2 mb-2">
                                                <field.icon className="w-3.5 h-3.5 text-neutral-600" />
                                                <span className="text-[10px] text-neutral-600 uppercase font-bold tracking-wider">{field.label}</span>
                                            </div>
                                            <p className="text-sm font-medium">{field.value}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Personality */}
                                {selectedAgent.personality && (
                                    <div className="p-5 rounded-2xl bg-teal-500/5 border border-teal-500/20 mb-6">
                                        <p className="text-[10px] text-teal-400 uppercase font-bold tracking-wider mb-2">SI Personality</p>
                                        <p className="text-sm text-neutral-300 leading-relaxed">{selectedAgent.personality}</p>
                                    </div>
                                )}

                                {/* Meeting Simulation Preview */}
                                <div className="rounded-2xl bg-black/40 border border-white/5 overflow-y-auto aspect-video relative">
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="text-center space-y-3">
                                            <Monitor className="w-16 h-16 text-white/5 mx-auto" />
                                            <p className="text-xs text-neutral-700">Meeting preview will appear here when agent is active</p>
                                        </div>
                                    </div>
                                    <div className={`absolute top-4 right-4 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                                        selectedAgent.status === 'active' ? 'bg-green-600 text-white' : 'bg-neutral-800 text-neutral-500'
                                    }`}>
                                        {selectedAgent.status === 'active' ? 'Ready' : 'Offline'}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-center p-8">
                                <div className="space-y-3">
                                    <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto">
                                        <Bot className="w-8 h-8 text-white/10" />
                                    </div>
                                    <p className="text-neutral-500 text-sm">Select an agent to view details</p>
                                    <p className="text-neutral-700 text-xs">Or create a new SI agent to get started</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <CreateAgentModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSave={handleCreateAgent}
            />
        </div>
    );
}
