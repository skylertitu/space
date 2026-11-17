'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, deleteDoc, doc, getDocs, onSnapshot, runTransaction } from 'firebase/firestore';
import { ArrowLeft, ExternalLink, Loader2, Plus, Power, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { db } from '@/lib/firebase';
import { BotChannelConfig } from '@/lib/automation/channels';
import { useAutomationEntity } from '@/lib/automation/useAutomationEntity';
import {
  getPrimaryPlatform,
  isBotActiveValue,
  normalizeTargetPlatforms,
  updateExclusiveBotForChannel,
} from '@/lib/automation/botActivation';

interface Bot {
  id: string;
  name: string;
  isActive: boolean;
  targetPlatforms?: string[];
}

interface ChannelBotsPageProps {
  channel: BotChannelConfig;
}

export function ChannelBotsPage({ channel }: ChannelBotsPageProps) {
  const router = useRouter();
  const { currentUser, entityId, authLoading, isReady } = useAutomationEntity();
  const [bots, setBots] = useState<Bot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [updatingBots, setUpdatingBots] = useState<string[]>([]);
  const [botToDelete, setBotToDelete] = useState<Bot | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [integrationConnected, setIntegrationConnected] = useState(false);

  const editorBase = `/home/${entityId}/cto/automation/bots/${channel.slug}`;
  const Icon = channel.Icon;

  useEffect(() => {
    if (authLoading) return;

    if (!currentUser || !entityId) {
      setIsLoading(false);
      setLoadError('No se pudo resolver la entidad. Vuelve al núcleo e intenta de nuevo.');
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    const botsCollection = collection(
      db,
      'users',
      currentUser.uid,
      'entities',
      entityId,
      channel.collection
    );

    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        setIsLoading(false);
      }
    };

    const unsubscribe = onSnapshot(
      botsCollection,
      (querySnapshot) => {
        const botsData = querySnapshot.docs.map((d) => {
          const data = d.data();
          return {
            ...data,
            id: d.id,
            name: data.name || 'Unnamed Bot',
            isActive: isBotActiveValue(data.isActive),
            targetPlatforms: normalizeTargetPlatforms(data.targetPlatforms),
          } as Bot;
        });
        setBots(botsData);
        finish();
      },
      async (error) => {
        console.error('[ChannelBotsPage] snapshot error:', error);
        try {
          const fallback = await getDocs(botsCollection);
          const botsData = fallback.docs.map((d) => {
            const data = d.data();
            return {
              ...data,
              id: d.id,
              name: data.name || 'Unnamed Bot',
              isActive: isBotActiveValue(data.isActive),
              targetPlatforms: normalizeTargetPlatforms(data.targetPlatforms),
            } as Bot;
          });
          setBots(botsData);
          finish();
        } catch (fallbackErr) {
          console.error('[ChannelBotsPage] fallback error:', fallbackErr);
          setLoadError('No se pudieron cargar los bots. Revisa permisos de Firestore.');
          toast.error('No se pudieron cargar los bots.');
          finish();
        }
      }
    );

    const timeout = window.setTimeout(() => {
      if (!settled) {
        setLoadError('La carga tardó demasiado. Intenta recargar la página.');
        finish();
      }
    }, 12000);

    return () => {
      unsubscribe();
      window.clearTimeout(timeout);
    };
  }, [authLoading, currentUser, entityId, channel.collection]);

  useEffect(() => {
    if (!currentUser || !entityId || !channel.integrationId) {
      setIntegrationConnected(channel.webhookReady);
      return;
    }

    const integrationsRef = collection(db, 'users', currentUser.uid, 'entities', entityId, 'integrations');
    const unsubscribe = onSnapshot(integrationsRef, (snapshot) => {
      const connected = snapshot.docs.some((d) => {
        if (d.id === '_init') return false;
        return d.id === channel.integrationId && d.data().status === 'Connected';
      });
      setIntegrationConnected(connected);
    });

    return () => unsubscribe();
  }, [currentUser, entityId, channel.integrationId, channel.webhookReady]);

  const handleCreateNewBot = async () => {
    if (!currentUser || !entityId) {
      toast.error('Sesión o entidad no disponible.');
      return;
    }

    setIsCreating(true);

    try {
      const counterKey = `counter_${channel.collection.replace(/-/g, '_')}`;
      const counterRef = doc(db, 'users', currentUser.uid, 'entities', entityId, 'system_metadata', counterKey);

      const newBotId = await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        const currentCount = counterDoc.exists() ? counterDoc.data()?.count || 0 : 0;
        const nextCount = currentCount + 1;
        transaction.set(counterRef, { count: nextCount }, { merge: true });
        const formattedId = String(nextCount).padStart(8, '0');

        const botRef = doc(db, 'users', currentUser.uid, 'entities', entityId, channel.collection, formattedId);
        transaction.set(botRef, {
          id: formattedId,
          name: `Nuevo bot ${channel.shortTitle}`,
          isActive: false,
          channel: channel.slug,
          botType: channel.botType,
          targetPlatforms: [channel.enginePlatform],
          createdAt: new Date(),
          flow: {
            nodes: [{ id: '1', type: 'startNode', position: { x: 250, y: 5 }, data: { label: 'Inicio' } }],
            edges: [],
          },
        });

        return formattedId;
      });

      router.push(`${editorBase}/${newBotId}`);
    } catch (error) {
      console.error('Error creating bot:', error);
      toast.error('No se pudo crear el bot.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggleBotStatus = async (bot: Bot) => {
    if (!channel.webhookReady) {
      toast.error('Este canal aún no tiene webhook en producción.');
      return;
    }

    if (!integrationConnected) {
      toast.error(`Conecta ${channel.shortTitle} en CTO → Integraciones.`);
      return;
    }

    setUpdatingBots((prev) => [...prev, bot.id]);
    try {
      const newStatus = !bot.isActive;
      await updateExclusiveBotForChannel({
        db,
        userId: currentUser!.uid,
        entityId,
        botId: bot.id,
        botsCollection: channel.collection,
        platformId: channel.enginePlatform,
        activate: newStatus,
      });
      toast.success(`Bot "${bot.name}" ${newStatus ? 'activado' : 'desactivado'}.`);
    } catch {
      toast.error('No se pudo actualizar el bot.');
    } finally {
      setUpdatingBots((prev) => prev.filter((id) => id !== bot.id));
    }
  };

  const confirmDelete = async () => {
    if (!botToDelete || deleteConfirmation !== 'delete' || !currentUser || !entityId) return;
    try {
      await deleteDoc(
        doc(db, 'users', currentUser.uid, 'entities', entityId, channel.collection, botToDelete.id)
      );
      toast.success(`Bot "${botToDelete.name}" eliminado.`);
      setBotToDelete(null);
    } catch {
      toast.error('Error al eliminar el bot.');
    }
  };

  const activeCount = bots.filter((b) => b.isActive).length;
  const showSpinner = authLoading || (isLoading && isReady);

  return (
    <div className="p-6 bg-neutral-900 text-white min-h-screen overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push(`/home/${entityId}/cto/automation`)}
            className="h-8 w-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className={`p-2 rounded-lg ${channel.activeBg} border ${channel.activeBorder}`}>
            <Icon className={`w-5 h-5 ${channel.iconColor}`} />
          </div>
          <div>
            <h1 className="text-xl font-medium tracking-tight">{channel.title}</h1>
            <p className="text-[10px] text-neutral-500 uppercase tracking-widest">
              Canal aislado · {activeCount} activo{activeCount !== 1 ? 's' : ''}
              {!channel.webhookReady && ' · Webhook próximamente'}
            </p>
          </div>
        </div>
        <Button
          onClick={handleCreateNewBot}
          disabled={!isReady || isCreating}
          className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium h-8"
        >
          {isCreating ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-1.5 h-4 w-4" />
          )}
          Crear bot
        </Button>
      </div>

      {!integrationConnected && channel.integrationId && (
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-xs text-amber-200/90">
            Conecta {channel.shortTitle} en Integraciones para recibir mensajes y activar bots.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="border-amber-500/40 text-amber-200 hover:bg-amber-500/20 shrink-0"
            onClick={() => router.push(`/home/${entityId}/cto/integrations`)}
          >
            <ExternalLink className="mr-1.5 h-3 w-3" /> Ir a Integraciones
          </Button>
        </div>
      )}

      {channel.slug === 'instagram-comments' && (
        <div className="mb-6 rounded-lg border border-pink-500/25 bg-pink-500/5 px-4 py-3 text-xs text-pink-100/90 space-y-1">
          <p className="font-semibold text-pink-200">Comentarios en publicaciones de Instagram</p>
          <p>
            Usa la misma cuenta conectada en Integraciones. En Meta → Webhooks activa el campo{' '}
            <strong className="text-white">comments</strong> (no solo live_comments). El bot responderá
            en hilo público al comentario.
          </p>
        </div>
      )}

      {loadError && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
          {loadError}
        </div>
      )}

      {showSpinner ? (
        <div className="flex flex-col justify-center items-center mt-32 gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
          <p className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest">
            {authLoading ? 'Validando sesión…' : 'Cargando bots…'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {bots.length > 0 ? (
            bots.map((bot) => (
              <div
                key={bot.id}
                className="bg-neutral-800 border border-neutral-700 rounded-lg flex flex-col group"
              >
                <div
                  onClick={() => router.push(`${editorBase}/${bot.id}`)}
                  className="p-4 cursor-pointer flex-grow"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className={`p-1.5 rounded-lg ${channel.activeBg}`}>
                      <Icon className={`w-5 h-5 ${channel.iconColor}`} />
                    </div>
                    <span
                      className={`px-2 py-0.5 text-[10px] uppercase font-bold rounded-full ${
                        bot.isActive ? 'bg-green-500/20 text-green-300' : 'bg-neutral-600/50 text-neutral-400'
                      }`}
                    >
                      {bot.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  <h2 className="text-sm font-medium truncate">{bot.name}</h2>
                  <p className="text-[10px] text-neutral-500 font-mono mt-1">{bot.id}</p>
                  <p className="text-[10px] text-neutral-600 mt-2">
                    {getPrimaryPlatform(bot.targetPlatforms) || channel.enginePlatform}
                  </p>
                </div>
                <div className="px-4 py-3 border-t border-neutral-700 flex gap-2">
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleBotStatus(bot);
                    }}
                    disabled={updatingBots.includes(bot.id)}
                    className={`flex-1 text-[10px] uppercase font-bold h-8 ${
                      bot.isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
                    }`}
                  >
                    <Power className="mr-1 h-3 w-3" />
                    {bot.isActive ? 'Desactivar' : 'Activar'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-neutral-500 hover:text-red-400"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBotToDelete(bot);
                      setDeleteConfirmation('');
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full text-center py-20 bg-neutral-800 rounded-xl border border-dashed border-neutral-700">
              <Icon className={`w-10 h-10 mx-auto mb-4 ${channel.iconColor} opacity-40`} />
              <h3 className="text-sm font-bold text-white mb-2">No hay bots de {channel.shortTitle}</h3>
              <p className="text-neutral-500 text-[10px] mb-6">Crea tu primer flujo para {channel.shortTitle}.</p>
              <Button
                onClick={handleCreateNewBot}
                disabled={!isReady || isCreating}
                className="bg-blue-600 hover:bg-blue-700 font-bold px-6 h-8 text-[10px]"
              >
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear ahora'}
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={!!botToDelete} onOpenChange={(open) => !open && setBotToDelete(null)}>
        <DialogContent className="bg-neutral-900 border-neutral-700 text-white">
          <DialogHeader>
            <DialogTitle>Eliminar bot</DialogTitle>
            <DialogDescription className="text-neutral-400 text-xs">
              Escribe <strong>delete</strong> para eliminar &quot;{botToDelete?.name}&quot;.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={deleteConfirmation}
            onChange={(e) => setDeleteConfirmation(e.target.value)}
            className="bg-neutral-800 border-neutral-700"
            placeholder="delete"
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setBotToDelete(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteConfirmation !== 'delete'}
              onClick={confirmDelete}
            >
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
