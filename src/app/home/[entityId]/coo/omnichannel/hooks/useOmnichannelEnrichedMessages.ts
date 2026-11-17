import { useEffect, useMemo, useState } from "react";
import { enrichOmnichannelMessages } from "@/lib/broadcast/enrichOmnichannelMessages";

function messagesFingerprint(messages: unknown[]): string {
    if (!messages.length) return "";
    return messages
        .map((m) => {
            if (!m || typeof m !== "object") return "";
            const msg = m as Record<string, unknown>;
            const wa = msg.whatsappMessageId as string | undefined;
            return `${msg.sender}:${wa || ""}:${String(msg.text || "").length}:${String(msg.text || "").slice(0, 24)}`;
        })
        .join("|");
}

export function useOmnichannelEnrichedMessages(
    tenantPath: string | undefined,
    messages: unknown[],
    contact: { name?: string; phone?: string; country?: string },
    userId?: string | null,
    entityId?: string | null
): unknown[] {
    const fingerprint = useMemo(() => messagesFingerprint(messages), [messages]);
    const [enriched, setEnriched] = useState<unknown[]>(messages);

    useEffect(() => {
        setEnriched(messages);
        if (!tenantPath || messages.length === 0) return;

        let cancelled = false;
        enrichOmnichannelMessages(tenantPath, messages, contact, userId, entityId).then((next) => {
            if (!cancelled) setEnriched(next);
        });

        return () => {
            cancelled = true;
        };
    }, [tenantPath, fingerprint, contact.name, contact.phone, contact.country, userId, entityId, messages]);

    return enriched;
}
