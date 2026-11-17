'use client';

import React, { useCallback, useMemo, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import ReactFlow, {
    Background,
    BackgroundVariant,
    Controls,
    Node,
    Edge,
    MarkerType,
    useNodesState,
    useEdgesState,
    ReactFlowInstance,
    NodeTypes
} from 'reactflow';
import 'reactflow/dist/style.css';

import { WindowNode } from '@/components/shared/WindowNode';

interface BoardDiagramProps {
    nodeTypes: NodeTypes;
    layers: any[];
    spawnWindow: (layer: any, position: { x: number; y: number }) => void;
}

export const BoardDiagram = ({ nodeTypes, layers, spawnWindow }: BoardDiagramProps) => {
    const router = useRouter();
    const params = useParams();
    const entityId = params.entityId as string;

    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

    const [nodes, setNodes, onNodesChange] = useNodesState([
        {
            id: 'modules-stack',
            type: 'stackNode',
            position: { x: 50, y: 50 },
            data: {
                layers,
                onGoToNucleo: () => router.push(`/home/${entityId}`),
                onLayerClick: (layer: any) => {
                    const isMobile = window.innerWidth < 768;
                    spawnWindow(layer, {
                        x: isMobile ? 20 : 800,
                        y: Math.max(0, (isMobile ? 400 : 100) + (Math.random() * 50 - 25))
                    });
                }
            },
        }
    ]);
    const [edges, setEdges, onEdgesState] = useEdgesState([]);

    return (
        <div ref={reactFlowWrapper} className="w-full h-full">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesState}
                nodeTypes={nodeTypes}
                onInit={setReactFlowInstance}
                fitView
            >
                <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} />
                <Controls />
            </ReactFlow>
        </div>
    );
};
