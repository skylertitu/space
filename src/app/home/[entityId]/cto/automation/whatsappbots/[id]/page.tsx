// src/app/home/[entityId]/cto/automation/whatsappbots/[id]/page.tsx
'use client';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, onSnapshot, collection } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { useEntityRoute } from '@/hooks/useEntityRoute';
import {
  subscribeSlotConnections,
  type SlotConnections,
} from '@/lib/whatsapp/numbers';
import {
  resolveBotPhoneNumberId,
  findConnectedPhone,
  formatConnectedPhoneLabel,
} from '@/lib/whatsapp/botPhoneBinding';
import {
  phoneDigitsFromConnection,
  patchStartNodePhone,
  flowNeedsStartPhoneSync,
} from '@/lib/chatbot/syncStartNodePhone';
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Node,
  Edge,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
} from 'reactflow';
import 'reactflow/dist/style.css';
import ChatbotCanvas from '@/components/ChatbotCanvas';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { toast } from 'sonner';
import {
  Loader2,
  ChevronLeft,
  Cloud,
  Check,
  AlertCircle,
  Facebook,
  Instagram,
  Send,
  Mail,
  Twitter,
  Wand2,
  FileJson,
  Braces,
  FileUp,
  Radio,
  Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { getPrimaryPlatform, normalizeTargetPlatforms, updateExclusiveBotPlatform } from '../utils';
import FlowGeneratorBar from '@/components/chatbot/FlowGeneratorBar';
import BotSimulatorDrawer from '@/components/chatbot/BotSimulatorDrawer';
import { layoutFlow } from '@/lib/chatbot/layoutFlow';
import type { FlowEditMode } from '@/lib/chatbot/flowGraphOps';
import { buildBotRulesExport, downloadJsonFile } from '@/lib/chatbot/botNodeCatalog';
import { cn } from '@/lib/utils';

const TOOLBAR_BTN =
  'h-8 gap-1.5 rounded-lg bg-transparent px-2.5 text-neutral-400 shadow-none border-0 hover:bg-white/[0.06] hover:text-white';
const TOOLBAR_ICON_BTN = cn(TOOLBAR_BTN, 'px-2');

function ToolbarDivider() {
  return <div className="mx-1 h-4 w-px shrink-0 bg-white/10" aria-hidden />;
}

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 0 5.414 0 12.05c0 2.123.551 4.197 1.597 6.03l-1.602 5.8 5.883-1.543a11.86 11.86 0 005.815 1.526h.005c6.634 0 12.048-5.414 12.048-12.05 0-3.213-1.252-6.234-3.525-8.508z" />
  </svg>
);

/** Serializa Timestamps de Firestore y objetos anidados para JSON legible. */
function serializeForJson(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map(serializeForJson);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, serializeForJson(nested)])
    );
  }
  return value;
}

type ParsedBotImport = {
  name?: string;
  humanizeTone?: boolean;
  humanizeStyle?: string;
  targetPlatforms?: string[];
  nodes: Node[];
  edges: Edge[];
};

/** Acepta JSON exportado por elizmey, documento de bot o solo flow { nodes, edges }. */
function parseBotImportJson(raw: unknown): ParsedBotImport {
  if (!raw || typeof raw !== 'object') {
    throw new Error('El archivo no contiene un JSON válido.');
  }

  const root = raw as Record<string, unknown>;
  const bot =
    root.bot && typeof root.bot === 'object'
      ? (root.bot as Record<string, unknown>)
      : root;

  const flow =
    bot.flow && typeof bot.flow === 'object'
      ? (bot.flow as Record<string, unknown>)
      : null;

  const nodes = flow?.nodes ?? bot.nodes;
  const edges = flow?.edges ?? bot.edges;

  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error('El JSON debe incluir al menos un nodo en flow.nodes.');
  }

  const normalizedEdges = (Array.isArray(edges) ? edges : []).map(
    ({ animated, style, selected, ...edge }: Edge & { animated?: boolean; style?: unknown; selected?: boolean }) => ({
      ...edge,
      type: edge.type || 'custom',
    })
  );

  return {
    name: typeof bot.name === 'string' ? bot.name : undefined,
    humanizeTone: typeof bot.humanizeTone === 'boolean' ? bot.humanizeTone : undefined,
    humanizeStyle: typeof bot.humanizeStyle === 'string' ? bot.humanizeStyle : undefined,
    targetPlatforms: Array.isArray(bot.targetPlatforms)
      ? normalizeTargetPlatforms(bot.targetPlatforms as string[])
      : undefined,
    nodes: nodes as Node[],
    edges: normalizedEdges as Edge[],
  };
}

const PLATFORMS_MAP: Record<string, any> = {
  whatsapp: { icon: WhatsAppIcon, color: 'text-[#25D366]' },
  messenger: { icon: Facebook, color: 'text-[#0084FF]' },
  instagram: { icon: Instagram, color: 'text-[#E1306C]' },
  telegram: { icon: Send, color: 'text-[#0088cc]' },
  x_twitter: { icon: Twitter, color: 'text-white' },
  gmail: { icon: Mail, color: 'text-[#EA4335]' }
};

function FlowPage() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [chatbotName, setChatbotName] = useState('Cargando...');
  const [targetPlatforms, setTargetPlatforms] = useState<string[]>([]);
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [humanizeTone, setHumanizeTone] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [botPhoneNumberId, setBotPhoneNumberId] = useState('');
  const [connections, setConnections] = useState<SlotConnections | null>(null);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const params = useParams();
    const router = useRouter();
    const { currentUser, activeEntity } = useAuth();
    const { routeSegment } = useEntityRoute();
    const chatbotId = params.id as string;
    const debounceTimeout = useRef<NodeJS.Timeout | null>(null);
    const importFileInputRef = useRef<HTMLInputElement | null>(null);

  const tenantPath = currentUser?.uid && activeEntity
    ? `users/${currentUser.uid}/entities/${activeEntity}`
    : '';

  useEffect(() => {
    if (!tenantPath) return;
    return subscribeSlotConnections(tenantPath, setConnections);
  }, [tenantPath]);

  const linkedPhone = botPhoneNumberId && connections
    ? findConnectedPhone(connections, botPhoneNumberId)
    : null;
  const linkedConn = linkedPhone ? connections?.[linkedPhone.slot] : undefined;
  const linkedPhoneDigits = phoneDigitsFromConnection(linkedConn);
  const linkedPhoneLabel = linkedPhone ? formatConnectedPhoneLabel(linkedPhone) : undefined;

  useEffect(() => {
    if (!linkedPhoneDigits) return;
    setNodes((prev) => {
      if (prev.length === 0 || !flowNeedsStartPhoneSync(prev, linkedPhoneDigits)) return prev;
      return patchStartNodePhone(prev, linkedPhoneDigits);
    });
  }, [linkedPhoneDigits, setNodes]);

  const saveData = useCallback(async (currentNodes: Node[], currentEdges: Edge[], name: string, extraFields?: Record<string, unknown>) => {
    if (!chatbotId || !currentUser || !activeEntity) return;

    setSaveStatus('saving');

    const saveLocally = () => {
      try {
        const storageKey = `elizmey_demo_bots_${activeEntity}_whatsapp`;
        const list = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const idx = list.findIndex((b: any) => String(b.id) === String(chatbotId));
        const botData = {
          id: chatbotId,
          name,
          ...extraFields,
          flow: { nodes: currentNodes, edges: currentEdges },
          updatedAt: new Date(),
        };
        if (idx >= 0) list[idx] = { ...list[idx], ...botData };
        else list.push(botData);
        localStorage.setItem(storageKey, JSON.stringify(list));
      } catch {}
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    };

    if (currentUser.uid.startsWith('demo')) {
      saveLocally();
      return;
    }

    try {
      const chatbotRef = doc(db, 'users', currentUser.uid, 'entities', activeEntity, 'chatbots', chatbotId);
      const edgesToSave = currentEdges.map(({ selected, ...edge }) => edge);

      await setDoc(chatbotRef, {
        name: name,
        ...extraFields,
        flow: {
          nodes: currentNodes,
          edges: edgesToSave,
        },
        updatedAt: new Date(),
      }, { merge: true });

      await fetch('/api/kanban/sync-bot-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.uid,
          entityId: activeEntity,
          botId: chatbotId,
          relocateCards: true,
        }),
      }).catch((err) => console.warn('[Chatbot] Kanban sync after save failed:', err));

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.warn("Firestore error al guardar, guardando localmente:", error);
      saveLocally();
    }
  }, [chatbotId, currentUser, activeEntity]);

  useEffect(() => {
    const fetchChatbotData = async () => {
      if (!chatbotId || !currentUser || !activeEntity) {
        setIsLoading(false);
        setChatbotName('ID de chatbot no encontrado');
        return;
      }

      setIsLoading(true);

      const loadFromLocalStorage = () => {
        try {
          const storageKey = `elizmey_demo_bots_${activeEntity}_whatsapp`;
          const raw = localStorage.getItem(storageKey);
          if (raw) {
            const list = JSON.parse(raw);
            const found = list.find((b: any) => String(b.id) === String(chatbotId));
            if (found) {
              setChatbotName(found.name || 'Mi Chatbot');
              setTargetPlatforms(normalizeTargetPlatforms(found.targetPlatforms));
              const flowData = found.flow || {};
              setNodes(Array.isArray(flowData.nodes) ? flowData.nodes : []);
              setEdges(Array.isArray(flowData.edges) ? flowData.edges : []);
              return true;
            }
          }
        } catch {}
        return false;
      };

      if (currentUser.uid.startsWith('demo')) {
        const loaded = loadFromLocalStorage();
        if (!loaded) {
          setChatbotName('Nuevo Chatbot');
          const startNodes = [{ id: '1', type: 'startNode', position: { x: 250, y: 5 }, data: { label: 'Inicio', welcomeMessage: '¡Hola! ¿En qué puedo ayudarte?' } }];
          setNodes(startNodes);
          setEdges([]);
        }
        setIsLoading(false);
        return;
      }

      try {
        const docRef = doc(db, 'users', currentUser.uid, 'entities', activeEntity, 'chatbots', chatbotId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setChatbotName(data.name || 'Mi Chatbot');
          setTargetPlatforms(normalizeTargetPlatforms(data.targetPlatforms));
          setHumanizeTone(!!data.humanizeTone);
          const resolvedPhoneId = resolveBotPhoneNumberId(
            { phoneNumberId: data.phoneNumberId, numberId: data.numberId },
            connections || { general: { connected: false }, support: { connected: false }, broadcast: { connected: false } }
          );
          setBotPhoneNumberId(resolvedPhoneId || '');

          const flowData = data.flow || {};
          const savedNodes = flowData.nodes || [];
          const savedEdges = (flowData.edges || []).map(({ animated, style, ...edge }: any) => ({
            ...edge,
            type: 'custom',
          }));

          setNodes(Array.isArray(savedNodes) ? savedNodes : []);
          setEdges(Array.isArray(savedEdges) ? savedEdges : []);
        } else {
          const loaded = loadFromLocalStorage();
          if (!loaded) {
            console.log('No se encontró el documento, creando un chatbot de inicio.');
            setChatbotName('Nuevo Chatbot');
            const startNodes = [{ id: '1', type: 'startNode', position: { x: 250, y: 5 }, data: { label: 'Inicio', welcomeMessage: '¡Hola! ¿En qué puedo ayudarte?' } }];
            setNodes(startNodes);
            setEdges([]);
            saveData(startNodes, [], 'Nuevo Chatbot');
          }
        }
      } catch (err: any) {
        console.warn('Firestore fetch failed, checking local storage:', err?.message);
        const loaded = loadFromLocalStorage();
        if (!loaded) {
          setChatbotName('Nuevo Chatbot');
          const startNodes = [{ id: '1', type: 'startNode', position: { x: 250, y: 5 }, data: { label: 'Inicio', welcomeMessage: '¡Hola! ¿En qué puedo ayudarte?' } }];
          setNodes(startNodes);
          setEdges([]);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchChatbotData();
  }, [chatbotId, saveData, currentUser, activeEntity, connections]);

  useEffect(() => {
    if (!chatbotId || !currentUser || !activeEntity) return;

    const docRef = doc(db, 'users', currentUser.uid, 'entities', activeEntity, 'chatbots', chatbotId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (!docSnap.exists()) return;
      const data = docSnap.data();
      setTargetPlatforms(normalizeTargetPlatforms(data.targetPlatforms));
      if (typeof data.humanizeTone === 'boolean') {
        setHumanizeTone(data.humanizeTone);
      }
      if (typeof data.name === 'string') {
        setChatbotName((prev) => prev === data.name ? prev : data.name);
      }
      const resolvedPhoneId = resolveBotPhoneNumberId(
        { phoneNumberId: data.phoneNumberId, numberId: data.numberId },
        connections || { general: { connected: false }, support: { connected: false }, broadcast: { connected: false } }
      );
      const nextPhoneId = resolvedPhoneId || '';
      setBotPhoneNumberId((prev) => (prev === nextPhoneId ? prev : nextPhoneId));
    });

    return () => unsubscribe();
  }, [chatbotId, currentUser, activeEntity, connections]);

  // Fetch connected integrations to filter options
  useEffect(() => {
    if (!currentUser || !activeEntity) return;

    const integrationsRef = collection(db, 'users', currentUser.uid, 'entities', activeEntity, 'integrations');
    const unsubscribe = onSnapshot(integrationsRef, (snapshot) => {
      const connected = snapshot.docs
        .filter(d => d.id !== '_init' && d.data().status === 'Connected')
        .map(d => {
            if (d.id === 'whatsapp_internal') return 'whatsapp';
            return d.id;
        });
      setConnectedPlatforms(connected);
    });

    return () => unsubscribe();
  }, [currentUser, activeEntity]);

  const handleTogglePlatform = async (platformId: string) => {
    if (!currentUser || !activeEntity || !chatbotId) return;
    
    try {
      const currentPlatform = getPrimaryPlatform(targetPlatforms);
      const isRemoving = currentPlatform === platformId;
      const botSnap = await getDoc(doc(db, 'users', currentUser.uid, 'entities', activeEntity, 'chatbots', chatbotId));
      const isActive = botSnap.exists() ? (botSnap.data().isActive === true || botSnap.data().isActive === 'true') : false;

      await updateExclusiveBotPlatform({
        db,
        userId: currentUser.uid,
        entityId: activeEntity,
        botId: chatbotId,
        platformId: isRemoving ? null : platformId,
        activate: isRemoving ? false : isActive
      });
      
      toast.success(`${platformId.toUpperCase()} ${!isRemoving ? 'vinculado' : 'removido'}`);
    } catch (error) {
      console.error('Error updating platform:', error);
      toast.error('No se pudo actualizar la plataforma.');
    }
  };

  const handleDownloadJson = async () => {
    if (!currentUser || !activeEntity || !chatbotId) return;

    try {
      const docRef = doc(db, 'users', currentUser.uid, 'entities', activeEntity, 'chatbots', chatbotId);
      const docSnap = await getDoc(docRef);
      const firestoreData = docSnap.exists() ? docSnap.data() : {};
      const edgesToExport = edges.map(({ selected, animated, style, ...edge }) => edge);

      const exportPayload = serializeForJson({
        exportedAt: new Date().toISOString(),
        schemaVersion: 1,
        entityId: activeEntity,
        bot: {
          id: chatbotId,
          ...firestoreData,
          name: chatbotName,
          humanizeTone,
          humanizeStyle: firestoreData.humanizeStyle ?? 'warm',
          targetPlatforms,
          flow: {
            nodes,
            edges: edgesToExport,
          },
        },
      });

      const safeName = chatbotName.replace(/[^a-z0-9-_áéíóúñ]/gi, '_').slice(0, 50) || 'bot';
      downloadJsonFile(exportPayload, `chatbot-${chatbotId}-${safeName}.json`);
      toast.success('JSON del bot descargado');
    } catch (error) {
      console.error('Error downloading bot JSON:', error);
      toast.error('No se pudo descargar el JSON del bot');
    }
  };

  const handleDownloadRulesJson = () => {
    try {
      downloadJsonFile(buildBotRulesExport(), 'chatbot-nodos-y-reglas.json');
      toast.success('Catálogo de nodos y reglas descargado');
    } catch (error) {
      console.error('Error downloading bot rules JSON:', error);
      toast.error('No se pudo descargar el catálogo de nodos');
    }
  };

  const handleImportJsonClick = () => {
    importFileInputRef.current?.click();
  };

  const handleImportJsonFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !currentUser || !activeEntity || !chatbotId) return;

    if (!window.confirm('Esto reemplazará el flujo actual del bot con el JSON importado. ¿Continuar?')) {
      return;
    }

    try {
      const text = await file.text();
      const parsedJson = JSON.parse(text) as unknown;
      const imported = parseBotImportJson(parsedJson);

      const importedName = imported.name ?? chatbotName;
      const importedHumanize = imported.humanizeTone ?? humanizeTone;
      const importedPlatforms = imported.targetPlatforms ?? targetPlatforms;

      setChatbotName(importedName);
      setHumanizeTone(importedHumanize);
      if (imported.targetPlatforms) {
        setTargetPlatforms(importedPlatforms);
      }
      setNodes(imported.nodes);
      setEdges(imported.edges);

      const extraFields: Record<string, unknown> = {
        humanizeTone: importedHumanize,
        humanizeStyle: imported.humanizeStyle ?? 'warm',
      };
      if (imported.targetPlatforms) {
        extraFields.targetPlatforms = importedPlatforms;
      }

      await saveData(imported.nodes, imported.edges, importedName, extraFields);
      toast.success(`JSON importado (${imported.nodes.length} nodos, ${imported.edges.length} conexiones)`);
    } catch (error) {
      console.error('Error importing bot JSON:', error);
      const message = error instanceof Error ? error.message : 'No se pudo importar el JSON del bot';
      toast.error(message);
    }
  };

  const handleToggleHumanizeTone = async (checked: boolean) => {
    if (!currentUser || !activeEntity || !chatbotId) return;
    setHumanizeTone(checked);
    try {
      const chatbotRef = doc(db, 'users', currentUser.uid, 'entities', activeEntity, 'chatbots', chatbotId);
      await setDoc(
        chatbotRef,
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

  // Efecto de Auto-guardado (Triggered by nodes/edges/name changes)
  useEffect(() => {
    if (isLoading) return;
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);

    debounceTimeout.current = setTimeout(() => {
      // Solo guardar si hay contenido
      if (nodes.length > 0 || edges.length > 0) {
        saveData(nodes, edges, chatbotName);
      }
    }, 1500);

    return () => {
      if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    };
  }, [nodes, edges, chatbotName, saveData, isLoading]);

  const onNodesChange: OnNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), [setNodes]);
  const onEdgesChange: OnEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), [setEdges]);
  const onConnect: OnConnect = useCallback(
    (connection) =>
      setEdges((eds) => {
        // Cada punto de salida enruta a un solo destino: al reconectar, se reemplaza la anterior.
        const withoutOldEdge = eds.filter(
          (e) => !(e.source === connection.source && e.sourceHandle === connection.sourceHandle)
        );
        return addEdge({ ...connection, type: 'custom' }, withoutOldEdge);
      }),
    [setEdges]
  );

  const handleFlowGenerated = useCallback((_generatedNodes: Node[], _generatedEdges: Edge[], _mode: FlowEditMode) => {
    // API already returns layouted merged flow; apply directly.
    const { nodes: layoutedNodes, edges: layoutedEdges } = layoutFlow(_generatedNodes, _generatedEdges, 'LR');
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, []);

  const handleSelectedNodeChange = useCallback((node: Node | null) => {
    setSelectedNode(node);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-neutral-900 text-white">
        <Loader2 className="w-12 h-12 animate-spin text-neutral-500" />
        <p className="ml-4 text-lg">Cargando chatbot...</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col min-h-screen overflow-y-auto md:h-screen md:overflow-hidden bg-neutral-900 text-white">
      <style jsx global>{`
        html, body {
          overflow: hidden !important;
          height: 100% !important;
          width: 100% !important;
          position: fixed;
        }
      `}</style>
      
      {/* HEADER BAR */}
      <header className="z-20 flex h-12 shrink-0 items-center justify-between border-b border-white/[0.06] bg-neutral-950/80 px-3 backdrop-blur-md sm:px-4">
        <TooltipProvider delayDuration={300}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (routeSegment) {
                      router.push(`/home/${routeSegment}/cto/automation/whatsappbots`);
                    }
                  }}
                  className={TOOLBAR_ICON_BTN}
                >
                  <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Volver a mis bots</TooltipContent>
            </Tooltip>

          <ToolbarDivider />

          <Input
            value={chatbotName}
            onChange={(e) => setChatbotName(e.target.value)}
            className="h-8 min-w-0 flex-1 border-0 bg-transparent px-1 text-base font-medium tracking-tight text-white shadow-none placeholder:text-neutral-600 focus-visible:bg-white/[0.03] focus-visible:ring-0 sm:max-w-xs sm:text-lg"
            placeholder="Nombre del chatbot"
          />
        </div>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <label
                  className={cn(
                    'flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2 transition-colors hover:bg-white/[0.06]',
                    humanizeTone ? 'text-emerald-400' : 'text-neutral-400 hover:text-white'
                  )}
                >
                  <Wand2 className="h-4 w-4" strokeWidth={1.75} />
                  <Switch
                    checked={humanizeTone}
                    onCheckedChange={handleToggleHumanizeTone}
                    className="h-4 w-7 data-[state=checked]:bg-emerald-500/80"
                  />
                </label>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[220px]">
                Humanizar: la SI reformula el tono sin cambiar el flujo
              </TooltipContent>
            </Tooltip>

            <ToolbarDivider />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={handleDownloadJson} className={TOOLBAR_ICON_BTN}>
                  <FileJson className="h-4 w-4" strokeWidth={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Descargar flujo JSON</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={handleDownloadRulesJson} className={TOOLBAR_ICON_BTN}>
                  <Braces className="h-4 w-4" strokeWidth={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Descargar nodos y reglas</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={handleImportJsonClick} className={TOOLBAR_ICON_BTN}>
                  <FileUp className="h-4 w-4" strokeWidth={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Importar JSON</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSimulatorOpen((prev) => !prev)}
                  className={cn(TOOLBAR_ICON_BTN, isSimulatorOpen && 'text-blue-400 bg-white/[0.08]')}
                >
                  <Play className="h-4 w-4" strokeWidth={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Probar chatbot (Simulador)</TooltipContent>
            </Tooltip>

            <input
              ref={importFileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImportJsonFile}
            />

            <ToolbarDivider />

            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        TOOLBAR_ICON_BTN,
                        targetPlatforms.length === 0 && 'text-red-400/90 hover:text-red-300'
                      )}
                    >
                      {targetPlatforms.length > 0 ? (
                        (() => {
                          const currentPlatform = getPrimaryPlatform(targetPlatforms);
                          const p = currentPlatform ? PLATFORMS_MAP[currentPlatform] : null;
                          if (!p || !currentPlatform) return <Radio className="h-4 w-4" strokeWidth={1.75} />;
                          return <p.icon className={cn('h-4 w-4', p.color)} />;
                        })()
                      ) : (
                        <Radio className="h-4 w-4" strokeWidth={1.75} />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {targetPlatforms.length > 0 ? 'Gestionar canal' : 'Sin canal vinculado'}
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent className="z-[100] min-w-[180px] rounded-xl border-neutral-800 bg-neutral-900 p-1.5 shadow-2xl">
                <p className="px-3 py-2 text-[9px] font-normal uppercase tracking-widest text-neutral-500">
                  Gestionar conexión
                </p>
                {Object.keys(PLATFORMS_MAP).filter((pId) => connectedPlatforms.includes(pId)).map((pId) => {
                  const p = PLATFORMS_MAP[pId];
                  const isCurrent = getPrimaryPlatform(targetPlatforms) === pId;
                  return (
                    <DropdownMenuItem
                      key={pId}
                      onClick={() => handleTogglePlatform(pId)}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-all',
                        isCurrent ? 'bg-white/5 text-white' : 'text-neutral-400 hover:bg-white/5 hover:text-white'
                      )}
                    >
                      <p.icon className={cn('h-4 w-4', p.color)} />
                      <span className="text-xs font-normal tracking-tight">{pId.toUpperCase()}</span>
                      {isCurrent && (
                        <span className="ml-auto text-[8px] font-normal text-emerald-500">VINCULADO</span>
                      )}
                    </DropdownMenuItem>
                  );
                })}
                {connectedPlatforms.length === 0 && (
                  <p className="px-4 py-5 text-center text-[10px] leading-relaxed text-neutral-500">
                    No hay integraciones conectadas en este tenant.
                  </p>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <ToolbarDivider />

            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-lg px-2',
                    saveStatus === 'saving' && 'text-neutral-400',
                    saveStatus === 'saved' && 'text-emerald-400',
                    saveStatus === 'error' && 'text-red-400',
                    saveStatus === 'idle' && 'text-neutral-600'
                  )}
                >
                  {saveStatus === 'saving' && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />}
                  {saveStatus === 'saved' && <Check className="h-3.5 w-3.5" strokeWidth={2} />}
                  {saveStatus === 'error' && <AlertCircle className="h-3.5 w-3.5" strokeWidth={1.75} />}
                  {saveStatus === 'idle' && <Cloud className="h-3.5 w-3.5" strokeWidth={1.75} />}
                  <span className="hidden text-[11px] font-normal sm:inline">
                    {saveStatus === 'saving' && 'Guardando'}
                    {saveStatus === 'saved' && 'Guardado'}
                    {saveStatus === 'error' && 'Error'}
                    {saveStatus === 'idle' && 'Al día'}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">Estado de guardado automático</TooltipContent>
            </Tooltip>
        </div>
        </TooltipProvider>
      </header>

      {/* CANVAS AREA */}
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
          onSelectedNodeChange={handleSelectedNodeChange}
          linkedPhoneDigits={linkedPhoneDigits}
          linkedPhoneLabel={linkedPhoneLabel}
        />
        {currentUser && activeEntity && (
          <FlowGeneratorBar
            userId={currentUser.uid}
            entityId={activeEntity}
            nodes={nodes}
            edges={edges}
            selectedNode={selectedNode}
            onFlowGenerated={handleFlowGenerated}
            disabled={isLoading}
          />
        )}
        <BotSimulatorDrawer
          isOpen={isSimulatorOpen}
          onClose={() => setIsSimulatorOpen(false)}
          nodes={nodes}
          edges={edges}
          botName={chatbotName}
        />
      </div>
    </div>
  );
}

export default FlowPage;
