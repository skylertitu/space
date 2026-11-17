import type { Edge, Node } from 'reactflow';
import { WHATSAPP_BUTTON_TITLE_MAX } from '@/lib/flowRouting';
import { callGeminiText, extractJsonFromModelText } from './callGeminiJson';
import { layoutFlow } from './layoutFlow';
import {
    detectFlowEditMode,
    mergeFragmentOntoSelection,
    stripForwardFromNode,
    summarizeFlowForPrompt,
    type FlowEditMode,
} from './flowGraphOps';

const ALLOWED_NODE_TYPES = new Set([
    'startNode',
    'textMessageNode',
    'quickReplyNode',
    'captureInputNode',
    'endNode',
]);

export type GeneratedFlow = {
    nodes: Node[];
    edges: Edge[];
};

export type GenerateFlowOptions = {
    apiKey: string;
    script: string;
    mode?: FlowEditMode;
    currentNodes?: Node[];
    currentEdges?: Edge[];
    selectedNodeId?: string | null;
    selectedSourceHandle?: string | null;
};

function slugPayload(title: string, index: number): string {
    const base = title
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 24);
    return `BTN_${index}_${base || 'OPT'}`;
}

function normalizeButtons(raw: unknown): Array<{ id: string; title: string; payload: string }> {
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 3).map((b, i) => {
        if (typeof b === 'string') {
            const title = b.trim().slice(0, WHATSAPP_BUTTON_TITLE_MAX);
            const id = slugPayload(title, i);
            return { id, title, payload: id };
        }
        const obj = b as Record<string, unknown>;
        const title = String(obj.title || obj.label || `Opción ${i + 1}`)
            .trim()
            .slice(0, WHATSAPP_BUTTON_TITLE_MAX);
        const id = String(obj.id || obj.payload || slugPayload(title, i)).trim();
        const payload = String(obj.payload || id).trim();
        return { id, title, payload };
    });
}

const NODE_RULES = `TIPOS DE NODO PERMITIDOS:
- startNode: inicio (solo en modo full, exactamente uno, id "1")
- textMessageNode: mensaje de texto → data.content (string)
- quickReplyNode: botones (máx 3) → data.bodyText + data.buttons[{id,title,payload}]
- captureInputNode: capturar respuesta → data.variableName + data.prompt
- endNode: fin del flujo

REGLAS DE EDGES:
- Cada edge: { "id", "source", "target", "type": "custom" }
- Nodos de un solo camino: edge sin sourceHandle
- quickReplyNode: un edge por botón con sourceHandle = button.id exacto
- Español natural para mensajes`;

function buildFullPrompt(script: string): string {
    return `Eres un generador de flujos para chatbots de WhatsApp en Roosevelt.
Convierte el guion del usuario en un JSON válido con nodos React Flow y conexiones ejecutables.

${NODE_RULES}
- El flujo debe ser conexo desde startNode "1"
- Usa ids cortos: "1", "n2", "n3", ...

GUION:
"""
${script.trim()}
"""

Responde SOLO JSON:
{
  "nodes": [
    { "id": "1", "type": "startNode", "data": { "label": "Inicio" } },
    { "id": "n2", "type": "textMessageNode", "data": { "label": "Saludo", "content": "..." } }
  ],
  "edges": [
    { "id": "e1", "source": "1", "target": "n2", "type": "custom" }
  ]
}`;
}

function buildFragmentPrompt(params: {
    script: string;
    mode: 'extend' | 'replace_forward';
    selectedNode: { id: string; type?: string; label?: string; data?: Record<string, unknown> };
    flowSummary: ReturnType<typeof summarizeFlowForPrompt>;
}): string {
    const modeHint =
        params.mode === 'replace_forward'
            ? `MODO: replace_forward
Se eliminaron los nodos posteriores al seleccionado. Genera SOLO los nodos NUEVOS que reemplazan esa rama.`
            : `MODO: extend
Conserva el flujo existente. Genera SOLO nodos NUEVOS para agregar DESPUÉS del nodo seleccionado.`;

    return `Eres un editor de flujos para chatbots WhatsApp en Roosevelt.

${modeHint}

NODO SELECCIONADO (ancla):
${JSON.stringify(params.selectedNode, null, 2)}

FLUJO ACTUAL (resumen exacto):
${JSON.stringify(params.flowSummary, null, 2)}

${NODE_RULES}

REGLAS DEL FRAGMENTO:
- NO incluyas startNode
- NO repitas nodos que ya existen en el flujo
- Usa ids nuevos cortos: "n_new1", "n_new2", ...
- Para conectar desde el nodo seleccionado usa source: "__SELECTED__"
- Si el seleccionado es quickReply y el usuario menciona un botón, usa sourceHandle = id de ese botón
- Si no especifica botón, conecta sin sourceHandle (o al primer botón si aplica)

INSTRUCCIÓN DEL USUARIO:
"""
${params.script.trim()}
"""

Responde SOLO JSON:
{
  "nodes": [
    { "id": "n_new1", "type": "textMessageNode", "data": { "label": "...", "content": "..." } }
  ],
  "edges": [
    { "id": "e_new1", "source": "__SELECTED__", "target": "n_new1", "type": "custom" }
  ]
}`;
}

export function normalizeGeneratedFlow(raw: unknown, options?: { allowStart?: boolean }): GeneratedFlow {
    const allowStart = options?.allowStart !== false;
    const obj = raw as { nodes?: unknown[]; edges?: unknown[] };
    const rawNodes = Array.isArray(obj?.nodes) ? obj.nodes : [];
    const rawEdges = Array.isArray(obj?.edges) ? obj.edges : [];

    const nodes: Node[] = [];

    if (allowStart) {
        const hasStart = rawNodes.some((n) => {
            const node = n as { type?: string; id?: string };
            return node.type === 'startNode' || node.id === '1';
        });
        if (!hasStart) {
            nodes.push({
                id: '1',
                type: 'startNode',
                position: { x: 0, y: 0 },
                data: { label: 'Inicio' },
            });
        }
    }

    for (const item of rawNodes) {
        const n = item as { id?: string; type?: string; data?: Record<string, unknown> };
        let type = String(n.type || '').trim();
        if (!ALLOWED_NODE_TYPES.has(type)) continue;
        if (!allowStart && type === 'startNode') continue;

        const id = type === 'startNode' ? '1' : String(n.id || `n_${nodes.length + 1}`).trim();
        const data = { ...(n.data || {}) };

        if (type === 'textMessageNode') {
            data.label = String(data.label || 'Mensaje');
            data.content = String(data.content || data.text || '').trim();
        }

        if (type === 'quickReplyNode') {
            data.label = String(data.label || 'Opciones');
            data.bodyText = String(data.bodyText || data.text || data.content || '').trim();
            data.buttons = normalizeButtons(data.buttons);
        }

        if (type === 'captureInputNode') {
            data.label = String(data.label || 'Capturar');
            data.variableName = String(data.variableName || data.variable || `var_${id}`).replace(
                /[^\w]/g,
                '_'
            );
            data.prompt = String(
                data.prompt || data.question || data.content || '¿Cuál es tu respuesta?'
            ).trim();
        }

        if (type === 'endNode') data.label = String(data.label || 'Fin');
        if (type === 'startNode') data.label = String(data.label || 'Inicio');

        if (nodes.some((existing) => existing.id === id)) continue;

        nodes.push({
            id,
            type,
            position: { x: 0, y: 0 },
            data,
        });
    }

    if (allowStart && !nodes.some((n) => n.id === '1' || n.type === 'startNode')) {
        nodes.unshift({
            id: '1',
            type: 'startNode',
            position: { x: 0, y: 0 },
            data: { label: 'Inicio' },
        });
    }

    const nodeIds = new Set(nodes.map((n) => n.id));
    // Allow placeholder for incremental merge
    nodeIds.add('__SELECTED__');
    nodeIds.add('SELECTED');

    const edges: Edge[] = [];

    for (const item of rawEdges) {
        const e = item as {
            id?: string;
            source?: string;
            target?: string;
            sourceHandle?: string | null;
            type?: string;
        };
        let source = String(e.source || '').trim();
        let target = String(e.target || '').trim();
        if (source === 'SELECTED') source = '__SELECTED__';
        if (target === 'SELECTED') target = '__SELECTED__';
        if (!source || !target || !nodeIds.has(source) || !nodeIds.has(target)) continue;

        edges.push({
            id: String(e.id || `e_${source}_${e.sourceHandle || 'default'}_${target}`),
            source,
            target,
            sourceHandle: e.sourceHandle ?? undefined,
            type: 'custom',
        });
    }

    for (const node of nodes) {
        if (node.type !== 'quickReplyNode') continue;
        node.data = { ...node.data, buttons: normalizeButtons(node.data?.buttons) };
    }

    return { nodes, edges };
}

async function callModel(prompt: string, apiKey: string) {
    const rawText = await callGeminiText(prompt, apiKey, {
        timeoutMs: 60_000,
        temperature: 0.25,
        maxOutputTokens: 8192,
    });
    return extractJsonFromModelText(rawText);
}

export async function generateFlowFromText(options: GenerateFlowOptions): Promise<{
    flow: GeneratedFlow;
    mode: FlowEditMode;
}> {
    const {
        apiKey,
        script,
        currentNodes = [],
        currentEdges = [],
        selectedNodeId,
        selectedSourceHandle,
    } = options;

    const hasSelection = Boolean(selectedNodeId && currentNodes.some((n) => n.id === selectedNodeId));
    const mode = options.mode || detectFlowEditMode(script, hasSelection);

    if (mode === 'full' || !hasSelection || !selectedNodeId) {
        const parsed = await callModel(buildFullPrompt(script), apiKey);
        const normalized = normalizeGeneratedFlow(parsed, { allowStart: true });
        return {
            flow: layoutFlow(normalized.nodes, normalized.edges, 'LR'),
            mode: 'full',
        };
    }

    const selected = currentNodes.find((n) => n.id === selectedNodeId)!;
    let baseNodes = currentNodes;
    let baseEdges = currentEdges;

    if (mode === 'replace_forward') {
        const stripped = stripForwardFromNode(currentNodes, currentEdges, selectedNodeId);
        baseNodes = stripped.nodes;
        baseEdges = stripped.edges;
    }

    const flowSummary = summarizeFlowForPrompt(baseNodes, baseEdges);
    const parsed = await callModel(
        buildFragmentPrompt({
            script,
            mode: mode === 'replace_forward' ? 'replace_forward' : 'extend',
            selectedNode: {
                id: selected.id,
                type: selected.type,
                label: selected.data?.label,
                data: {
                    content: selected.data?.content,
                    bodyText: selected.data?.bodyText,
                    buttons: selected.data?.buttons,
                    variableName: selected.data?.variableName,
                },
            },
            flowSummary,
        }),
        apiKey
    );

    const fragment = normalizeGeneratedFlow(parsed, { allowStart: false });
    if (!fragment.nodes.length) {
        throw new Error('La IA no generó nodos nuevos. Reformula la instrucción.');
    }

    const merged = mergeFragmentOntoSelection(
        baseNodes,
        baseEdges,
        selectedNodeId,
        fragment.nodes,
        fragment.edges,
        selectedSourceHandle
    );

    return {
        flow: layoutFlow(merged.nodes, merged.edges, 'LR'),
        mode,
    };
}
