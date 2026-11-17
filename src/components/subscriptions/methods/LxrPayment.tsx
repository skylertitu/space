'use client';

import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Transaction, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferCheckedInstruction } from '@solana/spl-token';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Zap, Clock, AlertCircle } from 'lucide-react';
import { usePriceFromJupiter } from '@/hooks/usePriceFromJupiter';
import { BillingData } from '../BillingForm';

interface LxrPaymentProps {
  plan: string;
  priceUSD: number;
  discount: string;
  isProcessing: boolean;
  setIsProcessing: (value: boolean) => void;
  onSuccess: () => void;
  userId: string;
  entityId: string;
  billingData: BillingData | null;
  isBillingValid: boolean;
}

// LXR Token on Solana Mainnet
const LXR_MINT = '7Qm6qUCXGZfGBYYFzq2kTbwTDah5r3d9DcPJHRT8Wdth';
const LXR_DECIMALS = 6;

export default function LxrPayment({
  plan,
  priceUSD,
  discount,
  isProcessing,
  setIsProcessing,
  onSuccess,
  userId,
  entityId,
  billingData,
  isBillingValid,
}: LxrPaymentProps) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { currentUser } = useAuth();

  const treasuryWallet = process.env.NEXT_PUBLIC_TREASURY_WALLET;

  const { prices, loading: loadingPrice, secondsRemaining } = usePriceFromJupiter([LXR_MINT], 30000);
  // Fallback to 1.0 USD per LXR if Jupiter doesn't index this custom token
  const lxrPrice = prices[LXR_MINT] || 1.0;
  const lxrAmount = lxrPrice ? priceUSD / lxrPrice : null;

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

    if (!lxrAmount) {
      toast.error('No se pudo calcular el monto en LXR');
      return;
    }

    setIsProcessing(true);
    try {
      const lxrMint = new PublicKey(LXR_MINT);
      const treasuryPublicKey = new PublicKey(treasuryWallet);

      const userATA = await getAssociatedTokenAddress(lxrMint, publicKey);
      const treasuryATA = await getAssociatedTokenAddress(lxrMint, treasuryPublicKey);

      const transferAmount = BigInt(Math.floor(lxrAmount * (10 ** LXR_DECIMALS)));

      const transaction = new Transaction().add(
        createTransferCheckedInstruction(
          userATA,
          lxrMint,
          treasuryATA,
          publicKey,
          transferAmount,
          LXR_DECIMALS
        )
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
          paymentMethod: 'lxr',
          userId,
          entityId,
          planPrice: priceUSD,
          billingData,
        }),
      });

      if (!response.ok) {
        throw new Error('Error verificando transacción');
      }

      toast.success('¡Suscripción activada exitosamente con LXR!');
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
      <div className="bg-green-600/10 border border-green-600/30 rounded-lg p-3 flex items-center gap-2">
        <Zap className="w-4 h-4 text-green-400" />
        <p className="text-sm text-green-300">
          💎 Save {discount}% using LXR!
        </p>
      </div>

      {loadingPrice ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500 mr-2" />
          <span className="text-sm text-white/60">Fetching LXR price...</span>
        </div>
      ) : lxrAmount && lxrPrice ? (
        <>
          <div className="bg-blue-600/10 border border-blue-600/20 rounded-lg p-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" />
            <p className="text-xs text-blue-300">
              Price guaranteed for {secondsRemaining}s
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-white/60">Discounted Amount</span>
              <span className="text-lg font-medium text-green-400">${priceUSD.toFixed(2)}</span>
            </div>
            <div className="h-px bg-white/10" />
            <div className="flex justify-between items-center">
              <span className="text-white/60">LXR Price</span>
              <span className="text-sm text-white">${lxrPrice.toFixed(6)}</span>
            </div>
            <div className="h-px bg-white/10" />
            <div className="flex justify-between items-center">
              <span className="text-white/60 font-medium">You will pay</span>
              <span className="text-2xl font-light text-white">
                {lxrAmount.toFixed(0)} LXR
              </span>
            </div>
          </div>

          <Button
            onClick={handlePayment}
            disabled={isProcessing || !publicKey || !isBillingValid}
            className="w-full h-12 rounded-full bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 text-base font-semibold"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Procesando...
              </>
            ) : (
              'Pay with LXR'
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

          <p className="text-xs text-white/40 text-center">
            Note: You must have LXR in your Phantom wallet
          </p>
        </>
      ) : (
        <p className="text-center text-red-400 py-4">Error loading LXR price</p>
      )}
    </div>
  );
}
