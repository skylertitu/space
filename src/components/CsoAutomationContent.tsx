"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowRight,
  ChevronLeft,
  Plus,
  Power,
  Trash2,
  Loader2,
  Workflow,
  Bot,
  Send,
  Facebook,
  Instagram,
  Sparkles,
  Clock,
  Users,
  FileText,
  Settings,
  Zap,
} from "lucide-react";
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useEntityRoute } from '@/hooks/useEntityRoute';
import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  onSnapshot,
  deleteDoc,
  runTransaction,
  updateDoc,
} from 'firebase/firestore';
import { toast } from 'sonner';
import { ChannelIcons } from '@/components/automation/ChannelIcons';
import { isBotActiveValue } from '@/lib/automation/botActivation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export type ChannelSlug = 'whatsapp' | 'messenger' | 'instagram-dm' | 'telegram';

export interface ChannelConfig {
  slug: ChannelSlug;
  title: string;
  channelLabel: string;
  collection: string;
  enginePlatform: string;
  iconColor: string;
  activeBg: string;
  activeBorder: string;
  badgeClass: string;
  editorUrl: (routeSegment: string, id: string) => string;
  channelUrl: (routeSegment: string) => string;
  Icon: React.FC<{ className?: string }>;
}

export const ALLOWED_CHANNELS: ChannelConfig[] = [
  {
    slug: 'whatsapp',
    title: 'WhatsApp',
    channelLabel: 'WhatsApp Bot',
    collection: 'chatbots',
    enginePlatform: 'whatsapp',
    iconColor: 'text-[#25D366]',
    activeBg: 'bg-[#25D366]/10',
    activeBorder: 'border-[#25D366]/30',
    badgeClass: 'bg-[#25D366]/10 text-[#25D366] border-[#25D366]/25',
    editorUrl: (routeSegment, id) => `/home/${routeSegment}/cto/automation/whatsappbots/${id}`,
    channelUrl: (routeSegment) => `/home/${routeSegment}/cto/automation/whatsappbots`,
    Icon: ChannelIcons.WhatsApp,
  },
  {
    slug: 'messenger',
    title: 'Facebook Messenger',
    channelLabel: 'Facebook Bot',
    collection: 'messenger-bots',
    enginePlatform: 'messenger',
    iconColor: 'text-[#0084FF]',
    activeBg: 'bg-[#0084FF]/10',
    activeBorder: 'border-[#0084FF]/30',
    badgeClass: 'bg-[#0084FF]/10 text-[#0084FF] border-[#0084FF]/25',
    editorUrl: (routeSegment, id) => `/home/${routeSegment}/cto/automation/bots/messenger/${id}`,
    channelUrl: (routeSegment) => `/home/${routeSegment}/cto/automation/bots/messenger`,
    Icon: Facebook,
  },
  {
    slug: 'instagram-dm',
    title: 'Instagram',
    channelLabel: 'Instagram DM Bot',
    collection: 'instagram-dm-bots',
    enginePlatform: 'instagram',
    iconColor: 'text-[#E1306C]',
    activeBg: 'bg-[#E1306C]/10',
    activeBorder: 'border-[#E1306C]/30',
    badgeClass: 'bg-[#E1306C]/10 text-[#E1306C] border-[#E1306C]/25',
    editorUrl: (routeSegment, id) => `/home/${routeSegment}/cto/automation/bots/instagram-dm/${id}`,
    channelUrl: (routeSegment) => `/home/${routeSegment}/cto/automation/bots/instagram-dm`,
    Icon: Instagram,
  },
  {
    slug: 'telegram',
    title: 'Telegram',
    channelLabel: 'Telegram Bot',
    collection: 'telegram-bots',
    enginePlatform: 'telegram',
    iconColor: 'text-[#0088cc]',
    activeBg: 'bg-[#0088cc]/10',
    activeBorder: 'border-[#0088cc]/30',
    badgeClass: 'bg-[#0088cc]/10 text-[#0088cc] border-[#0088cc]/25',
    editorUrl: (routeSegment, id) => `/home/${routeSegment}/cto/automation/bots/telegram/${id}`,
    channelUrl: (routeSegment) => `/home/${routeSegment}/cto/automation/bots/telegram`,
    Icon: Send,
  },
];

export interface CreatedBot {
  id: string;
  name: string;
  isActive: boolean;
  channelSlug: ChannelSlug;
  collection: string;
  editorUrl: string;
  nodeCount?: number;
  createdAt?: any;
}

export function CsoAutomationContent() {
  const router = useRouter();
  const { currentUser, loading: authLoading } = useAuth();
  const { firestoreId, routeSegment, entityName } = useEntityRoute();

  const [channelBots, setChannelBots] = useState<Record<ChannelSlug, CreatedBot[]>>({
    whatsapp: [],
    messenger: [],
    'instagram-dm': [],
    telegram: [],
  });

  const [isLoading, setIsLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | ChannelSlug>('all');
  const [updatingBots, setUpdatingBots] = useState<string[]>([]);

  // Create Bot Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newBotName, setNewBotName] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<ChannelSlug>('whatsapp');
  const [isCreating, setIsCreating] = useState(false);

  // Delete confirmation
  const [botToDelete, setBotToDelete] = useState<CreatedBot | null>(null);

  // Subscriptions to the 4 channel collections in real time
  useEffect(() => {
    if (authLoading) return;
    if (!currentUser || !firestoreId) {
      setIsLoading(false);
      return;
    }

    const loadLocalBots = () => {
      ALLOWED_CHANNELS.forEach((channel) => {
        try {
          const storageKey = `elizmey_demo_bots_${firestoreId}_${channel.slug}`;
          const raw = localStorage.getItem(storageKey);
          if (raw) {
            const list = JSON.parse(raw);
            const bots: CreatedBot[] = list.map((b: any) => ({
              id: b.id,
              name: b.name || `Bot ${channel.title}`,
              isActive: isBotActiveValue(b.isActive),
              channelSlug: channel.slug,
              collection: channel.collection,
              editorUrl: channel.editorUrl(routeSegment, b.id),
              nodeCount: Array.isArray(b.flow?.nodes) ? b.flow.nodes.length : 1,
              createdAt: b.createdAt,
            }));
            setChannelBots((prev) => ({ ...prev, [channel.slug]: bots }));
          }
        } catch {}
      });
      setIsLoading(false);
    };

    if (currentUser.uid.startsWith('demo')) {
      loadLocalBots();
      return;
    }

    setIsLoading(true);
    const unsubscribers: (() => void)[] = [];

    ALLOWED_CHANNELS.forEach((channel) => {
      const botsRef = collection(db, 'users', currentUser.uid, 'entities', firestoreId, channel.collection);
      const unsub = onSnapshot(
        botsRef,
        (snapshot) => {
          const bots: CreatedBot[] = snapshot.docs.map((d) => {
            const data = d.data();
            const nodes = data.flow?.nodes || [];
            return {
              id: d.id,
              name: data.name || `Bot ${channel.title}`,
              isActive: isBotActiveValue(data.isActive),
              channelSlug: channel.slug,
              collection: channel.collection,
              editorUrl: channel.editorUrl(routeSegment, d.id),
              nodeCount: Array.isArray(nodes) ? nodes.length : 1,
              createdAt: data.createdAt,
            };
          });
          setChannelBots((prev) => ({ ...prev, [channel.slug]: bots }));
          setIsLoading(false);
        },
        (error) => {
          console.warn(`[CsoAutomationContent] No se pudieron leer los bots de ${channel.slug}:`, error);
          setIsLoading(false);
        }
      );
      unsubscribers.push(unsub);
    });

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [currentUser, firestoreId, routeSegment, authLoading]);

  // Combined bots list
  const allBots = useMemo(() => {
    return [
      ...channelBots.whatsapp,
      ...channelBots.messenger,
      ...channelBots['instagram-dm'],
      ...channelBots.telegram,
    ];
  }, [channelBots]);

  // Filtered bots list
  const filteredBots = useMemo(() => {
    if (activeFilter === 'all') return allBots;
    return channelBots[activeFilter] || [];
  }, [activeFilter, allBots, channelBots]);

  // Toggle Bot Status
  const handleToggleStatus = async (bot: CreatedBot) => {
    if (!currentUser || !firestoreId) return;
    setUpdatingBots((prev) => [...prev, bot.id]);
    try {
      const newStatus = !bot.isActive;
      const botRef = doc(db, 'users', currentUser.uid, 'entities', firestoreId, bot.collection, bot.id);
      await updateDoc(botRef, {
        isActive: newStatus,
        updatedAt: new Date(),
      });
      toast.success(`Bot "${bot.name}" ${newStatus ? 'activado' : 'desactivado'}.`);
    } catch (error) {
      console.error('Error toggling bot status:', error);
      toast.error('No se pudo actualizar el estado del bot.');
    } finally {
      setUpdatingBots((prev) => prev.filter((id) => id !== bot.id));
    }
  };

  // Delete Bot
  const handleDeleteBot = async () => {
    if (!botToDelete || !currentUser || !firestoreId) return;
    try {
      const botRef = doc(db, 'users', currentUser.uid, 'entities', firestoreId, botToDelete.collection, botToDelete.id);
      await deleteDoc(botRef);
      toast.success(`Bot "${botToDelete.name}" eliminado.`);
      setBotToDelete(null);
    } catch (error) {
      console.error('Error deleting bot:', error);
      toast.error('Error al eliminar el chatbot.');
    }
  };

  // Create Bot
  const handleCreateBot = async () => {
    if (!newBotName.trim()) {
      toast.error('Escribe un nombre para el chatbot.');
      return;
    }
    if (!currentUser || !firestoreId) {
      toast.error('Sesión no disponible.');
      return;
    }

    setIsCreating(true);
    const channelConfig = ALLOWED_CHANNELS.find((c) => c.slug === selectedChannel) || ALLOWED_CHANNELS[0];
    const isDemoMode = currentUser.uid.startsWith('demo');

    const createLocally = () => {
      const formattedId = Date.now().toString().slice(-8);
      const storageKey = `elizmey_demo_bots_${firestoreId}_${channelConfig.slug}`;
      const defaultFlow = {
        nodes: [{
          id: '1',
          type: 'startNode',
          position: { x: 250, y: 5 },
          data: {
            label: 'Inicio',
            welcomeMessage: '¡Hola! ¿En qué puedo ayudarte?',
            triggerPhrase: 'Hola',
          },
        }],
        edges: [],
      };
      const botObj = {
        id: formattedId,
        name: newBotName.trim(),
        isActive: false,
        channel: channelConfig.slug,
        botType: 'dm',
        targetPlatforms: [channelConfig.enginePlatform],
        createdAt: new Date(),
        flow: defaultFlow,
      };

      try {
        const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
        existing.push(botObj);
        localStorage.setItem(storageKey, JSON.stringify(existing));
      } catch {}

      const newBot: CreatedBot = {
        id: formattedId,
        name: newBotName.trim(),
        isActive: false,
        channelSlug: channelConfig.slug,
        collection: channelConfig.collection,
        editorUrl: channelConfig.editorUrl(routeSegment, formattedId),
        nodeCount: 1,
        createdAt: new Date(),
      };
      setChannelBots((prev) => ({
        ...prev,
        [channelConfig.slug]: [...(prev[channelConfig.slug] || []), newBot],
      }));
      toast.success(`Chatbot "${newBotName.trim()}" creado.`);
      setIsCreateModalOpen(false);
      setNewBotName('');
      router.push(channelConfig.editorUrl(routeSegment, formattedId));
    };

    if (isDemoMode) {
      createLocally();
      setIsCreating(false);
      return;
    }

    try {
      const counterKey = channelConfig.slug === 'whatsapp' ? 'chatbot_counter' : `counter_${channelConfig.collection.replace(/-/g, '_')}`;
      const counterRef = doc(db, 'users', currentUser.uid, 'entities', firestoreId, 'system_metadata', counterKey);

      const newBotId = await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        const currentCount = counterDoc.exists() ? counterDoc.data()?.count || 0 : 0;
        const nextCount = currentCount + 1;
        transaction.set(counterRef, { count: nextCount }, { merge: true });
        const formattedId = String(nextCount).padStart(8, '0');

        const botRef = doc(db, 'users', currentUser.uid, 'entities', firestoreId, channelConfig.collection, formattedId);
        transaction.set(botRef, {
          id: formattedId,
          name: newBotName.trim(),
          isActive: false,
          channel: channelConfig.slug,
          botType: 'dm',
          targetPlatforms: [channelConfig.enginePlatform],
          createdAt: new Date(),
          flow: {
            nodes: [{
              id: '1',
              type: 'startNode',
              position: { x: 250, y: 5 },
              data: {
                label: 'Inicio',
                welcomeMessage: '¡Hola! ¿En qué puedo ayudarte?',
                triggerPhrase: 'Hola',
              },
            }],
            edges: [],
          },
        });
        return formattedId;
      });

      toast.success(`Chatbot "${newBotName.trim()}" creado.`);
      setIsCreateModalOpen(false);
      setNewBotName('');
      router.push(channelConfig.editorUrl(routeSegment, newBotId));
    } catch (error: any) {
      console.error('Error creating chatbot:', error);
      toast.error('No se pudo crear el chatbot en la cuenta. Revisa la sesión e inténtalo de nuevo.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <main className="flex-1 min-h-screen p-6 md:p-8 bg-black text-white font-sans overflow-y-auto">
      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.06] pb-6">
        <div className="flex items-center gap-3.5">
          <button
            onClick={() => router.push(`/home/${routeSegment}`)}
            className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer shrink-0"
            title="Volver"
            aria-label="Volver"
          >
            <ChevronLeft className="w-5 h-5" strokeWidth={1.75} />
          </button>
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.2em] text-pink-400 uppercase mb-1">
              <Sparkles className="w-3 h-3" />
              <span>RESPUESTAS CONTINUAS & FLUJOS</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-normal text-white">
              Chatbots & Automatización
            </h1>
            <p className="text-neutral-400 text-xs mt-0.5">
              {entityName || routeSegment} · WhatsApp, Facebook, Instagram y Telegram
            </p>
          </div>
        </div>

        {/* Action Button: Create Bot */}
        <div className="flex items-center gap-3">
          <Button
            onClick={() => {
              setNewBotName('');
              setSelectedChannel('whatsapp');
              setIsCreateModalOpen(true);
            }}
            className="bg-white hover:bg-neutral-200 text-black font-medium text-xs md:text-sm px-5 py-2.5 rounded-xl shadow-lg shadow-white/5 transition-all flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            Crear Chatbot
          </Button>
        </div>
      </div>

      {/* Channel Filters */}
      <div className="mb-8 flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
        <button
          onClick={() => setActiveFilter('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all shrink-0 ${
            activeFilter === 'all'
              ? 'bg-white text-black font-semibold'
              : 'bg-white/[0.04] text-neutral-400 hover:text-white hover:bg-white/[0.08] border border-white/5'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span>Todos los Bots</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
            activeFilter === 'all' ? 'bg-black/15 text-black' : 'bg-white/10 text-neutral-300'
          }`}>
            {allBots.length}
          </span>
        </button>

        {ALLOWED_CHANNELS.map((channel) => {
          const Icon = channel.Icon;
          const count = channelBots[channel.slug]?.length || 0;
          const isActive = activeFilter === channel.slug;
          return (
            <button
              key={channel.slug}
              onClick={() => setActiveFilter(channel.slug)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all shrink-0 border ${
                isActive
                  ? 'bg-white text-black font-semibold border-white'
                  : 'bg-white/[0.04] text-neutral-400 hover:text-white hover:bg-white/[0.08] border-white/5'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-black' : channel.iconColor}`} />
              <span>{channel.title}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                isActive ? 'bg-black/15 text-black' : 'bg-white/10 text-neutral-300'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Section: Created Chatbots */}
      <div className="mb-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[10px] font-normal uppercase tracking-[0.25em] text-neutral-500">
            Bots por canal ({filteredBots.length})
          </h2>
          {activeFilter !== 'all' && (
            <button
              onClick={() => {
                const target = ALLOWED_CHANNELS.find((c) => c.slug === activeFilter);
                if (target) router.push(target.channelUrl(routeSegment));
              }}
              className="text-[11px] text-neutral-500 hover:text-white transition-colors flex items-center gap-1"
            >
              <span>Ver panel detallado de {ALLOWED_CHANNELS.find((c) => c.slug === activeFilter)?.title}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-white/10 bg-white/[0.01]">
            <Loader2 className="w-7 h-7 text-white/40 animate-spin mb-3" />
            <p className="text-xs text-neutral-500 font-light">Cargando tus chatbots...</p>
          </div>
        ) : filteredBots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center rounded-2xl border border-dashed border-white/10 bg-white/[0.01] backdrop-blur-sm">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-neutral-400 mb-4">
              <Bot className="w-7 h-7" />
            </div>
            <h3 className="text-base font-medium text-white mb-1.5">
              {activeFilter === 'all'
                ? 'Aún no has creado ningún chatbot'
                : `No hay chatbots creados para ${ALLOWED_CHANNELS.find((c) => c.slug === activeFilter)?.title}`}
            </h3>
            <p className="text-xs text-neutral-400 max-w-md leading-relaxed mb-6 font-normal">
              Crea tu primer chatbot para diseñar los nodos de respuestas automáticas continuas paso a paso.
            </p>
            <Button
              onClick={() => {
                setNewBotName('');
                if (activeFilter !== 'all') setSelectedChannel(activeFilter);
                setIsCreateModalOpen(true);
              }}
              className="bg-white hover:bg-neutral-200 text-black text-xs font-semibold px-5 py-2.5 rounded-xl shadow-lg transition-all flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Crear mi primer Chatbot
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredBots.map((bot) => {
              const channel = ALLOWED_CHANNELS.find((c) => c.slug === bot.channelSlug) || ALLOWED_CHANNELS[0];
              const Icon = channel.Icon;
              const isUpdating = updatingBots.includes(bot.id);

              return (
                <div
                  key={`${bot.collection}-${bot.id}`}
                  className="group relative flex flex-col justify-between bg-neutral-950/80 border border-white/[0.08] hover:border-white/20 rounded-2xl p-5 transition-all duration-300 hover:shadow-xl hover:shadow-black/50"
                >
                  {/* Top: Channel badge + Delete */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3.5">
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border ${channel.badgeClass}`}>
                        <Icon className={`w-3 h-3 ${channel.iconColor}`} />
                        <span>{channel.title}</span>
                      </div>

                      <button
                        onClick={() => setBotToDelete(bot)}
                        className="text-neutral-600 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-white/5 opacity-0 group-hover:opacity-100"
                        title="Eliminar bot"
                        aria-label="Eliminar bot"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Bot Name */}
                    <h3 className="text-base font-medium text-white tracking-tight mb-1 truncate" title={bot.name}>
                      {bot.name}
                    </h3>
                    <p className="text-[11px] text-neutral-400 font-mono mb-4">
                      ID: {bot.id} · {bot.nodeCount} {bot.nodeCount === 1 ? 'nodo' : 'nodos'}
                    </p>
                  </div>

                  {/* Bottom: Activation + Open Editor */}
                  <div className="pt-4 border-t border-white/[0.06] flex items-center justify-between gap-3">
                    {/* Toggle Status */}
                    <button
                      onClick={() => handleToggleStatus(bot)}
                      disabled={isUpdating}
                      className={`flex items-center gap-1.5 text-[11px] font-medium transition-colors ${
                        bot.isActive ? 'text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'
                      }`}
                      title={bot.isActive ? 'Bot activo' : 'Bot inactivo (haz clic para activar)'}
                    >
                      {isUpdating ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Power className={`w-3.5 h-3.5 ${bot.isActive ? 'text-emerald-400' : 'text-neutral-500'}`} />
                      )}
                      <span>{bot.isActive ? 'Activo' : 'Inactivo'}</span>
                    </button>

                    {/* Edit Nodes Button */}
                    <Button
                      onClick={() => router.push(bot.editorUrl)}
                      className="bg-white/[0.06] hover:bg-white text-white hover:text-black border border-white/10 hover:border-transparent text-xs font-medium px-3 py-1.5 h-8 rounded-lg transition-all flex items-center gap-1.5"
                    >
                      <Workflow className="w-3.5 h-3.5" />
                      <span>Editar Nodos</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="pt-6 border-t border-white/[0.06]">
        <h2 className="text-[10px] font-normal uppercase tracking-[0.25em] text-neutral-500 mb-4">
          Herramientas Complementarias de Automatización
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { icon: <FileText className="w-6 h-6 text-sky-400" />, title: "Respuestas Rápidas", description: "Crea y gestiona plantillas de mensajes para responder más rápido a las preguntas comunes.", action: "Gestionar Plantillas" },
            { icon: <Zap className="w-6 h-6 text-amber-400" />, title: "Sugerencias de SI", description: "Activa sugerencias de respuesta impulsadas por SI basadas en los mensajes del cliente.", action: "Configurar SI" },
            { icon: <Users className="w-6 h-6 text-rose-400" />, title: "Asignación de Chats", description: "Establece reglas para asignar automáticamente nuevas conversaciones a miembros específicos del equipo.", action: "Definir Reglas" },
            { icon: <Clock className="w-6 h-6 text-indigo-400" />, title: "Mensajes Programados", description: "Gestiona y visualiza todos los mensajes que están programados para ser enviados en el futuro.", action: "Ver Programación" },
            { icon: <Settings className="w-6 h-6 text-slate-400" />, title: "Flujos de Trabajo", description: "Crea flujos de trabajo avanzados, como añadir una etiqueta si un mensaje contiene una palabra específica.", action: "Crear Flujos" },
          ].map((feature) => (
            <div
              key={feature.title}
              className="group relative flex flex-col bg-white/[0.02] border border-white/8 rounded-2xl hover:border-white/20 transition-all duration-300 p-4 backdrop-blur-sm"
            >
              <div className="mb-3 flex items-center justify-between">
                {feature.icon}
              </div>
              <h3 className="text-sm font-medium text-white tracking-tight">{feature.title}</h3>
              <p className="text-neutral-400 mt-1 text-xs leading-relaxed font-normal">{feature.description}</p>
              <div className="pt-3 mt-auto">
                <span className="flex items-center text-blue-400 font-normal text-[10px] uppercase tracking-wider">
                  {feature.action}
                  <ArrowRight className="w-3 h-3 ml-1 transform transition-transform duration-300 group-hover:translate-x-1" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal: Create Chatbot */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="bg-[#0c0c0c] border border-white/15 text-white sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-light tracking-tight text-white flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-400" />
              Crear Nuevo Chatbot
            </DialogTitle>
            <DialogDescription className="text-xs text-neutral-400">
              Selecciona el canal y asigna un nombre para comenzar a diseñar los nodos de respuestas continuas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {/* Bot Name Input */}
            <div>
              <label className="text-xs text-neutral-400 font-medium block mb-1.5">
                Nombre del Chatbot
              </label>
              <Input
                placeholder="Ej. Asistente de Ventas, Soporte 24/7..."
                value={newBotName}
                onChange={(e) => setNewBotName(e.target.value)}
                className="bg-black/60 border-white/15 text-white text-sm rounded-xl focus:border-white/30"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateBot();
                }}
              />
            </div>

            {/* Channel Selection */}
            <div>
              <label className="text-xs text-neutral-400 font-medium block mb-2">
                Canal de Destino
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {ALLOWED_CHANNELS.map((channel) => {
                  const Icon = channel.Icon;
                  const isSelected = selectedChannel === channel.slug;
                  return (
                    <button
                      key={channel.slug}
                      type="button"
                      onClick={() => setSelectedChannel(channel.slug)}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? `bg-white/10 ${channel.activeBorder} ring-1 ring-white/20 text-white`
                          : 'bg-white/[0.02] border-white/8 text-neutral-400 hover:bg-white/[0.05] hover:text-white'
                      }`}
                    >
                      <div className={`p-1.5 rounded-lg ${channel.activeBg} shrink-0`}>
                        <Icon className={`w-4 h-4 ${channel.iconColor}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-white truncate">{channel.title}</p>
                        <p className="text-[10px] text-neutral-500">Flujo de DM</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsCreateModalOpen(false)}
              className="text-neutral-400 hover:text-white hover:bg-white/5 text-xs rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCreateBot}
              disabled={isCreating || !newBotName.trim()}
              className="bg-white hover:bg-neutral-200 text-black text-xs font-semibold px-4 rounded-xl flex items-center gap-1.5 disabled:opacity-50"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Creando...</span>
                </>
              ) : (
                <>
                  <Workflow className="w-3.5 h-3.5" />
                  <span>Crear y Diseñar Nodos</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Confirm Delete */}
      <Dialog open={!!botToDelete} onOpenChange={(open) => !open && setBotToDelete(null)}>
        <DialogContent className="bg-[#0c0c0c] border border-white/15 text-white sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-normal text-white">
              ¿Eliminar Chatbot?
            </DialogTitle>
            <DialogDescription className="text-xs text-neutral-400">
              ¿Estás seguro de que deseas eliminar el bot <span className="text-white font-medium">"{botToDelete?.name}"</span>? Esta acción no se puede deshacer y borrará sus nodos de flujo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setBotToDelete(null)}
              className="text-neutral-400 hover:text-white hover:bg-white/5 text-xs rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteBot}
              className="bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-xl"
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
