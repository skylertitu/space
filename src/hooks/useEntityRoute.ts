'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useEntityRouteContext } from '@/contexts/EntityRouteContext';
import { buildEntityPath } from '@/lib/entitySlug';

/**
 * Resolved entity context for multi-tenant routes.
 * - firestoreId / entityId → Firestore paths (doc id, e.g. bs_h1zzpfn)
 * - routeSegment → URL segment only (e.g. udreamms)
 */
export function useEntityRoute() {
  const routeCtx = useEntityRouteContext();
  const { activeEntity, activeEntityRoute, currentUser } = useAuth();

  const firestoreId = routeCtx?.firestoreId || activeEntity || '';
  const routeSegment = routeCtx?.routeSegment || activeEntityRoute || activeEntity || '';
  const entityName = routeCtx?.entityName;

  const tenantPath =
    currentUser?.uid && firestoreId
      ? `users/${currentUser.uid}/entities/${firestoreId}`
      : '';

  return {
    /** Firestore document id — use for all DB reads/writes. */
    entityId: firestoreId,
    firestoreId,
    /** URL slug segment — use for links and navigation only. */
    routeSegment,
    /** Display name from entity document. */
    entityName,
    /** Entity type (e.g. 'empresa', 'persona', 'creador'). */
    entityType: routeCtx?.entityType || '',
    /** Whether the current entity environment is an enterprise/business profile. */
    isEnterprise: routeCtx?.entityType === 'empresa' || (Boolean(routeCtx?.entityType) && routeCtx?.entityType !== 'persona'),
    isResolved: Boolean(firestoreId),
    tenantPath,
    entityPath: (suffix = '') => buildEntityPath(routeSegment, suffix),
  };
}
