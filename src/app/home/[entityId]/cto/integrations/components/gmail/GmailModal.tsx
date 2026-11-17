'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, X, CheckCircle2, ShieldCheck, Plus, Star, Trash2, Building2, User } from 'lucide-react';
import { db } from '@/lib/firebase';
import {
    collection,
    doc,
    onSnapshot,
    deleteDoc,
    writeBatch,
    getDocs,
    updateDoc,
} from 'firebase/firestore';
import { toast } from 'sonner';
import { isGoogleLoginUser, openGmailConnectPopup } from '@/lib/integrations/gmailAutoConnect';
import {
    GmailAccountSummary,
    GmailRegistry,
    getGmailAccountTypeLabel,
    gmailAccountPublicPath,
    gmailAccountSecretPath,
    gmailRegistryPath,
    isGmailRegistryConnected,
} from '@/lib/gmail/accounts';

interface GmailModalProps {
    isOpen: boolean;
    onClose: () => void;
    activeEntity: string;
    currentUser: { uid: string; email?: string | null; providerData?: { providerId: string }[] } | null;
}

export default function GmailModal({ isOpen, onClose, activeEntity, currentUser }: GmailModalProps) {
    const userId = currentUser?.uid;
    const entityId = activeEntity;
    const [registry, setRegistry] = useState<GmailRegistry | null>(null);
    const [accounts, setAccounts] = useState<GmailAccountSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [connecting, setConnecting] = useState(false);

    const isConnected = isGmailRegistryConnected(registry) || accounts.length > 0;

    useEffect(() => {
        if (!isOpen || !userId || !entityId) return;

        const registryRef = doc(db, gmailRegistryPath(userId, entityId));
        const accountsRef = collection(db, `${gmailRegistryPath(userId, entityId)}/accounts`);

        const unsubRegistry = onSnapshot(registryRef, (snap) => {
            setRegistry(snap.exists() ? (snap.data() as GmailRegistry) : null);
            setLoading(false);
        });

        const unsubAccounts = onSnapshot(accountsRef, (snap) => {
            const nextAccounts = snap.docs.map((docSnap) => {
                const data = docSnap.data();
                return {
                    id: docSnap.id,
                    email: String(data.email || ''),
                    domain: String(data.domain || ''),
                    accountType: data.accountType || 'personal',
                    isDefault: !!data.isDefault,
                    status: String(data.status || 'Connected'),
                    watchStatus: data.watchStatus,
                } as GmailAccountSummary;
            });
            setAccounts(nextAccounts);
        });

        return () => {
            unsubRegistry();
            unsubAccounts();
        };
    }, [isOpen, entityId, userId]);

    const handleConnectGmail = async (mode: 'default' | 'add' = 'default') => {
        if (!userId || !entityId) {
            toast.error('Inicia sesión y selecciona una entidad.');
            return;
        }
        setConnecting(true);
        try {
            const result = await openGmailConnectPopup({
                userId,
                entityId,
                mode,
                loginHint: mode === 'default' && isGoogleLoginUser(currentUser as any) ? currentUser?.email : null,
            });

            if (result === 'success') {
                toast.success(mode === 'add' ? 'Cuenta añadida correctamente.' : 'Gmail vinculado correctamente.');
            } else if (result === 'error') {
                toast.error('No se pudo conectar Gmail.');
            }
        } catch (error) {
            console.error('Gmail connect error:', error);
            toast.error('Fallo de conexión con el servidor.');
        } finally {
            setConnecting(false);
        }
    };

    const handleSetDefault = async (accountId: string) => {
        if (!userId || !entityId) return;
        const toastId = toast.loading('Actualizando cuenta principal…');
        try {
            const accountsRef = collection(db, `${gmailRegistryPath(userId, entityId)}/accounts`);
            const snap = await getDocs(accountsRef);
            const batch = writeBatch(db);
            snap.docs.forEach((docSnap) => {
                batch.update(docSnap.ref, { isDefault: docSnap.id === accountId });
            });
            const selected = accounts.find((a) => a.id === accountId);
            batch.update(doc(db, gmailRegistryPath(userId, entityId)), {
                defaultAccountId: accountId,
                email: selected?.email || null,
                gmailAddress: selected?.email || null,
            });
            await batch.commit();
            toast.success('Cuenta principal actualizada.', { id: toastId });
        } catch {
            toast.error('No se pudo actualizar.', { id: toastId });
        }
    };

    const handleDeleteAccount = async (account: GmailAccountSummary) => {
        if (!userId || !entityId) return;
        if (!confirm(`¿Desvincular ${account.email}?`)) return;

        const toastId = toast.loading('Eliminando cuenta…');
        try {
            await deleteDoc(doc(db, gmailAccountSecretPath(userId, entityId, account.id)));
            await deleteDoc(doc(db, gmailAccountPublicPath(userId, entityId, account.id)));

            const remaining = accounts.filter((a) => a.id !== account.id);
            if (remaining.length === 0) {
                await deleteDoc(doc(db, gmailRegistryPath(userId, entityId)));
                await deleteDoc(doc(db, `users/${userId}/entities/${entityId}/integrations/gmail_internal`)).catch(() => null);
            } else {
                const nextDefault = account.isDefault ? remaining[0] : remaining.find((a) => a.isDefault) || remaining[0];
                await updateDoc(doc(db, gmailRegistryPath(userId, entityId)), {
                    status: 'Connected',
                    accountCount: remaining.length,
                    defaultAccountId: nextDefault.id,
                    email: nextDefault.email,
                    gmailAddress: nextDefault.email,
                    accounts: remaining.map((a) => ({
                        ...a,
                        isDefault: a.id === nextDefault.id,
                    })),
                });
                if (account.isDefault) {
                    await updateDoc(doc(db, gmailAccountPublicPath(userId, entityId, nextDefault.id)), { isDefault: true });
                }
            }

            toast.success('Cuenta desvinculada.', { id: toastId });
        } catch {
            toast.error('Error al desvincular.', { id: toastId });
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative flex h-[88vh] w-full max-w-[95vw] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#0A0A0A] shadow-2xl md:max-w-4xl md:flex-row md:h-auto md:max-h-[85vh]"
                    >
                        <div className="relative hidden w-[34%] shrink-0 flex-col justify-between overflow-hidden border-r border-white/5 bg-red-500/5 p-10 md:flex">
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#EA4335]/15 to-transparent" />
                            <div className="relative z-10">
                                <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EA4335] shadow-[0_0_30px_rgba(234,67,53,0.25)]">
                                    <Mail className="h-7 w-7 text-white" />
                                </div>
                                <h2 className="mb-2 text-3xl font-light text-white">Gmail</h2>
                                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-[#EA4335]">
                                    Multi-cuenta
                                </p>
                                <p className="mt-6 text-[12px] leading-relaxed text-white/40">
                                    Conecta Gmail personal y Google Workspace para enviar desde tu dominio
                                    (@tuempresa.com).
                                </p>
                            </div>
                            <div className="relative z-10 rounded-2xl border border-white/10 bg-white/5 p-5">
                                <p className="text-[10px] uppercase tracking-widest text-white/35">Cuentas activas</p>
                                <p className="mt-1 text-3xl font-light text-white">{accounts.length}</p>
                            </div>
                        </div>

                        <div className="relative flex flex-1 flex-col overflow-hidden bg-[#0A0A0A]">
                            <button
                                onClick={onClose}
                                className="absolute right-5 top-5 z-50 rounded-full p-2 text-white/30 hover:bg-white/5 hover:text-white"
                            >
                                <X className="h-5 w-5" />
                            </button>

                            <div className="flex-1 overflow-y-auto p-5 md:p-10">
                                {loading ? (
                                    <p className="text-sm text-white/40">Cargando cuentas…</p>
                                ) : !isConnected ? (
                                    <div className="flex h-full flex-col justify-center">
                                        <h3 className="mb-2 text-2xl font-light text-white md:text-3xl">
                                            Vincular Gmail
                                        </h3>
                                        <p className="mb-6 max-w-md text-sm text-white/45">
                                            Compatible con @gmail.com y cuentas empresariales de Google Workspace con
                                            dominio propio.
                                        </p>

                                        {isGoogleLoginUser(currentUser as any) && currentUser?.email && (
                                            <div className="mb-6 max-w-md rounded-2xl border border-[#EA4335]/20 bg-[#EA4335]/5 p-4">
                                                <p className="text-[12px] text-white/70">
                                                    Entraste con{' '}
                                                    <span className="font-medium text-white">{currentUser.email}</span>.
                                                    Puedes autorizar esa cuenta o añadir otra después.
                                                </p>
                                            </div>
                                        )}

                                        <button
                                            onClick={() => handleConnectGmail('default')}
                                            disabled={connecting}
                                            className="h-14 max-w-md rounded-full bg-[#EA4335] text-[11px] font-bold uppercase tracking-[0.25em] text-white hover:bg-[#d93025] disabled:opacity-50"
                                        >
                                            {connecting ? 'Conectando…' : 'Conectar primera cuenta'}
                                        </button>
                                    </div>
                                ) : (
                                    <div>
                                        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                            <div>
                                                <h3 className="text-2xl font-light text-white">Cuentas conectadas</h3>
                                                <p className="mt-1 text-[12px] text-white/40">
                                                    Elige cuál usar por defecto para envíos automáticos.
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => handleConnectGmail('add')}
                                                disabled={connecting}
                                                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#EA4335]/30 bg-[#EA4335]/10 px-5 text-[10px] font-bold uppercase tracking-wider text-[#EA4335] hover:bg-[#EA4335]/15 disabled:opacity-50"
                                            >
                                                <Plus className="h-3.5 w-3.5" />
                                                Añadir cuenta
                                            </button>
                                        </div>

                                        <div className="space-y-3">
                                            {(accounts.length > 0 ? accounts : registry?.accounts || []).map((account) => (
                                                <div
                                                    key={account.id}
                                                    className="flex flex-col gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 md:flex-row md:items-center md:justify-between"
                                                >
                                                    <div className="flex min-w-0 items-start gap-3">
                                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03]">
                                                            {account.accountType === 'workspace' ? (
                                                                <Building2 className="h-4 w-4 text-blue-400" />
                                                            ) : (
                                                                <User className="h-4 w-4 text-[#EA4335]" />
                                                            )}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <p className="truncate text-sm font-medium text-white">
                                                                    {account.email}
                                                                </p>
                                                                {account.isDefault && (
                                                                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-amber-400">
                                                                        <Star className="h-2.5 w-2.5 fill-current" />
                                                                        Principal
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="mt-0.5 text-[11px] text-white/35">
                                                                {getGmailAccountTypeLabel(account.accountType)}
                                                                {account.domain ? ` · ${account.domain}` : ''}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex shrink-0 gap-2">
                                                        {!account.isDefault && (
                                                            <button
                                                                onClick={() => handleSetDefault(account.id)}
                                                                className="h-9 rounded-full border border-white/10 px-3 text-[9px] font-bold uppercase tracking-wider text-white/55 hover:bg-white/5"
                                                            >
                                                                Hacer principal
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleDeleteAccount(account)}
                                                            className="flex h-9 w-9 items-center justify-center rounded-full border border-red-500/15 text-red-400/70 hover:bg-red-500/10"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="mt-8 flex items-center gap-3 rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-4">
                                            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                                            <p className="text-[11px] text-white/50">
                                                Las cuentas Workspace envían con tu dominio verificado en Google.
                                            </p>
                                            <ShieldCheck className="ml-auto h-5 w-5 shrink-0 text-emerald-400/40" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {isConnected && (
                                <div className="border-t border-white/6 p-5 md:px-10">
                                    <button
                                        onClick={onClose}
                                        className="h-12 w-full rounded-full border border-white/10 text-[10px] font-bold uppercase tracking-[0.25em] text-white/70 hover:bg-white/5"
                                    >
                                        Listo
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
