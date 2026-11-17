import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Broadcast, BroadcastRecipient } from "@/app/home/[entityId]/cmo/broadcast/list/lib/types";
import {
    isBroadcastTemplatePlaceholder,
    resolveBroadcastRecipientText,
} from "@/app/home/[entityId]/cmo/broadcast/list/lib/resolveBroadcastMessageText";
import { registerTemplateBody } from "@/lib/broadcast/templateDisplayCache";

const broadcastCache = new Map<string, Broadcast>();
const templateBodyCache = new Map<string, string>();

function isBroadcastMsg(msg: Record<string, unknown>): boolean {
    const meta = msg.metadata as { source?: string } | undefined;
    return (
        meta?.source === "broadcast" ||
        msg.source === "broadcast" ||
        msg.isBroadcast === true
    );
}

function templateNameFromPlaceholder(text: string): string | undefined {
    const m = text.match(/(?:Campaign template|Plantilla de campaña):\s*(.+)/i);
    return m?.[1]?.trim();
}

async function fetchTemplateBody(
    userId: string,
    entityId: string,
    templateName: string
): Promise<string | undefined> {
    const cacheKey = `${entityId}:${templateName}`;
    if (templateBodyCache.has(cacheKey)) return templateBodyCache.get(cacheKey);

    try {
        const res = await fetch(`/api/whatsapp/templates?userId=${userId}&entityId=${entityId}`);
        const data = await res.json();
        const templates = Array.isArray(data?.templates) ? data.templates : [];
        const lower = templateName.toLowerCase();
        const match =
            templates.find((t: { name?: string }) => t.name === templateName) ||
            templates.find((t: { name?: string }) => t.name?.toLowerCase() === lower) ||
            templates.find((t: { name?: string }) => {
                const n = (t.name || "").toLowerCase();
                return n.startsWith(lower) || lower.startsWith(n);
            });
        const body = match?.components?.find((c: { type?: string }) => c.type === "BODY")?.text;
        if (body) {
            templateBodyCache.set(cacheKey, body);
            registerTemplateBody(templateName, body);
        }
        return body;
    } catch {
        return undefined;
    }
}

async function loadBroadcast(
    tenantPath: string,
    broadcastId: string,
    userId?: string,
    entityId?: string
): Promise<Broadcast | null> {
    if (broadcastCache.has(broadcastId)) return broadcastCache.get(broadcastId)!;

    const snap = await getDoc(doc(db, `${tenantPath}/broadcasts/${broadcastId}`));
    if (!snap.exists()) return null;

    let broadcast = { id: broadcastId, ...snap.data() } as Broadcast;
    const msg = broadcast.message;

    if (
        msg?.kind === "template" &&
        !msg.templateBody?.trim() &&
        msg.templateName &&
        userId &&
        entityId
    ) {
        const body = await fetchTemplateBody(userId, entityId, msg.templateName);
        if (body) {
            broadcast = {
                ...broadcast,
                message: { ...msg, templateBody: body },
            };
        }
    }

    broadcastCache.set(broadcastId, broadcast);
    return broadcast;
}

/** Resolve placeholder broadcast bubbles to real template text (display only). */
export async function enrichOmnichannelMessages(
    tenantPath: string | undefined,
    messages: unknown[],
    contact: { name?: string; phone?: string; country?: string },
    userId?: string | null,
    entityId?: string | null
): Promise<unknown[]> {
    if (!tenantPath || !Array.isArray(messages) || messages.length === 0) {
        return messages;
    }

    const recipient: BroadcastRecipient = {
        id: "omnichannel-view",
        contactId: "",
        name: contact.name || "",
        phone: contact.phone || "",
        country: contact.country,
        status: "sent",
    };

    const broadcastIds = new Set<string>();
    messages.forEach((m) => {
        if (!m || typeof m !== "object") return;
        const msg = m as Record<string, unknown>;
        const meta = msg.metadata as { broadcastId?: string } | undefined;
        if (meta?.broadcastId) broadcastIds.add(meta.broadcastId);
    });

    await Promise.all(
        Array.from(broadcastIds).map((id) => loadBroadcast(tenantPath, id, userId || undefined, entityId || undefined))
    );

    let changed = false;
    const result = await Promise.all(
        messages.map(async (m) => {
            if (!m || typeof m !== "object") return m;
            const msg = m as Record<string, unknown>;
            const current = String(msg.text || "");
            const isPlaceholder = isBroadcastTemplatePlaceholder(current);
            const isBroadcast = isBroadcastMsg(msg);

            if (!isPlaceholder && !isBroadcast) return m;
            if (!isPlaceholder && isBroadcast) return m;

            const meta = msg.metadata as { broadcastId?: string } | undefined;
            let broadcast = meta?.broadcastId
                ? broadcastCache.get(meta.broadcastId)
                : undefined;

            if (!broadcast && isPlaceholder) {
                const templateName = templateNameFromPlaceholder(current);
                if (templateName && userId && entityId) {
                    const body = await fetchTemplateBody(userId, entityId, templateName);
                    if (body) {
                        broadcast = {
                            id: "placeholder",
                            status: "Completed",
                            broadcastTime: "",
                            name: "",
                            labels: "",
                            channel: "whatsapp",
                            segment: "",
                            recipients: 0,
                            totalMessages: 0,
                            message: {
                                kind: "template",
                                templateName,
                                templateBody: body,
                            },
                        };
                    }
                }
            }

            if (!broadcast) return m;

            const resolved = resolveBroadcastRecipientText(broadcast, recipient);
            if (!resolved || isBroadcastTemplatePlaceholder(resolved)) return m;

            changed = true;
            return { ...msg, text: resolved };
        })
    );

    return changed ? result : messages;
}
