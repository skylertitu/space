import type { CustomBoardFilters } from './customKanbanBoards';
import { getCardArrivalTime } from '@/lib/omnichannel/cardSort';
import { resolveCardChannel } from '@/lib/omnichannel/resolveCardChannel';

const PHONE_COUNTRY_PREFIXES: { prefix: string; code: string; label: string }[] = [
    { prefix: '52', code: 'MX', label: 'México' },
    { prefix: '1', code: 'US', label: 'EE.UU.' },
    { prefix: '57', code: 'CO', label: 'Colombia' },
    { prefix: '51', code: 'PE', label: 'Perú' },
    { prefix: '54', code: 'AR', label: 'Argentina' },
    { prefix: '56', code: 'CL', label: 'Chile' },
    { prefix: '58', code: 'VE', label: 'Venezuela' },
    { prefix: '593', code: 'EC', label: 'Ecuador' },
    { prefix: '502', code: 'GT', label: 'Guatemala' },
    { prefix: '503', code: 'SV', label: 'El Salvador' },
    { prefix: '504', code: 'HN', label: 'Honduras' },
    { prefix: '505', code: 'NI', label: 'Nicaragua' },
    { prefix: '506', code: 'CR', label: 'Costa Rica' },
    { prefix: '507', code: 'PA', label: 'Panamá' },
    { prefix: '34', code: 'ES', label: 'España' },
    { prefix: '55', code: 'BR', label: 'Brasil' },
];

export function inferCardCountry(card: Record<string, any>): string | null {
    const explicit = card.country || card.countryIso || card.pais || card.metadata?.country;
    if (explicit && String(explicit).trim()) {
        const s = String(explicit).trim().toUpperCase();
        if (s.length === 2) return s;
        const match = PHONE_COUNTRY_PREFIXES.find((p) => p.label.toLowerCase() === String(explicit).toLowerCase());
        if (match) return match.code;
    }

    const phone = String(card.contactNumberClean || card.contactNumber || '').replace(/\D/g, '');
    if (!phone) return null;

    const sorted = [...PHONE_COUNTRY_PREFIXES].sort((a, b) => b.prefix.length - a.prefix.length);
    for (const entry of sorted) {
        if (phone.startsWith(entry.prefix)) return entry.code;
    }
    return null;
}

export function getCountryLabel(code: string): string {
    return PHONE_COUNTRY_PREFIXES.find((p) => p.code === code)?.label || code;
}

export function collectFilterOptions(cards: Record<string, any>[]) {
    const countries = new Set<string>();
    const channels = new Set<string>();

    cards.forEach((card) => {
        const country = inferCardCountry(card);
        if (country) countries.add(country);
        channels.add(resolveCardChannel(card));
    });

    return {
        countries: Array.from(countries).sort(),
        channels: Array.from(channels).sort(),
    };
}

function startOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function endOfDay(d: Date): Date {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}

function getCardTime(card: Record<string, any>): number {
    const raw = card.updatedAt ?? card.createdAt;
    if (!raw) return getCardArrivalTime(card);
    if (typeof raw.toDate === 'function') return raw.toDate().getTime();
    if (raw.seconds) return raw.seconds * 1000;
    if (raw instanceof Date) return raw.getTime();
    if (typeof raw === 'number') return raw;
    return getCardArrivalTime(card);
}

export function getDateRangeBounds(filters: CustomBoardFilters): { from: number; to: number } | null {
    const now = new Date();

    switch (filters.dateRange) {
        case 'today':
            return { from: startOfDay(now).getTime(), to: endOfDay(now).getTime() };
        case 'yesterday': {
            const y = new Date(now);
            y.setDate(y.getDate() - 1);
            return { from: startOfDay(y).getTime(), to: endOfDay(y).getTime() };
        }
        case 'week': {
            const w = new Date(now);
            w.setDate(w.getDate() - 7);
            return { from: startOfDay(w).getTime(), to: endOfDay(now).getTime() };
        }
        case 'month': {
            const m = new Date(now);
            m.setDate(m.getDate() - 30);
            return { from: startOfDay(m).getTime(), to: endOfDay(now).getTime() };
        }
        case 'custom': {
            if (!filters.customDateFrom && !filters.customDateTo) return null;
            const from = filters.customDateFrom
                ? startOfDay(new Date(filters.customDateFrom)).getTime()
                : 0;
            const to = filters.customDateTo
                ? endOfDay(new Date(filters.customDateTo)).getTime()
                : endOfDay(now).getTime();
            return { from, to };
        }
        default:
            return null;
    }
}

export function cardMatchesFilters(card: Record<string, any>, filters: CustomBoardFilters): boolean {
    const bounds = getDateRangeBounds(filters);
    if (bounds) {
        const t = getCardTime(card);
        if (t < bounds.from || t > bounds.to) return false;
    }

    if (filters.hourFrom != null || filters.hourTo != null) {
        const t = getCardTime(card);
        const hour = new Date(t).getHours();
        const from = filters.hourFrom ?? 0;
        const to = filters.hourTo ?? 23;
        if (hour < from || hour > to) return false;
    }

    if (filters.channel && filters.channel !== 'all') {
        const ch = resolveCardChannel(card);
        if (ch !== filters.channel) return false;
    }

    if (filters.country && filters.country !== 'all') {
        const country = inferCardCountry(card);
        if (country !== filters.country) return false;
    }

    if (filters.unreadOnly && !(card.unreadCount > 0)) return false;

    if (filters.unassignedOnly && card.assignedTo) return false;

    if (filters.noResponseHours && filters.noResponseHours > 0) {
        const ms = filters.noResponseHours * 3600 * 1000;
        if (Date.now() - getCardTime(card) < ms) return false;
    }

    if (filters.keyword?.trim()) {
        const kw = filters.keyword.trim().toLowerCase();
        const text = `${card.contactName || ''} ${card.lastMessage || ''} ${card.contactNumber || ''}`.toLowerCase();
        if (!text.includes(kw)) return false;
    }

    return true;
}

export function sortCardsInColumn<T extends Record<string, any>>(
    cards: T[],
    sortMode: string,
    placements: Record<string, { order?: number }>
): T[] {
    if (sortMode === 'manual') {
        return [...cards].sort((a, b) => {
            const oa = placements[a.id]?.order ?? 0;
            const ob = placements[b.id]?.order ?? 0;
            if (oa !== ob) return oa - ob;
            return getCardArrivalTime(b) - getCardArrivalTime(a);
        });
    }
    if (sortMode === 'fifo') {
        return [...cards].sort((a, b) => getCardArrivalTime(a) - getCardArrivalTime(b));
    }
    if (sortMode === 'lifo') {
        return [...cards].sort((a, b) => getCardArrivalTime(b) - getCardArrivalTime(a));
    }
    return [...cards].sort((a, b) => getCardArrivalTime(b) - getCardArrivalTime(a));
}

export function hasActiveFilters(filters: CustomBoardFilters): boolean {
    return (
        filters.dateRange !== 'all' ||
        filters.hourFrom != null ||
        filters.hourTo != null ||
        (filters.channel != null && filters.channel !== 'all') ||
        (filters.country != null && filters.country !== 'all') ||
        !!filters.unreadOnly ||
        !!filters.unassignedOnly ||
        !!(filters.noResponseHours && filters.noResponseHours > 0) ||
        !!filters.keyword?.trim()
    );
}
