export interface BotFlowNode {
    id: string;
    type: string;
    position?: { x?: number; y?: number };
    data?: Record<string, any>;
}

/** Permanent reception column. Messages always land here, even when the bot is off. */
export const SYSTEM_INBOX_GROUP_ID = 'default_inbox';
export const SYSTEM_INBOX_NAME = 'Recepción';

/** Base fields for the permanent reception column in `kanban-groups`. */
export const SYSTEM_INBOX_GROUP_FIELDS = {
    name: SYSTEM_INBOX_NAME,
    isInbox: true,
    system: true,
    autoManaged: false,
    boardType: 'inbox',
    order: -1,
    color: 'bg-[#161616]',
} as const;

const TYPE_LABELS: Record<string, string> = {
    startNode: 'Inicio',
    endNode: 'Fin',
    textMessageNode: 'Mensaje',
    mediaMessageNode: 'Multimedia',
    quickReplyNode: 'Respuesta rápida',
    listMessageNode: 'Lista',
    captureInputNode: 'Capturar entrada',
    conditionNode: 'Condición',
    delayNode: 'Espera',
    humanHandoffNode: 'Agente humano',
    generativeAINode: 'SI',
    setVariableNode: 'Variable',
    webhookNode: 'Webhook',
    locationNode: 'Ubicación',
    templateNode: 'Plantilla',
};

export function getBotNodeTypeLabel(nodeType?: string | null): string {
    if (!nodeType) return 'Nodo';
    return TYPE_LABELS[nodeType] || nodeType.replace(/Node$/, '').replace(/([A-Z])/g, ' $1').trim();
}

export interface KanbanNodeDetails {
    typeLabel: string;
    title: string;
    prompt?: string;
    expectedAnswers?: string[];
    notes?: string[];
}

function readNodePrompt(data: Record<string, any>, nodeType: string): string | undefined {
    const candidates = [
        data.content,
        data.text,
        data.body,
        data.bodyText,
        data.caption,
        data.label,
    ];
    if (nodeType === 'endNode') {
        candidates.unshift(data.outcomeLabel);
    }
    const found = candidates.find((v) => typeof v === 'string' && v.trim());
    return found ? String(found).trim() : undefined;
}

function readButtonLabel(button: any): string {
    if (!button) return '';
    if (typeof button === 'string') return button.trim();
    return String(
        button.title ||
        button.text ||
        button.reply?.title ||
        button.label ||
        button.payload ||
        button.id ||
        ''
    ).trim();
}

/** Rich node snapshot for kanban column headers (pregunta + respuestas esperadas). */
export function extractBotNodeDetails(node: BotFlowNode): KanbanNodeDetails {
    const d = node.data || {};
    const typeLabel = getBotNodeTypeLabel(node.type);
    const prompt = readNodePrompt(d, node.type);
    const title =
        (typeof d.label === 'string' && d.label.trim()) ||
        (typeof d.kanbanGroupName === 'string' && d.kanbanGroupName.trim()) ||
        prompt?.slice(0, 48) ||
        typeLabel;

    const details: KanbanNodeDetails = { typeLabel, title };

    if (prompt) details.prompt = prompt;

    const expectedAnswers: string[] = [];
    const notes: string[] = [];

    switch (node.type) {
        case 'quickReplyNode': {
            (d.buttons || []).forEach((button: any) => {
                const label = readButtonLabel(button);
                if (label) expectedAnswers.push(label);
            });
            if (expectedAnswers.length === 0) notes.push('Sin botones configurados');
            break;
        }
        case 'listMessageNode': {
            const sections = d.sections || [];
            sections.forEach((section: any) => {
                (section.rows || []).forEach((row: any) => {
                    const rowTitle = String(row.title || row.text || '').trim();
                    const rowDesc = String(row.description || '').trim();
                    if (rowTitle) expectedAnswers.push(rowDesc ? `${rowTitle} — ${rowDesc}` : rowTitle);
                });
            });
            if (d.buttonText) notes.push(`Botón del menú: ${d.buttonText}`);
            if (expectedAnswers.length === 0) notes.push('Sin opciones en la lista');
            break;
        }
        case 'captureInputNode': {
            if (d.variableName) notes.push(`Variable: ${d.variableName}`);
            if (d.inputType) notes.push(`Tipo de entrada: ${d.inputType}`);
            if (d.validationRegex) notes.push(`Validación: ${d.validationRegex}`);
            if (d.errorMessage) notes.push(`Si falla: ${d.errorMessage}`);
            expectedAnswers.push('El usuario escribe o envía su respuesta');
            break;
        }
        case 'textMessageNode':
            notes.push('El bot envía este mensaje y continúa el flujo');
            break;
        case 'mediaMessageNode': {
            if (d.url) notes.push(`Archivo: ${String(d.url).slice(0, 80)}`);
            notes.push(`Tipo: ${d.type || d.mediaType || 'multimedia'}`);
            break;
        }
        case 'startNode':
        case 'start':
            details.prompt = details.prompt || 'Punto de inicio — el cliente entra al flujo aquí';
            notes.push('Nuevas conversaciones comienzan en esta etapa');
            break;
        case 'endNode':
            if (d.outcome) notes.push(`Resultado: ${d.outcome}`);
            notes.push('El flujo del bot termina en esta etapa');
            break;
        case 'humanHandoffNode':
            notes.push('Se transfiere a un agente humano');
            break;
        case 'conditionNode':
            notes.push('El camino depende de condiciones del flujo');
            break;
        default:
            if (!details.prompt) notes.push('Nodo del flujo del chatbot');
            break;
    }

    if (expectedAnswers.length) details.expectedAnswers = expectedAnswers;
    if (notes.length) details.notes = notes;

    return details;
}

const GROUP_COLORS = [
    'bg-blue-900/40',
    'bg-emerald-900/40',
    'bg-purple-900/40',
    'bg-amber-900/40',
    'bg-cyan-900/40',
    'bg-pink-900/40',
    'bg-indigo-900/40',
    'bg-orange-900/40',
    'bg-teal-900/40',
    'bg-rose-900/40',
];

export function getBotNodeLabel(node: BotFlowNode): string {
    const d = node.data || {};
    if (typeof d.label === 'string' && d.label.trim()) return d.label.trim();
    if (typeof d.kanbanGroupName === 'string' && d.kanbanGroupName.trim()) return d.kanbanGroupName.trim();

    const text = d.content || d.text || d.body || d.bodyText || d.caption || '';
    if (typeof text === 'string' && text.trim()) {
        const clean = text.trim().replace(/\s+/g, ' ');
        return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean;
    }

    if (node.type === 'captureInputNode' && d.variableName) {
        return `Captura: ${d.variableName}`;
    }
    if (node.type === 'endNode') {
        return d.outcomeLabel || d.label || 'Fin de flujo';
    }

    return TYPE_LABELS[node.type] || node.type;
}

/**
 * Column name that reflects the LITERAL node content (the message/prompt the bot
 * actually sends) instead of the friendly label. This makes it obvious which node
 * a kanban column maps to, and lets campaigns target the exact step of the flow.
 */
export function getBotNodeContentName(node: BotFlowNode, maxLength = 60): string {
    const d = node.data || {};
    const truncate = (value: string) => {
        const clean = value.trim().replace(/\s+/g, ' ');
        return clean.length > maxLength ? `${clean.slice(0, maxLength)}…` : clean;
    };

    const content = readNodePrompt(d, node.type);
    if (content) return truncate(content);

    if (node.type === 'startNode' || node.type === 'start') {
        return (typeof d.label === 'string' && d.label.trim()) || 'Inicio';
    }
    if (node.type === 'captureInputNode' && d.variableName) {
        return `Captura: ${d.variableName}`;
    }
    if (node.type === 'endNode') {
        return String(d.outcomeLabel || d.label || 'Fin de flujo').trim();
    }

    if (typeof d.label === 'string' && d.label.trim()) return truncate(d.label);
    return TYPE_LABELS[node.type] || node.type;
}

/** Every flow node gets a kanban column so cards track exact bot position. */
export function getKanbanEligibleNodes(nodes: BotFlowNode[]): BotFlowNode[] {
    return (nodes || []).filter((n) => n?.id && n?.type);
}

export function orderNodesForKanban(nodes: BotFlowNode[], edges: { source: string; target: string }[]): BotFlowNode[] {
    const nodeMap = new Map(nodes.map((n) => [String(n.id), n]));
    const start = nodes.find((n) => n.type === 'startNode' || n.type === 'start');
    const adj = new Map<string, string[]>();

    (edges || []).forEach((edge) => {
        const src = String(edge.source);
        const tgt = String(edge.target);
        if (!adj.has(src)) adj.set(src, []);
        adj.get(src)!.push(tgt);
    });

    const visited = new Set<string>();
    const ordered: BotFlowNode[] = [];
    const queue: string[] = start ? [String(start.id)] : [];

    while (queue.length) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        const node = nodeMap.get(id);
        if (node) ordered.push(node);
        for (const next of adj.get(id) || []) {
            if (!visited.has(next)) queue.push(next);
        }
    }

    const rest = nodes
        .filter((n) => !visited.has(String(n.id)))
        .sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0) || String(a.id).localeCompare(String(b.id)));

    return [...ordered, ...rest];
}

export function getGroupColorForIndex(index: number): string {
    return GROUP_COLORS[index % GROUP_COLORS.length];
}

export function isInboxLikeGroupName(name: string): boolean {
    const lower = (name || '').toLowerCase();
    return (
        lower.includes('inbox') ||
        lower.includes('bandeja') ||
        lower === 'inicio' ||
        lower.includes('entrada') ||
        lower.includes('recepci')
    );
}

/** True if the group is the permanent reception column (bot-independent). */
export function isInboxGroup(group: Record<string, any> | null | undefined): boolean {
    if (!group) return false;
    return (
        group.isInbox === true ||
        group.id === SYSTEM_INBOX_GROUP_ID ||
        group.boardType === 'inbox' ||
        (!group.autoManaged && !group.botNodeId && isInboxLikeGroupName(group.name || ''))
    );
}

/**
 * Header label for a kanban column. Bot columns show the LITERAL node content so it's
 * obvious which step of the flow they represent; the reception column keeps its name.
 * Works from the stored `botNodeDetails` so it updates instantly without a re-sync.
 */
export function getKanbanColumnDisplayName(
    group: Record<string, any> | null | undefined,
    maxLength = 60
): string {
    if (!group) return 'Sin nombre';
    if (isInboxGroup(group)) return group.name || SYSTEM_INBOX_NAME;

    const details = group.botNodeDetails as KanbanNodeDetails | undefined;
    const content = details?.prompt;
    if (content && content.trim()) {
        const clean = content.trim().replace(/\s+/g, ' ');
        return clean.length > maxLength ? `${clean.slice(0, maxLength)}…` : clean;
    }
    return group.name || 'Sin nombre';
}

export function resolveCardBotNodeId(cardData: Record<string, any> | null | undefined): string | null {
    if (!cardData) return null;
    const fromState = cardData.botState?.currentNodeId ?? cardData.chatbotState?.currentNodeId;
    if (fromState) return String(fromState);
    return null;
}

export function resolveCardBotId(cardData: Record<string, any> | null | undefined, fallbackBotId?: string): string | null {
    if (!cardData) return fallbackBotId || null;
    return (
        cardData.botState?.botId ||
        cardData.chatbotState?.botId ||
        cardData.activeBotId ||
        fallbackBotId ||
        null
    );
}
