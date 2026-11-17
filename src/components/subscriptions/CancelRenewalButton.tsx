'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

const CONFIRM_WORD = 'CANCELAR';

interface CancelRenewalButtonProps {
  userId: string;
  entityId?: string | null;
  expiresAt?: string | null;
  onSuccess?: () => void;
  className?: string;
}

export default function CancelRenewalButton({
  userId,
  entityId,
  expiresAt,
  onSuccess,
  className,
}: CancelRenewalButtonProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [ackNoRefund, setAckNoRefund] = useState(false);
  const [ackLoseRenewal, setAckLoseRenewal] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  const expiresLabel = expiresAt
    ? new Date(expiresAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'la fecha de vencimiento';

  const reset = () => {
    setStep(1);
    setAckNoRefund(false);
    setAckLoseRenewal(false);
    setConfirmText('');
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const runCancel = async () => {
    setIsCancelling(true);
    try {
      const response = await fetch('/api/subscriptions/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, entityId: entityId || undefined }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'No se pudo cancelar');
      }
      toast.success('Renovación cancelada.');
      setOpen(false);
      reset();
      onSuccess?.();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Error al cancelar');
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className={
          className ||
          'border-red-500/30 text-red-300 hover:bg-red-500/10 hover:text-red-200 rounded-full text-xs font-semibold uppercase tracking-wider'
        }
      >
        Cancelar renovación
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="bg-[#14161a] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              {step === 1 && '¿Cancelar renovación?'}
              {step === 2 && 'Confirma que entiendes'}
              {step === 3 && 'Confirmación final'}
            </DialogTitle>
            <DialogDescription className="text-white/50 text-sm">
              {step === 1 &&
                `Mantienes acceso hasta ${expiresLabel}. No hay reembolso en pagos Solana.`}
              {step === 2 && 'Marca las dos casillas para continuar.'}
              {step === 3 && `Escribe ${CONFIRM_WORD} para confirmar.`}
            </DialogDescription>
          </DialogHeader>

          {step === 1 && (
            <ul className="text-xs text-white/60 space-y-2 list-disc pl-4">
              <li>No se devuelve el dinero ya pagado.</li>
              <li>No habrá renovación automática al vencer.</li>
              <li>Puedes volver a pagar un plan cuando quieras.</li>
            </ul>
          )}

          {step === 2 && (
            <div className="space-y-3 text-sm">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ackNoRefund}
                  onChange={(e) => setAckNoRefund(e.target.checked)}
                  className="mt-1"
                />
                <span className="text-white/70">Entiendo que no hay reembolso.</span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ackLoseRenewal}
                  onChange={(e) => setAckLoseRenewal(e.target.checked)}
                  className="mt-1"
                />
                <span className="text-white/70">
                  Entiendo que la suscripción no se renovará sola.
                </span>
              </label>
            </div>
          )}

          {step === 3 && (
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
              placeholder={CONFIRM_WORD}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-red-500/40"
              autoComplete="off"
            />
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              className="text-white/50 hover:text-white"
            >
              Salir
            </Button>
            {step < 3 ? (
              <Button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                disabled={step === 2 && (!ackNoRefund || !ackLoseRenewal)}
                className="bg-white/10 hover:bg-white/15 text-white"
              >
                Continuar
              </Button>
            ) : (
              <Button
                type="button"
                disabled={confirmText !== CONFIRM_WORD || isCancelling}
                onClick={runCancel}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {isCancelling ? 'Procesando...' : 'Confirmar cancelación'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
