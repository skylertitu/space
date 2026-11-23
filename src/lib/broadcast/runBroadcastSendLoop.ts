import type { Firestore } from "firebase-admin/firestore";
import { admin } from "@/lib/firebase-admin";
import { registerWhatsAppTenantMapping } from "@/lib/whatsappTenant";
import { broadcastSendLooksStale, finalizeBroadcastIfDone } from "./finalizeBroadcastSend";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const delayForSpeed = (speed?: string): number => {
    switch (speed) {
        case "10":
            return 6000;
        case "50":
            return 1200;
        case "100":
            return 600;
        default:
            return 250;
    }
};

const resolveTokens = (input: string, r: Record<string, unknown>): string => {
    if (!input) return input;
    return input
        .replace(/\{\{\s*Nombre\s*\}\}/gi, String(r.name || ""))
        .replace(/\{\{\s*Tel[eé]fono\s*\}\}/gi, String(r.phone || ""))
        .replace(/\{\{\s*Pa[ií]s\s*\}\}/gi, String(r.country || ""));
};

export interface RunBroadcastSendParams {
    db: Firestore;
    userId: string;
    entityId: string;
    broadcastId: string;
    resume?: boolean;
    /** Reenvía solo los destinatarios que fallaron, también si la campaña ya figura completada. */
    retryFailed?: boolean;
}

export interface RunBroadcastSendResult {
    success: boolean;
    status: string;
    sent: number;
    failed: number;
    total: number;
    resumed?: boolean;
    error?: string;
}

export async function runBroadcastSendLoop(
    params: RunBroadcastSendParams
): Promise<RunBroadcastSendResult> {
    const { db, userId, entityId, broadcastId, resume = false, retryFailed = false } = params;
    const tenantPath = `users/${userId}/entities/${entityId}`;
    const broadcastRef = db.doc(`${tenantPath}/broadcasts/${broadcastId}`);
    const recipientsCol = db.collection(`${tenantPath}/broadcasts/${broadcastId}/recipients`);

    if (retryFailed) {
        const failedProbe = await recipientsCol.where("status", "==", "failed").limit(1).get();
        if (failedProbe.empty) {
            return { success: false, status: "Completed", sent: 0, failed: 0, total: 0, error: "no_failed" };
        }
    }

    const claimed = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(broadcastRef);
        if (!fresh.exists) return { error: "not_found" as const };
        const data = (fresh.data() || {}) as Record<string, unknown>;
        const current = String(data.status || "");
        const stale = broadcastSendLooksStale(data);
        if (current === "Completed" && !retryFailed) return { error: "already_completed" as const };
        if (current === "Sending" && !resume && !retryFailed && !stale) return { error: "already_sending" as const };
        tx.update(broadcastRef, {
            status: "Sending",
            launchedAt: admin.firestore.FieldValue.serverTimestamp(),
            sendHeartbeatAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { broadcast: data, stale };
    });

    if ("error" in claimed) {
        return { success: false, status: "unknown", sent: 0, failed: 0, total: 0, error: claimed.error };
    }

    let broadcast: Record<string, unknown> = claimed.broadcast;
    const stale = claimed.stale;

    let message = (broadcast.message || { kind: "text", text: "" }) as Record<string, unknown>;

    const { ensureBroadcastTemplateBody } = await import("./ensureBroadcastTemplateBody");
    const ensured = await ensureBroadcastTemplateBody({
        db,
        tenantPath,
        broadcastId,
        broadcast,
        userId,
        entityId,
    });
    if (ensured.updated) {
        message = ensured.message as unknown as Record<string, unknown>;
        broadcast = { ...broadcast, message };
    }

    const recSnap = await recipientsCol.get();

    type RecipientRow = Record<string, unknown> & {
        id: string;
        ref: FirebaseFirestore.DocumentReference;
    };

    const recipients: RecipientRow[] = recSnap.docs
        .map((d): RecipientRow => ({ id: d.id, ref: d.ref, ...(d.data() as Record<string, unknown>) }))
        .filter((r) => (retryFailed ? r.status === "failed" : r.status === "pending" || r.status === "failed"));

    const { sendWhatsAppMessage } = await import("@/lib/sendProviders");

    let broadcastFromPhoneId: string | undefined;
    const broadcastSlot = broadcast.senderSlot as string | undefined;
    try {
        if (broadcast.senderPhoneNumberId) {
            broadcastFromPhoneId = String(broadcast.senderPhoneNumberId);
        }
        if (!broadcastFromPhoneId && broadcastSlot) {
            const slotSnap = await db.doc(`${tenantPath}/whatsapp_numbers/${broadcastSlot}`).get();
            const slotData = slotSnap.data();
            const slotPhoneId = slotData?.phoneNumberId || slotData?.phone_number_id;
            if (slotPhoneId && slotData?.status !== "Disconnected") {
                broadcastFromPhoneId = String(slotPhoneId);
            }
        }
        if (broadcastFromPhoneId) {
            await registerWhatsAppTenantMapping(broadcastFromPhoneId, userId, entityId).catch(() => {});
        }
    } catch (e) {
        console.warn("[Broadcast] Broadcast number resolution skipped:", e);
    }

    const delay = delayForSpeed(broadcast.deliverySpeed as string | undefined);
    let sent = 0;
    let failed = 0;
    let aborted = false;

    try {
        for (let i = 0; i < recipients.length; i++) {
            const r = recipients[i];
            try {
                let text = "";
                let type = "text";
                let template: Record<string, unknown> | undefined;
                let url: string | undefined;
                let filename: string | undefined;

                if (message.kind === "template") {
                    type = "template";
                    const vars: string[] = (message.templateVariables as string[]) || [];
                    const params = vars.map((v: string) => ({
                        type: "text",
                        text: resolveTokens(
                            String((message.templateParamValues as Record<string, string>)?.[v] || ""),
                            r
                        ),
                    }));
                    template = {
                        name: message.templateName,
                        language: { code: message.templateLanguage || "es" },
                        components: params.length ? [{ type: "body", parameters: params }] : [],
                    };
                    const { resolveBroadcastRecipientText } = await import(
                        "@/app/home/[entityId]/cmo/broadcast/list/lib/resolveBroadcastMessageText"
                    );
                    text = resolveBroadcastRecipientText(
                        { id: broadcastId, ...broadcast, message } as any,
                        { ...(r as any), id: String(r.id), status: String(r.status || "pending") } as any
                    );
                } else if (message.kind === "media") {
                    type = String(message.mediaType || "image");
                    url = message.mediaUrl as string | undefined;
                    filename = message.filename as string | undefined;
                    text = resolveTokens(String(message.caption || ""), r);
                } else {
                    type = "text";
                    text = resolveTokens(String(message.text || ""), r);
                }

                const resp: any = await sendWhatsAppMessage(String(r.phone || ""), text, {
                    type: type as any,
                    template,
                    url,
                    filename,
                    userId,
                    entityId,
                    ...(broadcastFromPhoneId ? { fromPhoneNumberId: broadcastFromPhoneId } : {}),
                });

                const messageId = resp?.messages?.[0]?.id || null;
                await r.ref.update({
                    status: "sent",
                    messageId,
                    error: null,
                    sentAt: admin.firestore.FieldValue.serverTimestamp(),
                    sentText: text,
                });

                try {
                    const { isBroadcastTemplatePlaceholder } = await import(
                        "@/app/home/[entityId]/cmo/broadcast/list/lib/resolveBroadcastMessageText"
                    );
                    if (text && !isBroadcastTemplatePlaceholder(text)) {
                        const { logBroadcastMessageToConversation } = await import(
                            "./logBroadcastToConversationAdmin"
                        );
                        await logBroadcastMessageToConversation({
                            db,
                            tenantPath,
                            userId,
                            entityId,
                            phone: String(r.phone || ""),
                            text,
                            broadcastId,
                            broadcastName: broadcast.name as string | undefined,
                            messageId,
                            mediaUrl: url,
                            mediaType: type !== "text" && type !== "template" ? type : undefined,
                            filename,
                        });
                    }
                } catch (logErr) {
                    console.warn("[Broadcast] Conversation log skipped:", logErr);
                }

                const replyKeys = (await import("@/lib/phoneUtils")).phoneReplyIndexKeys(
                    String(r.phone || "")
                );
                if (replyKeys.length > 0) {
                    await Promise.all(
                        replyKeys.map((key) =>
                            db
                                .doc(`${tenantPath}/broadcast_reply_index/${key}`)
                                .set({
                                    broadcastId,
                                    recipientId: r.id,
                                    sentAt: admin.firestore.FieldValue.serverTimestamp(),
                                })
                                .catch(() => {})
                        )
                    );
                }
                if (messageId) {
                    await db
                        .doc(`${tenantPath}/broadcast_msg_index/${messageId}`)
                        .set({ broadcastId, recipientId: r.id })
                        .catch(() => {});
                }
                sent++;
            } catch (err: any) {
                const errMsg =
                    err?.response?.data?.error?.message || err?.message || "Error desconocido";
                await r.ref.update({
                    status: "failed",
                    error: String(errMsg).slice(0, 500),
                });
                failed++;
            }

            if (i % 3 === 0 || i === recipients.length - 1) {
                await broadcastRef.update({
                    sendHeartbeatAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            }

            if (i < recipients.length - 1) await sleep(delay);
        }

        if (broadcast.botId && broadcastFromPhoneId) {
            try {
                const botsSnap = await db.collection(`${tenantPath}/chatbots`).get();
                const targetPhone = String(broadcastFromPhoneId).trim();
                const batch = db.batch();
                for (const botDoc of botsSnap.docs) {
                    const data = botDoc.data() || {};
                    const botPhone = String(data.phoneNumberId || "").trim();
                    if (botDoc.id === broadcast.botId) {
                        batch.set(
                            botDoc.ref,
                            {
                                isActive: true,
                                phoneNumberId: targetPhone,
                                targetPlatforms: ["whatsapp"],
                                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                            },
                            { merge: true }
                        );
                    } else if (
                        (data.isActive === true || data.isActive === "true") &&
                        botPhone === targetPhone
                    ) {
                        batch.set(
                            botDoc.ref,
                            {
                                isActive: false,
                                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                            },
                            { merge: true }
                        );
                    }
                }
                await batch.commit();
            } catch (e) {
                console.error("[Broadcast] Failed to activate bot:", e);
            }
        }
    } catch (loopErr: any) {
        aborted = true;
        console.error("[Broadcast Send] Loop aborted:", loopErr);
    } finally {
        const done = await finalizeBroadcastIfDone({
            db,
            tenantPath,
            broadcastId,
            broadcastRef,
        });

        if (done.finalized) {
            try {
                const { backfillBroadcastConversations } = await import("./backfillBroadcastConversations");
                await backfillBroadcastConversations({ db, userId, entityId, broadcastId });
            } catch (backfillErr) {
                console.warn("[Broadcast] Post-send backfill skipped:", backfillErr);
            }
        }

        const finalStatus = done.status || (done.stats.pending > 0 ? "Sending" : "Completed");
        return {
            success: !aborted || done.finalized,
            status: finalStatus,
            sent: done.stats.sent,
            failed: done.stats.failed,
            total: done.stats.total,
            resumed: resume || retryFailed || stale,
            error: aborted && !done.finalized ? "interrupted" : undefined,
        };
    }
}
