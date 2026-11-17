import { useEffect, useState, useCallback } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { BroadcastRecipient } from "./types";
import {
    resolveBroadcastRecipientCard,
    type ResolvedBroadcastCard,
} from "./resolveBroadcastRecipientCard";

export function useBroadcastConversationCards(tenantPath: string) {
    const [groups, setGroups] = useState<any[]>([]);
    const [cards, setCards] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!tenantPath) {
            setGroups([]);
            setCards([]);
            setLoading(false);
            return;
        }

        const unsubGroups = onSnapshot(
            query(collection(db, `${tenantPath}/kanban-groups`), orderBy("order", "asc")),
            (snap) => setGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
            () => setGroups([])
        );

        return () => unsubGroups();
    }, [tenantPath]);

    useEffect(() => {
        if (!tenantPath || groups.length === 0) {
            setCards([]);
            setLoading(false);
            return;
        }

        const registry = new Map<string, any>();
        const unsubs = groups.map((group) =>
            onSnapshot(
                collection(db, `${tenantPath}/kanban-groups/${group.id}/cards`),
                (snap) => {
                    snap.docs.forEach((d) => {
                        registry.set(d.id, { id: d.id, groupId: group.id, ...d.data() });
                    });
                    snap.docChanges().forEach((change) => {
                        if (change.type === "removed") registry.delete(change.doc.id);
                    });
                    setCards(Array.from(registry.values()));
                    setLoading(false);
                },
                () => setLoading(false)
            )
        );

        return () => unsubs.forEach((u) => u());
    }, [tenantPath, groups]);

    const resolveCardForRecipient = useCallback(
        async (recipient: BroadcastRecipient): Promise<ResolvedBroadcastCard> => {
            if (!tenantPath) {
                return {
                    id: `temp-${recipient.id}`,
                    contactName: recipient.name,
                    contactNumber: recipient.phone,
                };
            }
            return resolveBroadcastRecipientCard(tenantPath, recipient, cards);
        },
        [tenantPath, cards]
    );

    const getGroupName = useCallback(
        (groupId?: string) => groups.find((g) => g.id === groupId)?.name || "",
        [groups]
    );

    return { groups, cards, loading, resolveCardForRecipient, getGroupName };
}
