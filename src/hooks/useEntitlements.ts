'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { NO_ENTITLEMENTS, type Entitlements } from '@/lib/subscriptions/plans';

export type EntitlementsState = Entitlements & { enforced: boolean };

const CACHE_MS = 30_000;
const cache = new Map<string, { at: number; value: EntitlementsState }>();

/**
 * Permisos de la entidad según el servidor (plan real). La interfaz solo los refleja:
 * el bloqueo de verdad ocurre en las rutas API (SUBSCRIPTION_ENFORCEMENT) y en las reglas de Firestore.
 */
export function useEntitlements(entityId: string | null | undefined) {
    const { currentUser } = useAuth();
    const [state, setState] = useState<EntitlementsState | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(
        async (force = false) => {
            if (!currentUser || !entityId) return;
            if (currentUser.uid.startsWith('demo') || entityId === 'mensajeria') {
                setState({
                    active: true,
                    plan: 'enterprise',
                    suites: ['board', 'ceo', 'coo', 'cfo', 'cto', 'cmo', 'chro', 'cso', 'cdo', 'ciso', 'cpo', 'clo'],
                    orgChart: true,
                    free: true,
                    expiresAt: null,
                    enforced: false,
                });
                setLoading(false);
                return;
            }
            const key = `${currentUser.uid}/${entityId}`;
            const hit = cache.get(key);
            if (!force && hit && Date.now() - hit.at < CACHE_MS) {
                setState(hit.value);
                setLoading(false);
                return;
            }
            try {
                const res = await fetch(`/api/subscriptions/entitlements?userId=${encodeURIComponent(currentUser.uid)}&entityId=${encodeURIComponent(entityId)}`);
                if (!res.ok) throw new Error(String(res.status));
                const value = (await res.json()) as EntitlementsState;
                cache.set(key, { at: Date.now(), value });
                setState(value);
            } catch {
                // Si el servidor no responde no se bloquea a nadie: la protección real está en el servidor.
                setState({ ...NO_ENTITLEMENTS, enforced: false });
            } finally {
                setLoading(false);
            }
        },
        [currentUser, entityId]
    );

    useEffect(() => {
        void load();
    }, [load]);

    return { entitlements: state, loading, refresh: () => load(true) };
}
