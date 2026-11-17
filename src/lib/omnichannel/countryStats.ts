import { getCountryFromPhone } from '@/lib/countryCodes';
import { normalizePhoneNumber } from '@/lib/phoneUtils';
import { resolveCardChannel } from '@/lib/omnichannel/resolveCardChannel';

export interface CountryStat {
    iso: string;
    country: string;
    count: number;
}

export interface CountryStatsSummary {
    /** Unique contacts (by phone) who have written in this folder. */
    total: number;
    byCountry: CountryStat[];
}

const NON_PHONE_CHANNELS = new Set([
    'instagram',
    'instagram_comments',
    'messenger',
    'gmail',
    'x',
    'tiktok',
    'snapchat',
]);

export function extractCardPhoneNumber(card: Record<string, any> | null | undefined): string | null {
    if (!card) return null;
    const candidates = [
        card.contactNumber,
        card.contactNumberClean,
        card.phone,
        card.phoneNumber,
        card.customerPhone,
        card.userPhone,
        card.recipientPhone,
        card.botPhoneNumber,
        card.wabaPhoneNumber,
        card.displayPhoneNumber,
        card.whatsapp_account,
        card.platform_ids?.whatsapp,
        card.customFields?.telefono,
        card.customFields?.phone,
        card.customFields?.celular,
    ];
    for (const val of candidates) {
        if (val && typeof val === 'string' && val.trim().length >= 7) {
            return val.trim();
        }
    }
    if (typeof card.id === 'string' && card.id.replace(/\D/g, '').length >= 7 && !card.id.includes('@')) {
        return card.id;
    }
    return null;
}

function collectPhoneContacts(cards: readonly Record<string, any>[]) {
    const byCountry = new Map<string, { iso: string; country: string; phones: Set<string> }>();
    const allPhones = new Set<string>();

    for (const card of cards) {
        const channel = resolveCardChannel(card);
        if (NON_PHONE_CHANNELS.has(channel)) continue;

        const rawPhone = extractCardPhoneNumber(card);
        if (!rawPhone) continue;

        const normalized = normalizePhoneNumber(String(rawPhone));
        const phoneKey = normalized.replace(/\D/g, '');
        if (!phoneKey) continue;

        allPhones.add(phoneKey);

        const countryInfo = getCountryFromPhone(normalized);
        if (!countryInfo?.iso) continue;

        const existing = byCountry.get(countryInfo.iso);
        if (existing) {
            existing.phones.add(phoneKey);
        } else {
            byCountry.set(countryInfo.iso, {
                iso: countryInfo.iso,
                country: countryInfo.country,
                phones: new Set([phoneKey]),
            });
        }
    }

    return { byCountry, allPhones };
}

/** Count unique contacts per country from cards with a phone number. */
export function getCountryStatsFromCards(cards: readonly Record<string, any>[]): CountryStat[] {
    return getCountryStatsSummary(cards).byCountry;
}

export function getCountryStatsSummary(cards: readonly Record<string, any>[]): CountryStatsSummary {
    const { byCountry, allPhones } = collectPhoneContacts(cards);

    const byCountryList = Array.from(byCountry.values())
        .map(({ iso, country, phones }) => ({
            iso,
            country,
            count: phones.size,
        }))
        .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));

    return {
        total: allPhones.size,
        byCountry: byCountryList,
    };
}
