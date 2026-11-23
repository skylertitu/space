'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { collection, onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import {
  EntityRouteProvider,
  type EntityRouteContextValue,
} from '@/contexts/EntityRouteContext';
import { db } from '@/lib/firebase';
import {
  getEntityRouteSegment,
  resolveEntityFromSegmentWithIndex,
  type EntitySlugRecord,
} from '@/lib/entitySlug';

interface EntityRouteResolverProps {
  segment: string;
  children: React.ReactNode;
}

export function EntityRouteResolver({ segment, children }: EntityRouteResolverProps) {
  const { currentUser, loading, setActiveEntity } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const [ready, setReady] = useState(false);
  const [routeContext, setRouteContext] = useState<EntityRouteContextValue | null>(null);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    setReady(false);
    setRouteContext(null);
  }, [segment]);

  useEffect(() => {
    if (loading) return;
    if (!currentUser) {
      router.replace('/login');
      return;
    }
    if (!segment) {
      router.replace('/home');
      return;
    }

    // Modo Inmediato / Personal / Demo: Desconectar de la base de datos externa y resolver inmediatamente
    if (segment === 'personal' || segment === 'life' || segment === 'mensajeria' || currentUser?.uid.startsWith('demo')) {
      let entName = segment === 'personal' || segment === 'life' ? 'Personal' : 'Plataforma de Mensajería Automática';
      let entType = segment === 'personal' || segment === 'life' ? 'persona' : 'empresa';
      let entId = segment;
      try {
        const stored = localStorage.getItem('elizmey_demo_entities');
        if (stored) {
          const parsed = JSON.parse(stored);
          const found = parsed.find((e: any) => e.slug === segment || e.id === segment);
          if (found) {
            entName = found.name || entName;
            entType = found.type || entType;
            entId = found.id || entId;
          }
        }
      } catch {}
      const contextValue: EntityRouteContextValue = {
        firestoreId: entId,
        routeSegment: segment,
        entityName: entName,
        entityType: entType,
      };
      setActiveEntity(entId, segment);
      setRouteContext(contextValue);
      setReady(true);
      return;
    }

    let cancelled = false;

    // Timeout de seguridad: si Firestore no responde en 1.5s, resolver con fallback para no congelar la navegación
    const safetyTimer = setTimeout(() => {
      if (cancelled) return;
      console.warn('[EntityRouteResolver] Firestore snapshot timeout, using fallback.');
      let entName = segment === 'personal' || segment === 'life' ? 'Personal' : segment;
      let entType = segment === 'personal' || segment === 'life' ? 'persona' : 'empresa';
      let entId = segment;
      try {
        const stored = localStorage.getItem('elizmey_demo_entities');
        if (stored) {
          const parsed = JSON.parse(stored);
          const found = parsed.find((e: any) => e.slug === segment || e.id === segment);
          if (found) {
            entName = found.name || entName;
            entType = found.type || entType;
            entId = found.id || entId;
          }
        }
      } catch {}
      const contextValue: EntityRouteContextValue = {
        firestoreId: entId,
        routeSegment: segment,
        entityName: entName,
        entityType: entType,
      };
      setActiveEntity(entId, segment);
      setRouteContext(contextValue);
      setReady(true);
    }, 1500);

    const unsub = onSnapshot(
      collection(db, `users/${currentUser.uid}/entities`),
      (snapshot) => {
        if (cancelled) return;
        clearTimeout(safetyTimer);

        const entities: EntitySlugRecord[] = snapshot.docs.map((d) => ({
          id: d.id,
          name: d.data().name,
          slug: d.data().slug,
        }));

        void (async () => {
          const resolved = await resolveEntityFromSegmentWithIndex(
            currentUser.uid,
            entities,
            segment
          );

          if (cancelled) return;

          if (!resolved) {
            router.replace('/home');
            return;
          }

          const docData = snapshot.docs.find((d) => d.id === resolved.id)?.data();
          const entityType = docData?.type || (resolved as any).type;

          const routeSegment = getEntityRouteSegment(resolved);
          const contextValue: EntityRouteContextValue = {
            firestoreId: resolved.id,
            routeSegment,
            entityName: resolved.name,
            entityType,
          };

          setActiveEntity(resolved.id, routeSegment);
          setRouteContext(contextValue);

          const currentPath = pathnameRef.current;
          if (segment !== routeSegment && (currentPath?.startsWith(`/home/${segment}`))) {
            const prefix = `/home/${segment}`;
            const rest = currentPath.slice(prefix.length);
            router.replace(`/home/${routeSegment}${rest}`);
            return;
          }

          // Verify if this entity has an active subscription (Personal is free and exempt)
          const isPersonal = docData?.type === 'persona';

          if (!isPersonal) {
            // El plan lo decide el servidor (/api/subscriptions/entitlements). Mientras SUBSCRIPTION_ENFORCEMENT
            // no esté en 'enforce' se respeta el desbloqueo heredado del navegador para no dejar fuera a nadie.
            let allowed = false;
            try {
              const res = await fetch(
                `/api/subscriptions/entitlements?userId=${encodeURIComponent(currentUser.uid)}&entityId=${encodeURIComponent(resolved.id)}`
              );
              if (!res.ok) throw new Error(String(res.status));
              const ent = await res.json();
              // Sin desbloqueo local: el navegador ya no puede "abrirse" una entidad. Solo 'log' (emergencia) no bloquea.
              allowed = !!ent.active || !ent.enforced;
            } catch (subErr) {
              console.error('[EntityRouteResolver] Error checking subscription:', subErr);
              allowed = true; // fallo de red: no se bloquea en el navegador; el servidor sigue protegiendo sus rutas
            }
            // La órbita de la entidad (/home/<entidad>) se muestra con todas las suites con candado; el resto exige plan.
            const isEntityHome = currentPath === `/home/${routeSegment}` || currentPath === `/home/${segment}`;
            if (!allowed && !isEntityHome) {
              const targetRedirect = currentPath || `/home/${routeSegment}`;
              router.replace(`/subscriptions?entityId=${resolved.id}&redirect=${encodeURIComponent(targetRedirect)}`);
              return;
            }
          }

          setReady(true);
        })();
      },
      (error) => {
        clearTimeout(safetyTimer);
        console.warn('[EntityRouteResolver] Firestore permission error, applying local fallback:', error);
        let entName = segment;
        let entType = 'empresa';
        let entId = segment;
        try {
          const stored = localStorage.getItem('elizmey_demo_entities');
          if (stored) {
            const parsed = JSON.parse(stored);
            const found = parsed.find((e: any) => e.slug === segment || e.id === segment);
            if (found) {
              entName = found.name || entName;
              entType = found.type || entType;
              entId = found.id || entId;
            }
          }
        } catch {}
        const contextValue: EntityRouteContextValue = {
          firestoreId: entId,
          routeSegment: segment,
          entityName: entName,
          entityType: entType,
        };
        setActiveEntity(entId, segment);
        setRouteContext(contextValue);
        setReady(true);
      }
    );

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
      unsub();
    };
  }, [currentUser, loading, segment, router, setActiveEntity]);

  if (!ready || !routeContext) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-white/40 text-sm tracking-widest uppercase">
        Cargando entidad...
      </div>
    );
  }

  return (
    <EntityRouteProvider value={routeContext}>
      {children}
    </EntityRouteProvider>
  );
}
