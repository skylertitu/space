'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Check,
  Mail,
  Calendar,
  HardDrive,
  FileText,
  Video,
  Sparkles,
  Layers,
  Workflow,
  FileSignature,
  BookOpen,
  ShieldCheck,
  CheckCircle,
  Wallet,
  Key,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import CheckoutModal from '@/components/subscriptions/CheckoutModal';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

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

    const particleCount = 450;
    particles.current = Array.from({ length: particleCount }).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2,
      size: Math.random() * 1.5 + 0.5,
      seed: Math.random()
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

        const opacity = 0.1 + p.seed * 0.3;
        ctx.fillStyle = `rgba(59, 130, 246, ${opacity})`;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      animationFrame.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
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

interface FeatureItem {
  iconType: 'storage' | 'email' | 'suite' | 'ai' | 'workflow' | 'video' | 'esign' | 'booking' | 'notebook' | 'security' | 'check';
  boldText: string;
  normalText: string;
  highlightText?: string;
  isLink?: boolean;
}

interface PlanConfig {
  id: string;
  name: string;
  monthlyPrice: string;
  monthlyPriceUSD: number;
  annualPrice: string;
  annualPriceUSD: number;
  isEnterprise?: boolean;
  featuresHeader: string;
  features: FeatureItem[];
  highlighted?: boolean;
}

const plans: PlanConfig[] = [
  {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: '$49.99',
    monthlyPriceUSD: 49.99,
    annualPrice: '$39.99',
    annualPriceUSD: 39.99,
    featuresHeader: 'Starter incluye:',
    features: [
      { iconType: 'check', boldText: 'Bandeja de WhatsApp', normalText: ' para leer y responder desde esta cuenta' },
      { iconType: 'check', boldText: 'Chatbots', normalText: ' que se guardan y se activan en esta cuenta' },
      { iconType: 'check', boldText: 'Número de empresa', normalText: ' conectado en Integraciones' },
    ],
  },
  {
    id: 'standard',
    name: 'Standard',
    monthlyPrice: '$99.99',
    monthlyPriceUSD: 99.99,
    annualPrice: '$79.99',
    annualPriceUSD: 79.99,
    highlighted: true,
    featuresHeader: 'Incluye Starter, y además:',
    features: [
      { iconType: 'check', boldText: 'Campañas', normalText: ' de difusión por WhatsApp' },
      { iconType: 'check', boldText: 'Audiencias', normalText: ': contactos, importación y duplicados' },
      { iconType: 'check', boldText: 'El mismo número', normalText: ' de empresa para responder y para difundir' },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: '$199.99',
    monthlyPriceUSD: 199.99,
    annualPrice: '$159.99',
    annualPriceUSD: 159.99,
    featuresHeader: 'Incluye Standard, y además:',
    features: [
      { iconType: 'check', boldText: 'Todos los módulos', normalText: ' de mensajería de esta cuenta' },
      { iconType: 'check', boldText: 'Métricas', normalText: ' de envíos, respuestas y fallos' },
      { iconType: 'check', boldText: 'Bandeja, bots, campañas y contactos', normalText: ' en la misma cuenta' },
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: '$999.99',
    monthlyPriceUSD: 999.99,
    annualPrice: '$799.99',
    annualPriceUSD: 799.99,
    isEnterprise: false,
    featuresHeader: 'Incluye Pro, y además:',
    features: [
      { iconType: 'check', boldText: 'Todos los módulos', normalText: ' de mensajería de esta cuenta' },
      { iconType: 'check', boldText: 'El mismo alcance de Pro', normalText: ' en bandeja, bots, campañas y contactos' },
      { iconType: 'check', boldText: 'Pago anual', normalText: ' a $799.99 por mes si se paga el año' },
    ],
  },
];

const renderFeatureIcon = (type: FeatureItem['iconType']) => {
  switch (type) {
    case 'storage':
      return <HardDrive className="w-3.5 h-3.5 text-white/50 shrink-0 mt-0.5" />;
    case 'email':
      return <Mail className="w-3.5 h-3.5 text-white/50 shrink-0 mt-0.5" />;
    case 'suite':
      return <Layers className="w-3.5 h-3.5 text-white/50 shrink-0 mt-0.5" />;
    case 'ai':
      return <Sparkles className="w-3.5 h-3.5 text-white/50 shrink-0 mt-0.5" />;
    case 'workflow':
      return <Workflow className="w-3.5 h-3.5 text-white/50 shrink-0 mt-0.5" />;
    case 'video':
      return <Video className="w-3.5 h-3.5 text-white/50 shrink-0 mt-0.5" />;
    case 'esign':
      return <FileSignature className="w-3.5 h-3.5 text-white/50 shrink-0 mt-0.5" />;
    case 'booking':
      return <Calendar className="w-3.5 h-3.5 text-white/50 shrink-0 mt-0.5" />;
    case 'notebook':
      return <BookOpen className="w-3.5 h-3.5 text-white/50 shrink-0 mt-0.5" />;
    case 'security':
      return <ShieldCheck className="w-3.5 h-3.5 text-white/50 shrink-0 mt-0.5" />;
    case 'check':
    default:
      return <Check className="w-3.5 h-3.5 text-white/50 shrink-0 mt-0.5" />;
  }
};

function SubscriptionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paramEntityId = searchParams.get('entityId');
  const paramRedirect = searchParams.get('redirect');

  const { currentUser, activeEntity, loading } = useAuth();
  const targetEntityId = paramEntityId || activeEntity || null;

  const { status: subscriptionStatus, plan: activePlanId, expiresAt, isExpired } = useSubscriptionStatus(targetEntityId);
  const [selectedPlan, setSelectedPlan] = useState<typeof plans[number] | null>(null);
  const [hasHistory, setHasHistory] = useState(false);
  const [isAnnual, setIsAnnual] = useState(false);
  const [isBypassOpen, setIsBypassOpen] = useState(false);
  const [bypassCode, setBypassCode] = useState('');
  const [targetEntity, setTargetEntity] = useState<{ id: string; name: string; type?: string } | null>(null);

  useEffect(() => {
    if (!currentUser || !targetEntityId) {
      setTargetEntity(null);
      return;
    }

    const fetchEntity = async () => {
      try {
        const snap = await getDoc(doc(db, `users/${currentUser.uid}/entities/${targetEntityId}`));
        if (snap.exists()) {
          const d = snap.data();
          setTargetEntity({
            id: snap.id,
            name: d.name || (d.type === 'persona' ? 'Personal' : snap.id),
            type: d.type,
          });
        }
      } catch (err) {
        console.error('Error fetching target entity:', err);
      }
    };

    fetchEntity();
  }, [currentUser, targetEntityId]);

  const handleGoToNucleo = () => {
    router.push('/home');
  };

  const handleVerifyBypass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetEntityId || !currentUser) return;
    try {
      // El código se valida en el servidor (nunca viaja al navegador) y el servidor registra la suscripción.
      const res = await fetch('/api/subscriptions/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.uid, entityId: targetEntityId, code: bypassCode.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        toast.error(data.message || 'Invalid code. An active subscription is required.');
        return;
      }
      setIsBypassOpen(false);
      toast.success('Access code validated! Access activated for ' + (targetEntity?.name || 'this environment'));
      router.push(paramRedirect || '/home');
    } catch {
      toast.error('Could not validate the code. Try again.');
    }
  };

  useEffect(() => {
    const checkHistory = async () => {
      if (!currentUser) return;
      try {
        const subPath = targetEntityId 
          ? `users/${currentUser.uid}/entities/${targetEntityId}/subscriptions/current`
          : `users/${currentUser.uid}/subscriptions/current`;
        const subRef = doc(db, subPath);
        const subSnap = await getDoc(subRef);
        if (subSnap.exists()) {
          setHasHistory(true);
          return;
        }

        const reqPath = targetEntityId
          ? `users/${currentUser.uid}/entities/${targetEntityId}/paymentRequests`
          : `users/${currentUser.uid}/paymentRequests`;
        const requestsRef = collection(db, reqPath);
        const q = query(requestsRef, where('status', '==', 'paid'));
        const reqSnap = await getDocs(q);
        if (!reqSnap.empty) {
          setHasHistory(true);
        }
      } catch (err) {
        console.error('Error checking history:', err);
      }
    };

    checkHistory();
  }, [currentUser, targetEntityId]);

  // Use target entity ID
  const entityId = targetEntityId;

  const hasActiveSubscription = subscriptionStatus === 'active';
  const currentPlan = plans.find(p => p.id === activePlanId?.toLowerCase());
  const currentPlanPrice = currentPlan
    ? (isAnnual ? currentPlan.annualPriceUSD : currentPlan.monthlyPriceUSD)
    : 0;

  const plansToRender = hasActiveSubscription && currentPlan ? [currentPlan] : plans;

  // Map selected plan to structure expected by CheckoutModal
  const checkoutPlan = selectedPlan
    ? {
        id: selectedPlan.id,
        name: selectedPlan.name,
        price: isAnnual ? selectedPlan.annualPrice : selectedPlan.monthlyPrice,
        priceUSD: isAnnual ? selectedPlan.annualPriceUSD : selectedPlan.monthlyPriceUSD,
        lxrPrice: isAnnual ? `$${(selectedPlan.annualPriceUSD * 0.75).toFixed(2)}` : `$${(selectedPlan.monthlyPriceUSD * 0.75).toFixed(2)}`,
        lxrPriceUSD: isAnnual ? selectedPlan.annualPriceUSD * 0.75 : selectedPlan.monthlyPriceUSD * 0.75,
        features: selectedPlan.features.map(f => `${f.boldText} ${f.normalText}`),
      }
    : null;

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-[#000000] text-white relative selection:bg-white/10 font-sans">
        <BlueParticles />
        
        {/* Content container */}
        <div className="relative z-[10]">
          {hasActiveSubscription && (
            <div className="relative z-[50] bg-gradient-to-r from-emerald-950/40 via-emerald-900/30 to-emerald-950/40 border-b border-emerald-500/20 px-6 py-3.5 backdrop-blur-xl shadow-lg shadow-emerald-950/20">
              <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 animate-pulse">
                    <CheckCircle className="w-4.5 h-4.5 text-emerald-400" />
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                    <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 w-fit">
                      {targetEntity?.name || 'Environment'}: {activePlanId}
                    </span>
                    <p className="text-sm font-normal text-emerald-100/90 tracking-wide">
                      The subscription for <strong className="text-white font-medium">{targetEntity?.name || 'this environment'}</strong> is active until <span className="text-emerald-300 font-semibold">{expiresAt ? new Date(expiresAt).toLocaleDateString() : 'N/A'}</span>
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => router.push(paramRedirect || '/home')}
                  className="bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-black font-semibold tracking-wider text-xs rounded-full h-9 px-6 transition-all duration-300 shadow-md shadow-emerald-500/20"
                >
                  {paramRedirect ? 'Enter environment' : 'Go to dashboard'}
                </Button>
              </div>
            </div>
          )}

          <section className="mx-auto flex min-h-screen w-full max-w-[102rem] flex-col justify-center px-4 py-16 sm:px-6 lg:px-8 relative z-[10]">

            {/* Main Clean Header */}
            <div className="mx-auto mb-10 max-w-3xl text-center z-[40] space-y-3">
              {targetEntity && (
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-300 text-xs font-normal backdrop-blur-md">
                  <span className="text-white/60 font-light">Plan de:</span>
                  <span className="font-semibold text-white">{targetEntity.name}</span>
                  {targetEntity.type && (
                    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-white/80 font-normal">
                      {targetEntity.type === 'persona' ? 'Personal' : targetEntity.type === 'creador' ? 'Creador' : 'Empresa'}
                    </span>
                  )}
                </div>
              )}
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-normal tracking-tight text-white">
                El plan de mensajería de {targetEntity ? targetEntity.name : 'esta cuenta'}.
              </h1>
              <p className="text-sm sm:text-base text-white/60 font-normal">
                Cada cuenta de empresa tiene su propio plan. Un perfil personal no paga.
              </p>
              <div className="pt-2 flex justify-center">
                <button
                  type="button"
                  onClick={() => setIsBypassOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/10 hover:border-blue-500/40 bg-white/[0.03] hover:bg-blue-500/10 text-white/60 hover:text-white text-xs font-normal transition-all duration-300 cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5 text-blue-400" />
                  <span>Have an access code? Redeem it here</span>
                </button>
              </div>
            </div>

            {/* Google Workspace Style Container */}
            <div className="mx-auto w-full rounded-[2rem] border border-white/10 bg-[#0a0a0c]/80 backdrop-blur-xl p-8 sm:p-10 lg:p-12 shadow-2xl relative z-[20]">
              
              {/* Top Bar: Clean unboxed icons on Left, Annual Switch on Right */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-8 border-b border-white/5 mb-8">
                <div className="flex items-center gap-4">
                  <Mail className="w-5 h-5 text-white/60 hover:text-white transition-colors" />
                  <Calendar className="w-5 h-5 text-white/60 hover:text-white transition-colors" />
                  <HardDrive className="w-5 h-5 text-white/60 hover:text-white transition-colors" />
                  <FileText className="w-5 h-5 text-white/60 hover:text-white transition-colors" />
                  <Video className="w-5 h-5 text-white/60 hover:text-white transition-colors" />
                  <Sparkles className="w-5 h-5 text-white/60 hover:text-white transition-colors" />
                </div>

                {!hasActiveSubscription && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs sm:text-sm text-white/70 font-normal">
                      Anual <span className="text-blue-400 font-normal">(un año, con el precio anual)</span>
                    </span>
                    <button
                      onClick={() => setIsAnnual(!isAnnual)}
                      className={`w-12 h-6 rounded-full transition-colors duration-300 focus:outline-none p-1 relative flex items-center ${
                        isAnnual ? 'bg-blue-600' : 'bg-white/20'
                      }`}
                      aria-label="Toggle billing cycle"
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition-transform duration-300 ${
                          isAnnual ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                )}
              </div>

              {/* 4 Cards Grid */}
              <div className={`grid gap-6 lg:gap-8 ${hasActiveSubscription ? 'max-w-md mx-auto grid-cols-1 w-full' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'}`}>
                {plansToRender.map((plan) => {
                  const isCurrentPlan = subscriptionStatus === 'active' && activePlanId?.toLowerCase() === plan.id.toLowerCase();
                  const displayPrice = isAnnual ? plan.annualPrice : plan.monthlyPrice;
                  const displayPriceUSD = isAnnual ? plan.annualPriceUSD : plan.monthlyPriceUSD;

                  // Render Action Button inline below pricing
                  const renderButton = () => {
                    if (plan.isEnterprise) {
                      const emailSubject = encodeURIComponent("Interest in Enterprise Plan");
                      const emailBody = encodeURIComponent("Hello, I am interested in an Enterprise plan for my business.");
                      return (
                        <a
                          href={`https://mail.google.com/mail/?view=cm&fs=1&to=siomeyromero@gmail.com&su=${emailSubject}&body=${emailBody}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full block"
                        >
                          <Button className="w-full h-11 rounded-full bg-transparent hover:bg-white/10 text-blue-400 hover:text-blue-300 border border-blue-500/40 flex items-center justify-center font-medium text-sm transition-all duration-300">
                            Contactar
                          </Button>
                        </a>
                      );
                    }

                    if (isCurrentPlan) {
                      return (
                        <Button
                          disabled
                          className="h-11 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium tracking-wider text-xs uppercase cursor-default flex items-center justify-center gap-2 w-full"
                        >
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                          Plan actual
                        </Button>
                      );
                    }

                    return (
                      <Button
                        onClick={() => setSelectedPlan(plan)}
                        className={`h-11 rounded-full text-sm font-medium transition-all duration-300 w-full ${
                          plan.highlighted
                            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30 active:scale-[0.99]'
                            : 'bg-transparent border border-blue-500/40 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10'
                        }`}
                      >
                        {hasActiveSubscription 
                          ? displayPriceUSD > currentPlanPrice 
                            ? 'Subir de plan' 
                            : 'Elegir' 
                          : 'Elegir'}
                      </Button>
                    );
                  };

                  const isHighlightedStandard = plan.highlighted && !isCurrentPlan;

                  return (
                    <article
                      key={plan.id}
                      className={`p-7 sm:p-8 lg:p-8 flex min-h-[640px] flex-col relative transition-all duration-300 ${
                        isHighlightedStandard
                          ? 'border-2 border-blue-500 rounded-[1.75rem] bg-blue-500/[0.03] shadow-xl shadow-blue-500/10'
                          : 'border border-white/10 rounded-[1.75rem] bg-white/[0.01] hover:border-white/20'
                      } ${
                        isCurrentPlan ? 'ring-2 ring-emerald-500/80 shadow-2xl shadow-emerald-500/20 border-emerald-500/40 bg-gradient-to-b from-emerald-950/15 via-black/40 to-black/80' : ''
                      }`}
                    >
                      {/* Header Title */}
                      <div className="flex items-center justify-between mb-1">
                        <h2 className="text-2xl font-normal text-white tracking-tight">
                          {plan.name}
                        </h2>
                        {isCurrentPlan ? (
                          <span className="text-[9px] px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full uppercase tracking-wider font-semibold animate-pulse">
                            Active
                          </span>
                        ) : null}
                      </div>

                      {/* Price Section */}
                      <div className="mt-1 mb-5">
                        {!plan.isEnterprise ? (
                          <div className="flex flex-col">
                            <span className="text-3xl sm:text-4xl font-normal text-white tracking-tight">
                              {displayPrice}
                            </span>
                            <span className="text-xs text-white/50 mt-0.5 font-normal">
                              {isAnnual ? 'por cuenta / mes, pago anual' : 'por cuenta / mes'}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            <span className="text-xs text-white/60 mt-3 font-normal">
                              Precio a consultar
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Button Placement directly below pricing */}
                      <div className="mb-6 w-full">
                        {renderButton()}
                      </div>

                      {/* Features List */}
                      <div className="flex-grow">
                        <p className="text-xs font-normal text-white/70 mb-4 tracking-tight">
                          {plan.featuresHeader}
                        </p>
                        <div className="space-y-3">
                          {plan.features.map((feature, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-2.5 text-xs text-white/75 font-normal leading-relaxed"
                            >
                              {renderFeatureIcon(feature.iconType)}
                              <div>
                                <span className="font-normal text-white">{feature.boldText}</span>
                                {feature.normalText}
                                {feature.highlightText && (
                                  <span className="underline underline-offset-2 decoration-blue-400/60 text-white font-normal">
                                    {feature.highlightText}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* Bottom footer text inside container */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-8 mt-8 border-t border-white/5 text-[11px] text-white/40">
                <span>{isAnnual ? 'El anual se cobra por el año completo' : 'El mensual se cobra cada mes'}</span>
                <span>Precios en USD. Tarjeta o Solana.</span>
              </div>
            </div>

            {/* Bottom Disclaimers */}
            <div className="mx-auto w-full max-w-[92rem] mt-6 px-4 space-y-2 text-[11px] text-white/40 leading-relaxed">
              <p>
                El plan es de la cuenta de empresa. Starter cubre bandeja y chatbots. Standard suma campañas y audiencias. Pro y Enterprise abren todos los módulos de mensajería. La tarjeta se renueva sola. El pago con Solana cubre solo el periodo comprado.
              </p>
            </div>

          </section>

          {checkoutPlan && (
            <CheckoutModal
              plan={checkoutPlan}
              onClose={() => setSelectedPlan(null)}
              entityId={entityId}
              redirectUrl={paramRedirect}
            />
          )}

          {/* Home & Wallet - Top Right */}
          <div className="fixed top-8 right-8 md:top-12 md:right-12 z-[50] flex items-center gap-4">
            {hasHistory && (
              <Button
                onClick={() => router.push('/configuracion')}
                variant="outline"
                className="border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white rounded-full flex items-center gap-2 h-10 px-5 text-xs font-normal tracking-wider uppercase transition-all duration-300 shadow-md backdrop-blur-sm"
              >
                <Wallet className="w-3.5 h-3.5" />
                Wallet
              </Button>
            )}
            <button
              onClick={handleGoToNucleo}
              className="group flex items-center gap-2 text-white/40 hover:text-white transition-all duration-300"
            >
              <span className="text-sm font-normal tracking-wide">Home</span>
            </button>
          </div>
        </div>
      </main>

      {isBypassOpen && (
        <Dialog open onOpenChange={setIsBypassOpen}>
          <DialogContent className="max-w-sm bg-[#111111] border border-white/10 text-white rounded-2xl p-6 shadow-2xl">
            <DialogTitle className="text-base font-semibold text-white">Access Code</DialogTitle>
            <form onSubmit={handleVerifyBypass} className="mt-4 space-y-4">
              <p className="text-xs text-white/50 leading-relaxed">
                Enter your access code to start a free 30-day trial of the <strong className="text-white font-medium">{targetEntity?.name || 'business'}</strong> environment. After 30 days it locks again (your data is kept) until you activate a subscription.
              </p>
              <input
                type="password"
                placeholder="Access code"
                value={bypassCode}
                onChange={(e) => setBypassCode(e.target.value)}
                className="w-full h-10 px-3.5 bg-white/[0.02] border border-white/10 rounded-xl text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 transition-colors"
                autoFocus
              />
              <div className="flex justify-end gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsBypassOpen(false)}
                  className="h-9 px-4 rounded-full text-white/60 hover:text-white text-xs font-normal"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="h-9 px-5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
                >
                  Verify
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </ProtectedRoute>
  );
}

export default function SubscriptionsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#000000] text-white flex items-center justify-center text-xs tracking-widest uppercase">Loading subscriptions...</div>}>
      <SubscriptionsContent />
    </Suspense>
  );
}
