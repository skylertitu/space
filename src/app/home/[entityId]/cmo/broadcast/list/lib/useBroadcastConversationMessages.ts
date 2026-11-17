import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ResolvedBroadcastCard } from "./resolveBroadcastRecipientCard";
import {
    findConversationsByPhoneClient,
    pickBestConversationId,
    conversationIdsFromCards,
} from "./conversationMessageMerge";
import { mergeConversationMessages } from "@/lib/conversations/mergeMessages";

const EMPTY_MESSAGES: unknown[] = [];

export function useBroadcastConversationMessages(
    tenantPath: string | undefined,
    card: ResolvedBroadcastCard | null | undefined,
    extraCardMessages: unknown[] = EMPTY_MESSAGES,
    allCards: any[] = EMPTY_MESSAGES as any[]
) {
    const [conversationData, setConversationData] = useState<Record<string, unknown> | null>(null);
    const [mergedMessages, setMergedMessages] = useState<unknown[]>([]);
    const [loading, setLoading] = useState(false);
    const [kanbanCardMessages, setKanbanCardMessages] = useState<unknown[]>([]);
    const [convSnapshots, setConvSnapshots] = useState<
        Map<string, Record<string, unknown> | null>
    >(() => new Map());

    const allCardsRef = useRef(allCards);
    allCardsRef.current = allCards;

    const extraRef = useRef(extraCardMessages);
    extraRef.current = extraCardMessages;

    const cardId = card?.id;
    const cardGroupId = card?.groupId;
    const conversationId = card?.conversationId;
    const phone = card?.contactNumber || (card?.contactNumberClean as string | undefined);
    const primaryId = conversationId || cardId;
    const legacyRef = useRef<unknown[]>(EMPTY_MESSAGES);
    legacyRef.current = Array.isArray(card?.messages)
        ? (card.messages as unknown[])
        : EMPTY_MESSAGES;

    const bestIdRef = useRef<string | null>(null);

    // Live kanban card may still hold legacy messages.
    useEffect(() => {
        if (!tenantPath || !cardGroupId || !cardId || cardId.startsWith("temp-")) {
            setKanbanCardMessages(EMPTY_MESSAGES);
            return;
        }

        const cardRef = doc(db, `${tenantPath}/kanban-groups/${cardGroupId}/cards/${cardId}`);

        return onSnapshot(
            cardRef,
            (snap) => {
                const msgs = snap.exists() ? snap.data()?.messages : null;
                setKanbanCardMessages(Array.isArray(msgs) ? msgs : []);
            },
            () => setKanbanCardMessages(EMPTY_MESSAGES)
        );
    }, [tenantPath, cardGroupId, cardId]);

    // Subscribe to /conversations — stable deps only (no whole card / allCards arrays).
    useEffect(() => {
        if (!tenantPath || !primaryId || primaryId.startsWith("temp-")) {
            bestIdRef.current = null;
            setConvSnapshots(new Map());
            setLoading(false);
            return;
        }

        let cancelled = false;
        let unsubs: Array<() => void> = [];

        const subscribe = async () => {
            setLoading(true);

            const phoneMatches = phone
                ? await findConversationsByPhoneClient(tenantPath, phone)
                : [];
            if (cancelled) return;

            const cardConvIds = phone
                ? conversationIdsFromCards(allCardsRef.current, phone)
                : [];
            const bestId = pickBestConversationId(primaryId, phoneMatches) || primaryId;
            bestIdRef.current = bestId;

            const ids = Array.from(
                new Set([
                    bestId,
                    primaryId,
                    ...phoneMatches.map((m) => m.id),
                    ...cardConvIds,
                ].filter(Boolean))
            );

            const initial = new Map<string, Record<string, unknown> | null>();
            phoneMatches.forEach((m) => initial.set(m.id, m.data));
            setConvSnapshots(new Map(initial));

            unsubs = ids.map((id) =>
                onSnapshot(
                    doc(db, `${tenantPath}/conversations/${id}`),
                    (snap) => {
                        if (cancelled) return;
                        setConvSnapshots((prev) => {
                            const next = new Map(prev);
                            next.set(id, snap.exists() ? snap.data() : null);
                            return next;
                        });
                    },
                    () => {
                        if (cancelled) return;
                        setConvSnapshots((prev) => {
                            const next = new Map(prev);
                            next.set(id, null);
                            return next;
                        });
                    }
                )
            );

            if (!cancelled) setLoading(false);
        };

        subscribe();

        return () => {
            cancelled = true;
            unsubs.forEach((u) => u());
        };
    }, [tenantPath, primaryId, phone]);

    // Merge snapshots into messages whenever source data changes.
    useEffect(() => {
        if (!primaryId || primaryId.startsWith("temp-")) {
            setMergedMessages(EMPTY_MESSAGES);
            setConversationData(null);
            return;
        }

        const bestId = bestIdRef.current || primaryId;
        const convLists = Array.from(convSnapshots.values()).map((data) =>
            Array.isArray(data?.messages) ? (data.messages as unknown[]) : EMPTY_MESSAGES
        );

        const merged = mergeConversationMessages(
            ...convLists,
            legacyRef.current,
            kanbanCardMessages,
            extraRef.current
        );

        const bestData =
            convSnapshots.get(bestId) ||
            Array.from(convSnapshots.values()).find((d) => d != null) ||
            null;

        setMergedMessages(merged);
        setConversationData(
            bestData || merged.length > 0
                ? {
                      ...(bestData || {}),
                      messages: merged,
                      conversationId: bestId,
                  }
                : null
        );
    }, [convSnapshots, kanbanCardMessages, primaryId, cardId]);

    return { conversationData, mergedMessages, loading };
}
