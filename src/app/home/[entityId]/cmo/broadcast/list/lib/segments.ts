import { db } from "@/lib/firebase";
import { collection, getDocs, onSnapshot, query, orderBy } from "firebase/firestore";
import { normalizePhoneNumber } from "@/lib/phoneUtils";
import { getCountryFromPhone } from "@/lib/countryCodes";
import { resolveKanbanBoardColumnRecipients } from "@/lib/kanban/broadcastKanbanTargets";
import type { BroadcastRecipient, SegmentConfig } from "./types";

export interface KanbanGroupInfo {
    id: string;
    name: string;
    order: number;
}

const timeValue = (ts: any): number => {
    if (!ts) return 0;
    if (typeof ts.toMillis === "function") return ts.toMillis();
    if (ts.seconds !== undefined) return ts.seconds * 1000;
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === "string") return new Date(ts).getTime();
    return 0;
};

const hasWhatsAppPhone = (phone: string | undefined | null): boolean => {
    if (!phone) return false;
    return phone.replace(/\D/g, "").length >= 8;
};

const parseKanbanGroups = (docs: { id: string; data: () => Record<string, unknown> }[]): KanbanGroupInfo[] =>
    docs.map((d) => ({
        id: d.id,
        name: (d.data().name as string) || "Sin nombre",
        order: (d.data().order as number) ?? 0,
    }));

const parseTagsFromContacts = (docs: { data: () => Record<string, unknown> }[]): string[] => {
    const set = new Set<string>();
    docs.forEach((d) => {
        const tags = d.data().tags;
        if (Array.isArray(tags)) tags.forEach((t: string) => t && set.add(t));
    });
    return Array.from(set).sort();
};

const parseCountriesFromContacts = (
    docs: { data: () => Record<string, unknown> }[]
): { iso: string; country: string; flag: string; count: number }[] => {
    const map = new Map<string, { iso: string; country: string; flag: string; count: number }>();
    docs.forEach((d) => {
        const phone = d.data().phone as string;
        if (!hasWhatsAppPhone(phone)) return;
        const c = getCountryFromPhone(phone);
        if (!c) return;
        const existing = map.get(c.iso);
        if (existing) existing.count += 1;
        else map.set(c.iso, { iso: c.iso, country: c.country, flag: c.flag, count: 1 });
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
};

// One-shot loaders (kept for server-side / estimate flows).
export const getKanbanGroups = async (tenantPath: string): Promise<KanbanGroupInfo[]> => {
    try {
        const q = query(collection(db, `${tenantPath}/kanban-groups`), orderBy("order", "asc"));
        const snap = await getDocs(q);
        return parseKanbanGroups(snap.docs);
    } catch (e) {
        console.error("[Broadcast] getKanbanGroups error:", e);
        return [];
    }
};

export const getAvailableTags = async (tenantPath: string): Promise<string[]> => {
    try {
        const snap = await getDocs(collection(db, `${tenantPath}/contacts`));
        return parseTagsFromContacts(snap.docs);
    } catch (e) {
        console.error("[Broadcast] getAvailableTags error:", e);
        return [];
    }
};

export const getAvailableCountries = async (
    tenantPath: string
): Promise<{ iso: string; country: string; flag: string; count: number }[]> => {
    try {
        const snap = await getDocs(collection(db, `${tenantPath}/contacts`));
        return parseCountriesFromContacts(snap.docs);
    } catch (e) {
        console.error("[Broadcast] getAvailableCountries error:", e);
        return [];
    }
};

// Live listeners — dropdowns update instantly when Kanban/contacts change.
export const subscribeKanbanGroups = (
    tenantPath: string,
    cb: (groups: KanbanGroupInfo[]) => void
): (() => void) => {
    const q = query(collection(db, `${tenantPath}/kanban-groups`), orderBy("order", "asc"));
    return onSnapshot(
        q,
        (snap) => cb(parseKanbanGroups(snap.docs)),
        (err) => {
            console.error("[Broadcast] subscribeKanbanGroups error:", err);
            cb([]);
        }
    );
};

export const subscribeAvailableTags = (
    tenantPath: string,
    cb: (tags: string[]) => void
): (() => void) =>
    onSnapshot(
        collection(db, `${tenantPath}/contacts`),
        (snap) => cb(parseTagsFromContacts(snap.docs)),
        (err) => {
            console.error("[Broadcast] subscribeAvailableTags error:", err);
            cb([]);
        }
    );

export const subscribeAvailableCountries = (
    tenantPath: string,
    cb: (countries: { iso: string; country: string; flag: string; count: number }[]) => void
): (() => void) =>
    onSnapshot(
        collection(db, `${tenantPath}/contacts`),
        (snap) => cb(parseCountriesFromContacts(snap.docs)),
        (err) => {
            console.error("[Broadcast] subscribeAvailableCountries error:", err);
            cb([]);
        }
    );

const buildRecipient = (
    id: string,
    name: string,
    phone: string,
    extra: Partial<BroadcastRecipient> = {}
): BroadcastRecipient => {
    const normalized = normalizePhoneNumber(phone);
    const c = getCountryFromPhone(normalized);
    return {
        id,
        contactId: id,
        name: name || "Sin nombre",
        phone: normalized,
        country: c?.country,
        countryFlag: c?.flag,
        countryIso: c?.iso,
        status: "pending",
        error: null,
        messageId: null,
        ...extra,
    };
};

// Resolve the actual recipients (deduped by phone) for a segment config.
export const resolveRecipients = async (
    tenantPath: string,
    segment: SegmentConfig
): Promise<BroadcastRecipient[]> => {
    if (segment.type === "manual") {
        return segment.manualRecipients || [];
    }

    const byPhone = new Map<string, BroadcastRecipient>();

    const push = (r: BroadcastRecipient) => {
        const key = r.phone.replace(/\D/g, "");
        if (!key || key.length < 8) return;
        if (!byPhone.has(key)) byPhone.set(key, r);
    };

    // Kanban-group segments resolve from the live cards in that group.
    if (segment.type === "kanban_group" && segment.kanbanGroupId) {
        try {
            const snap = await getDocs(
                collection(db, `${tenantPath}/kanban-groups/${segment.kanbanGroupId}/cards`)
            );
            snap.docs.forEach((d) => {
                const data = d.data();
                const phone = data.contactNumber || data.contactNumberClean || data.phone;
                if (!hasWhatsAppPhone(phone)) return;
                push(
                    buildRecipient(data.crmId || data.contactId || d.id, data.contactName || "Sin nombre", phone, {
                        kanbanGroupId: segment.kanbanGroupId,
                        kanbanGroupName: segment.kanbanGroupName,
                    })
                );
            });
        } catch (e) {
            console.error("[Broadcast] resolveRecipients kanban error:", e);
        }
        return Array.from(byPhone.values());
    }

    // Hub kanban board column (principal / manual CRM / custom copy).
    if (
        segment.type === "kanban_board_column" &&
        segment.kanbanBoardSource &&
        segment.kanbanBoardId &&
        segment.kanbanColumnId
    ) {
        try {
            const list = await resolveKanbanBoardColumnRecipients(tenantPath, {
                kanbanBoardSource: segment.kanbanBoardSource,
                kanbanBoardId: segment.kanbanBoardId,
                kanbanColumnId: segment.kanbanColumnId,
                kanbanBoardName: segment.kanbanBoardName,
                kanbanColumnName: segment.kanbanColumnName,
                botId: segment.botId,
            });
            list.forEach(push);
        } catch (e) {
            console.error("[Broadcast] resolveRecipients kanban board column error:", e);
        }
        return Array.from(byPhone.values());
    }

    // Everything else resolves from contacts.
    const snap = await getDocs(collection(db, `${tenantPath}/contacts`));
    const now = Date.now();

    snap.docs.forEach((d) => {
        const c: any = { id: d.id, ...d.data() };
        if (!hasWhatsAppPhone(c.phone)) return;

        let include = false;
        switch (segment.type) {
            case "all":
                include = true;
                break;
            case "tag":
                include = Array.isArray(c.tags) && !!segment.tag && c.tags.includes(segment.tag);
                break;
            case "country": {
                const country = getCountryFromPhone(c.phone);
                include = !!country && country.iso === segment.countryIso;
                break;
            }
            case "stage":
                include = !!segment.stage && c.stage === segment.stage;
                break;
            case "created_recent": {
                const days = segment.days || 7;
                const t = timeValue(c.createdAt) || timeValue(c.importedAt) || timeValue(c.date);
                include = t > 0 && now - t <= days * 86400000;
                break;
            }
            case "inactive": {
                const days = segment.days || 30;
                const t = timeValue(c.lastUpdated) || timeValue(c.createdAt);
                include = t > 0 && now - t >= days * 86400000;
                break;
            }
            case "saved_audience": {
                const tags = segment.tags || [];
                const stages = segment.stages || [];
                const sources = segment.sources || [];
                if (tags.length + stages.length + sources.length === 0) {
                    include = false;
                    break;
                }
                const tagOk = tags.length === 0 || (Array.isArray(c.tags) && c.tags.some((tag: string) => tags.includes(tag)));
                const stageOk = stages.length === 0 || stages.includes(c.stage);
                const sourceOk = sources.length === 0 || sources.includes(c.source);
                include = tagOk && stageOk && sourceOk;
                break;
            }
            default:
                include = false;
        }

        if (include) {
            const name = c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim();
            push(buildRecipient(c.id, name, c.phone, { kanbanGroupId: c.kanbanGroupId }));
        }
    });

    return Array.from(byPhone.values());
};

export const estimateRecipients = async (
    tenantPath: string,
    segment: SegmentConfig
): Promise<number> => {
    const list = await resolveRecipients(tenantPath, segment);
    return list.length;
};
