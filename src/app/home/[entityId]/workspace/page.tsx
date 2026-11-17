'use client';

import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import ReactFlow, {
    Background,
    Node,
    Edge,
    Position,
    NodeProps,
    useNodesState,
    useEdgesState,
    ReactFlowInstance,
    MiniMap,
    Controls,
    Handle,
    BackgroundVariant,
    ReactFlowProvider,
    useReactFlow
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
    FileCheck, Scale, MessageSquare, TrendingUp, FileText, Megaphone, Cpu, Activity, Package, BookOpen, Contact, Brain, Users, Search, Award, Truck, Settings, Layout, Building, PieChart, Gavel, Coffee, Lightbulb, Briefcase, Share2, Server, Network, LifeBuoy, Calendar, Code2, Database, UserPlus, Globe, Shield, PenTool, Lock, Rocket, Landmark, Bot, Layers, ShieldAlert, CreditCard, Heart, Crown, GraduationCap, Target, BarChart, Send, Zap, DollarSign, ChevronDown, Handshake, Fingerprint, Key, Sun, Phone, Smartphone, ShoppingBag, Globe2, Terminal, Workflow, ZapOff, Anchor, Bell, Box, CheckCircle, Clipboard, Compass, Eye, Filter, Gift, HelpCircle, Image, Link, List, Mail, Map, MapPin, Mic, Moon, MousePointer, Music, Navigation, Paperclip, Play, Plus, Power, Printer, Radio, Save, Scissors, Share, Star, Table, Tag, Thermometer, ThumbsUp, Trash, Video, Volume2, Watch, Wifi, Wind, Smile, X, Edit3, Move, ExternalLink, Grid3X3, Square, ShieldCheck, BriefcaseIcon, Microscope, HardHat, ArrowLeft, Minus, ZoomIn, ZoomOut, Maximize2, GripVertical, ChevronLeft
} from "lucide-react";
import { WindowNode } from '@/components/shared/WindowNode';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useEntityRoute } from '@/hooks/useEntityRoute';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { ensureEntityMoldUpToDate } from '@/lib/mold/entityMold';
import { MOLD_WORKSPACE_ROUTES } from '@/lib/mold/routes';
import { toast } from 'sonner';
import { WorkspaceRightFloatingBar } from '@/components/floating-bars/WorkspaceRightFloatingBar';

// --- CONSTANTS ---
const PIXELS_PER_INCH = 96;

// --- THEMES ---
const themes: Record<string, any> = {
    cyan: { bg: 'rgba(6, 182, 212, 0.15)', border: 'rgba(6, 182, 212, 0.3)', shadow: 'rgba(6,182,212,0.3)', blur: 'bg-cyan-500/30', iconBg: 'bg-cyan-500/20', iconText: 'text-cyan-400', iconShadow: 'drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]' },
    amber: { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.3)', shadow: 'rgba(245, 158, 11, 0.3)', blur: 'bg-amber-500/30', iconBg: 'bg-amber-500/20', iconText: 'text-amber-400', iconShadow: 'drop-shadow-[0_0_8px_rgba(245, 158, 11, 0.6)]' },
    blue: { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgba(59, 130, 246, 0.3)', shadow: 'rgba(59,130,246,0.3)', blur: 'bg-blue-500/30', iconBg: 'bg-blue-500/20', iconText: 'text-blue-400', iconShadow: 'drop-shadow-[0_0_8px_rgba(59, 130, 246, 0.6)]' },
    emerald: { bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.3)', shadow: 'rgba(16,185,129,0.3)', blur: 'bg-emerald-500/30', iconBg: 'bg-emerald-500/20', iconText: 'text-emerald-400', iconShadow: 'drop-shadow-[0_0_8px_rgba(16, 185, 129, 0.6)]' },
    rose: { bg: 'rgba(244, 63, 94, 0.15)', border: 'rgba(244, 63, 94, 0.3)', shadow: 'rgba(244,63,94,0.3)', blur: 'bg-rose-500/30', iconBg: 'bg-rose-500/20', iconText: 'text-rose-400', iconShadow: 'drop-shadow-[0_0_8px_rgba(244, 63, 94, 0.6)]' },
    purple: { bg: 'rgba(168, 85, 247, 0.15)', border: 'rgba(168, 85, 247, 0.3)', shadow: 'rgba(168,85,247,0.3)', blur: 'bg-purple-500/30', iconBg: 'bg-purple-500/20', iconText: 'text-purple-400', iconShadow: 'drop-shadow-[0_0_8px_rgba(168, 85, 247, 0.6)]' },
    orange: { bg: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.3)', shadow: 'rgba(249,115,22,0.3)', blur: 'bg-orange-500/30', iconBg: 'bg-orange-500/20', iconText: 'text-orange-400', iconShadow: 'drop-shadow-[0_0_8px_rgba(249, 115, 22, 0.6)]' },
    indigo: { bg: 'rgba(99, 102, 241, 0.15)', border: 'rgba(99, 102, 241, 0.3)', shadow: 'rgba(99,102,241,0.3)', blur: 'bg-indigo-500/30', iconBg: 'bg-indigo-500/20', iconText: 'text-indigo-400', iconShadow: 'drop-shadow-[0_0_8px_rgba(99, 102, 241, 0.6)]' },
    red: { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.3)', shadow: 'rgba(239,68,68,0.3)', blur: 'bg-red-500/30', iconBg: 'bg-red-500/20', iconText: 'text-red-400', iconShadow: 'drop-shadow-[0_0_8px_rgba(239, 68, 68, 0.6)]' },
    slate: { bg: 'rgba(100, 116, 139, 0.15)', border: 'rgba(100, 116, 139, 0.3)', shadow: 'rgba(100,116,139,0.3)', blur: 'bg-slate-500/30', iconBg: 'bg-slate-500/20', iconText: 'text-slate-400', iconShadow: 'drop-shadow-[0_0_8px_rgba(100, 116, 139, 0.6)]' }
};

const DEPARTMENTS_DATA: Record<string, { title: string, layers: any[] }> = {
    board: { title: "BOARD OF DIRECTORS", layers: [
        { id: 'treasury', label: 'MultiSig Treasury', path: 'treasury', icon: Landmark, theme: 'slate' },
        { id: 'audits', label: 'Audits & Risk', path: 'audits', icon: FileCheck, theme: 'slate' },
        { id: 'governance', label: 'Protocol Governance', path: 'governance', icon: Gavel, theme: 'slate' }
    ].sort((a, b) => a.label.localeCompare(b.label)) },
    
    ceo: { title: "CHIEF EXECUTIVE OFFICER", layers: [
        { id: 'board-liaison', label: 'Board Liaison', path: 'board-liaison', icon: Users, theme: 'amber' },
        { id: 'crisis-management', label: 'Crisis Management', path: 'crisis-management', icon: ShieldAlert, theme: 'amber' },
        { id: 'culture-steering', label: 'Culture Steering', path: 'culture-steering', icon: Heart, theme: 'amber' },
        { id: 'esg', label: 'ESG & Impact', path: 'esg', icon: Globe, theme: 'amber' },
        { id: 'executive-dashboard', label: 'Executive Dashboard', path: 'executive-dashboard', icon: Layout, theme: 'amber' },
        { id: 'kpis', label: 'Global KPIs', path: 'kpis', icon: BarChart, theme: 'amber' },
        { id: 'investor-relations', label: 'Investor Relations', path: 'investor-relations', icon: Handshake, theme: 'amber' },
        { id: 'ma', label: 'M&A Strategy', path: 'ma', icon: BriefcaseIcon, theme: 'amber' },
        { id: 'public-relations', label: 'Public Relations', path: 'public-relations', icon: Megaphone, theme: 'amber' },
        { id: 'strategy', label: 'Vision & Strategy', path: 'strategy', icon: Target, theme: 'amber' }
    ].sort((a, b) => a.label.localeCompare(b.label)) },
    
    coo: { title: "CHIEF OPERATING OFFICER", layers: [
        { id: 'cx', label: 'Customer Experience', path: 'cx', icon: Smile, theme: 'cyan' },
        { id: 'facilities', label: 'Facilities Management', path: 'facilities', icon: Building, theme: 'cyan' },
        { id: 'procurement', label: 'Global Procurement', path: 'procurement', icon: ShoppingBag, theme: 'cyan' },
        { id: 'visas', label: 'Global Visas', path: 'visas', icon: Globe, theme: 'cyan' },
        { id: 'logistics', label: 'Neural Logistics', path: 'logistics', icon: Share2, theme: 'cyan' },
        { id: 'omnichannel', label: 'Omnichannel Engine', path: 'omnichannel', icon: MessageSquare, theme: 'cyan' },
        { id: 'kamban', label: 'Operational Kamban', fullPath: MOLD_WORKSPACE_ROUTES.kambanLayerFullPath, icon: Layout, theme: 'cyan' },
        { id: 'team', label: 'Operations Team', path: 'team', icon: Users, theme: 'cyan' },
        { id: 'quality', label: 'Quality Assurance', path: 'quality', icon: Award, theme: 'cyan' },
        { id: 'supply', label: 'Supply Chain', path: 'supply', icon: Truck, theme: 'cyan' },
        { id: 'whatsapp', label: 'WhatsApp Flows', fullPath: 'cto/automation/whatsappbots', icon: Smartphone, theme: 'cyan' }
    ].sort((a, b) => a.label.localeCompare(b.label)) },
    
    cto: { title: "CHIEF TECHNOLOGY OFFICER", layers: [
        { id: 'orchestrator', label: 'SI Orchestrator', path: 'orchestrator', icon: Cpu, theme: 'cyan' },
        { id: 'voice-center', label: 'SI Voice Center', path: 'voice-center', icon: Phone, theme: 'cyan' },
        { id: 'web-builder', label: 'SI Web Builder', path: 'web-builder', icon: Globe, theme: 'cyan' },
        { id: 'api', label: 'API Gateway', path: 'api', icon: Code2, theme: 'cyan' },
        { id: 'cloud', label: 'Cloud Infrastructure', path: 'cloud', icon: Server, theme: 'cyan' },
        { id: 'integrations', label: 'Cloud Integrations', path: 'integrations', icon: Network, theme: 'cyan' },
        { id: 'security', label: 'Cyber Security', path: 'security', icon: Shield, theme: 'cyan' },
        { id: 'data', label: 'Data Warehouse', path: 'data', icon: Database, theme: 'cyan' },
        { id: 'devops', label: 'DevOps Pipeline', path: 'devops', icon: Terminal, theme: 'cyan' },
        { id: 'meet-agents', label: 'Meet SI Agents', path: 'meet-agents', icon: Bot, theme: 'cyan' },
        { id: 'automation', label: 'Neural Automation', path: 'automation', icon: Workflow, theme: 'cyan' },
        { id: 'quantum', label: 'Quantum Protocols', path: 'quantum', icon: Zap, theme: 'cyan' },
        { id: 'smart-contracts', label: 'Smart Contracts', path: 'smart-contracts', icon: FileText, theme: 'cyan' }
    ].sort((a, b) => a.label.localeCompare(b.label)) },
    
    cfo: { title: "CHIEF FINANCIAL OFFICER", layers: [
        { id: 'audit-prep', label: 'Audit Prep', path: 'audit-prep', icon: FileCheck, theme: 'emerald' },
        { id: 'billing', label: 'Billing Engine', path: 'billing', icon: CreditCard, theme: 'emerald' },
        { id: 'cash-flow', label: 'Cash Flow', path: 'cash-flow', icon: Landmark, theme: 'emerald' },
        { id: 'revenue', label: 'Revenue Streams', path: 'revenue', icon: TrendingUp, theme: 'emerald' },
        { id: 'tax', label: 'Tax Management', path: 'tax', icon: Gavel, theme: 'emerald' }
    ].sort((a, b) => a.label.localeCompare(b.label)) },
    
    cmo: { title: "CHIEF MARKETING OFFICER", layers: [
        { id: 'affiliates', label: 'Affiliate Program', path: 'affiliates', icon: Link, theme: 'orange' },
        { id: 'brand', label: 'Brand Identity', path: 'brand', icon: Award, theme: 'orange' },
        { id: 'content', label: 'Content Factory', path: 'content', icon: PenTool, theme: 'orange' },
        { id: 'events', label: 'Corporate Events', path: 'events', icon: Calendar, theme: 'orange' },
        { id: 'crm', label: 'Customer Relations', path: 'crm', icon: Contact, theme: 'orange' },
        { id: 'loyalty', label: 'Loyalty Programs', path: 'loyalty', icon: Gift, theme: 'orange' },
        { id: 'analytics', label: 'Market Analytics', path: 'analytics', icon: BarChart, theme: 'orange' },
        { id: 'goals', label: 'Marketing Goals', path: 'goals', icon: Target, theme: 'orange' },
        { id: 'campaigns', label: 'Broadcasts', path: 'broadcast/list', icon: Megaphone, theme: 'orange' },
        { id: 'market-share', label: 'Market Share', path: 'market-share', icon: PieChart, theme: 'orange' },
        { id: 'seo', label: 'SEO Engine', path: 'seo', icon: Search, theme: 'orange' },
        { id: 'social', label: 'Social Media', path: 'social', icon: Share2, theme: 'orange' }
    ].sort((a, b) => a.label.localeCompare(b.label)) },
    
    chro: { title: "CHIEF HUMAN RESOURCES OFFICER", layers: [
        { id: 'hris', label: 'HR Registry', path: 'hris', icon: Users, theme: 'purple' },
        { id: 'payroll', label: 'Payroll Engine', path: 'payroll', icon: DollarSign, theme: 'purple' },
        { id: 'performance', label: 'Performance', path: 'performance', icon: Heart, theme: 'purple' },
        { id: 'recruitment', label: 'Talent Acquisition', path: 'recruitment', icon: UserPlus, theme: 'purple' }
    ].sort((a, b) => a.label.localeCompare(b.label)) },
    
    cso: { title: "CHIEF STRATEGY OFFICER", layers: [
        { id: 'expansion', label: 'Global Expansion', path: 'expansion', icon: Globe, theme: 'red' },
        { id: 'growth', label: 'Growth Strategy', path: 'growth', icon: Zap, theme: 'red' }
    ].sort((a, b) => a.label.localeCompare(b.label)) },

    ciso: { title: "CHIEF INFORMATION SECURITY OFFICER", layers: [
        { id: 'map', label: 'Threat Intelligence', path: 'map', icon: ShieldAlert, theme: 'blue' },
        { id: 'compliance', label: 'InfoSec Compliance', path: 'compliance', icon: ShieldCheck, theme: 'blue' },
        { id: 'incident', label: 'Incident Response', path: 'incident', icon: Lock, theme: 'blue' }
    ].sort((a, b) => a.label.localeCompare(b.label)) },

    clo: { title: "CHIEF LEGAL OFFICER", layers: [
        { id: 'contracts', label: 'Contract Lifecycle', path: 'contracts', icon: FileText, theme: 'slate' },
        { id: 'disputes', label: 'Litigation Center', path: 'disputes', icon: Gavel, theme: 'slate' },
        { id: 'ip', label: 'Intellectual Property', path: 'ip', icon: Lightbulb, theme: 'slate' }
    ].sort((a, b) => a.label.localeCompare(b.label)) },

    cpo: { title: "CHIEF PRODUCT OFFICER", layers: [
        { id: 'roadmap', label: 'Product Roadmap', path: 'roadmap', icon: Map, theme: 'indigo' },
        { id: 'research', label: 'User Discovery', path: 'research', icon: Search, theme: 'indigo' },
        { id: 'design', label: 'Design System', path: 'design', icon: PenTool, theme: 'indigo' }
    ].sort((a, b) => a.label.localeCompare(b.label)) },

    cdo: { title: "CHIEF DATA OFFICER", layers: [
        { id: 'governance', label: 'Data Governance', path: 'governance', icon: Database, theme: 'purple' },
        { id: 'bi', label: 'Business Intelligence', path: 'bi', icon: BarChart, theme: 'purple' },
        { id: 'neural', label: 'Neural Modeling', path: 'neural', icon: Brain, theme: 'purple' }
    ].sort((a, b) => a.label.localeCompare(b.label)) }
};

// --- NODES ---

const AxesNode = ({ data }: NodeProps) => {
    const isLight = data?.isLight;
    return (
        <div className="relative pointer-events-none w-[20000px] h-[20000px] -translate-x-1/2 -translate-y-1/2">
            <div className={cn("absolute top-0 left-1/2 -translate-x-1/2 w-[1px] h-full border-l border-dashed z-[1]", isLight ? "border-black/25" : "border-white/20")} />
            <div className={cn("absolute top-1/2 left-0 w-full h-[1px] border-t border-dashed z-[1]", isLight ? "border-black/25" : "border-white/20")} />
            <div className="absolute inset-0 z-[1]">
                {Array.from({ length: 100 }).map((_, i) => {
                    const pos = (i - 50) * PIXELS_PER_INCH;
                    if (i === 50) return null;
                    return (
                        <div key={`tick-y-${i}`} style={{ top: `calc(50% + ${pos}px)`, left: '50%' }} className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center">
                            <div className={cn("w-2 h-[1px]", isLight ? "bg-black/40" : "bg-white/40")} />
                            <span className={cn("ml-2 text-[8px] font-mono", isLight ? "text-black/50 font-semibold" : "text-white/20")}>{- (i - 50)}"</span>
                        </div>
                    );
                })}
                {Array.from({ length: 100 }).map((_, i) => {
                    const pos = (i - 50) * PIXELS_PER_INCH;
                    if (i === 50) return null;
                    return (
                        <div key={`tick-x-${i}`} style={{ left: `calc(50% + ${pos}px)`, top: '50%' }} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                            <div className={cn("h-2 w-[1px]", isLight ? "bg-black/40" : "bg-white/40")} />
                            <span className={cn("mt-2 text-[8px] font-light", isLight ? "text-black/50" : "text-white/20")}>{i - 50}"</span>
                        </div>
                    );
                })}
            </div>
            <div className={cn("absolute top-[10%] left-1/2 -translate-x-1/2 text-xl font-light uppercase tracking-[1em]", isLight ? "text-black/30" : "text-white/10")}>Y+ NORTH</div>
            <div className={cn("absolute bottom-[10%] left-1/2 -translate-x-1/2 text-xl font-light uppercase tracking-[1em]", isLight ? "text-black/30" : "text-white/10")}>Y- SOUTH</div>
            <div className={cn("absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full blur-[2px] z-[2]", isLight ? "bg-black/50" : "bg-white/40")} />
        </div>
    );
};

const TitleNode = ({ data }: NodeProps) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as globalThis.Node)) setMenuOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [menuOpen]);

    return (
        <div className="pointer-events-none select-none flex flex-row items-center gap-10" style={{ transform: 'translate(-50%, -50%)' }}>
            {data.onBack && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); data.onBack(); }}
                    title="Volver a la suite"
                    className={cn(
                        "nodrag pointer-events-auto shrink-0 transition-colors cursor-pointer",
                        data?.isLight ? "text-black/50 hover:text-black" : "text-white/40 hover:text-white"
                    )}
                >
                    <ChevronLeft className="w-16 h-16 md:w-24 md:h-24" strokeWidth={1.25} />
                </button>
            )}
            <h1 className={cn(
                "text-6xl md:text-8xl font-thin tracking-tighter whitespace-nowrap uppercase",
                data?.isLight 
                    ? "text-slate-900 drop-shadow-[0_0_30px_rgba(0,0,0,0.1)]" 
                    : "text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]"
            )}>
                {data.title}
            </h1>
            {data.roles && (
                <div className="relative pointer-events-auto shrink-0" ref={menuRef}>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); }}
                        title="Cambiar de oficial"
                        className={cn(
                            "nodrag cursor-pointer transition-colors",
                            menuOpen 
                                ? (data?.isLight ? "text-black" : "text-white") 
                                : (data?.isLight ? "text-black/40 hover:text-black" : "text-white/40 hover:text-white")
                        )}
                    >
                        <ChevronDown
                            className={cn("w-16 h-16 md:w-24 md:h-24 transition-transform duration-300", menuOpen && "rotate-180")}
                            strokeWidth={1.25}
                        />
                    </button>
                    {menuOpen && (
                        <div className={cn(
                            "absolute left-1/2 -translate-x-1/2 top-[100%] mt-3 w-max max-w-[90vw] max-h-[75vh] sm:max-h-[680px] overflow-y-auto rounded-3xl border p-2 shadow-[0_25px_60px_rgba(0,0,0,0.8)] z-[400] custom-scrollbar backdrop-blur-2xl transition-all",
                            data?.isLight 
                                ? "bg-white/95 border-black/10 shadow-slate-300/60" 
                                : "bg-[#0c0d12]/95 border-white/10"
                        )}>
                            {data.roles.map((r: any) => {
                                return (
                                    <button
                                        key={r.id}
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            data.onSelectRole?.(r.id);
                                            setMenuOpen(false);
                                        }}
                                        className={cn(
                                            "w-full text-left px-5 py-3 text-sm rounded-2xl transition-colors flex items-center justify-between gap-4",
                                            r.id === data.activeRole
                                                ? (data?.isLight ? "bg-black/10 text-black font-light" : "bg-white/10 text-white font-light")
                                                : (data?.isLight ? "text-black/60 hover:text-black hover:bg-black/5" : "text-white/60 hover:text-white hover:bg-white/5")
                                        )}
                                    >
                                        <div className="flex items-center gap-4">
                                            <span
                                                className={cn(
                                                    "shrink-0 w-14 text-xs font-light tracking-wider tabular-nums",
                                                    r.id === data.activeRole 
                                                        ? (data?.isLight ? "text-black" : "text-white") 
                                                        : (data?.isLight ? "text-black/40" : "text-white/40")
                                                )}
                                            >
                                                {r.acronym}
                                            </span>
                                            <span className="whitespace-nowrap font-light tracking-tight">{r.title}</span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const LayerNode = ({ data }: NodeProps) => {
    const [isHovered, setIsHovered] = useState(false);
    const [lastTap, setLastTap] = useState(0);

    const handleTap = () => {
        const now = Date.now();
        const DOUBLE_TAP_DELAY = 500;
        if (now - lastTap < DOUBLE_TAP_DELAY) {
            data.onDoubleClick?.();
        } else {
            data.onClick?.();
        }
        setLastTap(now);
    };

    return (
        <div className="relative group">
            <div
                className="pointer-events-none transition-all duration-300"
                style={{
                    transform: `translate(-50%, -50%) rotateX(60deg) rotateZ(-45deg) scale(${isHovered ? 1.05 : 1})`,
                    transformStyle: 'preserve-3d',
                    filter: 'none',
                }}
            >
                {/* Contenedor 100% Transparente sin fondo ni sombra */}
                {/* Contenedor Transparente con Borde Sutil Visible y Ancho Dinámico */}
                <div
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                    onClick={handleTap}
                    className={cn(
                        "pointer-events-auto cursor-pointer flex flex-row items-center justify-center gap-4 px-12 sm:px-16 py-8 transition-all duration-300 bg-transparent rounded-[3rem] border min-w-[580px] w-max",
                        data.isLight 
                            ? (isHovered ? "border-slate-500" : "border-slate-300/80") 
                            : (isHovered ? "border-white/50" : "border-white/20")
                    )}
                    style={{
                        minWidth: 580,
                        width: 'max-content',
                        height: 340,
                        backgroundColor: 'transparent',
                        boxShadow: 'none',
                    }}
                >
                    {/* Contenido en proporción real 1:1 con texto en una sola línea */}
                    <div
                        className="flex flex-row items-center justify-start gap-4 w-max shrink-0"
                        style={{ transform: 'rotateZ(45deg) scaleY(1.8)' }}
                    >
                        {/* Puntos para arrastrar y reordenar */}
                        <div
                            className={cn(
                                "hex-drag-handle pointer-events-auto cursor-grab active:cursor-grabbing shrink-0 p-1.5 rounded-xl transition-colors",
                                data.isLight ? "hover:bg-black/10" : "hover:bg-white/10"
                            )}
                            onClick={(e) => e.stopPropagation()}
                            title="Arrastra para mover / reordenar la lámina"
                        >
                            <GripVertical
                                className={cn(
                                    'w-6 h-6 transition-colors',
                                    isHovered 
                                        ? (data.isLight ? 'text-slate-900' : 'text-white') 
                                        : (data.isLight ? 'text-slate-500' : 'text-white/40')
                                )}
                            />
                        </div>
                        {data.icon && (
                            <data.icon
                                className={cn(
                                    'w-11 h-11 sm:w-12 sm:h-12 shrink-0 transition-all duration-300',
                                    isHovered
                                        ? (data.isLight ? 'text-black drop-shadow-[0_0_15px_rgba(0,0,0,0.3)]' : 'text-white drop-shadow-[0_0_25px_rgba(255,255,255,0.9)]')
                                        : (data.isLight ? 'text-slate-900' : 'text-white/90')
                                )}
                            />
                        )}
                        <span className={cn(
                            "whitespace-nowrap text-left text-2xl sm:text-3xl font-light tracking-tight transition-all duration-300",
                            data.isLight 
                                ? (isHovered ? "text-black drop-shadow-[0_0_10px_rgba(0,0,0,0.15)]" : "text-slate-900")
                                : (isHovered ? "text-white drop-shadow-[0_0_25px_rgba(255,255,255,0.8)]" : "text-white/90 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]")
                        )}>
                            {data.label}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ActionNode = ({ data }: NodeProps) => (
    <div className="relative group cursor-pointer pointer-events-auto" style={{ transform: 'translate(-50%, -50%)' }} onClick={data.onClick}>
        <motion.div 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="transition-all"
        >
            <span className="text-sm font-light tracking-tight text-white/70 group-hover:text-white transition-colors">
                {data.label}
            </span>
        </motion.div>
    </div>
);

const FolderNode = ({ data }: NodeProps) => {
    const theme = themes[data.theme || 'cyan'];
    const [isHovered, setIsHovered] = useState(false);
    const [lastTap, setLastTap] = useState(0);

    return (
        <div 
            className="group cursor-pointer pointer-events-auto"
            style={{ transform: 'translate(-50%, -50%) rotateX(60deg) rotateZ(-45deg)', transformStyle: 'preserve-3d' }}
        >
            <motion.div 
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onClick={() => {
                    const now = Date.now();
                    const DOUBLE_TAP_DELAY = 500;
                    if (now - lastTap < DOUBLE_TAP_DELAY) {
                        data.onDoubleClick?.();
                    } else {
                        data.onClick?.();
                    }
                    setLastTap(now);
                }}
                whileHover={{ scale: 1.05 }}
                className={cn(
                    "w-[420px] h-[420px] rounded-[6rem] border-4 border-dashed transition-all duration-300 flex flex-col items-center justify-center backdrop-blur-3xl",
                    isHovered ? theme.bg : "bg-white/5"
                )}
                style={{ borderColor: theme.border, boxShadow: `0 0 60px ${theme.shadow}, inset 0 0 40px ${theme.shadow}` }}
            >
                <div className="flex flex-col items-center gap-6" style={{ transform: 'rotateZ(45deg) rotateX(-20deg)' }}>
                    <div className={cn("p-8 rounded-full shadow-2xl", theme.iconBg)}>
                        {data.icon ? (
                            <data.icon className={cn("w-20 h-20", theme.iconText)} />
                        ) : (
                            <Layers className={cn("w-20 h-20", theme.iconText)} />
                        )}
                    </div>
                    <div className="text-center space-y-1">
                        <span className="block text-6xl font-thin tracking-[0.1em] text-white uppercase drop-shadow-2xl">{data.role}</span>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

const nodeTypes = { axesNode: AxesNode, titleNode: TitleNode, layerNode: LayerNode, windowNode: WindowNode, actionNode: ActionNode, folderNode: FolderNode };

export default function UnifiedWorkspace() {
    return (
        <ReactFlowProvider>
            <WorkspaceContent />
        </ReactFlowProvider>
    );
}

function WorkspaceContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { currentUser } = useAuth();
    const { entityId: firestoreId, routeSegment, isEnterprise } = useEntityRoute();
    const { zoomIn, zoomOut, fitView, setCenter } = useReactFlow();
    
    const roleParam = searchParams.get('role');
    const defaultRole = isEnterprise ? 'coo' : 'ceo';
    const initialRole = roleParam || defaultRole;
    const [activeRole, setActiveRole] = useState<string>(initialRole);

    useEffect(() => {
        const currentRoleParam = searchParams.get('role');
        const targetRole = currentRoleParam || (isEnterprise ? 'coo' : 'ceo');
        if (targetRole !== activeRole) {
            setActiveRole(targetRole);
            setExpandedDepts([]);
            setOpenWindows([]);
        }
    }, [searchParams, activeRole, isEnterprise, routeSegment, router]);
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [gridType, setGridType] = useState<'none' | 'dots' | 'lines'>('none');
    const [canvasTheme, setCanvasTheme] = useState<'dark' | 'light'>('dark');
    const [isMicActive, setIsMicActive] = useState(false);
    const [showCartesianPlane, setShowCartesianPlane] = useState(false);
    const [savedLayout, setSavedLayout] = useState<Record<string, { x: number, y: number }>>({});
    const [layerOrder, setLayerOrder] = useState<Record<string, string[]>>({});
    const [expandedDepts, setExpandedDepts] = useState<string[]>([]);
    const [openWindows, setOpenWindows] = useState<string[]>([]);
    const [persistedWindows, setPersistedWindows] = useState<string[]>([]);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        if (!currentUser?.uid || !firestoreId) return;
        ensureEntityMoldUpToDate(db, currentUser.uid, firestoreId).catch((err) => {
            console.error('[Workspace] mold upgrade failed:', err);
        });
    }, [currentUser?.uid, firestoreId]);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const currentDeptData = useMemo(() => DEPARTMENTS_DATA[activeRole] || DEPARTMENTS_DATA.ceo, [activeRole]);

    const toCanvas = (xInches: number, yInches: number) => ({ x: xInches * PIXELS_PER_INCH, y: -yInches * PIXELS_PER_INCH });
    const fromCanvas = (xPixels: number, yPixels: number) => ({ x: Math.round(xPixels / PIXELS_PER_INCH * 100) / 100, y: Math.round(-yPixels / PIXELS_PER_INCH * 100) / 100 });

    // --- REGLA 4: PERSISTENCIA EN LA BÓVEDA ---
    useEffect(() => {
        if (!currentUser?.uid || !firestoreId || currentUser.uid.startsWith('demo')) return;
        try {
            const layoutRef = doc(db, `users/${currentUser.uid}/entities/${firestoreId}/workspace-layout`, 'global');
            
            const unsubscribe = onSnapshot(layoutRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setSavedLayout(data.positions || {});
                    setPersistedWindows(data.openWindows || []);
                    setLayerOrder(data.layerOrder || {});
                }
            }, () => {});
            return () => unsubscribe();
        } catch {}
    }, [currentUser, firestoreId]);

    const savePosition = async (nodeId: string, xInches: number, yInches: number) => {
        if (!currentUser || !firestoreId) return;
        const layoutRef = doc(db, `users/${currentUser.uid}/entities/${firestoreId}/workspace-layout`, 'global');
        const newPositions = { ...savedLayout, [nodeId]: { x: xInches, y: yInches } };
        await setDoc(layoutRef, { positions: newPositions }, { merge: true });
    };

    // Fixed slot (cartesian inches) for a layer at a given order index.
    // This is the original aligned layout the layers snap back into.
    const layerSlot = (index: number) => ({ x: 0, y: -7 - index * 2 });

    // Resolve the display order of layer ids for a role, honoring the saved
    // custom order and falling back to the default (alphabetical) order.
    const getOrderedLayerIds = useCallback((role: string): string[] => {
        const dept = DEPARTMENTS_DATA[role] || DEPARTMENTS_DATA.ceo;
        const ids = dept.layers.map((l: any) => l.id);
        const order = layerOrder[role];
        if (!order || order.length === 0) return ids;
        return [...ids].sort((a, b) => {
            const ia = order.indexOf(a);
            const ib = order.indexOf(b);
            return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
        });
    }, [layerOrder]);

    const saveLayerOrder = async (role: string, ids: string[]) => {
        if (!currentUser?.uid || !firestoreId) return;
        const layoutRef = doc(db, `users/${currentUser.uid}/entities/${firestoreId}/workspace-layout`, 'global');
        const newOrder = { ...layerOrder, [role]: ids };
        setLayerOrder(newOrder); // optimistic: keeps the new order even offline
        try {
            await setDoc(layoutRef, { layerOrder: newOrder }, { merge: true });
            toast.success('Orden de las láminas guardado', { duration: 1500 });
        } catch (e: any) {
            console.error('[Workspace] saveLayerOrder error:', e);
            toast.error('No se pudo guardar el orden');
        }
    };

    const persistWindowState = async (windowIds: string[]) => {
        if (!currentUser || !firestoreId) return;
        const layoutRef = doc(db, `users/${currentUser.uid}/entities/${firestoreId}/workspace-layout`, 'global');
        await setDoc(layoutRef, { openWindows: windowIds }, { merge: true });
    };

    const updateNodePosition = (nodeId: string, xInches: number, yInches: number) => {
        const newPos = toCanvas(xInches, yInches);
        setNodes((nds) => nds.map((node) => node.id === nodeId ? { ...node, position: newPos } : node));
        savePosition(nodeId, xInches, yInches);
    };

    const selectedNode = useMemo(() => nodes.find(n => n.id === selectedNodeId), [nodes, selectedNodeId]);
    const cartesianPos = useMemo(() => selectedNode ? fromCanvas(selectedNode.position.x, selectedNode.position.y) : { x: 0, y: 0 }, [selectedNode]);

    const spawnWindow = (layer: any, parentPos?: { x: number, y: number }) => {
        setNodes((nds) => {
            const uniqueId = `window-${layer.role || activeRole}-${layer.id}`;
            if (nds.some(node => node.id === uniqueId)) return nds;

            // Offset the window position relative to the layer node (e.g. 500px to the right, 100px up)
            const pos = parentPos 
                ? { x: parentPos.x + 500, y: parentPos.y - 100 }
                : toCanvas(15, -15);

            const newNode: Node = {
                id: uniqueId,
                type: 'windowNode',
                position: pos,
                data: {
                    id: layer.id, label: layer.label, icon: layer.icon,
                    origin: parentPos, // Pass parentPos as origin for the entry animation
                    url: layer.fullPath
                        ? `/home/${routeSegment}/${layer.fullPath}`
                        : `/home/${routeSegment}/${layer.role || activeRole}/${layer.path}`,
                    onClose: () => {
                        setOpenWindows(prev => prev.filter(id => id !== uniqueId));
                        setNodes(currNodes => currNodes.filter(n => n.id !== uniqueId));
                    }
                }
            };

            setOpenWindows(prev => prev.includes(uniqueId) ? prev : [...prev, uniqueId]);
            
            return [...nds, newNode];
        });
    };

    // Función para encontrar un layer y su rol correspondiente en cualquier departamento
    const findLayerAcrossDepts = (layerId: string) => {
        for (const role in DEPARTMENTS_DATA) {
            const layer = (DEPARTMENTS_DATA as any)[role].layers.find((l: any) => l.id === layerId);
            if (layer) return { layer, role };
        }
        return null;
    };

    // --- GESTIÓN DE NODOS BASE (DEPARTAMENTO) ---
    useEffect(() => {
        const newNodes: Node[] = [];
        
        // Ejes del Plano Cartesiano (visibles según showCartesianPlane)
        if (showCartesianPlane) {
            newNodes.push({ id: 'global-axes', type: 'axesNode', position: { x: 0, y: 0 }, draggable: false, selectable: false, zIndex: -1, data: { isLight: canvasTheme === 'light' } });
        }

        // Título (con flecha de regreso "<" a la izquierda y selector de oficial "v" a la derecha)
        const titleSaved = savedLayout['dept-title'] || { x: 0, y: -3 };
        const roleOptions = Object.keys(DEPARTMENTS_DATA)
            .map((id) => ({ 
                id, 
                title: DEPARTMENTS_DATA[id].title, 
                acronym: id === 'board' ? 'BOD' : id.toUpperCase(),
            }))
            .sort((a, b) => a.title.localeCompare(b.title));
        newNodes.push({
            id: 'dept-title', type: 'titleNode', position: toCanvas(titleSaved.x, titleSaved.y),
            draggable: true, zIndex: 2000, style: { pointerEvents: 'none' },
            data: {
                title: currentDeptData.title,
                isLight: canvasTheme === 'light',
                onBack: () => router.push(`/home/${routeSegment}`),
                roles: roleOptions,
                activeRole,
                onSelectRole: (roleId: string) => router.push(`/home/${routeSegment}/workspace?role=${roleId}`)
            }
        });

        const toggleDept = (role: string) => {
            setExpandedDepts(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
        };

        const allNodesData: any[] = [];
        
        const rainbowThemes = ['rose', 'orange', 'amber', 'emerald', 'cyan', 'blue', 'indigo', 'purple', 'slate'];

        // 1. Capas del rol activo - respetando el orden personalizado guardado.
        const orderedIds = getOrderedLayerIds(activeRole);
        const orderedLayers = orderedIds
            .map(id => currentDeptData.layers.find((l: any) => l.id === id))
            .filter(Boolean);
        orderedLayers.forEach(layer => {
            allNodesData.push({ ...layer, role: activeRole, type: 'layer', isPrimary: true });
        });



        allNodesData.forEach((item, index) => {
            const nodeId = item.type === 'folder' ? item.id : `layer-${item.role}-${item.id}`;
            const saved = savedLayout[nodeId] || { x: 0, y: -7 - (index * 2) };
            
            if (item.type === 'folder') {
                newNodes.push({
                    id: nodeId, type: 'folderNode', position: toCanvas(saved.x, saved.y),
                    draggable: false, zIndex: 1000 - index,
                    data: { ...item, isLight: canvasTheme === 'light' }
                });
            } else {
                // Layers always sit in their fixed, aligned slot (by order index),
                // so dragging only reorders them between those slots.
                const slot = layerSlot(index);
                const canvasPos = toCanvas(slot.x, slot.y);
                newNodes.push({
                    id: nodeId, type: 'layerNode', position: canvasPos,
                    draggable: true, dragHandle: '.hex-drag-handle', zIndex: 1000 - index,
                    style: { zIndex: 1000 - index, pointerEvents: 'none' },
                    data: { 
                        ...item, 
                        isHex: true,
                        isLight: canvasTheme === 'light',
                        onClick: () => spawnWindow(item, canvasPos),
                        onDoubleClick: () => spawnWindow(item, canvasPos)
                    }
                });
            }
        });

        setNodes(prev => {
            const windowNodes = prev.filter(n => n.type === 'windowNode');
            return [...newNodes, ...windowNodes];
        });
    }, [activeRole, routeSegment, savedLayout, currentDeptData, expandedDepts, getOrderedLayerIds, router, canvasTheme, showCartesianPlane]);

    // Snap a dragged layer into the nearest fixed slot and reorder the list.
    const handleLayerReorder = (node: Node) => {
        const layerId = node.id.replace(`layer-${activeRole}-`, '');
        const currentIds = getOrderedLayerIds(activeRole);
        const count = currentIds.length;
        if (count === 0) return;

        // Nearest slot to where the layer was dropped.
        let targetIndex = 0;
        let best = Infinity;
        for (let i = 0; i < count; i++) {
            const slot = layerSlot(i);
            const c = toCanvas(slot.x, slot.y);
            const d = (c.x - node.position.x) ** 2 + (c.y - node.position.y) ** 2;
            if (d < best) { best = d; targetIndex = i; }
        }

        const without = currentIds.filter(id => id !== layerId);
        without.splice(targetIndex, 0, layerId);

        // Immediately snap the dragged layer into its target slot for feedback.
        const snap = toCanvas(layerSlot(targetIndex).x, layerSlot(targetIndex).y);
        setNodes(prev => prev.map(n => n.id === node.id ? { ...n, position: snap } : n));

        // Persist on every drag so the order is always saved.
        saveLayerOrder(activeRole, without);
    };

    const onNodeDragStop = (event: any, node: Node) => {
        if (node.id.startsWith('layer-')) {
            handleLayerReorder(node);
            return;
        }
        if (node.id === 'dept-title' || node.id === 'action-return' || node.type === 'windowNode') {
            const pos = node.type === 'windowNode' ? node.position : fromCanvas(node.position.x, node.position.y);
            savePosition(node.id, pos.x, pos.y);
        }
    };

    return (
        <div className={cn("w-full h-screen flex flex-col relative overflow-hidden transition-colors duration-500", canvasTheme === 'light' ? "bg-white" : "bg-black")}>
            
            {/* Right Edge Floating Dock for Workspace Canvas Controls */}
            <WorkspaceRightFloatingBar
                gridType={gridType}
                setGridType={setGridType}
                canvasTheme={canvasTheme}
                setCanvasTheme={setCanvasTheme}
                showCartesianPlane={showCartesianPlane}
                setShowCartesianPlane={setShowCartesianPlane}
                zoomIn={zoomIn}
                zoomOut={zoomOut}
                setCenter={setCenter}
                fitView={fitView}
                isMicActive={isMicActive}
                setIsMicActive={setIsMicActive}
            />

            <div className="flex-1 w-full h-full relative z-0">
                <ReactFlow 
                    nodes={nodes} 
                    edges={edges} 
                    onNodesChange={onNodesChange} 
                    onEdgesChange={onEdgesChange} 
                    onNodeDragStop={onNodeDragStop} 
                    nodeTypes={nodeTypes} 
                    className={canvasTheme === 'light' ? "bg-white" : "bg-black"} 
                    proOptions={{ hideAttribution: true }} 
                    minZoom={0.01} 
                    maxZoom={4} 
                    zoomOnDoubleClick={false}
                    fitView 
                    fitViewOptions={{ 
                        padding: 0.2,
                        nodes: nodes.filter(n => n.id === 'dept-title' || n.id.startsWith('layer-')),
                        duration: 800
                    }}
                >
                    {gridType !== 'none' && <Background variant={gridType === 'dots' ? BackgroundVariant.Dots : BackgroundVariant.Lines} color={canvasTheme === 'light' ? "#000000" : "#ffffff"} gap={PIXELS_PER_INCH} size={1} className={canvasTheme === 'light' ? "opacity-[0.08]" : "opacity-[0.03]"} />}
                </ReactFlow>
            </div>
        </div>
    );
}
