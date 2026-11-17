'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { doc, getDoc, setDoc, collection, query, where, getDocs, type DocumentData, type DocumentReference } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { SUBSCRIPTION_RPC_URL, SUBSCRIPTION_TREASURY_WALLET } from '@/lib/subscriptions/payment-config';

const normalizePlanId = (plan?: string | null, priceUSD?: number | null) => {
  if (!plan && priceUSD == null) return null;
  const normalized = plan ? plan.toLowerCase() : '';

  if (normalized.includes('pro')) return 'pro';
  if (normalized.includes('starter')) return 'starter';
  if (normalized.includes('enterprise')) return 'enterprise';

  if (priceUSD === 19.99) return 'starter';
  if (priceUSD === 99.99) return 'pro';

  return normalized || null;
};

const getSubscriptionSnapshot = async (userId: string, entityId: string | null) => {
  if (entityId && entityId !== 'default') {
    const entitySubRef = doc(db, `users/${userId}/entities/${entityId}/subscriptions/current`);
    const snap = await getDoc(entitySubRef);
    if (snap.exists()) return snap;
    return null;
  }
  const globalRef = doc(db, `users/${userId}/subscriptions/current`);
  const snap = await getDoc(globalRef);
  return snap.exists() ? snap : null;
};

interface SubscriptionData {
  status: 'active' | 'pending' | 'expired' | null;
  plan: string | null;
  expiresAt: string | null;
  priceUSD: number | null;
  activatedAt: string | null;
  isExpired: boolean;
  cancelAtPeriodEnd: boolean;
}

export function useSubscriptionStatus(customEntityId?: string | null): SubscriptionData & { loading: boolean } {
  const { currentUser, activeEntity } = useAuth();
  const entity = customEntityId !== undefined ? customEntityId : activeEntity;
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionData>({
    status: null,
    plan: null,
    expiresAt: null,
    priceUSD: null,
    activatedAt: null,
    isExpired: false,
    cancelAtPeriodEnd: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSubscription = async () => {
      if (!currentUser) {
        setLoading(false);
        return;
      }

      const targetEntity = entity && entity !== 'default' ? entity : null;
      const subscriptionRef = doc(
        db,
        targetEntity
          ? `users/${currentUser.uid}/entities/${targetEntity}/subscriptions/current`
          : `users/${currentUser.uid}/subscriptions/current`
      );

      try {
        // 1. Check subscription state for the specific entity
        const snapshot = await getSubscriptionSnapshot(currentUser.uid, targetEntity);
        let data = snapshot?.exists() ? (snapshot.data() as Record<string, any>) : null;
        let isExpired = false;
        let normalizedPlan: string | null = null;

        if (data) {
          const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
          isExpired = expiresAt ? expiresAt < new Date() : false;
          normalizedPlan = normalizePlanId(data.plan, data.priceUSD || null);
        }

        const isActive = data && data.status === 'active' && !isExpired;

        // 2. If NOT active, run server recovery then check payment requests on-chain
        if (!isActive) {
          try {
            await fetch('/api/subscriptions/recover', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId: currentUser.uid,
                entityId: targetEntity,
              }),
            });
            const recoveredSnap = await getDoc(subscriptionRef);
            if (recoveredSnap.exists() && recoveredSnap.data()?.status === 'active') {
              const recovered = recoveredSnap.data() as Record<string, any>;
              const expiresAt = recovered.expiresAt ? new Date(recovered.expiresAt) : null;
              const recoveredExpired = expiresAt ? expiresAt < new Date() : false;
              if (!recoveredExpired) {
                setSubscriptionData({
                  status: 'active',
                  plan: normalizePlanId(recovered.plan, recovered.priceUSD || null),
                  expiresAt: recovered.expiresAt || null,
                  priceUSD: typeof recovered.priceUSD === 'number' ? recovered.priceUSD : null,
                  activatedAt: recovered.activatedAt || null,
                  isExpired: false,
                  cancelAtPeriodEnd: !!recovered.cancelAtPeriodEnd,
                });
                setLoading(false);
                return;
              }
            }
          } catch (recoverErr) {
            console.error('Subscription recover API failed:', recoverErr);
          }

          // La recuperación de pagos pendientes la hace el servidor (/api/subscriptions/recover); el navegador no escribe suscripciones.
        }

        // 3. Fallback to reading the subscription directly if no background updates occurred
        if (isActive) {
          setSubscriptionData({
            status: data.status || null,
            plan: normalizedPlan,
            expiresAt: data.expiresAt || null,
            priceUSD: typeof data.priceUSD === 'number' ? data.priceUSD : null,
            activatedAt: data.activatedAt || null,
            isExpired,
            cancelAtPeriodEnd: !!data.cancelAtPeriodEnd,
          });
        } else {
          setSubscriptionData({
            status: null,
            plan: null,
            expiresAt: null,
            priceUSD: null,
            activatedAt: null,
            isExpired: false,
            cancelAtPeriodEnd: false,
          });
        }
      } catch (error) {
        console.error('Error checking subscription:', error);
        setSubscriptionData({
          status: null,
          plan: null,
          expiresAt: null,
          priceUSD: null,
          activatedAt: null,
          isExpired: false,
          cancelAtPeriodEnd: false,
        });
      } finally {
        setLoading(false);
      }
    };

    checkSubscription();
  }, [currentUser, entity]);

  return { ...subscriptionData, loading };
}
