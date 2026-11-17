'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useEntityRoute } from '@/hooks/useEntityRoute';

/** Entity doc id (Firestore). Never use the URL slug segment for DB paths. */
export function useAutomationEntity() {
  const { currentUser, loading: authLoading } = useAuth();
  const { firestoreId, routeSegment, tenantPath, isResolved } = useEntityRoute();

  const isReady = !authLoading && !!currentUser && isResolved;

  return {
    currentUser,
    entityId: firestoreId,
    routeSegment,
    tenantPath,
    authLoading,
    isReady,
  };
}
