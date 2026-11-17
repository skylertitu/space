'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, X, Lock, CreditCard, KeyRound, Webhook } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { doc, deleteDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';

interface StripeModalProps {
    isOpen: boolean;
    onClose: () => void;
    activeEntity: string;
    currentUser: { uid: string } | null;
}

export default function StripeModal({ isOpen, onClose, activeEntity, currentUser }: StripeModalProps) {
    const userId = currentUser?.uid;
    const entityId = activeEntity;

    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [publishableKey, setPublishableKey] = useState('');
    const [secretKey, setSecretKey] = useState('');
    const [webhookSecret, setWebhookSecret] = useState('');
    const [config, setConfig] = useState<Record<string, unknown> | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);

    useEffect(() => {
        if (!isOpen || !userId || !entityId) return;
        setInitialLoading(true);

        const configRef = doc(db, `users/${userId}/entities/${entityId}/integrations/stripe`);
        const unsub = onSnapshot(configRef, (snap) => {
            if (snap.exists() && snap.data()?.status === 'Connected') {
                setConfig(snap.data());
                setStep(3);
                setPublishableKey(String(snap.data()?.publishableKey || ''));
            } else {
                setConfig(null);
                setStep(1);
                setPublishableKey('');
                setSecretKey('');
                setWebhookSecret('');
            }
            setInitialLoading(false);
        });

        return () => unsub();
    }, [isOpen, userId, entityId]);

    const handleConnect = async () => {
        const pk = publishableKey.trim();
        const sk = secretKey.trim();
        const wh = webhookSecret.trim();

        if (!pk || !sk) {
            toast.error('Ingresa la Publishable Key y la Secret Key de Stripe.');
            return;
        }

        setIsLoading(true);
        const toastId = toast.loading('Verificando credenciales con Stripe…');

        try {
            const res = await fetch('/api/integrations/stripe/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    entityId,
                    publishableKey: pk,
                    secretKey: sk,
                    webhookSecret: wh,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'No se pudo conectar Stripe.');
            }

            const basePath = `users/${userId}/entities/${entityId}/integrations`;
            try {
                await setDoc(
                    doc(db, `${basePath}/stripe`),
                    {
                        publishableKey: pk,
                        mode: data.mode,
                        livemode: !!data.livemode,
                        status: 'Connected',
                        updatedAt: serverTimestamp(),
                    },
                    { merge: true }
                );
                await setDoc(
                    doc(db, `${basePath}/stripe_internal`),
                    {
                        secretKey: sk,
                        webhookSecret: wh || '',
                        updatedAt: serverTimestamp(),
                    },
                    { merge: true }
                );
            } catch (saveError: unknown) {
                const saveMsg = saveError instanceof Error ? saveError.message : 'Error al guardar en Firestore.';
                throw new Error(
                    `Stripe validó las claves, pero no se pudieron guardar: ${saveMsg}`
                );
            }

            toast.success(
                `Stripe conectado en modo ${data.mode === 'live' ? 'producción' : 'prueba'}.`,
                { id: toastId }
            );
            setStep(3);
            setSecretKey('');
            setWebhookSecret('');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Error al conectar Stripe.';
            toast.error(message, { id: toastId });
        } finally {
            setIsLoading(false);
        }
    };

    const handleDisconnect = async () => {
        if (!userId || !entityId) return;
        if (!confirm('¿Desconectar Stripe de esta entidad?')) return;

        const toastId = toast.loading('Desconectando Stripe…');
        try {
            await deleteDoc(doc(db, `users/${userId}/entities/${entityId}/integrations/stripe_internal`));
            await deleteDoc(doc(db, `users/${userId}/entities/${entityId}/integrations/stripe`));
            setStep(1);
            setPublishableKey('');
            setSecretKey('');
            setWebhookSecret('');
            toast.success('Stripe desconectado.', { id: toastId });
        } catch {
            toast.error('Error al desconectar.', { id: toastId });
        }
    };

    const maskedPk =
        publishableKey.length > 12
            ? `${publishableKey.slice(0, 8)}…${publishableKey.slice(-4)}`
            : publishableKey || '—';

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/60 backdrop-blur-md"
                    />

                    <motion.div
                        initial={{ scale: 0.95, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.95, opacity: 0, y: 20 }}
                        className="relative flex h-auto max-h-[85vh] w-full max-w-[95vw] flex-col overflow-hidden rounded-[24px] border border-white/5 bg-[#0a0a0a] shadow-2xl md:max-w-3xl md:flex-row md:rounded-[40px]"
                    >
                        <div className="relative hidden w-[38%] shrink-0 flex-col overflow-hidden border-r border-white/5 bg-[#101018] p-12 md:flex">
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#635BFF]/20 to-transparent" />
                            <div className="relative z-10">
                                <div className="mb-10 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]">
                                    <CreditCard className="h-8 w-8 text-[#635BFF]" />
                                </div>
                                <h1 className="mb-4 text-[32px] font-normal leading-tight tracking-tight text-white">
                                    Stripe
                                </h1>
                                <p className="max-w-[280px] text-[14px] font-light leading-relaxed text-white/40">
                                    Conecta tu cuenta para que elizmey lea pagos, teléfonos y correos
                                    capturados en el checkout y automatice el acceso por WhatsApp.
                                </p>
                            </div>
                        </div>

                        <div className="relative flex flex-1 flex-col overflow-y-auto bg-[#0a0a0a] p-5 md:p-12">
                            <button
                                onClick={onClose}
                                className="absolute right-6 top-6 z-50 p-2 text-neutral-500 transition-colors hover:text-white"
                            >
                                <X className="h-5 w-5" />
                            </button>

                            <div className="mb-8 flex shrink-0 items-center gap-2 text-neutral-500">
                                <Lock className="h-3.5 w-3.5" />
                                <span className="text-[8px] font-black uppercase tracking-[0.2em] md:text-[9px]">
                                    Claves por entidad
                                </span>
                            </div>

                            {initialLoading ? (
                                <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
                                    Cargando…
                                </div>
                            ) : (
                                <div className="flex flex-1 flex-col justify-center">
                                    <AnimatePresence mode="wait">
                                        {step === 1 && (
                                            <motion.div
                                                key="s1"
                                                initial={{ opacity: 0, x: 16 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -16 }}
                                                className="space-y-6"
                                            >
                                                <div className="rounded-3xl border border-[#635BFF]/20 bg-[#635BFF]/5 p-6">
                                                    <h3 className="mb-3 flex items-center gap-2 text-lg font-medium text-white">
                                                        <div className="h-2 w-2 animate-pulse rounded-full bg-[#635BFF]" />
                                                        Obtener tus claves
                                                    </h3>
                                                    <ol className="list-inside list-decimal space-y-3 text-[13px] text-white/50">
                                                        <li>
                                                            Entra a{' '}
                                                            <a
                                                                href="https://dashboard.stripe.com/apikeys"
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="text-[#635BFF] hover:underline"
                                                            >
                                                                Stripe Dashboard → API keys
                                                            </a>
                                                        </li>
                                                        <li>Copia la Publishable key y la Secret key.</li>
                                                        <li>
                                                            (Opcional) En Webhooks, crea un endpoint y copia el
                                                            signing secret.
                                                        </li>
                                                    </ol>
                                                </div>
                                                <div className="flex gap-3">
                                                    <button
                                                        onClick={onClose}
                                                        className="h-12 flex-1 rounded-xl bg-white/5 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white"
                                                    >
                                                        Cancelar
                                                    </button>
                                                    <button
                                                        onClick={() => setStep(2)}
                                                        className="h-12 flex-[2] rounded-xl bg-[#635BFF] text-[11px] font-black uppercase tracking-widest text-white hover:bg-[#5249e0]"
                                                    >
                                                        Continuar
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )}

                                        {step === 2 && (
                                            <motion.div
                                                key="s2"
                                                initial={{ opacity: 0, x: 16 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -16 }}
                                                className="space-y-5"
                                            >
                                                <div>
                                                    <label className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-neutral-500">
                                                        <KeyRound className="h-3.5 w-3.5" />
                                                        Publishable Key
                                                    </label>
                                                    <input
                                                        type="text"
                                                        autoComplete="off"
                                                        value={publishableKey}
                                                        onChange={(e) => setPublishableKey(e.target.value)}
                                                        placeholder="pk_test_… o pk_live_…"
                                                        className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white focus:border-[#635BFF]/50 focus:outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-neutral-500">
                                                        <Lock className="h-3.5 w-3.5" />
                                                        Secret Key
                                                    </label>
                                                    <input
                                                        type="password"
                                                        autoComplete="off"
                                                        value={secretKey}
                                                        onChange={(e) => setSecretKey(e.target.value)}
                                                        placeholder="sk_test_… o sk_live_…"
                                                        className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white focus:border-[#635BFF]/50 focus:outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-neutral-500">
                                                        <Webhook className="h-3.5 w-3.5" />
                                                        Webhook Secret (opcional)
                                                    </label>
                                                    <input
                                                        type="password"
                                                        autoComplete="off"
                                                        value={webhookSecret}
                                                        onChange={(e) => setWebhookSecret(e.target.value)}
                                                        placeholder="whsec_…"
                                                        className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white focus:border-[#635BFF]/50 focus:outline-none"
                                                    />
                                                </div>
                                                <p className="text-[11px] text-neutral-600">
                                                    La Secret Key se guarda solo en{' '}
                                                    <span className="text-neutral-400">integrations/stripe_internal</span>{' '}
                                                    (servidor).
                                                </p>
                                                <div className="flex gap-3">
                                                    <button
                                                        onClick={() => setStep(1)}
                                                        className="h-12 flex-1 rounded-xl bg-white/5 text-[10px] font-black uppercase tracking-widest text-white/40"
                                                    >
                                                        Atrás
                                                    </button>
                                                    <button
                                                        onClick={handleConnect}
                                                        disabled={isLoading}
                                                        className="h-12 flex-[2] rounded-xl bg-[#635BFF] text-[11px] font-black uppercase tracking-widest text-white disabled:opacity-50"
                                                    >
                                                        {isLoading ? 'Verificando…' : 'Conectar Stripe'}
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )}

                                        {step === 3 && (
                                            <motion.div
                                                key="s3"
                                                initial={{ opacity: 0, x: 16 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: -16 }}
                                                className="space-y-6 text-center"
                                            >
                                                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
                                                    <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                                                </div>
                                                <div>
                                                    <h3 className="mb-2 text-xl font-medium text-white">
                                                        Stripe activo
                                                    </h3>
                                                    <p className="mb-1 text-sm text-white/40">
                                                        Modo {String(config?.mode || 'test')}
                                                    </p>
                                                    <p className="font-mono text-xs text-neutral-500">{maskedPk}</p>
                                                </div>
                                                <div className="flex flex-col gap-3 sm:flex-row">
                                                    <button
                                                        onClick={() => setStep(2)}
                                                        className="h-12 flex-1 rounded-xl bg-white/5 text-[10px] font-black uppercase tracking-widest text-white"
                                                    >
                                                        Actualizar claves
                                                    </button>
                                                    <button
                                                        onClick={handleDisconnect}
                                                        className="h-12 flex-1 rounded-xl border border-red-500/20 bg-red-500/10 text-[10px] font-black uppercase tracking-widest text-red-400"
                                                    >
                                                        Desconectar
                                                    </button>
                                                    <button
                                                        onClick={onClose}
                                                        className="h-12 flex-1 rounded-xl bg-[#635BFF] text-[10px] font-black uppercase tracking-widest text-white"
                                                    >
                                                        Listo
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
