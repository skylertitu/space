import { useEffect, useState } from "react";
import type { Broadcast, BroadcastMessage } from "./types";

function findTemplateMatch(
    templates: Array<{ name?: string; components?: Array<{ type?: string; text?: string }> }>,
    templateName?: string
) {
    if (!templateName) return undefined;
    const lower = templateName.toLowerCase();
    return (
        templates.find((t) => t.name === templateName) ||
        templates.find((t) => t.name?.toLowerCase() === lower) ||
        templates.find((t) => {
            const n = (t.name || "").toLowerCase();
            return n.startsWith(lower) || lower.startsWith(n);
        })
    );
}

/**
 * For older campaigns saved without templateBody, fetch Meta template BODY once.
 */
export function useBroadcastWithTemplateBody(
    broadcast: Broadcast,
    userId?: string | null,
    entityId?: string | null
): { broadcast: Broadcast; templateLoading: boolean } {
    const [message, setMessage] = useState<BroadcastMessage | undefined>(broadcast.message);
    const [templateLoading, setTemplateLoading] = useState(false);

    useEffect(() => {
        setMessage(broadcast.message);
    }, [broadcast.id, broadcast.message]);

    useEffect(() => {
        const msg = broadcast.message;
        if (!msg || msg.kind !== "template") return;
        if (msg.templateBody?.trim()) return;
        if (!userId || !entityId || !msg.templateName) return;

        let cancelled = false;
        setTemplateLoading(true);
        fetch(`/api/whatsapp/templates?userId=${userId}&entityId=${entityId}`)
            .then((r) => r.json())
            .then((data) => {
                if (cancelled) return;
                const templates = Array.isArray(data?.templates) ? data.templates : [];
                const match = findTemplateMatch(templates, msg.templateName);
                const bodyComp = match?.components?.find((c: { type?: string }) => c.type === "BODY");
                const templateBody = bodyComp?.text as string | undefined;
                if (templateBody) {
                    setMessage({ ...msg, templateBody });
                }
            })
            .catch(() => undefined)
            .finally(() => {
                if (!cancelled) setTemplateLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [broadcast.id, broadcast.message, userId, entityId]);

    return { broadcast: { ...broadcast, message }, templateLoading };
}
