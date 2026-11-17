import axios from "axios";
import { db } from "@/lib/firebase-admin";

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

/** Fetch Meta template BODY text for a broadcast template name. */
export async function fetchMetaTemplateBody(
    userId: string,
    entityId: string,
    templateName?: string
): Promise<string | null> {
    if (!templateName) return null;

    // Solo credenciales de la entidad (sin fallback a variables de entorno de la plataforma)
    let token: string | undefined;
    let wabaId = "";

    const applyCredentials = (source: Record<string, unknown> | undefined) => {
        if (!source) return;
        const resolvedToken =
            source.accessToken ||
            source.token ||
            source.access_token ||
            source.pageAccessToken;
        const resolvedWaba = source.wabaId || source.whatsapp_business_account_id;
        if (resolvedToken && typeof resolvedToken === "string" && resolvedToken.startsWith("EAA")) {
            token = resolvedToken;
        }
        if (resolvedWaba) wabaId = String(resolvedWaba);
    };

    const integrationsRef = db.collection(`users/${userId}/entities/${entityId}/integrations`);
    const [stdSnap, intSnap, allSnap] = await Promise.all([
        integrationsRef.doc("whatsapp").get(),
        integrationsRef.doc("whatsapp_internal").get(),
        integrationsRef.get(),
    ]);

    applyCredentials(stdSnap.data());
    applyCredentials(intSnap.data());

    if (!token || !wabaId) {
        for (const doc of allSnap.docs) {
            if (doc.id === "_init") continue;
            applyCredentials(doc.data());
            if (token && wabaId) break;
        }
    }

    if (!token || !wabaId) return null;

    const response = await axios.get(`https://graph.facebook.com/v21.0/${wabaId}/message_templates`, {
        params: { access_token: token, limit: 100 },
    });

    const templates = (response.data?.data || []).filter(
        (t: { status?: string }) => t.status === "APPROVED"
    );
    const match = findTemplateMatch(templates, templateName);
    const bodyComp = match?.components?.find((c: { type?: string }) => c.type === "BODY");
    return (bodyComp?.text as string | undefined) || null;
}
