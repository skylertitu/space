import {
    getContactHeaderNames,
    getContactPhoneDisplay,
} from '@/lib/omnichannel/contactHeaderInfo';

/** Match a kanban card against a column-local search query. */
export function cardMatchesColumnSearch(card: Record<string, any>, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;

    const { whatsappName, botName } = getContactHeaderNames(card);
    const phoneDisplay = getContactPhoneDisplay(card);

    const haystack = [
        whatsappName,
        botName,
        card.contactName,
        card.contactNumber,
        card.contactNumberClean,
        card.phone,
        card.lastMessage,
        card.email,
        phoneDisplay?.country,
        phoneDisplay?.formatted,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    return haystack.includes(q);
}
