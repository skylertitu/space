'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Edge,
  Node,
  OnConnect,
  OnEdgesChange,
  OnNodesChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { ArrowLeft, Check, Cloud, Instagram, Loader2, Save, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import ChatbotCanvas from '@/components/ChatbotCanvas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { db } from '@/lib/firebase';
import { BotChannelConfig } from '@/lib/automation/channels';
import { useAutomationEntity } from '@/lib/automation/useAutomationEntity';
import { normalizeTargetPlatforms } from '@/lib/automation/botActivation';

interface ChannelBotEditorPageProps {
  channel: BotChannelConfig;
  botId: string;
}

export function ChannelBotEditorPage({ channel, botId }: ChannelBotEditorPageProps) {
  const router = useRouter();
  const { currentUser, entityId, authLoading, isReady } = useAutomationEntity();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [chatbotName, setChatbotName] = useState('Cargando...');
  const [targetPlatforms, setTargetPlatforms] = useState<string[]>([channel.enginePlatform]);
  const [humanizeTone, setHumanizeTone] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isLoading, setIsLoading] = useState(true);
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const Icon = channel.Icon;
  const listHref = channel.listHref(entityId || '');

  const botDocPath = () =>
    doc(db, 'users', currentUser!.uid, 'entities', entityId, channel.collection, botId);

  const saveData = useCallback(
    async (currentNodes: Node[], currentEdges: Edge[], name: string) => {
      if (!botId || !currentUser || !entityId) return;
      setSaveStatus('saving');
      try {
        const edgesToSave = currentEdges.map(({ selected, ...edge }) => ({ ...edge, type: 'custom' }));
        await setDoc(
          botDocPath(),
          {
            name,
            channel: channel.slug,
            botType: channel.botType,
            targetPlatforms: [channel.enginePlatform],
            flow: { nodes: currentNodes, edges: edgesToSave },
            updatedAt: new Date(),
          },
          { merge: true }
        );
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } catch (error) {
        console.error('Error al guardar:', error);
        setSaveStatus('error');
        toast.error('Error al guardar el flujo.');
      }
    },
    [botId, currentUser, entityId, channel]
  );

  useEffect(() => {
    if (authLoading) return;

    const load = async () => {
      if (!botId || !currentUser || !entityId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const snap = await getDoc(botDocPath());
        if (snap.exists()) {
          const data = snap.data();
          setChatbotName(data.name || `Bot ${channel.shortTitle}`);
          setTargetPlatforms(normalizeTargetPlatforms(data.targetPlatforms) || [channel.enginePlatform]);
          setHumanizeTone(!!data.humanizeTone);
          const flowData = data.flow || {};
          setNodes(Array.isArray(flowData.nodes) ? flowData.nodes : []);
          setEdges(
            (flowData.edges || []).map(({ animated, style, ...edge }: Edge & { animated?: boolean; style?: object }) => ({
              ...edge,
              type: 'custom',
            }))
          );
        } else {
          setChatbotName(`Nuevo bot ${channel.shortTitle}`);
          const startNodes: Node[] = [
            { id: '1', type: 'startNode', position: { x: 250, y: 5 }, data: { label: 'Inicio' } },
          ];
          setNodes(startNodes);
          setEdges([]);
          await saveData(startNodes, [], `Nuevo bot ${channel.shortTitle}`);
        }
      } catch (err) {
        console.error('[ChannelBotEditorPage] load error:', err);
        toast.error('No se pudo cargar el bot.');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [botId, currentUser, entityId, authLoading, channel.slug, channel.collection]);

  useEffect(() => {
    if (!botId || !currentUser || !entityId) return;
    const unsubscribe = onSnapshot(botDocPath(), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setTargetPlatforms(normalizeTargetPlatforms(data.targetPlatforms) || [channel.enginePlatform]);
      if (typeof data.humanizeTone === 'boolean') {
        setHumanizeTone(data.humanizeTone);
      }
      if (typeof data.name === 'string') {
        setChatbotName((prev) => (prev === data.name ? prev : data.name));
      }
    });
    return () => unsubscribe();
  }, [botId, currentUser, entityId, channel.collection]);

  useEffect(() => {
    if (isLoading || !isReady) return;
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => {
      if (nodes.length > 0 || edges.length > 0) saveData(nodes, edges, chatbotName);
    }, 1500);
    return () => {
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    };
  }, [nodes, edges, chatbotName, saveData, isLoading, isReady]);

  const onNodesChange: OnNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange: OnEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onConnect: OnConnect = useCallback(
    (connection) => setEdges((eds) => addEdge({ ...connection, type: 'custom' }, eds)),
    []
  );

  const handleToggleHumanizeTone = async (checked: boolean) => {
    if (!botId || !currentUser || !entityId) return;
    setHumanizeTone(checked);
    try {
      await setDoc(
        botDocPath(),
        { humanizeTone: checked, humanizeStyle: 'warm', updatedAt: new Date() },
        { merge: true }
      );
      toast.success(checked ? 'Humanizar conversación activado' : 'Humanizar conversación desactivado');
    } catch (error) {
      console.error('Error updating humanizeTone:', error);
      setHumanizeTone(!checked);
      toast.error('No se pudo guardar Humanizar.');
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-neutral-900 text-white gap-3">
        <Loader2 className="w-12 h-12 animate-spin text-neutral-500" />
        <p className="text-[10px] uppercase tracking-widest text-neutral-500">
          {authLoading ? 'Validando sesión…' : 'Cargando editor…'}
        </p>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-neutral-900 text-white gap-4 p-6">
        <p className="text-sm text-neutral-400">No se pudo abrir el editor.</p>
        <Button onClick={() => router.push(listHref)}>Volver a bots</Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-neutral-900 text-white">
      <div className="h-14 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between px-4 z-20 shrink-0">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(listHref)}
            className="text-neutral-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className={`p-1.5 rounded-lg ${channel.activeBg}`}>
            <Icon className={`w-4 h-4 ${channel.iconColor}`} />
          </div>
          <Input
            value={chatbotName}
            onChange={(e) => setChatbotName(e.target.value)}
            className="bg-transparent border-transparent text-lg font-medium text-white w-[280px] h-9"
          />
          <span className="text-[10px] text-neutral-500 uppercase tracking-widest hidden sm:inline">
            {channel.shortTitle}
          </span>
          {channel.enginePlatform === 'instagram' && (
            <span className="hidden md:flex items-center gap-1 text-[9px] text-pink-400/80 uppercase tracking-wider">
              <Instagram className="w-3 h-3" /> Solo DMs · sin botones nativos
            </span>
          )}
          {channel.enginePlatform === 'instagram_comments' && (
            <span className="hidden md:flex items-center gap-1 text-[9px] text-orange-400/80 uppercase tracking-wider">
              <Instagram className="w-3 h-3" /> Respuestas públicas a comentarios
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div
            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-full border ${
              humanizeTone ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-white/5 border-white/5'
            }`}
            title="La SI solo reformula el tono. El flujo decide el camino."
          >
            <Sparkles className={`w-3.5 h-3.5 ${humanizeTone ? 'text-emerald-400' : 'text-neutral-500'}`} />
            <span className={`text-[10px] uppercase tracking-tight ${humanizeTone ? 'text-emerald-300' : 'text-neutral-500'}`}>
              Humanizar
            </span>
            <Switch
              checked={humanizeTone}
              onCheckedChange={handleToggleHumanizeTone}
              className="scale-75 data-[state=checked]:bg-emerald-600"
            />
          </div>
          {saveStatus === 'saving' && (
            <span className="text-neutral-400 flex items-center gap-2"><Cloud className="w-4 h-4" /> Guardando...</span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-green-500 flex items-center gap-2"><Check className="w-4 h-4" /> Guardado</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-red-500 flex items-center gap-2"><Save className="w-4 h-4" /> Error</span>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 relative w-full">
        <ChatbotCanvas
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          setNodes={setNodes}
          setEdges={setEdges}
          targetPlatforms={targetPlatforms}
        />
      </div>
    </div>
  );
}
