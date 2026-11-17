'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface SubscriptionGuardProps {
  children: React.ReactNode;
}

export default function SubscriptionGuard({ children }: SubscriptionGuardProps) {
  const router = useRouter();
  const { status, isExpired, loading } = useSubscriptionStatus();

  useEffect(() => {
    if (!loading) {
      const hasBypass = typeof window !== 'undefined' && (
        localStorage.getItem('elizmey_bypass') === 'elizmey2025' ||
        localStorage.getItem('roosevelt_bypass') === 'roosevelt2025'
      );
      if (hasBypass) return;

      // If no active subscription, redirect to subscriptions page
      if (status !== 'active' || isExpired) {
        if (isExpired) {
          toast.error('Tu suscripción ha expirado. Por favor, renuela.');
        } else {
          toast.info('Por favor, adquiere una suscripción para acceder.');
        }
        router.push('/subscriptions');
      }
    }
  }, [status, isExpired, loading, router]);

  const hasBypass = typeof window !== 'undefined' && (
    localStorage.getItem('elizmey_bypass') === 'elizmey2025' ||
    localStorage.getItem('roosevelt_bypass') === 'roosevelt2025'
  );

  if (loading && !hasBypass) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
        <p className="ml-4 tracking-wider text-sm font-medium">Verificando suscripción...</p>
      </div>
    );
  }

  // If subscription is active and not expired, or bypass code is active, render children
  if ((status === 'active' && !isExpired) || hasBypass) {
    return <>{children}</>;
  }

  // Otherwise, show nothing (redirect should handle it)
  return null;
}
