import type { Edge, Node } from 'reactflow';

/** Collect all node ids reachable from `rootId` (excluding root). */
export function collectDescendantIds(rootId: string, edges: Edge[]): Set<string> {
    const outgoing = new Map<string, string[]>();
    for (const e of edges) {
        const list = outgoing.get(e.source) || [];
        list.push(e.target);
        outgoing.set(e.source, list);
    }

    const visited = new Set<string>();
    const stack = [...(outgoing.get(rootId) || [])];

    while (stack.length) {
        const id = stack.pop()!;
        if (visited.has(id) || id === rootId) continue;
        visited.add(id);
        for (const next of outgoing.get(id) || []) {
            if (!visited.has(next)) stack.push(next);
        }
    }

    return visited;
}

/** Keep selected + everything NOT in the forward subtree. */
export function stripForwardFromNode(
    nodes: Node[],
    edges: Edge[],
    selectedNodeId: string
): { nodes: Node[]; edges: Edge[] } {
    const toRemove = collectDescendantIds(selectedNodeId, edges);
    const keepNodes = nodes.filter((n) => !toRemove.has(n.id));
    const keepIds = new Set(keepNodes.map((n) => n.id));

    const keepEdges = edges.filter((e) => {
        if (!keepIds.has(e.source) || !keepIds.has(e.target)) return false;
        // Drop edges leaving selected toward removed descendants
        if (e.source === selectedNodeId && toRemove.has(e.target)) return false;
        return true;
    });

    return { nodes: keepNodes, edges: keepEdges };
}

/** Compact JSON-safe snapshot for the model (no positions/noise). */
export function summarizeFlowForPrompt(nodes: Node[], edges: Edge[], maxNodes = 80) {
    const slimNodes = nodes.slice(0, maxNodes).map((n) => ({
        id: n.id,
        type: n.type,
        label: n.data?.label || '',
        content: n.data?.content || n.data?.bodyText || n.data?.prompt || '',
        buttons: Array.isArray(n.data?.buttons)
            ? n.data.buttons.map((b: { id?: string; title?: string; payload?: string }) => ({
                  id: b.id || b.payload,
                  title: b.title,
              }))
            : undefined,
        variableName: n.data?.variableName,
    }));

    const slimEdges = edges
        .filter((e) => slimNodes.some((n) => n.id === e.source) && slimNodes.some((n) => n.id === e.target))
        .map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle || null,
        }));

    return { nodes: slimNodes, edges: slimEdges, truncated: nodes.length > maxNodes };
}

export function uniqueFragmentIds(
    fragmentNodes: Node[],
    fragmentEdges: Edge[],
    existingIds: Set<string>
): { nodes: Node[]; edges: Edge[]; idMap: Map<string, string> } {
    const idMap = new Map<string, string>();
    const stamp = Date.now().toString(36);

    for (const n of fragmentNodes) {
        if (n.type === 'startNode') continue;
        let next = n.id;
        if (!next || existingIds.has(next) || idMap.has(next)) {
            next = `ai_${stamp}_${idMap.size + 1}`;
        }
        while (existingIds.has(next) || [...idMap.values()].includes(next)) {
            next = `${next}_x`;
        }
        idMap.set(n.id, next);
    }

    const nodes = fragmentNodes
        .filter((n) => n.type !== 'startNode')
        .map((n) => ({
            ...n,
            id: idMap.get(n.id) || n.id,
            position: n.position || { x: 0, y: 0 },
        }));

    const edges = fragmentEdges
        .map((e) => {
            const source =
                e.source === '__SELECTED__' || e.source === 'SELECTED'
                    ? '__SELECTED__'
                    : idMap.get(e.source) || e.source;
            const target =
                e.target === '__SELECTED__' || e.target === 'SELECTED'
                    ? '__SELECTED__'
                    : idMap.get(e.target) || e.target;
            return {
                ...e,
                id: `e_${source}_${e.sourceHandle || 'd'}_${target}_${stamp}`,
                source,
                target,
                type: 'custom' as const,
            };
        })
        .filter((e) => e.source && e.target);

    return { nodes, edges, idMap };
}

export function mergeFragmentOntoSelection(
    baseNodes: Node[],
    baseEdges: Edge[],
    selectedNodeId: string,
    fragmentNodes: Node[],
    fragmentEdges: Edge[],
    attachHandle?: string | null
): { nodes: Node[]; edges: Edge[] } {
    const existingIds = new Set(baseNodes.map((n) => n.id));
    const { nodes: newNodes, edges: remappedEdges } = uniqueFragmentIds(
        fragmentNodes,
        fragmentEdges,
        existingIds
    );

    const finalEdges: Edge[] = [...baseEdges];
    let attached = false;

    for (const e of remappedEdges) {
        if (e.source === '__SELECTED__') {
            finalEdges.push({
                ...e,
                source: selectedNodeId,
                sourceHandle: e.sourceHandle || attachHandle || undefined,
                type: 'custom',
            });
            attached = true;
        } else if (e.target === '__SELECTED__') {
            // Ignore inbound to selected for forward generation
            continue;
        } else {
            finalEdges.push({ ...e, type: 'custom' });
        }
    }

    if (!attached && newNodes.length > 0) {
        finalEdges.push({
            id: `e_${selectedNodeId}_to_${newNodes[0].id}`,
            source: selectedNodeId,
            target: newNodes[0].id,
            sourceHandle: attachHandle || undefined,
            type: 'custom',
        });
    }

    return {
        nodes: [...baseNodes, ...newNodes],
        edges: finalEdges,
    };
}

export type FlowEditMode = 'full' | 'extend' | 'replace_forward';

export function detectFlowEditMode(
    script: string,
    hasSelection: boolean
): FlowEditMode {
    if (!hasSelection) return 'full';

    const s = script.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    if (
        /\b(elimina|borra|reemplaza|quita|sustituye|rehacer)\b/.test(s) &&
        /\b(siguiente|adelante|despues|desde aqui|desde el|rama|nodos)\b/.test(s)
    ) {
        return 'replace_forward';
    }

    if (/\b(reemplaza todo lo siguiente|borra lo siguiente|elimina lo siguiente)\b/.test(s)) {
        return 'replace_forward';
    }

    // Default with selection: extend
    return 'extend';
}
