'use client';

import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, AlertCircle } from 'lucide-react';
import { BillingData } from '../BillingForm';

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
);

interface CardPaymentProps {
  plan: string;
  planName: string;
  priceUSD: number;
  isProcessing: boolean;
  setIsProcessing: (value: boolean) => void;
  onSuccess: () => void;
  userId: string;
  entityId: string;
  billingData: BillingData | null;
  isBillingValid: boolean;
}

function PaymentForm({
  plan,
  planName,
  priceUSD,
  isProcessing,
  setIsProcessing,
  onSuccess,
  userId,
  entityId,
  clientSecret,
  grossAmount,
  stripeFee,
  billingData,
  isBillingValid,
}: CardPaymentProps & { clientSecret: string; grossAmount: number; stripeFee: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const { currentUser } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      toast.error('Stripe no está cargado');
      return;
    }

    setIsProcessing(true);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      });

      if (error) {
        toast.error(`Error: ${error.message}`);
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        const response = await fetch('/api/subscriptions/activate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentIntentId: paymentIntent.id,
            userId,
            entityId,
            plan,
            billingData,
          }),
        });

        if (!response.ok) {
          throw new Error('Error activando suscripción recurrente');
        }

        toast.success('¡Suscripción y pagos recurrentes activados exitosamente!');
        onSuccess();
      }
    } catch (error: any) {
      console.error('Payment error:', error);
      toast.error(`Error: ${error.message || 'Pago fallido'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2.5">
        <div className="flex justify-between items-center text-xs font-normal text-white/50">
          <span>Plan {planName}:</span>
          <span className="text-white/80">${Number(priceUSD).toFixed(2)} USD</span>
        </div>
        <div className="flex justify-between items-center text-xs font-normal text-white/50">
          <span>Comisión de procesamiento (Stripe 2.9% + $0.30):</span>
          <span className="text-white/70">+${Number(stripeFee).toFixed(2)} USD</span>
        </div>
        <div className="border-t border-white/10 pt-2.5 flex justify-between items-baseline">
          <div className="text-xs font-normal text-white/70">Total a pagar:</div>
          <div className="text-base font-normal text-white tracking-tight">
            ${Number(grossAmount).toFixed(2)} <span className="text-[11px] font-normal text-white/40">USD</span>
          </div>
        </div>
        <div className="text-[10px] text-blue-400/90 bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 text-center font-normal">
          🔄 Cobro recurrente automático mensual. Cancela cuando desees.
        </div>
      </div>

      <PaymentElement
        options={{
          layout: 'tabs',
          defaultValues: {
            billingDetails: {
              email: currentUser?.email || '',
            },
          },
        }}
      />

      <Button
        type="submit"
        disabled={isProcessing || !stripe || !isBillingValid}
        className="w-full h-10 rounded-xl bg-white text-black hover:bg-neutral-200 font-normal text-xs transition-all shadow-sm disabled:opacity-50"
      >
        {isProcessing ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
            Procesando suscripción...
          </>
        ) : (
          `Activar Suscripción ($${Number(grossAmount).toFixed(2)} USD)`
        )}
      </Button>

      {!isBillingValid && (
        <div className="flex items-center gap-2 p-2.5 bg-white/[0.03] border border-white/10 rounded-xl">
          <AlertCircle className="w-3.5 h-3.5 text-white/50 flex-shrink-0" />
          <p className="text-[11px] font-normal text-white/70">Completa los datos de facturación para continuar</p>
        </div>
      )}

      <p className="text-[11px] font-normal text-white/35 text-center">
        🔒 Pago seguro y encriptado procesado directamente por Stripe
      </p>
    </form>
  );
}

export default function CardPayment({
  plan,
  planName,
  priceUSD,
  isProcessing,
  setIsProcessing,
  onSuccess,
  userId,
  entityId,
  billingData,
  isBillingValid,
}: CardPaymentProps) {
  const { currentUser } = useAuth();
  const [clientSecret, setClientSecret] = useState('');
  const [grossAmount, setGrossAmount] = useState(priceUSD);
  const [stripeFee, setStripeFee] = useState(0);
  const [loadingIntent, setLoadingIntent] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const createPaymentIntent = async () => {
      try {
        setLoadingIntent(true);
        const response = await fetch('/api/subscriptions/stripe-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan,
            userId,
            entityId,
            priceUSD,
            planName,
            email: currentUser?.email || '',
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || 'Error creando sesión de pago en Stripe');
        }

        const data = await response.json();
        setClientSecret(data.clientSecret);
        if (data.grossAmount) setGrossAmount(data.grossAmount);
        if (data.stripeFee) setStripeFee(data.stripeFee);
      } catch (error: any) {
        console.error('Error:', error);
        toast.error('Error inicializando pago: ' + error.message);
      } finally {
        setLoadingIntent(false);
      }
    };

    if (currentUser && mounted) {
      createPaymentIntent();
    }
  }, [plan, currentUser, priceUSD, planName, entityId, userId, mounted]);

  const hasPublishableKey = !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

  if (!hasPublishableKey) {
    return (
      <div className="p-6 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-center space-y-3">
        <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
        <h4 className="text-sm font-semibold text-white">Publishable Key requerida para el frontend</h4>
        <p className="text-xs text-white/60 leading-relaxed">
          Ya se configuró la <span className="text-white font-mono">Secret Key</span> en el backend. Para habilitar el formulario de tarjeta en el navegador, agrega tu <span className="text-amber-300 font-mono">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</span> (empieza con <span className="font-mono">pk_live_...</span>) a las variables de entorno.
        </p>
      </div>
    );
  }

  if (!mounted || loadingIntent || !clientSecret) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-blue-500 mr-2" />
        <span className="text-sm text-white/60">
          {loadingIntent ? 'Inicializando pasarela segura de Stripe...' : 'Cargando...'}
        </span>
      </div>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'night',
          variables: {
            colorPrimary: '#ffffff',
            colorBackground: '#0a0a0a',
            colorText: '#ffffff',
            borderRadius: '0.75rem',
            fontFamily: 'Outfit, sans-serif',
          },
        },
      }}
    >
      <PaymentForm
        plan={plan}
        planName={planName}
        priceUSD={priceUSD}
        isProcessing={isProcessing}
        setIsProcessing={setIsProcessing}
        onSuccess={onSuccess}
        userId={userId}
        entityId={entityId}
        clientSecret={clientSecret}
        grossAmount={grossAmount}
        stripeFee={stripeFee}
        billingData={billingData}
        isBillingValid={isBillingValid}
      />
    </Elements>
  );
}
