/** Timestamp helper for sorting cards by arrival (createdAt, then updatedAt). */
export function getCardArrivalTime(card: Record<string, any> | null | undefined): number {
    if (!card) return 0;

    const ts = card.createdAt || card.updatedAt;
    if (!ts) return 0;
    if (typeof ts.toDate === 'function') return ts.toDate().getTime();
    if (ts.seconds) return ts.seconds * 1000;
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === 'number') return ts;
    return 0;
}

/** Newest arrivals first. */
export function sortCardsByArrival<T extends Record<string, any>>(cards: T[]): T[] {
    return [...cards].sort((a, b) => getCardArrivalTime(b) - getCardArrivalTime(a));
}
