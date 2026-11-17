'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wallet, CreditCard, Store, Info, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import QrTokenPayment from './methods/QrTokenPayment';
import CardPayment from './methods/CardPayment';
import BillingForm, { BillingData } from './BillingForm';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface CheckoutModalProps {
  plan: {
    id: string;
    name: string;
    price: string;
    priceUSD: number;
    chargeUSD?: number;
    catalogPriceUSD?: number;
    lxrPrice?: string;
    lxrPriceUSD?: number;
    lxrChargeUSD?: number;
    upgradeQuote?: {
      unusedCreditUSD: number;
      daysRemaining: number;
      fullTargetPriceUSD: number;
    } | null;
    features: string[];
  };
  onClose: () => void;
  entityId: string | null;
  redirectUrl?: string | null;
}

const PLAN_RATES = {
  starter: { monthly: 49.99, annual: 39.99 },
  standard: { monthly: 99.99, annual: 79.99 },
  pro: { monthly: 199.99, annual: 159.99 },
  plus: { monthly: 199.99, annual: 159.99 },
  enterprise: { monthly: 999.99, annual: 799.99 }
} as const;

export default function CheckoutModal({ plan, onClose, entityId: propEntityId, redirectUrl }: CheckoutModalProps) {
  const router = useRouter();
  const { currentUser, activeEntity } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [billingData, setBillingData] = useState<BillingData | null>(null);
  const [isBillingValid, setIsBillingValid] = useState(false);

  const planKey = (plan.id?.toLowerCase() || 'starter') as keyof typeof PLAN_RATES;
  const rates = PLAN_RATES[planKey] || { monthly: plan.priceUSD, annual: plan.priceUSD };

  // Determine initial state from pricing matches
  const isAnnualInitial = plan.priceUSD === rates.annual;
  const [isAnnualCheckout, setIsAnnualCheckout] = useState(isAnnualInitial);

  const entityId = propEntityId || activeEntity || 'life';

  // Calculations for billing cycles
  const pricePerMonth = isAnnualCheckout ? rates.annual : rates.monthly;
  const chargeUSD = isAnnualCheckout ? (pricePerMonth * 12) : pricePerMonth;
  const catalogUSD = chargeUSD;
  const lxrChargeUSD = chargeUSD * 0.75;
  const isUpgrade = !!plan.upgradeQuote;

  const handleSuccess = () => {
    onClose();
    if (redirectUrl) {
      router.push(redirectUrl);
    } else {
      router.push('/home');
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-[100vw] w-screen h-[100dvh] max-h-none bg-[#0a0a0a] border-none text-white sm:rounded-none p-0 overflow-hidden no-scrollbar">
        <DialogTitle className="sr-only">Checkout - {plan.name}</DialogTitle>

        <div className="flex flex-col lg:flex-row h-full overflow-y-auto lg:overflow-hidden no-scrollbar">
          {/* Left Column: Form & Summary */}
          <div className="w-full lg:w-1/2 lg:h-full bg-[#111111] border-r border-white/5 p-6 lg:p-10 flex flex-col justify-start overflow-y-visible lg:overflow-y-auto no-scrollbar">
            <div className="max-w-[540px] w-full mx-auto">
              
              {/* Header Banner */}
              <div className="mb-5 flex items-center gap-3 bg-white/[0.02] border border-white/5 p-3.5 rounded-xl">
                <Wallet className="w-4 h-4 text-blue-400 shrink-0" />
                <div>
                  <p className="text-[11px] text-white/50 font-normal">
                    {(currentUser?.email || 'email@example.com').toLowerCase()}
                  </p>
                  <h4 className="text-xs font-normal text-white">Plan {plan.name}</h4>
                </div>
              </div>

              {/* Billing Cycle Toggle Selector */}
              <div className="flex items-center justify-between p-3.5 bg-white/[0.02] border border-white/5 rounded-xl mb-6">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-normal text-white">Facturación Anual</span>
                  <span className="text-[10px] text-white/45 font-normal">Cobro único de 12 meses (Ahorras 20%)</span>
                </div>
                <button
                  onClick={() => setIsAnnualCheckout(!isAnnualCheckout)}
                  className={`w-9 h-5 rounded-full transition-colors duration-300 focus:outline-none p-0.5 relative flex items-center ${
                    isAnnualCheckout ? 'bg-blue-600' : 'bg-white/15'
                  }`}
                  type="button"
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform duration-300 ${
                      isAnnualCheckout ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Billing Form (Contact Info & Address) */}
              <div className="mb-6">
                <h3 className="text-xs font-normal tracking-wider text-white/60 mb-3 uppercase">Información de contacto</h3>
                <BillingForm
                  initialEmail={currentUser?.email || ''}
                  onDataChange={setBillingData}
                  isValid={isBillingValid}
                  onValidChange={setIsBillingValid}
                />
              </div>

              {/* Order Summary & Total Due */}
              <div className="pt-5 border-t border-white/10">
                <p className="text-[11px] font-normal text-white/50 mb-0.5">Total a pagar</p>
                <h2 className="text-xl font-normal tracking-tight text-white mb-4">
                  USD {chargeUSD.toFixed(2)}
                </h2>

                <div className="bg-[#0f0f11] border border-white/10 rounded-xl py-5 px-5 min-h-[130px] flex flex-col justify-between shadow-sm">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-xs font-normal">
                      <span className="text-white/60">Plan {plan.name}</span>
                      <span className="text-white/90">USD {catalogUSD.toFixed(2)}</span>
                    </div>

                    {plan.upgradeQuote ? (
                      <div className="flex justify-between items-center text-xs font-normal text-emerald-400">
                        <span>Crédito plan actual</span>
                        <span>− USD {plan.upgradeQuote.unusedCreditUSD.toFixed(2)}</span>
                      </div>
                    ) : null}
                  </div>
                  
                  <div className="w-full space-y-3 pt-3">
                    <div className="h-px bg-white/10" />
                    
                    <div className="flex justify-between items-center text-xs font-normal">
                      <span className="text-white/80">Total</span>
                      <span className="bg-gradient-to-r from-[#53a7ff] to-[#0055ff] bg-clip-text text-transparent font-medium text-sm">
                        USD {chargeUSD.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Payment Method */}
          <div className="w-full lg:w-1/2 lg:h-full bg-black p-6 lg:p-10 overflow-y-visible lg:overflow-y-auto no-scrollbar">
            <div className="max-w-[540px] w-full mx-auto">
              <div>
                <h3 className="text-xs font-normal tracking-wider text-white/60 mb-4 uppercase">Método de pago</h3>

                <Tabs defaultValue="card" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 bg-white/5 border border-white/10 rounded-xl p-1 mb-5 h-9">
                    <TabsTrigger value="card" className="data-[state=active]:bg-white/10 h-full flex items-center justify-center gap-2 text-xs font-normal text-white/70 data-[state=active]:text-white">
                      <CreditCard className="w-3.5 h-3.5" /> Card
                    </TabsTrigger>
                    <TabsTrigger value="phantom" className="data-[state=active]:bg-white/10 h-full flex items-center justify-center gap-2 text-xs font-normal text-white/70 data-[state=active]:text-white">
                      <Wallet className="w-3.5 h-3.5" /> Phantom
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="card">
                    <CardPayment
                      plan={plan.id}
                      planName={plan.name}
                      priceUSD={chargeUSD}
                      isProcessing={isProcessing}
                      setIsProcessing={setIsProcessing}
                      onSuccess={handleSuccess}
                      userId={currentUser?.uid || ''}
                      entityId={entityId}
                      billingData={billingData}
                      isBillingValid={isBillingValid}
                    />
                  </TabsContent>

                  <TabsContent value="phantom" className="space-y-4">
                    {/* Phantom QR details */}
                    <div className="flex flex-col items-center justify-center gap-1 py-3 border-b border-white/5 mb-4 text-center">
                      <span className="text-white text-sm font-medium tracking-tight">phantom</span>
                      <p className="text-[10px] text-white/45 max-w-xs leading-relaxed font-normal">
                        Descarga esta app en Play Store o App Store, recarga tu cuenta y escanea el siguiente código para pagar.
                      </p>
                    </div>

                    <div>
                      <p className="text-[11px] font-normal text-white/50 mb-2">Selecciona tu token</p>
                      
                      <Tabs defaultValue="usdc" className="w-full">
                        <TabsList className="grid w-full grid-cols-3 bg-white/5 border border-white/10 rounded-lg p-1 mb-2 h-9">
                          <TabsTrigger value="usdc" className="data-[state=active]:bg-white/10 text-xs font-normal text-white/70 data-[state=active]:text-white">USDC</TabsTrigger>
                          <TabsTrigger value="usdt" className="data-[state=active]:bg-white/10 text-xs font-normal text-white/70 data-[state=active]:text-white">USDT</TabsTrigger>
                          <TabsTrigger value="sol" className="data-[state=active]:bg-white/10 text-xs font-normal text-white/70 data-[state=active]:text-white">SOL</TabsTrigger>
                        </TabsList>
                        
                        <div className="text-[9px] text-white/35 text-center mb-4 font-normal">
                          LXR estará disponible en enero 2027.
                        </div>

                        <TabsContent value="usdc">
                          <QrTokenPayment
                            plan={plan.id}
                            priceUSD={chargeUSD}
                            catalogPriceUSD={catalogUSD}
                            isUpgrade={isUpgrade}
                            paymentMethod="usdc"
                            isProcessing={isProcessing}
                            setIsProcessing={setIsProcessing}
                            onSuccess={handleSuccess}
                            userId={currentUser?.uid || ''}
                            entityId={entityId}
                            billingData={billingData}
                            isBillingValid={isBillingValid}
                          />
                        </TabsContent>

                        <TabsContent value="usdt">
                          <QrTokenPayment
                            plan={plan.id}
                            priceUSD={chargeUSD}
                            catalogPriceUSD={catalogUSD}
                            isUpgrade={isUpgrade}
                            paymentMethod="usdt"
                            isProcessing={isProcessing}
                            setIsProcessing={setIsProcessing}
                            onSuccess={handleSuccess}
                            userId={currentUser?.uid || ''}
                            entityId={entityId}
                            billingData={billingData}
                            isBillingValid={isBillingValid}
                          />
                        </TabsContent>

                        <TabsContent value="sol">
                          <QrTokenPayment
                            plan={plan.id}
                            priceUSD={chargeUSD}
                            catalogPriceUSD={catalogUSD}
                            isUpgrade={isUpgrade}
                            paymentMethod="sol"
                            isProcessing={isProcessing}
                            setIsProcessing={setIsProcessing}
                            onSuccess={handleSuccess}
                            userId={currentUser?.uid || ''}
                            entityId={entityId}
                            billingData={billingData}
                            isBillingValid={isBillingValid}
                          />
                        </TabsContent>
                      </Tabs>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
