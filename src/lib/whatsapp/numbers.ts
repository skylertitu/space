import { db } from "@/lib/firebase";
import { collection, doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";

// Fixed tabs (slots). Each slot can have ONE WhatsApp number connected to it,
// and runs ONE active bot at a time.
export type NumberSlot = "general" | "support" | "broadcast";

export interface SlotDefinition {
    id: NumberSlot;
    label: string;
    short: string;
    description: string;
}

export const SLOTS: SlotDefinition[] = [
    { id: "general", label: "General", short: "GEN", description: "Atención general y conversaciones normales." },
    { id: "support", label: "Soporte", short: "SOP", description: "Atención al cliente y postventa." },
    { id: "broadcast", label: "Broadcast", short: "CAM", description: "Campañas y envíos masivos." },
];

/**
 * Normalize legacy slot ids (`primary`) and empty values to the canonical NumberSlot.
 * Bots / whatsapp_numbers historically used `primary` for the first number.
 */
export function normalizeNumberSlot(value: unknown): NumberSlot {
    const v = String(value || "").trim().toLowerCase();
    if (v === "support") return "support";
    if (v === "broadcast") return "broadcast";
    // primary / general / empty / unknown → general
    return "general";
}

export interface WhatsAppNumberConnection {
    connected: boolean;
    phoneNumberId?: string;
    wabaId?: string;
    accessToken?: string;
    displayPhoneNumber?: string;
    updatedAt?: any;
}

export type SlotConnections = Record<NumberSlot, WhatsAppNumberConnection>;

const numbersPath = (tenantPath: string) => `${tenantPath}/whatsapp_numbers`;

const emptyConnection = (): WhatsAppNumberConnection => ({ connected: false });

const buildConnection = (data: any): WhatsAppNumberConnection => {
    const phoneNumberId = data?.phoneNumberId || data?.phone_number_id || data?.phoneId;
    return {
        connected: !!phoneNumberId,
        phoneNumberId: phoneNumberId ? String(phoneNumberId) : undefined,
        wabaId: data?.wabaId ? String(data.wabaId) : undefined,
        accessToken: data?.accessToken || data?.token || data?.access_token,
        displayPhoneNumber: data?.displayPhoneNumber,
        updatedAt: data?.updatedAt,
    };
};

/**
 * Subscribe to the connection status of the 3 fixed slots.
 * The legacy single integration (`integrations/whatsapp` / `whatsapp_internal`)
 * is surfaced under the "general" slot until the user explicitly assigns it,
 * so existing setups keep working with zero migration.
 */
export const subscribeSlotConnections = (
    tenantPath: string,
    cb: (connections: SlotConnections) => void
): (() => void) => {
    const slots: SlotConnections = {
        general: emptyConnection(),
        support: emptyConnection(),
        broadcast: emptyConnection(),
    };
    let legacy: WhatsAppNumberConnection | null = null;
    // Track which slots have an explicit doc so legacy doesn't override them.
    const explicit: Record<NumberSlot, boolean> = { general: false, support: false, broadcast: false };

    const emit = () => {
        const out: SlotConnections = {
            general: explicit.general ? slots.general : (slots.general.connected ? slots.general : (legacy || emptyConnection())),
            support: slots.support,
            broadcast: slots.broadcast,
        };
        cb(out);
    };

    const unsubNumbers = onSnapshot(
        collection(db, numbersPath(tenantPath)),
        (snap) => {
            (["general", "support", "broadcast"] as NumberSlot[]).forEach((s) => {
                slots[s] = emptyConnection();
                explicit[s] = false;
            });
            snap.docs.forEach((d) => {
                // Map legacy `primary` docs onto the General tab.
                const id = d.id === "primary" ? "general" : (d.id as NumberSlot);
                if (id === "general" || id === "support" || id === "broadcast") {
                    slots[id] = buildConnection(d.data());
                    explicit[id] = true;
                }
            });
            emit();
        },
        (err) => {
            console.error("[WhatsAppNumbers] subscribe error:", err);
            emit();
        }
    );

    const applyLegacy = (data: any) => {
        const phoneNumberId = data?.phoneNumberId || data?.phone_number_id || data?.phoneId;
        if (!phoneNumberId) return;
        legacy = buildConnection(data);
        emit();
    };

    const unsubStd = onSnapshot(
        doc(db, `${tenantPath}/integrations/whatsapp`),
        (snap) => {
            if (snap.exists()) applyLegacy(snap.data());
            emit();
        },
        () => {}
    );
    const unsubInt = onSnapshot(
        doc(db, `${tenantPath}/integrations/whatsapp_internal`),
        (snap) => {
            if (snap.exists() && !legacy) applyLegacy(snap.data());
            emit();
        },
        () => {}
    );

    return () => {
        unsubNumbers();
        unsubStd();
        unsubInt();
    };
};

export interface SaveSlotInput {
    phoneNumberId: string;
    wabaId?: string;
    accessToken: string;
    displayPhoneNumber?: string;
}

export const saveSlotConnection = async (
    tenantPath: string,
    slot: NumberSlot,
    input: SaveSlotInput
): Promise<void> => {
    const ref = doc(db, numbersPath(tenantPath), slot);
    await setDoc(
        ref,
        {
            slot,
            phoneNumberId: input.phoneNumberId.trim(),
            wabaId: input.wabaId?.trim() || null,
            accessToken: input.accessToken.trim(),
            displayPhoneNumber: input.displayPhoneNumber?.trim() || null,
            status: "Connected",
            provider: "whatsapp",
            updatedAt: serverTimestamp(),
        },
        { merge: true }
    );
};

export const disconnectSlot = async (tenantPath: string, slot: NumberSlot): Promise<void> => {
    const ref = doc(db, numbersPath(tenantPath), slot);
    await setDoc(
        ref,
        {
            slot,
            phoneNumberId: null,
            wabaId: null,
            accessToken: null,
            displayPhoneNumber: null,
            status: "Disconnected",
            updatedAt: serverTimestamp(),
        },
        { merge: true }
    );
};
