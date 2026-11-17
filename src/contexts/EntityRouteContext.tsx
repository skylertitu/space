'use client';

import { createContext, useContext } from 'react';

export interface EntityRouteContextValue {
  /** Firestore document id (e.g. bs_h1zzpfn). */
  firestoreId: string;
  /** URL slug segment (e.g. udreamms). */
  routeSegment: string;
  /** Display name from the entity document. */
  entityName?: string;
  /** Type of entity ('empresa' | 'persona' | 'creador'). */
  entityType?: string;
}

const EntityRouteContext = createContext<EntityRouteContextValue | null>(null);

export function useEntityRouteContext(): EntityRouteContextValue | null {
  return useContext(EntityRouteContext);
}

export const EntityRouteProvider = EntityRouteContext.Provider;
