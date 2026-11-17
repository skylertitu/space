'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Clock, Sparkles } from 'lucide-react';

interface DepartmentPageShellProps {
    title: string;
    subtitle: string;
    department: string;
    accentColor: string; // e.g., 'blue', 'purple', 'emerald'
    description?: string;
    features?: string[];
}

const colorMap: Record<string, { text: string; bg: string; border: string; glow: string }> = {
    blue:    { text: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    glow: 'from-blue-600/5' },
    purple:  { text: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/20',  glow: 'from-purple-600/5' },
    emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', glow: 'from-emerald-600/5' },
    amber:   { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   glow: 'from-amber-600/5' },
    red:     { text: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20',     glow: 'from-red-600/5' },
    cyan:    { text: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/20',    glow: 'from-cyan-600/5' },
    teal:    { text: 'text-teal-400',    bg: 'bg-teal-500/10',    border: 'border-teal-500/20',    glow: 'from-teal-600/5' },
    indigo:  { text: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/20',  glow: 'from-indigo-600/5' },
    yellow:  { text: 'text-yellow-400',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/20',  glow: 'from-yellow-600/5' },
    orange:  { text: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20',  glow: 'from-orange-600/5' },
    pink:    { text: 'text-pink-400',    bg: 'bg-pink-500/10',    border: 'border-pink-500/20',    glow: 'from-pink-600/5' },
    rose:    { text: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    glow: 'from-rose-600/5' },
    slate:   { text: 'text-slate-400',   bg: 'bg-slate-500/10',   border: 'border-slate-500/20',   glow: 'from-slate-600/5' },
};

export default function DepartmentPageShell({
    title,
    subtitle,
    department,
    accentColor,
    description,
    features = [],
}: DepartmentPageShellProps) {
    const router = useRouter();
    const params = useParams();
    const entityId = params?.entityId as string;
    const colors = colorMap[accentColor] || colorMap.blue;

    return (
        <div className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
            {/* Gradient background */}
            <div className={`absolute inset-0 bg-gradient-to-br ${colors.glow} to-transparent opacity-40`} />

            <div className="relative z-10 p-5 sm:p-8 md:p-12 max-w-5xl mx-auto">
                {/* Back button */}
                <motion.button
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    onClick={() => router.push(`/home/${entityId}/${department}`)}
                    className="flex items-center gap-2 text-neutral-600 hover:text-white text-[10px] sm:text-xs tracking-wider uppercase transition-colors mb-8 md:mb-12"
                >
                    <ArrowLeft className="w-3 h-3" /> Back to {department.toUpperCase()}
                </motion.button>

                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="mb-8 md:mb-16"
                >
                    <div className={`inline-flex items-center gap-2 ${colors.text} text-[9px] sm:text-[10px] font-bold tracking-[0.25em] uppercase mb-4`}>
                        <Clock className="w-3 h-3" />
                        <span>{subtitle}</span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl md:text-5xl font-extralight tracking-tighter mb-4">
                        {title}
                    </h1>
                    {description && (
                        <p className="text-neutral-500 text-xs sm:text-sm max-w-xl leading-relaxed">
                            {description}
                        </p>
                    )}
                </motion.div>

                {/* Status card */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className={`rounded-[22px] md:rounded-[28px] border ${colors.border} ${colors.bg} p-6 md:p-14 text-center`}
                >
                    <div className="relative mx-auto w-20 h-20 mb-8">
                        <div className={`absolute inset-0 ${colors.bg} rounded-full blur-2xl opacity-60 animate-pulse`} />
                        <div className={`relative z-10 w-full h-full rounded-full ${colors.bg} border ${colors.border} flex items-center justify-center`}>
                            <Sparkles className={`w-8 h-8 ${colors.text}`} />
                        </div>
                    </div>

                    <h2 className="text-xl font-medium mb-3 text-white/80">Module Under Development</h2>
                    <p className="text-neutral-500 text-sm max-w-md mx-auto leading-relaxed mb-8">
                        This module is being engineered to deliver enterprise-grade capabilities.
                        It will be available in an upcoming release.
                    </p>

                    {features.length > 0 && (
                        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg mx-auto text-left">
                            {features.map((feature, i) => (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.3 + i * 0.05 }}
                                    className="flex items-center gap-3 py-2"
                                >
                                    <div className={`w-1.5 h-1.5 rounded-full ${colors.text.replace('text-', 'bg-')}`} />
                                    <span className="text-xs text-neutral-400">{feature}</span>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </motion.div>
            </div>
        </div>
    );
}
