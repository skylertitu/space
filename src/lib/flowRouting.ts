/**
 * Shared flow routing utilities for chatbot canvas edges and runtime execution.
 * Keeps React Flow sourceHandle IDs aligned with WhatsApp interactive reply IDs.
 */

export const WHATSAPP_REPLY_ID_MAX = 256;
export const WHATSAPP_BUTTON_TITLE_MAX = 20;

export function normalizeFlowInput(text: string): string {
    return (text || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/** Canonical handle ID used in React Flow edges and for routing. */
export function getButtonRouteId(button: any): string {
    if (!button) return '';
    if (typeof button === 'string') return button.trim();
    return String(button.payload || button.id || button.title || '').trim();
}

/** ID sent to WhatsApp Cloud API as button_reply / list_reply id. */
export function getWhatsAppReplyId(button: any): string {
    if (!button) return '';
    if (typeof button === 'string') return button.trim().substring(0, WHATSAPP_REPLY_ID_MAX);
    if (button.payload?.trim()) {
        return button.payload.trim().substring(0, WHATSAPP_REPLY_ID_MAX);
    }
    return getButtonRouteId(button).substring(0, WHATSAPP_REPLY_ID_MAX);
}

export function inputsMatch(userText: string, candidate: string): boolean {
    if (!candidate || userText === undefined || userText === null) return false;

    const u = String(userText).trim();
    const c = String(candidate).trim();
    if (!u || !c) return false;

    if (u === c) return true;
    if (normalizeFlowInput(u) === normalizeFlowInput(c)) return true;

    const uLow = u.toLowerCase();
    const cLow = c.toLowerCase();

    // WhatsApp may echo a truncated version of a long UUID id.
    if (uLow.length >= 8 && (cLow.startsWith(uLow) || uLow.startsWith(cLow))) return true;

    return false;
}

export function getButtonMatchCandidates(button: any): string[] {
    if (!button) return [];
    if (typeof button === 'string') return [button];

    const raw = [
        button.payload,
        button.id,
        button.title,
        getButtonRouteId(button),
        getWhatsAppReplyId(button),
    ]
        .filter((v) => v !== undefined && v !== null && String(v).trim() !== '')
        .map(String);

    return [...new Set(raw)];
}

export function buttonsReferToSameOption(a: any, b: any): boolean {
    const aCandidates = getButtonMatchCandidates(a);
    const bCandidates = getButtonMatchCandidates(b);
    return aCandidates.some((ac) => bCandidates.some((bc) => inputsMatch(ac, bc)));
}

export function getOutgoingEdges(edges: any[], sourceNodeId: string): any[] {
    return (edges || []).filter((e) => String(e.source) === String(sourceNodeId));
}

/** Default next edge for single-output nodes (text, media, capture success, etc.). */
export function resolveDefaultNextEdge(edges: any[], sourceNodeId: string): any | null {
    const outgoing = getOutgoingEdges(edges, sourceNodeId);
    if (!outgoing.length) return null;

    const neutral =
        outgoing.find((e) => !e.sourceHandle) ||
        outgoing.find((e) => String(e.sourceHandle).toLowerCase() === 'success') ||
        outgoing.find((e) => !String(e.sourceHandle).toLowerCase().includes('fail'));

    return neutral || outgoing[0];
}

export function matchQuickReplyButton(buttons: any[], userText: string): any | null {
    if (!buttons?.length || !String(userText || '').trim()) return null;

    return (
        buttons.find((btn) =>
            getButtonMatchCandidates(btn).some((candidate) => inputsMatch(userText, candidate))
        ) || null
    );
}

export function matchListRow(
    sections: any[],
    userText: string
): { row: any; handleCandidates: string[] } | null {
    for (const sec of sections || []) {
        const rows = sec.rows || sec.options || [];
        for (const row of rows) {
            const rowObj =
                typeof row === 'object' && row !== null ? row : { id: String(row), title: String(row) };
            const candidates = getButtonMatchCandidates(rowObj);
            if (candidates.some((c) => inputsMatch(userText, c))) {
                return { row: rowObj, handleCandidates: candidates };
            }
        }
    }
    return null;
}

export function edgeHandleMatches(
    sourceHandle: string | null | undefined,
    candidates: string[]
): boolean {
    const handle = String(sourceHandle || '').trim();
    if (!handle) return false;
    return candidates.some((c) => inputsMatch(handle, c));
}

export function resolveEdgeForSelection(
    edges: any[],
    sourceNodeId: string,
    handleCandidates: string[]
): any | null {
    const outgoing = getOutgoingEdges(edges, sourceNodeId);
    if (!outgoing.length || !handleCandidates.length) return null;

    for (const candidate of handleCandidates) {
        const exact = outgoing.find((e) => String(e.sourceHandle || '') === candidate);
        if (exact) return exact;
    }

    for (const edge of outgoing) {
        if (edgeHandleMatches(edge.sourceHandle, handleCandidates)) return edge;
    }

    return null;
}

/** Positional / legacy fallback when sourceHandle ids drift from button payloads. */
export function resolveEdgeByButtonIndex(
    edges: any[],
    sourceNodeId: string,
    buttons: any[],
    matchedButton: any
): any | null {
    const outgoing = getOutgoingEdges(edges, sourceNodeId);
    if (!outgoing.length || !matchedButton) return null;

    const btnIndex = buttons.findIndex((btn) => buttonsReferToSameOption(btn, matchedButton));
    if (btnIndex < 0) return null;

    const buttonCandidates = getButtonMatchCandidates(buttons[btnIndex]);
    const byHandle = outgoing.find((e) => edgeHandleMatches(e.sourceHandle, buttonCandidates));
    if (byHandle) return byHandle;

    if (outgoing.length === buttons.length) {
        return outgoing[btnIndex] || null;
    }

    if (outgoing.length === 1) {
        return outgoing[0];
    }

    return null;
}

export type QuickReplyResolution = {
    edge: any | null;
    matchedButton: any | null;
    invalid: boolean;
    missingEdge: boolean;
};

export function resolveQuickReplyEdge(
    edges: any[],
    sourceNodeId: string,
    buttons: any[],
    userText: string
): QuickReplyResolution {
    const sanitized = (buttons || []).filter(
        (b) => b && (typeof b === 'string' || b.title?.trim() || b.id || b.payload)
    );

    if (!sanitized.length) {
        const defaultEdge = resolveDefaultNextEdge(edges, sourceNodeId);
        return { edge: defaultEdge, matchedButton: null, invalid: false, missingEdge: false };
    }

    const matchedButton = matchQuickReplyButton(sanitized, userText);
    if (!matchedButton) {
        return { edge: null, matchedButton: null, invalid: true, missingEdge: false };
    }

    const candidates = getButtonMatchCandidates(matchedButton);
    const edge =
        resolveEdgeForSelection(edges, sourceNodeId, candidates) ||
        resolveEdgeByButtonIndex(edges, sourceNodeId, sanitized, matchedButton);

    return {
        edge,
        matchedButton,
        invalid: false,
        missingEdge: !edge,
    };
}

export function resolveListMessageEdge(
    edges: any[],
    sourceNodeId: string,
    sections: any[],
    userText: string
): QuickReplyResolution {
    const sanitized = sections || [];
    if (!sanitized.length) {
        const defaultEdge = resolveDefaultNextEdge(edges, sourceNodeId);
        return { edge: defaultEdge, matchedButton: null, invalid: false, missingEdge: false };
    }

    const match = matchListRow(sanitized, userText);
    if (!match) {
        return { edge: null, matchedButton: null, invalid: true, missingEdge: false };
    }

    const allRows = sanitized.flatMap((s) => (s.rows || s.options || []).map((r: any) =>
        typeof r === 'object' && r !== null ? r : { id: String(r), title: String(r) }
    ));

    const edge =
        resolveEdgeForSelection(edges, sourceNodeId, match.handleCandidates) ||
        resolveEdgeByButtonIndex(edges, sourceNodeId, allRows, match.row);

    return {
        edge,
        matchedButton: match.row,
        invalid: false,
        missingEdge: !edge,
    };
}

export function buildWhatsAppQuickReplyButtons(buttons: any[]) {
    return (buttons || []).slice(0, 3).map((b: any) => {
        const base = typeof b === 'string' ? { title: b, payload: b } : b;
        const title = String(base.title || base).substring(0, WHATSAPP_BUTTON_TITLE_MAX);
        const id = getWhatsAppReplyId(base);
        return { type: 'reply', reply: { id, title } };
    });
}

export function buildWhatsAppListSections(sections: any[]) {
    return (sections || []).map((s: any) => ({
        title: s.title || 'Opciones',
        rows: (s.rows || s.options || []).map((r: any) => {
            const row = typeof r === 'object' && r !== null ? r : { title: String(r), id: String(r) };
            const cleanRow: any = {
                id: getWhatsAppReplyId(row).substring(0, 200),
                title: String(row.title || row).substring(0, 24),
            };
            if (row.description) {
                cleanRow.description = String(row.description).substring(0, 72);
            }
            return cleanRow;
        }),
    }));
}

export function sanitizeFlowButtons(buttons: any[]): any[] {
    if (!Array.isArray(buttons)) return [];
    return buttons.filter(
        (b) => b && (typeof b === 'string' || (b.title && b.title !== 'undefined' && String(b.title).trim() !== ''))
    );
}
