"use client";

import React, { useState, useEffect } from "react";
import { DollarSign, TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight, CreditCard, PieChart, BarChart3, Clock, Shield, Sparkles, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import { useEntityRoute } from "@/hooks/useEntityRoute";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";

interface Transaction {
    id: string;
    type: 'income' | 'expense';
    amount: number;
    description: string;
    category: string;
    date: string;
    status: 'completed' | 'pending' | 'failed';
}

// Mock data for demo - will be replaced by Firestore data when credentials are available
const DEMO_TRANSACTIONS: Transaction[] = [
    { id: '1', type: 'income', amount: 2450.00, description: 'Subscription Revenue - Pro Plan', category: 'Subscriptions', date: '2026-04-29', status: 'completed' },
    { id: '2', type: 'income', amount: 890.00, description: 'Enterprise Consultation', category: 'Services', date: '2026-04-28', status: 'completed' },
    { id: '3', type: 'expense', amount: 340.00, description: 'Cloud Infrastructure (Firebase)', category: 'Infrastructure', date: '2026-04-27', status: 'completed' },
    { id: '4', type: 'income', amount: 1200.00, description: 'Token Sales - LXR', category: 'Web3', date: '2026-04-27', status: 'completed' },
    { id: '5', type: 'expense', amount: 85.00, description: 'API Services (Gemini, ElevenLabs)', category: 'SI', date: '2026-04-26', status: 'completed' },
    { id: '6', type: 'income', amount: 560.00, description: 'Referral Bonus Payouts', category: 'Growth', date: '2026-04-25', status: 'pending' },
    { id: '7', type: 'expense', amount: 120.00, description: 'Solana Network Fees', category: 'Web3', date: '2026-04-24', status: 'completed' },
    { id: '8', type: 'income', amount: 3200.00, description: 'Subscription Revenue - Starter Plan', category: 'Subscriptions', date: '2026-04-23', status: 'completed' },
];

const DEMO_METRICS = {
    totalRevenue: 48720,
    monthlyGrowth: 12.4,
    activeSubscriptions: 127,
    pendingPayments: 3,
    walletBalance: 15230,
    tokenPrice: 0.042,
};

function MetricCard({ icon: Icon, label, value, change, changeType, color }: {
    icon: any; label: string; value: string; change?: string; changeType?: 'up' | 'down'; color: string;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 rounded-[24px] bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all group"
        >
            <div className="flex items-start justify-between mb-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
                    <Icon className="w-5 h-5" />
                </div>
                {change && (
                    <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                        changeType === 'up' ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'
                    }`}>
                        {changeType === 'up' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {change}
                    </div>
                )}
            </div>
            <p className="text-[10px] text-neutral-600 uppercase font-bold tracking-[0.15em] mb-1">{label}</p>
            <p className="text-2xl font-medium tracking-tight text-white">{value}</p>
        </motion.div>
    );
}

function MiniBarChart({ data }: { data: number[] }) {
    const max = Math.max(...data);
    return (
        <div className="flex items-end gap-1 h-12">
            {data.map((value, i) => (
                <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    animate={{ height: `${(value / max) * 100}%` }}
                    transition={{ delay: i * 0.05, duration: 0.4 }}
                    className="flex-1 bg-gradient-to-t from-blue-500/40 to-blue-400/80 rounded-sm min-h-[4px]"
                />
            ))}
        </div>
    );
}

export default function RevenuePage() {
    const { currentUser } = useAuth();
    const { firestoreId: entityId } = useEntityRoute();

    const [transactions, setTransactions] = useState<Transaction[]>(DEMO_TRANSACTIONS);
    const [metrics, setMetrics] = useState(DEMO_METRICS);
    const [isLive, setIsLive] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string>('All');

    // Attempt to load real data from Firestore
    useEffect(() => {
        if (!currentUser?.uid || !entityId) return;
        
        const transactionsRef = collection(db, `users/${currentUser.uid}/entities/${entityId}/transactions`);
        const q = query(transactionsRef, orderBy('date', 'desc'), limit(50));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const realData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
                setTransactions(realData);
                setIsLive(true);
            }
        }, () => {
            // Firestore error (no credentials) - keep demo data
            setIsLive(false);
        });

        return () => unsubscribe();
    }, [currentUser, entityId]);

    const categories = ['All', ...new Set(transactions.map(t => t.category))];
    const filteredTransactions = selectedCategory === 'All'
        ? transactions
        : transactions.filter(t => t.category === selectedCategory);

    const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

    // Weekly revenue data for chart
    const weeklyData = [3200, 2800, 4100, 3600, 5200, 4800, 6100];

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-white">
            <div className="p-6 md:p-10 max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-10">
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div>
                            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold tracking-[0.2em] uppercase mb-4">
                                <DollarSign className="w-3 h-3" />
                                <span>Financial Command Center</span>
                                {!isLive && (
                                    <span className="ml-2 px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-full text-[9px]">
                                        DEMO MODE
                                    </span>
                                )}
                            </div>
                            <h1 className="text-3xl md:text-4xl font-extralight tracking-tighter mb-3">
                                Revenue & <span className="font-medium text-white">Treasury</span>
                            </h1>
                            <p className="text-neutral-500 max-w-xl text-sm">
                                Real-time financial overview. Track revenue streams, monitor expenses, and manage your digital treasury.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <MetricCard
                        icon={TrendingUp}
                        label="Total Revenue"
                        value={`$${totalIncome.toLocaleString()}`}
                        change={`+${metrics.monthlyGrowth}%`}
                        changeType="up"
                        color="bg-emerald-500/10 text-emerald-400"
                    />
                    <MetricCard
                        icon={TrendingDown}
                        label="Total Expenses"
                        value={`$${totalExpense.toLocaleString()}`}
                        change="−8.2%"
                        changeType="down"
                        color="bg-red-500/10 text-red-400"
                    />
                    <MetricCard
                        icon={Wallet}
                        label="Wallet Balance"
                        value={`$${metrics.walletBalance.toLocaleString()}`}
                        change="+5.1%"
                        changeType="up"
                        color="bg-blue-500/10 text-blue-400"
                    />
                    <MetricCard
                        icon={CreditCard}
                        label="Active Subscriptions"
                        value={metrics.activeSubscriptions.toString()}
                        change="+18"
                        changeType="up"
                        color="bg-purple-500/10 text-purple-400"
                    />
                </div>

                {/* Main Content */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Revenue Chart */}
                    <div className="lg:col-span-2 rounded-[24px] bg-white/[0.02] border border-white/5 p-6">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-lg font-medium flex items-center gap-2">
                                    <BarChart3 className="w-5 h-5 text-blue-400" />
                                    Weekly Revenue
                                </h2>
                                <p className="text-xs text-neutral-600 mt-1">Last 7 days performance</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="text-right">
                                    <p className="text-2xl font-medium">${weeklyData.reduce((a, b) => a + b, 0).toLocaleString()}</p>
                                    <p className="text-xs text-green-400">+12.4% vs last week</p>
                                </div>
                            </div>
                        </div>

                        <div className="h-48 flex items-end gap-2">
                            {weeklyData.map((value, i) => {
                                const max = Math.max(...weeklyData);
                                const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                                return (
                                    <div key={i} className="flex-1 flex flex-col items-center gap-2">
                                        <motion.div
                                            initial={{ height: 0 }}
                                            animate={{ height: `${(value / max) * 140}px` }}
                                            transition={{ delay: i * 0.08, duration: 0.5, ease: "easeOut" }}
                                            className="w-full bg-gradient-to-t from-blue-600/30 to-blue-400/60 rounded-lg hover:from-blue-600/50 hover:to-blue-400/80 transition-all cursor-pointer group relative"
                                        >
                                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] text-neutral-600 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                                ${value.toLocaleString()}
                                            </div>
                                        </motion.div>
                                        <span className="text-[10px] text-neutral-700">{days[i]}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Token & Wallet Panel */}
                    <div className="rounded-[24px] bg-white/[0.02] border border-white/5 p-6 flex flex-col gap-6">
                        <div>
                            <h2 className="text-lg font-medium flex items-center gap-2 mb-4">
                                <Shield className="w-5 h-5 text-purple-400" />
                                Digital Treasury
                            </h2>
                            <div className="p-5 rounded-2xl bg-gradient-to-br from-purple-600/10 to-blue-600/10 border border-purple-500/20">
                                <p className="text-[10px] text-purple-400 uppercase font-bold tracking-wider mb-1">LXR Token Price</p>
                                <div className="flex items-end gap-2">
                                    <span className="text-3xl font-medium">${metrics.tokenPrice}</span>
                                    <span className="text-xs text-green-400 mb-1">+3.2%</span>
                                </div>
                                <div className="mt-4">
                                    <MiniBarChart data={[12, 18, 15, 22, 28, 24, 32, 29, 35, 31, 38, 42]} />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <p className="text-[10px] text-neutral-600 uppercase font-bold tracking-wider">Quick Stats</p>
                            {[
                                { label: 'Net Profit', value: `$${(totalIncome - totalExpense).toLocaleString()}`, color: 'text-green-400' },
                                { label: 'Pending Payments', value: metrics.pendingPayments.toString(), color: 'text-amber-400' },
                                { label: 'Profit Margin', value: `${((1 - totalExpense / totalIncome) * 100).toFixed(1)}%`, color: 'text-blue-400' },
                            ].map((stat) => (
                                <div key={stat.label} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                                    <span className="text-xs text-neutral-500">{stat.label}</span>
                                    <span className={`text-sm font-medium ${stat.color}`}>{stat.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Transactions Table */}
                <div className="mt-6 rounded-[24px] bg-white/[0.02] border border-white/5 overflow-y-auto">
                    <div className="px-6 py-5 border-b border-white/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <h2 className="text-lg font-medium flex items-center gap-2">
                            <Clock className="w-5 h-5 text-neutral-400" />
                            Recent Transactions
                        </h2>
                        <div className="flex gap-2 flex-wrap">
                            {categories.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setSelectedCategory(cat)}
                                    className={`px-3 py-1.5 rounded-full text-[10px] font-medium transition-all ${
                                        selectedCategory === cat
                                            ? 'bg-white text-black'
                                            : 'bg-white/5 text-neutral-500 hover:text-white'
                                    }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="divide-y divide-white/5">
                        {filteredTransactions.map((tx, i) => (
                            <motion.div
                                key={tx.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: i * 0.03 }}
                                className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                                        tx.type === 'income' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                                    }`}>
                                        {tx.type === 'income' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium">{tx.description}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-[10px] text-neutral-600">{tx.category}</span>
                                            <span className="text-[10px] text-neutral-700">•</span>
                                            <span className="text-[10px] text-neutral-600">{tx.date}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                                        tx.status === 'completed' ? 'bg-green-500/10 text-green-400' :
                                        tx.status === 'pending' ? 'bg-amber-500/10 text-amber-400' :
                                        'bg-red-500/10 text-red-400'
                                    }`}>
                                        {tx.status}
                                    </span>
                                    <span className={`text-sm font-medium tabular-nums ${
                                        tx.type === 'income' ? 'text-green-400' : 'text-red-400'
                                    }`}>
                                        {tx.type === 'income' ? '+' : '-'}${tx.amount.toLocaleString()}
                                    </span>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
