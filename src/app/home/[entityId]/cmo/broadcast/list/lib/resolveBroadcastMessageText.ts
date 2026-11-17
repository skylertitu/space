import type { Broadcast, BroadcastMessage, BroadcastRecipient } from "./types";
import { formatBroadcastTemplateLabel } from "./conversationMessageMerge";

export function resolveTokens(input: string, recipient: BroadcastRecipient): string {
    if (!input) return input;
    return input
        .replace(/\{\{\s*Nombre\s*\}\}/gi, recipient.name || "")
        .replace(/\{\{\s*Tel[eé]fono\s*\}\}/gi, recipient.phone || "")
        .replace(/\{\{\s*Pa[ií]s\s*\}\}/gi, recipient.country || "");
}

export function isBroadcastTemplatePlaceholder(text: string | null | undefined): boolean {
    const t = String(text || "").trim();
    if (!t) return false;
    return (
        /^Campaign template:/i.test(t) ||
        /^📢\s*Plantilla de campaña:/i.test(t) ||
        /^Plantilla de campaña:/i.test(t)
    );
}

/** Resolve Meta template BODY text with per-recipient variables. */
export function resolveTemplateBodyForRecipient(
    message: BroadcastMessage,
    recipient: BroadcastRecipient
): string {
    let body = String(message.templateBody || "").trim();
    if (!body) {
        const preview = String(message.messagePreview || "").trim();
        if (preview) {
            return resolveTokens(preview, recipient);
        }
        return formatBroadcastTemplateLabel(message.templateName);
    }

    const vars = message.templateVariables || [];
    vars.forEach((v) => {
        const raw = message.templateParamValues?.[v] || "";
        const replacement = resolveTokens(raw, recipient);
        body = body.split(v).join(replacement);
    });

    return body.trim() || formatBroadcastTemplateLabel(message.templateName);
}

/** The literal text this recipient received from the campaign. */
export function resolveBroadcastRecipientText(
    broadcast: Broadcast | null | undefined,
    recipient: BroadcastRecipient
): string {
    if (!broadcast) return "";
    if (recipient.sentText && !isBroadcastTemplatePlaceholder(recipient.sentText)) {
        return recipient.sentText;
    }

    const message = broadcast.message;
    if (!message) return "";

    if (message.kind === "template") {
        return resolveTemplateBodyForRecipient(message, recipient);
    }
    if (message.kind === "media") {
        return resolveTokens(message.caption || "", recipient);
    }
    return resolveTokens(message.text || "", recipient);
}

/** Replace placeholder broadcast bubbles with the real outbound campaign text. */
export function enrichBroadcastMessagesForRecipient(
    messages: unknown[],
    broadcast: Broadcast,
    recipient: BroadcastRecipient
): unknown[] {
    const resolvedText = resolveBroadcastRecipientText(broadcast, recipient);
    if (!resolvedText || isBroadcastTemplatePlaceholder(resolvedText)) {
        return messages;
    }

    return messages.map((m) => {
        if (!m || typeof m !== "object") return m;
        const msg = m as Record<string, unknown>;
        const meta = msg.metadata as { source?: string } | undefined;
        const isBroadcast =
            meta?.source === "broadcast" || msg.source === "broadcast" || msg.isBroadcast === true;

        const current = String(msg.text || "");
        if (isBroadcastTemplatePlaceholder(current) || (isBroadcast && !current.trim())) {
            return {
                ...msg,
                text: resolvedText,
                source: "broadcast",
                isBroadcast: true,
                metadata: {
                    ...(typeof meta === "object" && meta ? meta : {}),
                    source: "broadcast",
                    broadcastId: broadcast.id,
                },
            };
        }
        return m;
    });
}
