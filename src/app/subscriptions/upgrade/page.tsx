'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Mail, CheckCircle, ArrowRight, LogOut, Wallet } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import CheckoutModal from '@/components/subscriptions/CheckoutModal';
import CancelRenewalButton from '@/components/subscriptions/CancelRenewalButton';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import {
  buildCheckoutPricing,
  type UpgradeChargeQuote,
} from '@/lib/subscriptions/upgrade-pricing';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  seed: number;
}

const BlueParticles = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const animationFrame = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    particles.current = Array.from({ length: 450 }).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2,
      size: Math.random() * 1.5 + 0.5,
      seed: Math.random(),
    }));

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.current.forEach((p) => {
        p.x += p.vx + Math.sin(Date.now() * 0.001 + p.seed * 10) * 0.2;
        p.y += p.vy + Math.cos(Date.now() * 0.001 + p.seed * 10) * 0.2;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.fillStyle = `rgba(59, 130, 246, ${0.1 + p.seed * 0.3})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });
      animationFrame.current = requestAnimationFrame(animate);
    };

    animate();
    return () => {
      window.removeEventListener('resize', resize);
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ opacity: 0.8 }}
    />
  );
};

const plans = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$49.99',
    priceUSD: 49.99,
    lxrPrice: '$37.49',
    lxrPriceUSD: 37.49,
    description: 'Initial access to start operating within Roosevelt.',
    features: ['1 active workspace', 'Base dashboard', 'Essential support'],
    accent: 'border-white/10 bg-white/[0.03]',
    highlighted: false,
    isEnterprise: false,
  },
  {
    id: 'standard',
    name: 'Standard',
    price: '$99.99',
    priceUSD: 99.99,
    lxrPrice: '$74.99',
    lxrPriceUSD: 74.99,
    description: 'Expanded workflow for high-paced teams and operations.',
    features: ['3 active workspaces', 'Priority dashboard & support', 'SI research assistant'],
    accent: 'border-white/10 bg-white/[0.03]',
    highlighted: false,
    isEnterprise: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$199.99',
    priceUSD: 199.99,
    lxrPrice: '$149.99',
    lxrPriceUSD: 149.99,
    description: 'Advanced coverage for more robust operations.',
    features: ['10 active workspaces', 'Premium support & faster responses', 'Advanced API access'],
    accent: 'border-blue-500/50 bg-white/[0.06] shadow-lg shadow-blue-500/5',
    highlighted: true,
    isEnterprise: false,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '$999.99',
    priceUSD: 999.99,
    lxrPrice: '$749.99',
    lxrPriceUSD: 749.99,
    description: 'Dedicated resources for complex corporate requirements.',
    features: ['Unlimited workspaces', 'Dedicated manager & Custom SLA', 'Enterprise security'],
    accent: 'border-white/10 bg-white/[0.03]',
    highlighted: false,
    isEnterprise: false,
  } as const,
] as const;

type PlanDef = (typeof plans)[number];

type CheckoutPlan = Omit<PlanDef, 'features'> & {
  features: string[];
  chargeUSD: number;
  catalogPriceUSD: number;
  lxrChargeUSD: number;
  upgradeQuote: UpgradeChargeQuote | null;
};

const PLAN_TIER: Record<string, number> = {
  starter: 1,
  standard: 2,
  pro: 3,
  plus: 3,
  enterprise: 4,
};

export default function SubscriptionUpgradePage() {
  const router = useRouter();
  const { currentUser, activeEntity, loading: authLoading } = useAuth();
  const {
    status: subscriptionStatus,
    plan: activePlanId,
    expiresAt,
    priceUSD: activePriceUSD,
    activatedAt,
    cancelAtPeriodEnd,
    loading: subLoading,
  } = useSubscriptionStatus();
  const [selectedPlan, setSelectedPlan] = useState<CheckoutPlan | null>(null);

  const entityId = activeEntity;
  const hasActiveSubscription = subscriptionStatus === 'active';
  const currentPlan = plans.find((p) => p.id === activePlanId?.toLowerCase());
  const currentPlanPrice = activePriceUSD ?? (currentPlan ? currentPlan.priceUSD : 0);
  const currentTier = currentPlan ? (PLAN_TIER[currentPlan.id] ?? 0) : 0;

  const upgradePlans = currentPlan
    ? plans.filter((p) => (PLAN_TIER[p.id] ?? 0) > currentTier)
    : [];

  const buildPlanForCheckout = (plan: PlanDef): CheckoutPlan => {
    const usd = buildCheckoutPricing({
      hasActiveSubscription: true,
      currentPriceUSD: currentPlanPrice,
      expiresAt,
      activatedAt,
      targetPlanId: plan.id,
    });
    const lxr = buildCheckoutPricing({
      hasActiveSubscription: true,
      currentPriceUSD: currentPlanPrice,
      expiresAt,
      activatedAt,
      targetPlanId: plan.id,
      useLxr: true,
    });
    return {
      ...plan,
      features: [...plan.features],
      chargeUSD: usd.chargeUSD,
      catalogPriceUSD: usd.fullTargetPriceUSD,
      lxrChargeUSD: lxr.chargeUSD,
      upgradeQuote: usd.quote,
    };
  };

  useEffect(() => {
    if (authLoading || subLoading) return;
    if (!hasActiveSubscription) {
      router.replace('/subscriptions');
    }
  }, [authLoading, subLoading, hasActiveSubscription, router]);

  if (authLoading || subLoading || !hasActiveSubscription) {
    return (
      <ProtectedRoute>
        <main className="min-h-screen bg-black flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </main>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-black text-white relative selection:bg-white/10">
        <BlueParticles />

        <div className="relative z-[10]">
          <div className="relative z-[50] bg-gradient-to-r from-emerald-950/30 via-emerald-900/20 to-emerald-950/30 border-b border-emerald-500/20 px-6 py-3.5 backdrop-blur-xl shadow-lg shadow-emerald-950/20">
            <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 animate-pulse">
                  <CheckCircle className="w-4.5 h-4.5 text-emerald-400" />
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                  <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 w-fit">
                    Active: {activePlanId}
                  </span>
                  <p className="text-sm font-medium text-emerald-100/90 tracking-wide">
                    Your subscription is active and valid until{' '}
                    <span className="text-emerald-300 font-semibold">
                      {expiresAt ? new Date(expiresAt).toLocaleDateString() : 'N/A'}
                    </span>
                  </p>
                </div>
              </div>
              <Button
                onClick={() => router.push('/home')}
                className="bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-black font-bold tracking-wider text-xs rounded-full h-9 px-6 transition-all duration-300 shadow-md shadow-emerald-500/20"
              >
                Go to Dashboard
              </Button>
            </div>
          </div>

          <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col justify-center px-6 py-16 sm:px-10 lg:px-12 relative z-[10]">
            <div className="absolute top-8 right-6 sm:right-10 lg:right-12 z-[40]">
              <Button
                onClick={() => router.push('/configuracion?tab=billing')}
                variant="outline"
                className="border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white rounded-full flex items-center gap-2 h-10 px-5 text-xs font-semibold tracking-wider uppercase transition-all duration-300 shadow-md backdrop-blur-sm"
              >
                <Wallet className="w-3.5 h-3.5" />
                Wallet
              </Button>
            </div>

            <div className="mx-auto mb-10 max-w-3xl text-center">
              <p className="mb-4 text-[11px] uppercase tracking-[0.45em] text-white/40 font-semibold">
                Subscription
              </p>
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
                Cambiar tu plan
              </h1>
              <p className="mt-3 text-sm text-white/55 font-medium">
                Solo pagas la diferencia entre tu plan actual y el plan superior (ej. Pro − Starter).
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2 text-[10px] uppercase tracking-wider">
                <span className="px-3 py-1 rounded-full border border-white/10 text-white/50">
                  1 · Elegir plan
                </span>
                <span className="px-3 py-1 rounded-full border border-white/10 text-white/50">
                  2 · Pagar QR
                </span>
                <span className="px-3 py-1 rounded-full border border-emerald-500/30 text-emerald-400/90">
                  3 · Activo al instante
                </span>
              </div>
              <button
                type="button"
                onClick={() => router.push('/subscriptions')}
                className="mt-6 text-xs text-white/40 hover:text-white/70 transition-colors"
              >
                ← Volver a mi plan actual
              </button>
            </div>

            {upgradePlans.length === 0 ? (
              <p className="text-center text-sm text-white/50 max-w-md mx-auto">
                Ya tienes el plan más alto disponible.
              </p>
            ) : (
              <div
                className={`grid gap-6 w-full mx-auto ${
                  upgradePlans.length >= 2
                    ? 'max-w-4xl lg:grid-cols-2'
                    : 'max-w-md grid-cols-1'
                }`}
              >
                {upgradePlans.map((plan) => {
                  const checkoutPreview = !plan.isEnterprise
                    ? buildCheckoutPricing({
                        hasActiveSubscription: true,
                        currentPriceUSD: currentPlanPrice,
                        expiresAt,
                        activatedAt,
                        targetPlanId: plan.id,
                      })
                    : null;

                  return (
                    <article
                      key={plan.id}
                      className={`rounded-3xl border backdrop-blur-sm p-8 ${plan.accent} flex min-h-[420px] flex-col relative overflow-hidden transition-all duration-300 hover:border-white/20 ${
                        plan.highlighted
                          ? 'lg:scale-105 ring-2 ring-blue-500/50 shadow-lg shadow-blue-500/10'
                          : ''
                      }`}
                    >
                      {plan.highlighted && (
                        <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-blue-600/20 to-transparent h-px" />
                      )}

                      <div className="mb-8">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs uppercase tracking-[0.35em] text-white/35 font-semibold">
                            {plan.name}
                          </p>
                          {plan.id === 'pro' && (
                            <span className="text-[10px] px-3 py-1 bg-blue-600/30 text-blue-200 rounded-full uppercase tracking-widest font-bold">
                              Popular
                            </span>
                          )}
                        </div>

                        {!plan.isEnterprise && checkoutPreview?.quote && (
                          <div className="mt-5 mb-5">
                            <p className="text-sm text-white/40 line-through">{plan.price} / mes</p>
                            <div className="flex items-end gap-2 mt-1">
                              <span className="text-4xl font-semibold tracking-tight text-emerald-300">
                                ${checkoutPreview.chargeUSD.toFixed(2)}
                              </span>
                              <span className="pb-1 text-xs uppercase tracking-widest text-white/35">
                                a pagar hoy
                              </span>
                            </div>
                            <p className="text-[11px] text-white/45 mt-2">
                              Crédito plan actual −${checkoutPreview.quote.unusedCreditUSD.toFixed(2)}
                            </p>
                          </div>
                        )}

                        <p className="text-sm leading-6 text-white/60 font-medium">{plan.description}</p>
                      </div>

                      <div className="mb-10 space-y-4">
                        {plan.features.map((feature) => (
                          <div
                            key={feature}
                            className="flex items-center gap-3 text-sm text-white/75 font-medium"
                          >
                            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-white/5">
                              <Check className="h-3.5 w-3.5" />
                            </div>
                            <span>{feature}</span>
                          </div>
                        ))}
                      </div>

                      {plan.isEnterprise ? (
                        <a
                          href={`mailto:business@itsroosevelt.com?subject=${encodeURIComponent(
                            `Enterprise upgrade inquiry — ${currentUser?.email || 'Roosevelt user'}`
                          )}`}
                          className="mt-auto"
                        >
                          <Button className="w-full h-12 rounded-full font-semibold tracking-wider text-xs flex items-center justify-center gap-2 bg-violet-600/20 hover:bg-violet-600/30 text-violet-200 border border-violet-500/30">
                            <Mail className="w-4 h-4" />
                            Upgrade — Contact team
                          </Button>
                        </a>
                      ) : (
                        <Button
                          onClick={() => setSelectedPlan(buildPlanForCheckout(plan))}
                          className="mt-auto h-12 rounded-full font-semibold tracking-widest text-xs uppercase shadow-lg transition-all duration-300 bg-blue-600 hover:bg-blue-700 text-white shadow-blue-900/20"
                        >
                          Pagar {plan.name}
                        </Button>
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            <div className="mt-8 max-w-2xl mx-auto rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {cancelAtPeriodEnd ? (
                <p className="text-xs text-amber-300/90">
                  Renovación cancelada · acceso hasta{' '}
                  {expiresAt ? new Date(expiresAt).toLocaleDateString('es-ES') : 'vencimiento'}
                </p>
              ) : (
                <>
                  <p className="text-xs text-white/40">¿No quieres renovar? Sin reembolso.</p>
                  {currentUser && (
                    <CancelRenewalButton
                      userId={currentUser.uid}
                      entityId={entityId}
                      expiresAt={expiresAt}
                      onSuccess={() => window.location.reload()}
                    />
                  )}
                </>
              )}
            </div>

            <div className="mt-16 max-w-2xl mx-auto text-center">
              <p className="text-xs uppercase tracking-[0.35em] text-white/40 mb-4 font-semibold">
                💎 Save with LXR
              </p>
              <p className="text-sm text-white/60 font-medium">
                Pay with our LXR token and unlock exclusive discounts.
                Starter: <span className="text-green-400 font-bold">$14.99</span> (vs $19.99) • Pro:{' '}
                <span className="text-green-400 font-bold">$74.99</span> (vs $99.99)
              </p>
            </div>
          </section>

          {selectedPlan && (
            <CheckoutModal
              plan={selectedPlan}
              onClose={() => setSelectedPlan(null)}
              entityId={entityId}
            />
          )}

          <div className="fixed bottom-8 left-8 md:bottom-12 md:left-12 z-[50]">
            <button
              onClick={async () => {
                try {
                  await signOut(auth);
                  router.push('/login');
                } catch (error) {
                  console.error('Error logging out:', error);
                  toast.error('Error al cerrar sesión');
                }
              }}
              className="group flex items-center gap-2 text-white/40 hover:text-white transition-all duration-300"
            >
              <LogOut className="w-4 h-4 transition-transform duration-300 group-hover:-translate-x-1" strokeWidth={1.5} />
              <span className="text-sm font-medium tracking-wide">Log out</span>
            </button>
          </div>

          <div className="fixed bottom-8 right-8 md:bottom-12 md:right-12 z-[50]">
            <button
              onClick={() => router.push('/home')}
              className="group flex items-center gap-2 text-white/40 hover:text-white transition-all duration-300"
            >
              <span className="text-sm font-medium tracking-wide">Go to Home</span>
              <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </main>
    </ProtectedRoute>
  );
}
