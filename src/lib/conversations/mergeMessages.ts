export function messageTimeMs(msg: unknown): number {
    if (!msg || typeof msg !== "object") return 0;
    const ts = (msg as { timestamp?: unknown }).timestamp;
    if (!ts) return 0;
    if (typeof (ts as { toDate?: () => Date }).toDate === "function") {
        return (ts as { toDate: () => Date }).toDate().getTime();
    }
    if (typeof (ts as { seconds?: number }).seconds === "number") {
        return (ts as { seconds: number }).seconds * 1000;
    }
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts === "string" || typeof ts === "number") {
        const d = new Date(ts);
        return isNaN(d.getTime()) ? 0 : d.getTime();
    }
    return 0;
}

/** Merge message arrays from conversations, cards, etc. Deduplicate and sort. */
export function mergeConversationMessages(
    ...lists: Array<unknown[] | undefined | null>
): unknown[] {
    const seen = new Set<string>();
    const merged: unknown[] = [];

    const push = (msg: unknown) => {
        if (!msg || typeof msg !== "object") return;
        const m = msg as Record<string, unknown>;
        const waId = m.whatsappMessageId as string | undefined;
        const meta = m.metadata as { broadcastId?: string } | undefined;
        const time = messageTimeMs(msg);
        const key =
            waId ||
            `${m.sender}:${String(m.text || "")}:${meta?.broadcastId || ""}:${Math.floor(time / 5000)}`;

        if (seen.has(key)) return;
        seen.add(key);
        merged.push(msg);
    };

    lists.forEach((list) => {
        if (!Array.isArray(list)) return;
        list.forEach(push);
    });

    return merged.sort((a, b) => messageTimeMs(a) - messageTimeMs(b));
}
