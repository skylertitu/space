import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface EntitySlugRecord {
  id: string;
  name?: string;
  slug?: string;
}

const RESERVED_SLUGS = new Set([
  'nucleo',
  'login',
  'api',
  'configuracion',
  'perfil',
  'subscriptions',
  'meta-callback',
  'suite',
  'admin',
  'new',
  'create',
]);

export function slugifyEntityName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export function validateEntitySlug(slug: string): { valid: boolean; error?: string } {
  const value = slug.trim().toLowerCase();
  if (!value) return { valid: false, error: 'El usuario de ruta es obligatorio.' };
  if (value.length < 3) return { valid: false, error: 'Mínimo 3 caracteres.' };
  if (value.length > 32) return { valid: false, error: 'Máximo 32 caracteres.' };
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value)) {
    return { valid: false, error: 'Solo letras minúsculas, números y guiones.' };
  }
  if (RESERVED_SLUGS.has(value)) {
    return { valid: false, error: 'Ese nombre está reservado.' };
  }
  return { valid: true };
}

export function getEntityRouteSegment(entity: EntitySlugRecord): string {
  const slug = entity.slug?.trim().toLowerCase();
  return slug || entity.id;
}

export function resolveEntityFromSegment(
  entities: EntitySlugRecord[],
  segment: string
): EntitySlugRecord | null {
  const normalized = segment.trim();
  if (!normalized) return null;

  const realEntities = filterRealEntities(entities);
  const lower = normalized.toLowerCase();

  // URLs use slugs — match slug before doc id so ghost docs (id === slug) never win.
  const bySlug = realEntities.find((e) => e.slug?.trim().toLowerCase() === lower);
  if (bySlug) return bySlug;

  const byId = realEntities.find((e) => e.id === normalized);
  return byId || null;
}

/** Resolve segment via entity list + entity_slugs index (for tenants without slug on doc yet). */
export async function resolveEntityFromSegmentWithIndex(
  userId: string,
  entities: EntitySlugRecord[],
  segment: string
): Promise<EntitySlugRecord | null> {
  const fromList = resolveEntityFromSegment(entities, segment);
  if (fromList) return fromList;

  const normalized = segment.trim().toLowerCase();
  if (!normalized) return null;

  const slugSnap = await getDoc(doc(db, `users/${userId}/entity_slugs/${normalized}`));
  if (!slugSnap.exists()) return null;

  const entityId = slugSnap.data()?.entityId as string | undefined;
  if (!entityId) return null;

  const realEntities = filterRealEntities(entities);
  return realEntities.find((e) => e.id === entityId) || null;
}

export function buildEntityPath(routeSegment: string, suffix = ''): string {
  const base = `/home/${routeSegment}`;
  if (!suffix) return base;
  return suffix.startsWith('/') ? `${base}${suffix}` : `${base}/${suffix}`;
}

/** Duplicates created when a route slug was mistaken for a Firestore entity id. */
export function findGhostEntities(entities: EntitySlugRecord[]): EntitySlugRecord[] {
  const slugToEntityId = new Map<string, string>();
  for (const entity of entities) {
    const slug = entity.slug?.trim().toLowerCase();
    if (slug) slugToEntityId.set(slug, entity.id);
  }
  return entities.filter((entity) => {
    const realOwnerId = slugToEntityId.get(entity.id.toLowerCase());
    return realOwnerId !== undefined && realOwnerId !== entity.id;
  });
}

export function filterRealEntities<T extends EntitySlugRecord>(entities: T[]): T[] {
  const ghostIds = new Set(findGhostEntities(entities).map((e) => e.id));
  return entities.filter((e) => !ghostIds.has(e.id));
}

export async function isEntitySlugAvailable(
  userId: string,
  slug: string,
  entityId: string
): Promise<boolean> {
  const normalized = slug.trim().toLowerCase();
  const slugRef = doc(db, `users/${userId}/entity_slugs/${normalized}`);
  const snap = await getDoc(slugRef);
  if (!snap.exists()) return true;
  return snap.data()?.entityId === entityId;
}

export async function claimEntitySlug(
  userId: string,
  entityId: string,
  slug: string,
  previousSlug?: string
): Promise<void> {
  const normalized = slug.trim().toLowerCase();
  const validation = validateEntitySlug(normalized);
  if (!validation.valid) throw new Error(validation.error);

  const available = await isEntitySlugAvailable(userId, normalized, entityId);
  if (!available) throw new Error('Ese usuario de ruta ya está en uso.');

  const prev = previousSlug?.trim().toLowerCase();
  if (prev && prev !== normalized) {
    await deleteDoc(doc(db, `users/${userId}/entity_slugs/${prev}`));
  }

  await setDoc(doc(db, `users/${userId}/entity_slugs/${normalized}`), {
    entityId,
    updatedAt: new Date(),
  });
}

export async function releaseEntitySlug(userId: string, slug?: string): Promise<void> {
  const normalized = slug?.trim().toLowerCase();
  if (!normalized) return;
  await deleteDoc(doc(db, `users/${userId}/entity_slugs/${normalized}`));
}

export async function generateUniqueEntitySlug(
  userId: string,
  name: string,
  entityId: string
): Promise<string> {
  const base = slugifyEntityName(name) || 'entidad';
  let candidate = base;
  let attempt = 0;
  while (attempt < 20) {
    const validation = validateEntitySlug(candidate);
    if (validation.valid && (await isEntitySlugAvailable(userId, candidate, entityId))) {
      return candidate;
    }
    attempt += 1;
    candidate = `${base}-${attempt}`.slice(0, 32);
  }
  return `${base.slice(0, 24)}-${entityId.slice(-4)}`.slice(0, 32);
}
