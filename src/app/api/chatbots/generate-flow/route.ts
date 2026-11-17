import { NextResponse } from 'next/server';
import type { Edge, Node } from 'reactflow';
import { db } from '@/lib/firebase-admin';
import { resolveTenantGeminiKey } from '@/lib/chatbot/resolveTenantGeminiKey';
import { generateFlowFromText } from '@/lib/chatbot/generateFlowFromText';
import type { FlowEditMode } from '@/lib/chatbot/flowGraphOps';
import { guardApi } from '@/lib/apiAuth';
import { requireSuite } from '@/lib/subscriptions/entitlements.server';

export async function POST(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;
    try {
        const body = await req.json();
        const {
            userId,
            entityId,
            script,
            mode,
            currentNodes,
            currentEdges,
            selectedNodeId,
            selectedSourceHandle,
        } = body || {};
        const suiteDenied = await requireSuite(userId, entityId, 'cto');
        if (suiteDenied) return suiteDenied;

        if (!userId || !entityId) {
            return NextResponse.json(
                { error: 'userId y entityId son requeridos.' },
                { status: 400 }
            );
        }

        const text = String(script || '').trim();
        if (text.length < 8) {
            return NextResponse.json(
                { error: 'Describe qué quieres crear (mín. 8 caracteres).' },
                { status: 400 }
            );
        }

        if (text.length > 12_000) {
            return NextResponse.json(
                { error: 'El guion es demasiado largo (máx. 12 000 caracteres).' },
                { status: 400 }
            );
        }

        const geminiKey = await resolveTenantGeminiKey(db, userId, entityId);
        if (!geminiKey) {
            return NextResponse.json(
                {
                    error: 'Gemini no está conectado para esta entidad. Ve a Integraciones → Gemini.',
                    code: 'GEMINI_NOT_CONNECTED',
                },
                { status: 422 }
            );
        }

        const nodes = Array.isArray(currentNodes) ? (currentNodes as Node[]) : [];
        const edges = Array.isArray(currentEdges) ? (currentEdges as Edge[]) : [];

        // Cap payload size for safety
        if (nodes.length > 250) {
            return NextResponse.json(
                { error: 'El flujo actual es demasiado grande para editar con SI.' },
                { status: 400 }
            );
        }

        const result = await generateFlowFromText({
            apiKey: geminiKey,
            script: text,
            mode: mode as FlowEditMode | undefined,
            currentNodes: nodes,
            currentEdges: edges,
            selectedNodeId: selectedNodeId ? String(selectedNodeId) : null,
            selectedSourceHandle: selectedSourceHandle ? String(selectedSourceHandle) : null,
        });

        if (!result.flow.nodes.length) {
            return NextResponse.json(
                { error: 'No se pudo generar un flujo válido. Intenta con un guion más claro.' },
                { status: 422 }
            );
        }

        return NextResponse.json({
            success: true,
            flow: result.flow,
            mode: result.mode,
            nodeCount: result.flow.nodes.length,
            edgeCount: result.flow.edges.length,
        });
    } catch (error: unknown) {
        console.error('[chatbots/generate-flow]', error);
        const message = error instanceof Error ? error.message : 'Error al generar el flujo';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
