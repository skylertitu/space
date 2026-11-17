export type UniqueIntegrationField = 'botToken' | 'twitterHandle' | 'pageId' | 'instagramId';

/** Pregunta al servidor si el identificador ya pertenece a otro tenant (ver api/integrations/check-unique). */
export async function isIntegrationTakenByAnotherTenant(
    field: UniqueIntegrationField,
    value: string,
    userId: string,
    entityId: string
): Promise<boolean> {
    const res = await fetch('/api/integrations/check-unique', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, entityId, field, value }),
    });
    if (!res.ok) throw new Error('No se pudo verificar la integración.');
    const data = await res.json();
    return Boolean(data.usedByAnotherTenant);
}
