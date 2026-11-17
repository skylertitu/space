import type { Edge, Node, Position } from 'reactflow';
import dagre from 'dagre';

const NODE_WIDTH = 320;
const NODE_HEIGHT = 160;

export function layoutFlow(nodes: Node[], edges: Edge[], direction: 'LR' | 'TB' = 'LR') {
    if (!nodes.length) return { nodes, edges };

    const graph = new dagre.graphlib.Graph();
    graph.setDefaultEdgeLabel(() => ({}));
    graph.setGraph({ rankdir: direction, ranksep: 100, nodesep: 80 });

    nodes.forEach((node) => {
        graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    });

    edges.forEach((edge) => {
        graph.setEdge(edge.source, edge.target);
    });

    dagre.layout(graph);

    const isHorizontal = direction === 'LR';
    const layoutedNodes = nodes.map((node) => {
        const pos = graph.node(node.id);
        return {
            ...node,
            targetPosition: (isHorizontal ? 'left' : 'top') as Position,
            sourcePosition: (isHorizontal ? 'right' : 'bottom') as Position,
            position: {
                x: pos.x - NODE_WIDTH / 2,
                y: pos.y - NODE_HEIGHT / 2,
            },
        };
    });

    return { nodes: layoutedNodes, edges };
}
