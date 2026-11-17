'use client';

import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, SystemProgram, PublicKey } from '@solana/web3.js';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Clock, AlertCircle } from 'lucide-react';
import { usePriceFromJupiter } from '@/hooks/usePriceFromJupiter';
import { BillingData } from '../BillingForm';

interface SolPaymentProps {
  plan: string;
  priceUSD: number;
  isProcessing: boolean;
  setIsProcessing: (value: boolean) => void;
  onSuccess: () => void;
  userId: string;
  entityId: string;
  billingData: BillingData | null;
  isBillingValid: boolean;
}

export default function SolPayment({
  plan,
  priceUSD,
  isProcessing,
  setIsProcessing,
  onSuccess,
  userId,
  entityId,
  billingData,
  isBillingValid,
}: SolPaymentProps) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { currentUser } = useAuth();
  const treasuryWallet = process.env.NEXT_PUBLIC_TREASURY_WALLET;

  // Wrapped SOL on Solana Mainnet
  const SOL_ADDRESS = 'So11111111111111111111111111111111111111112';

  const { prices, loading: loadingPrice, secondsRemaining } = usePriceFromJupiter([SOL_ADDRESS], 30000);
  const solPrice = prices[SOL_ADDRESS];
  const solAmount = solPrice ? priceUSD / solPrice : null;

  const handlePayment = async () => {
    if (!publicKey) {
      toast.error('Por favor conecta tu Phantom wallet');
      return;
    }

    if (!currentUser) {
      toast.error('Error de sesión. Reconecta tu cuenta.');
      return;
    }

    if (!treasuryWallet) {
      toast.error('Configuración incompleta del servidor');
      return;
    }

    if (!solAmount) {
      toast.error('No se pudo calcular el monto en SOL');
      return;
    }

    setIsProcessing(true);
    try {
      const treasuryPublicKey = new PublicKey(treasuryWallet);
      const lamports = Math.floor(solAmount * 1_000_000_000);

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: treasuryPublicKey,
          lamports,
        })
      );

      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      const signature = await sendTransaction(transaction, connection);
      toast.info('Transacción enviada a Solana. Esperando confirmación...');

      await connection.confirmTransaction(signature, 'confirmed');

      const response = await fetch('/api/subscriptions/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature,
          plan,
          paymentMethod: 'sol',
          userId,
          entityId,
          planPrice: priceUSD,
          billingData,
        }),
      });

      if (!response.ok) {
        throw new Error('Error verificando transacción');
      }

      toast.success('¡Suscripción activada exitosamente!');
      onSuccess();
    } catch (error: any) {
      console.error('Payment error:', error);
      toast.error(`Error: ${error?.message || 'Pago fallido'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      {loadingPrice ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500 mr-2" />
          <span className="text-sm text-white/60">Fetching SOL price...</span>
        </div>
      ) : solAmount && solPrice ? (
        <>
          <div className="bg-blue-600/10 border border-blue-600/20 rounded-lg p-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" />
            <p className="text-xs text-blue-300">
              Price guaranteed for {secondsRemaining}s
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-white/60">Amount in USD</span>
              <span className="text-lg font-medium text-white">${priceUSD.toFixed(2)}</span>
            </div>
            <div className="h-px bg-white/10" />
            <div className="flex justify-between items-center">
              <span className="text-white/60">SOL Price</span>
              <span className="text-sm text-white">${solPrice.toFixed(2)}</span>
            </div>
            <div className="h-px bg-white/10" />
            <div className="flex justify-between items-center">
              <span className="text-white/60 font-medium">You will pay</span>
              <span className="text-2xl font-light text-white">
                {solAmount.toFixed(4)} SOL
              </span>
            </div>
          </div>

          <Button
            onClick={handlePayment}
            disabled={isProcessing || !publicKey || !isBillingValid}
            className="w-full h-12 rounded-full bg-white text-black hover:bg-white/90 disabled:opacity-50 text-base font-semibold"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Procesando...
              </>
            ) : (
              'Pay with SOL'
            )}
          </Button>

          {!isBillingValid && (
            <div className="flex items-center gap-2 p-3 bg-yellow-600/10 border border-yellow-600/30 rounded-lg">
              <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
              <p className="text-xs text-yellow-300">Complete billing details to continue</p>
            </div>
          )}

          {!publicKey && isBillingValid && (
            <p className="text-xs text-yellow-400/70 text-center">
              Connect your Phantom wallet to continue
            </p>
          )}
        </>
      ) : (
        <p className="text-center text-red-400 py-4">Error loading SOL price</p>
      )}
    </div>
  );
}
