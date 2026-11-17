import { MANUAL_INBOX_SLUG } from './manualKanbanColumns';
import type { ManualPlacement } from './manualKanban';

type KanbanGroupLite = {
    name?: string;
    botNodeDetails?: { prompt?: string; title?: string };
};

/** Señales por etapa — de más avanzada a más temprana. */
const COLUMN_SIGNALS: { slug: string; patterns: RegExp[] }[] = [
    {
        slug: 'cita_seguimiento',
        patterns: [
            /pudiste conectarte/i,
            /reagendar/i,
            /evaluaci[oó]n con nuestro equipo/i,
            /ten[ií]as agendada/i,
            /no vi el enlace/i,
            /no pude conectarme/i,
        ],
    },
    {
        slug: 'elige_libro_digital',
        patterns: [
            /libro digital/i,
            /escr[ií]benos ['"]?libro/i,
            /\bds-160\b/i,
            /\bsevis\b/i,
            /40 p[aá]ginas/i,
        ],
    },
    {
        slug: 'no_responde_bank_statement',
        patterns: [
            /bank statement/i,
            /usd\s*5[,.]?000/i,
            /\$5[,.]?000/i,
            /respaldo econ[oó]mico/i,
            /patrocinador/i,
            /demostrar aproximadamente/i,
        ],
    },
    {
        slug: 'no_responde_estado_usa',
        patterns: [
            /estado de estados unidos/i,
            /a qu[eé] estado/i,
            /venir a estudiar/i,
            /mejor opci[oó]n de estudios/i,
        ],
    },
    {
        slug: 'no_responde_estoy_de_acuerdo',
        patterns: [
            /estoy de acuerdo/i,
            /3 preguntas r[aá]pidas/i,
            /requisitos del programa/i,
            /visa de estudiante/i,
            /te parece si continuamos/i,
        ],
    },
    {
        slug: 'no_responde_emilia',
        patterns: [
            /emilia/i,
            /sigues interesado/i,
            /ya no estoy interesado/i,
            /informaci[oó]n para estudiar en estados unidos/i,
            /no alcanzamos a terminar/i,
            /24 horas despu[eé]s/i,
            /48 horas despu[eé]s/i,
        ],
    },
];

function cardTimestamp(card: Record<string, any>): number {
    const raw = card.updatedAt ?? card.createdAt;
    if (!raw) return 0;
    if (typeof raw === 'number') return raw;
    if (typeof raw.toMillis === 'function') return raw.toMillis();
    if (typeof raw.seconds === 'number') return raw.seconds * 1000;
    const parsed = Date.parse(String(raw));
    return Number.isNaN(parsed) ? 0 : parsed;
}

function collectCardText(card: Record<string, any>, group?: KanbanGroupLite): string {
    const chunks: string[] = [];

    if (group?.name) chunks.push(group.name);
    if (group?.botNodeDetails?.title) chunks.push(group.botNodeDetails.title);
    if (group?.botNodeDetails?.prompt) chunks.push(group.botNodeDetails.prompt);
    if (card.lastMessage) chunks.push(String(card.lastMessage));
    if (card.contactName) chunks.push(String(card.contactName));

    const messages = Array.isArray(card.messages) ? card.messages : [];
    messages.slice(-5).forEach((msg: any) => {
        if (msg?.text) chunks.push(String(msg.text));
    });

    return chunks.join('\n').toLowerCase();
}

/** Sugiere columna manual según contexto del lead (sin pisar placements guardados). */
export function inferManualColumnSlug(
    card: Record<string, any>,
    group?: KanbanGroupLite
): string {
    const haystack = collectCardText(card, group);
    if (!haystack.trim()) return MANUAL_INBOX_SLUG;

    for (const { slug, patterns } of COLUMN_SIGNALS) {
        if (patterns.some((re) => re.test(haystack))) return slug;
    }

    return MANUAL_INBOX_SLUG;
}

export function resolveManualColumnForCard(
    cardId: string,
    card: Record<string, any>,
    placements: Record<string, ManualPlacement>,
    group?: KanbanGroupLite
): string {
    const placement = placements[cardId];
    if (placement?.columnSlug) return placement.columnSlug;
    return inferManualColumnSlug(card, group);
}

export function sortManualColumnCards(
    cards: Record<string, any>[],
    placements: Record<string, ManualPlacement>
): Record<string, any>[] {
    return [...cards].sort((a, b) => {
        const orderA = placements[a.id]?.order;
        const orderB = placements[b.id]?.order;

        if (orderA != null && orderB != null && orderA !== orderB) {
            return orderA - orderB;
        }
        if (orderA != null && orderB == null) return -1;
        if (orderA == null && orderB != null) return 1;

        const timeDiff = cardTimestamp(b) - cardTimestamp(a);
        if (timeDiff !== 0) return timeDiff;

        const nameA = (a.contactName || '').toLowerCase();
        const nameB = (b.contactName || '').toLowerCase();
        return nameA.localeCompare(nameB, 'es');
    });
}

export function computeManualCardOrder(
    cardsInColumn: Record<string, any>[],
    activeId: string,
    overId: string,
    placements: Record<string, ManualPlacement>
): Record<string, number> {
    const sorted = sortManualColumnCards(cardsInColumn, placements);
    const oldIndex = sorted.findIndex((c) => c.id === activeId);
    const newIndex = sorted.findIndex((c) => c.id === overId);
    if (oldIndex < 0 || newIndex < 0) return {};

    const reordered = [...sorted];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    const orders: Record<string, number> = {};
    reordered.forEach((card, index) => {
        orders[card.id] = (index + 1) * 1000;
    });
    return orders;
}
