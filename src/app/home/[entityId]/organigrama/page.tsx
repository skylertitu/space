'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Network, Users, Bot, ShieldCheck, Layers } from 'lucide-react';

/**
 * Organigrama de la entidad (plan Enterprise). El acceso lo controla <SuiteGate> en el layout y, en el servidor,
 * requireOrgChart(). Esta pantalla es la base: aquí se administrarán personas y agentes SI asignados a suites.
 * Datos previstos: users/{uid}/entities/{id}/org/*
 */
const FEATURES = [
    { icon: Users, title: 'People', text: 'Employees and collaborators with their role, reporting line and assigned suites.' },
    { icon: Bot, title: 'SI agents', text: 'Roosevelt Super Intelligence agents placed in the chart with their own scope and limits.' },
    { icon: Layers, title: 'Suite assignment', text: 'Decide who and which agent operates CTO, COO, CMO, CFO and every other suite.' },
    { icon: ShieldCheck, title: 'Role permissions', text: 'Granular access per role, enforced on the server, with an audit trail.' },
];

export default function OrgChartPage() {
    const router = useRouter();
    const params = useParams();
    const entityId = params?.entityId as string;

    return (
        <div className="min-h-screen bg-[#050505] text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/5 to-transparent opacity-40" />
            <div className="relative z-10 p-5 sm:p-8 md:p-12 max-w-5xl mx-auto">
                <motion.button
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    onClick={() => router.push(`/home/${entityId}`)}
                    className="flex items-center gap-2 text-neutral-600 hover:text-white text-[10px] sm:text-xs tracking-wider uppercase transition-colors mb-8 md:mb-12"
                >
                    <ArrowLeft className="w-3 h-3" /> Back to Home
                </motion.button>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mb-10">
                    <div className="inline-flex items-center gap-2 text-indigo-400 text-[9px] sm:text-[10px] font-bold tracking-[0.25em] uppercase mb-4">
                        <Network className="w-3 h-3" />
                        <span>Enterprise</span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl md:text-5xl font-extralight tracking-tighter mb-4">Org Chart</h1>
                    <p className="text-neutral-500 text-xs sm:text-sm max-w-xl leading-relaxed">
                        Your company&apos;s structure in one place: the people, the Super Intelligence agents, and the suites each of them runs.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {FEATURES.map((f, i) => (
                        <motion.div
                            key={f.title}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.15 + i * 0.07 }}
                            className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-5"
                        >
                            <f.icon className="w-5 h-5 text-indigo-400 mb-3" />
                            <h2 className="text-sm font-medium text-white/90 mb-1">{f.title}</h2>
                            <p className="text-xs text-neutral-500 leading-relaxed">{f.text}</p>
                        </motion.div>
                    ))}
                </div>

                <p className="mt-10 text-[11px] text-neutral-600 tracking-wide">Module in development — included in your Enterprise plan.</p>
            </div>
        </div>
    );
}
