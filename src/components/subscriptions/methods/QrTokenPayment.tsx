'use client';

import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Connection, PublicKey } from '@solana/web3.js';
import { AlertCircle, CheckCircle2, Clock, Loader2, RefreshCw, Smartphone, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { usePriceFromJupiter } from '@/hooks/usePriceFromJupiter';
import { db } from '@/lib/firebase';
import { BillingData } from '../BillingForm';
import {
  getSubscriptionPaymentConfig,
  getSubscriptionCurrentDocPath,
  getSubscriptionPaymentRequestsCollectionPath,
  SUBSCRIPTION_RPC_URL,
  SUBSCRIPTION_TREASURY_WALLET,
  type SubscriptionPaymentMethod,
} from '@/lib/subscriptions/payment-config';

interface QrTokenPaymentProps {
  plan: string;
  priceUSD: number;
  catalogPriceUSD?: number;
  paymentMethod: SubscriptionPaymentMethod;
  isProcessing: boolean;
  setIsProcessing: (value: boolean) => void;
  onSuccess: () => void;
  userId: string;
  entityId: string;
  billingData: BillingData | null;
  isBillingValid: boolean;
  discountLabel?: string;
  isUpgrade?: boolean;
}

interface PaymentRequestState {
  requestId: string;
  qrUrl: string;
  expiresAt: string;
  reference: string;
  status: 'pending' | 'paid' | 'expired';
  paymentSignature?: string | null;
}

function getClientSolanaConnection() {
  const rpcUrl = SUBSCRIPTION_RPC_URL && SUBSCRIPTION_RPC_URL.startsWith('http')
    ? SUBSCRIPTION_RPC_URL
    : 'https://api.mainnet-beta.solana.com';
  return new Connection(rpcUrl, 'confirmed');
}

function toUiAndRawAmount(value: number, decimals: number) {
  const fixed = value.toFixed(decimals);
  const [integerPart, decimalPart = ''] = fixed.split('.');
  const uiAmount = fixed.replace(/\.?0+$/, '');
  const rawAmount = `${integerPart}${decimalPart}`.replace(/^0+/, '') || '0';

  return { uiAmount, rawAmount };
}

export default function QrTokenPayment({
  plan,
  priceUSD,
  catalogPriceUSD,
  paymentMethod,
  isProcessing,
  setIsProcessing,
  onSuccess,
  userId,
  entityId,
  billingData,
  isBillingValid,
  discountLabel,
  isUpgrade = false,
}: QrTokenPaymentProps) {
  const config = useMemo(() => getSubscriptionPaymentConfig(paymentMethod), [paymentMethod]);
  const needsPriceFeed = paymentMethod !== 'usdc' && paymentMethod !== 'usdt';
  const priceMint = paymentMethod === 'sol' ? 'So11111111111111111111111111111111111111112' : config.mint;
  const { prices, loading: loadingPrice, secondsRemaining } = usePriceFromJupiter(
    needsPriceFeed && priceMint ? [priceMint] : [],
    60000 // Cache price for 60 seconds (1 minute) to reduce volatility and rate limits
  );
  const quotedTokenPrice = priceMint ? prices[priceMint] : 1;
  const isStable = paymentMethod === 'usdc' || paymentMethod === 'usdt';
  const paymentAmount = isStable ? priceUSD : quotedTokenPrice ? priceUSD / quotedTokenPrice : null;
  const preciseAmount = paymentAmount ? toUiAndRawAmount(paymentAmount, config.decimals) : null;

  const [paymentRequest, setPaymentRequest] = useState<PaymentRequestState | null>(null);
  const [secondsUntilExpiry, setSecondsUntilExpiry] = useState(0);
  const [lastGenerationKey, setLastGenerationKey] = useState<string | null>(null);

  useEffect(() => {
    if (!paymentRequest?.expiresAt) {
      setSecondsUntilExpiry(0);
      return;
    }

    const updateCountdown = () => {
      const remaining = Math.max(
        0,
        Math.ceil((new Date(paymentRequest.expiresAt).getTime() - Date.now()) / 1000)
      );
      setSecondsUntilExpiry(remaining);
    };

    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(intervalId);
  }, [paymentRequest?.expiresAt]);

  const getPaymentRequestDocRef = (requestId: string) =>
    doc(db, `${getSubscriptionPaymentRequestsCollectionPath(userId, entityId)}/${requestId}`);

  const catalogUsd = catalogPriceUSD ?? priceUSD;

  useEffect(() => {
    if (!paymentRequest?.requestId || paymentRequest.status !== 'pending') {
      return;
    }

    let cancelled = false;

    const pollServerStatus = async () => {
      const params = new URLSearchParams({
        userId,
        entityId,
        requestId: paymentRequest.requestId,
      });
      const response = await fetch(`/api/subscriptions/qr/status?${params.toString()}`);
      if (!response.ok) return null;
      return response.json() as Promise<{ status: string; paymentSignature?: string | null }>;
    };

    const pollStatus = async () => {
      try {
        const serverStatus = await pollServerStatus();
        if (serverStatus?.status === 'paid') {
          if (!cancelled) {
            setPaymentRequest((current) =>
              current ? { ...current, status: 'paid', paymentSignature: serverStatus.paymentSignature } : current
            );
            toast.success('Payment confirmed on Solana. Activating subscription...');
            onSuccess();
          }
          return;
        }

        if (Date.now() > new Date(paymentRequest.expiresAt).getTime()) {
          const recoverResponse = await fetch('/api/subscriptions/recover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              entityId,
              requestId: paymentRequest.requestId,
            }),
          });

          if (recoverResponse.ok) {
            const recoverData = await recoverResponse.json();
            if (recoverData.success) {
              if (!cancelled) {
                toast.success('Payment found and subscription activated.');
                onSuccess();
              }
              return;
            }
          }

          // El servidor marca la orden como expirada al consultar su estado (el navegador ya no escribe en Firestore).
          await pollServerStatus();

          if (!cancelled) {
            setPaymentRequest((current) =>
              current
                ? {
                    ...current,
                    status: 'expired',
                  }
                : current
            );
            toast.error('This QR code expired. Generate a new one to continue.');
          }
          return;
        }

        // La verificación en cadena y la activación las hace el servidor (/api/subscriptions/qr/status).
      } catch (error) {
        console.error('QR payment status polling failed:', error);
      }
    };

    pollStatus();
    const intervalId = window.setInterval(pollStatus, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [entityId, onSuccess, paymentRequest?.requestId, paymentRequest?.status, userId]);

  const generationKey = useMemo(() => {
    if (!billingData || !isBillingValid || !preciseAmount) {
      return null;
    }

    return JSON.stringify({
      userId,
      entityId,
      plan,
      paymentMethod,
      amount: preciseAmount.uiAmount,
      email: billingData.email,
      fullName: billingData.fullName,
      zipCode: billingData.zipCode,
    });
  }, [billingData, entityId, isBillingValid, paymentMethod, plan, preciseAmount, userId]);

  const handleGenerateQr = async (auto = false) => {
    if (!billingData || !isBillingValid) {
      if (!auto) {
        toast.error('Complete your billing details first');
      }
      return;
    }

    if (!userId || !entityId) {
      if (!auto) {
        toast.error('Missing active account context. Reload and try again.');
      }
      return;
    }

    if (priceUSD <= 0) {
      if (!auto) {
        toast.error('No payment required for this upgrade');
      }
      return;
    }

    if (!preciseAmount) {
      if (!auto) {
        toast.error(`Unable to calculate the ${config.label} payment amount`);
      }
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch('/api/subscriptions/qr/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          entityId,
          plan,
          paymentMethod,
          planPriceUSD: catalogUsd,
          chargeUSD: priceUSD,
          expectedAmountUi: preciseAmount.uiAmount,
          expectedAmountRaw: preciseAmount.rawAmount,
          billingData: billingData || null,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || 'Unable to create payment QR on server');
      }

      const created = await response.json();

      setPaymentRequest({
        requestId: created.requestId,
        qrUrl: created.qrUrl,
        expiresAt: created.expiresAt,
        reference: created.reference,
        status: 'pending',
        paymentSignature: null,
      });
      if (generationKey) {
        setLastGenerationKey(generationKey);
      }

      if (!auto) {
        toast.success('Unique Phantom QR generated');
      }
    } catch (error: any) {
      console.error('QR generation error:', error);
      if (!auto) {
        toast.error(error?.message || 'Unable to generate payment QR');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (!generationKey || isProcessing) {
      return;
    }

    if (paymentRequest && paymentRequest.status !== 'expired' && lastGenerationKey === generationKey) {
      return;
    }

    if (lastGenerationKey === generationKey && paymentRequest?.status === 'expired') {
      return;
    }

    handleGenerateQr(true);
  }, [generationKey, isProcessing, lastGenerationKey, paymentRequest]);

  const showPriceLoader = needsPriceFeed && loadingPrice;

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(SUBSCRIPTION_TREASURY_WALLET);
    toast.success('Dirección copiada');
  };

  return (
    <div className="space-y-4">
      {discountLabel ? (
        <div className="bg-green-600/10 border border-green-600/30 rounded-lg px-3 py-2 text-xs text-green-300">
          {discountLabel}
        </div>
      ) : null}

      {showPriceLoader ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500 mr-2" />
          <span className="text-sm text-white/60">Fetching {config.label} price...</span>
        </div>
      ) : preciseAmount ? (
        <>
          <div className="bg-blue-600/10 border border-blue-600/20 rounded-xl p-2.5 flex items-center gap-2 mb-3.5 text-xs font-normal">
            <Clock className="w-3.5 h-3.5 text-[#0055ff] shrink-0" />
            {paymentMethod === 'usdc' || paymentMethod === 'usdt' ? (
              <span className="bg-gradient-to-r from-[#53a7ff] to-[#0055ff] bg-clip-text text-transparent font-normal text-xs">
                Monto fijo en stablecoin
              </span>
            ) : (
              <span className="bg-gradient-to-r from-[#53a7ff] to-[#0055ff] bg-clip-text text-transparent font-normal text-xs">
                La cotización se actualizará cada 60 segundos
              </span>
            )}
          </div>

          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5 mb-3.5 space-y-2.5">
            <div className="flex justify-between items-center text-xs font-normal">
              <span className="text-white/50">Monto en USD</span>
              <span className="text-white/80">${priceUSD.toFixed(2)}</span>
            </div>
            <div className="h-px bg-white/5" />
            <div className="flex justify-between items-center text-xs font-normal">
              <span className="text-white/50">Escanea y paga</span>
              <span className="bg-gradient-to-r from-[#53a7ff] to-[#0055ff] bg-clip-text text-transparent font-medium">
                {preciseAmount.uiAmount} {config.label}
              </span>
            </div>
          </div>

          {paymentRequest ? (
            <div className="rounded-xl border border-white/10 bg-[#0f0f11] p-3.5 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-normal uppercase tracking-wider text-white/80">QR listo</p>
                  <p className="text-[10px] text-white/40 mt-0.5 leading-normal font-normal">
                    Este código QR está vinculado únicamente a esta orden.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleGenerateQr(false)}
                  disabled={isProcessing}
                  className="h-7 px-2.5 text-[10px] text-white/70 hover:text-white hover:bg-white/10 border border-white/5 rounded-lg font-normal"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Actualizar
                </Button>
              </div>

              <div className="bg-white rounded-xl p-3 flex justify-center shadow-sm">
                <QRCodeSVG value={paymentRequest.qrUrl} size={160} bgColor="#ffffff" fgColor="#111111" />
              </div>

              {isStable ? (
                <div className="w-full rounded-lg border border-white/5 bg-black/40 p-2">
                  <p className="text-[9px] uppercase tracking-wider text-white/35 font-normal">Estado</p>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/80 font-normal">
                    {paymentRequest.status === 'paid' ? (
                      <>
                        <CheckCircle2 className="w-3 h-3 text-green-400" />
                        Confirmado
                      </>
                    ) : paymentRequest.status === 'expired' ? (
                      <>
                        <AlertCircle className="w-3 h-3 text-red-400" />
                        Expirado
                      </>
                    ) : (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                        Esperando pago
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid gap-2.5 grid-cols-2 w-full">
                  <div className="rounded-lg border border-white/5 bg-black/40 p-2">
                    <p className="text-[9px] uppercase tracking-wider text-white/35 font-normal">Estado</p>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/80 font-normal">
                      {paymentRequest.status === 'paid' ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-green-400" />
                          Confirmado
                        </>
                      ) : paymentRequest.status === 'expired' ? (
                        <>
                          <AlertCircle className="w-3 h-3 text-red-400" />
                          Expirado
                        </>
                      ) : (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
                          Esperando pago
                        </>
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-white/5 bg-black/40 p-2">
                    <p className="text-[9px] uppercase tracking-wider text-white/35 font-normal">Actualiza en</p>
                    <p className="mt-0.5 text-[11px] text-white/80 font-normal">
                      {secondsRemaining > 0 ? `${secondsRemaining}s` : 'Actualizando...'}
                    </p>
                  </div>
                </div>
              )}

              {/* Treasury Address Manual Copy Input */}
              <div className="pt-2 border-t border-white/5 space-y-1.5">
                <p className="text-[10px] text-white/40 leading-normal font-normal">
                  Toca para copiar la dirección de la wallet. Pégala en Phantom y envía el pago manualmente si no puedes escanear el código QR.
                </p>
                <div 
                  onClick={handleCopyAddress}
                  className="flex items-center justify-between bg-black/40 border border-white/10 rounded-lg p-2 text-xs text-white/80 select-all cursor-pointer hover:bg-white/5 transition-all"
                >
                  <span className="truncate font-mono text-[10px] mr-2">{SUBSCRIPTION_TREASURY_WALLET}</span>
                  <Copy className="w-3 h-3 text-white/45 shrink-0" />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-[#0f0f11] p-4">
              <div className="border border-dashed border-white/10 bg-[#000000]/40 rounded-xl p-5 flex flex-col items-center justify-center min-h-[170px] text-center gap-2.5">
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                    <p className="text-xs text-white/60 font-normal">Generando tu código QR de Phantom...</p>
                  </>
                ) : (
                  <>
                    <Smartphone className="w-5 h-5 text-white/30" />
                    <p className="text-xs text-white/50 max-w-[260px] leading-relaxed font-normal">
                      Completa nombre, correo y teléfono para generar el QR
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {!isBillingValid && (
            <div className="flex items-center gap-2 p-2.5 bg-white/[0.03] border border-white/10 rounded-xl">
              <AlertCircle className="w-3.5 h-3.5 text-white/50 flex-shrink-0" />
              <p className="text-[11px] font-normal text-white/70">
                Completa los datos de facturación para continuar
              </p>
            </div>
          )}
        </>
      ) : (
        <p className="text-center text-red-400 py-4">Error al cargar cotización de {config.label}</p>
      )}
    </div>
  );
}
