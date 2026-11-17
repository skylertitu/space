/**
 * Multi-tenant route contract (molde v13+).
 *
 * - Firestore doc id → permanent tenant id; always use for DB paths.
 * - slug / routeSegment → visual URL only (/home/{slug}/...).
 * - users/{uid}/entity_slugs/{slug} → { entityId } index for resolution.
 */
export const ENTITY_ROUTE_CONTRACT_VERSION = 1;

/** Written on each real entity doc when slug mold runs. */
export const ENTITY_ROUTE_MOLD_FIELDS = {
    routeContractVersion: ENTITY_ROUTE_CONTRACT_VERSION,
} as const;

/**
 * True when this doc id equals a slug registered to a different entity
 * (phantom doc created by mistake during slug migration).
 */
export function isSlugOwnedByOtherEntity(
    entityId: string,
    slugIndexOwnerId: string | null | undefined
): boolean {
    if (!slugIndexOwnerId) return false;
    return slugIndexOwnerId !== entityId;
}
