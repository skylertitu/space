import { db } from "@/lib/firebase";
import {
    collection,
    doc,
    setDoc,
    getDocs,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp,
    writeBatch,
    deleteDoc,
    updateDoc,
} from "firebase/firestore";
import type { Broadcast, BroadcastMessage, BroadcastRecipient, SegmentConfig } from "./types";
import { emptyStats } from "./types";
import { resolveRecipients } from "./segments";
import { stripUndefined } from "@/lib/mold/firestoreWrite";

const broadcastsPath = (tenantPath: string) => `${tenantPath}/broadcasts`;

export interface CreateBroadcastInput {
    name: string;
    labels: string;
    channel: string;
    segment: string;
    segmentConfig: SegmentConfig;
    message: BroadcastMessage;
    botId?: string | null;
    botName?: string | null;
    senderSlot?: string | null;
    senderPhoneNumberId?: string | null;
    deliverySpeed?: string;
    sendImmediately?: boolean;
    scheduleAt?: string | null;
}

// Create a broadcast document and pre-resolve + persist its recipients.
export const createBroadcast = async (
    tenantPath: string,
    input: CreateBroadcastInput
): Promise<{ id: string; recipientCount: number }> => {
    const recipients = await resolveRecipients(tenantPath, input.segmentConfig);

    const ref = doc(collection(db, broadcastsPath(tenantPath)));
    const stats = emptyStats();
    stats.total = recipients.length;
    stats.pending = recipients.length;

    const broadcast: any = {
        id: ref.id,
        name: input.name,
        labels: input.labels || "-",
        channel: input.channel || "-",
        segment: input.segment || "-",
        segmentConfig: stripUndefined(input.segmentConfig as unknown as Record<string, unknown>),
        message: stripUndefined(input.message as unknown as Record<string, unknown>),
        botId: input.botId || null,
        botName: input.botName || null,
        senderSlot: input.senderSlot || null,
        senderPhoneNumberId: input.senderPhoneNumberId || null,
        deliverySpeed: input.deliverySpeed || "No limit",
        sendImmediately: input.sendImmediately ?? true,
        scheduleAt: input.scheduleAt || null,
        status: input.sendImmediately ? "Draft" : "Scheduled",
        broadcastTime: input.sendImmediately ? "-" : input.scheduleAt || "-",
        recipients: recipients.length,
        totalMessages: recipients.length,
        stats,
        createdAt: serverTimestamp(),
        launchedAt: null,
        completedAt: null,
    };

    await setDoc(ref, broadcast);

    // Persist recipients in chunked batches (500 write cap).
    const CHUNK = 450;
    for (let i = 0; i < recipients.length; i += CHUNK) {
        const batch = writeBatch(db);
        recipients.slice(i, i + CHUNK).forEach((r) => {
            const rRef = doc(db, `${broadcastsPath(tenantPath)}/${ref.id}/recipients`, r.id);
            batch.set(rRef, { ...r, sentAt: null, repliedAt: null });
        });
        await batch.commit();
    }

    return { id: ref.id, recipientCount: recipients.length };
};

// Update an existing broadcast and re-resolve its recipients.
// Only meant for campaigns that have not been launched yet (Draft / Scheduled),
// because it wipes and rebuilds the recipients subcollection (resetting stats).
export const updateBroadcast = async (
    tenantPath: string,
    broadcastId: string,
    input: CreateBroadcastInput
): Promise<{ recipientCount: number }> => {
    const recipients = await resolveRecipients(tenantPath, input.segmentConfig);

    const stats = emptyStats();
    stats.total = recipients.length;
    stats.pending = recipients.length;

    await updateDoc(doc(db, broadcastsPath(tenantPath), broadcastId), {
        name: input.name,
        labels: input.labels || "-",
        channel: input.channel || "-",
        segment: input.segment || "-",
        segmentConfig: stripUndefined(input.segmentConfig as unknown as Record<string, unknown>),
        message: stripUndefined(input.message as unknown as Record<string, unknown>),
        botId: input.botId || null,
        botName: input.botName || null,
        senderSlot: input.senderSlot || null,
        senderPhoneNumberId: input.senderPhoneNumberId || null,
        deliverySpeed: input.deliverySpeed || "No limit",
        sendImmediately: input.sendImmediately ?? true,
        scheduleAt: input.scheduleAt || null,
        status: input.sendImmediately ? "Draft" : "Scheduled",
        broadcastTime: input.sendImmediately ? "-" : input.scheduleAt || "-",
        recipients: recipients.length,
        totalMessages: recipients.length,
        stats,
        updatedAt: serverTimestamp(),
    });

    const recPath = `${broadcastsPath(tenantPath)}/${broadcastId}/recipients`;
    const CHUNK = 450;

    // Wipe existing recipients so the campaign reflects the new number list.
    const existing = await getDocs(collection(db, recPath));
    for (let i = 0; i < existing.docs.length; i += CHUNK) {
        const batch = writeBatch(db);
        existing.docs.slice(i, i + CHUNK).forEach((d) => batch.delete(d.ref));
        await batch.commit();
    }

    // Write the freshly resolved recipients.
    for (let i = 0; i < recipients.length; i += CHUNK) {
        const batch = writeBatch(db);
        recipients.slice(i, i + CHUNK).forEach((r) => {
            const rRef = doc(db, recPath, r.id);
            batch.set(rRef, { ...r, sentAt: null, repliedAt: null });
        });
        await batch.commit();
    }

    return { recipientCount: recipients.length };
};

// Realtime subscription to the broadcasts list.
export const subscribeBroadcasts = (
    tenantPath: string,
    cb: (list: Broadcast[]) => void
): (() => void) => {
    const q = query(collection(db, broadcastsPath(tenantPath)), orderBy("createdAt", "desc"));
    return onSnapshot(
        q,
        (snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Broadcast));
            cb(list);
        },
        (err) => {
            console.error("[Broadcast] subscribe error:", err);
            cb([]);
        }
    );
};

// One-shot fetch of a campaign's recipients (for the results view).
export const subscribeRecipients = (
    tenantPath: string,
    broadcastId: string,
    cb: (list: BroadcastRecipient[]) => void
): (() => void) => {
    const ref = collection(db, `${broadcastsPath(tenantPath)}/${broadcastId}/recipients`);
    return onSnapshot(
        ref,
        (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as BroadcastRecipient))),
        (err) => {
            console.error("[Broadcast] subscribeRecipients error:", err);
            cb([]);
        }
    );
};

export const deleteBroadcast = async (tenantPath: string, broadcastId: string) => {
    // Delete recipients subcollection first (chunked).
    const recRef = collection(db, `${broadcastsPath(tenantPath)}/${broadcastId}/recipients`);
    const snap = await getDocs(recRef);
    const CHUNK = 450;
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += CHUNK) {
        const batch = writeBatch(db);
        docs.slice(i, i + CHUNK).forEach((d) => batch.delete(d.ref));
        await batch.commit();
    }
    await deleteDoc(doc(db, broadcastsPath(tenantPath), broadcastId));
};

export const renameBroadcast = async (
    tenantPath: string,
    broadcastId: string,
    name: string
) => {
    await updateDoc(doc(db, broadcastsPath(tenantPath), broadcastId), { name });
};

// Trigger the server-side send loop.
export const launchBroadcast = async (
    userId: string,
    entityId: string,
    broadcastId: string,
    options?: { resume?: boolean }
): Promise<{ ok: boolean; error?: string; summary?: any }> => {
    try {
        const res = await fetch("/api/whatsapp/broadcast/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, entityId, broadcastId, resume: options?.resume }),
        });
        const data = await res.json();
        if (!res.ok) return { ok: false, error: data.error || "Error al iniciar la campaña" };
        return { ok: true, summary: data };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
};

/** Mark Completed when all recipients are already sent (unsticks "Sending"). */
export const finalizeBroadcast = async (
    userId: string,
    entityId: string,
    broadcastId: string
): Promise<{ ok: boolean; error?: string; data?: any }> => {
    try {
        const res = await fetch("/api/whatsapp/broadcast/finalize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, entityId, broadcastId }),
        });
        const data = await res.json();
        if (!res.ok) return { ok: false, error: data.error || "Error al finalizar" };
        return { ok: true, data };
    } catch (e: any) {
        return { ok: false, error: e.message };
    }
};
