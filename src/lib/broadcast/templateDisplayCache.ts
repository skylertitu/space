import {
    isBroadcastTemplatePlaceholder,
    resolveTemplateBodyForRecipient,
} from "@/app/home/[entityId]/cmo/broadcast/list/lib/resolveBroadcastMessageText";
import type { BroadcastMessage } from "@/app/home/[entityId]/cmo/broadcast/list/lib/types";

const bodyByName = new Map<string, string>();
let loadPromise: Promise<void> | null = null;
let loadedForKey = "";

function templateNameFromPlaceholder(text: string): string | undefined {
    const m = text.match(/(?:Campaign template|Plantilla de campaña):\s*(.+)/i);
    return m?.[1]?.trim();
}

function findBody(templateName: string): string | undefined {
    if (bodyByName.has(templateName)) return bodyByName.get(templateName);
    const lower = templateName.toLowerCase();
    for (const [name, body] of bodyByName.entries()) {
        const n = name.toLowerCase();
        if (n === lower || n.startsWith(lower) || lower.startsWith(n)) return body;
    }
    return undefined;
}

/** Preload all Meta template bodies once per session (for omnichannel display). */
export function preloadWhatsAppTemplateBodies(
    userId: string,
    entityId: string
): Promise<void> {
    const key = `${userId}:${entityId}`;
    const cacheStorageKey = `elizmey_wa_templates_${key}`;

    if (loadedForKey === key && bodyByName.size > 0) {
        return Promise.resolve();
    }

    try {
        if (typeof window !== "undefined") {
            const stored = sessionStorage.getItem(cacheStorageKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    bodyByName.clear();
                    parsed.forEach(([k, v]: [string, string]) => bodyByName.set(k, v));
                    loadedForKey = key;
                }
            }
        }
    } catch {}

    if (loadPromise && loadedForKey === key) return loadPromise;

    loadedForKey = key;
    loadPromise = fetch(`/api/whatsapp/templates?userId=${userId}&entityId=${entityId}`)
        .then((r) => r.json())
        .then((data) => {
            bodyByName.clear();
            const templates = Array.isArray(data?.templates) ? data.templates : [];
            templates.forEach((t: { name?: string; components?: Array<{ type?: string; text?: string }> }) => {
                if (!t.name) return;
                const body = t.components?.find((c) => c.type === "BODY")?.text;
                if (body) bodyByName.set(t.name, body);
            });
            try {
                if (typeof window !== "undefined") {
                    sessionStorage.setItem(cacheStorageKey, JSON.stringify(Array.from(bodyByName.entries())));
                }
            } catch {}
        })
        .catch(() => undefined)
        .finally(() => {
            loadPromise = null;
        });

    return loadPromise;
}

/** Sync display resolver — call after preloadWhatsAppTemplateBodies. */
export function resolvePlaceholderDisplayText(
    text: string,
    contact?: { name?: string; phone?: string; country?: string }
): string {
    if (!isBroadcastTemplatePlaceholder(text)) return text;

    const templateName = templateNameFromPlaceholder(text);
    if (!templateName) return text;

    const body = findBody(templateName);
    if (!body) return text;

    const message: BroadcastMessage = {
        kind: "template",
        templateName,
        templateBody: body,
    };

    const resolved = resolveTemplateBodyForRecipient(message, {
        id: "view",
        contactId: "",
        name: contact?.name || "",
        phone: contact?.phone || "",
        country: contact?.country,
        status: "sent",
    });

    return isBroadcastTemplatePlaceholder(resolved) ? text : resolved;
}

export function findTemplateBodyFromCache(templateName?: string): string | undefined {
    if (!templateName) return undefined;
    return findBody(templateName);
}

export function registerTemplateBody(name: string, body: string) {
    if (name && body) bodyByName.set(name, body);
}
