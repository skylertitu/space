'use client';
import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Loader2,
  Power,
  Trash2,
  MessageCircle,
  Check,
  Link2,
  Settings2,
  Phone,
  Bot,
  ChevronRight,
  Filter,
  ChevronLeft,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { collection, onSnapshot, doc, deleteDoc, runTransaction, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { useEntityRoute } from '@/hooks/useEntityRoute';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import { isBotActiveValue, toggleBotForPhone } from './utils';
import {
  phoneDigitsFromConnection,
  syncBotStartPhoneInFirestore,
} from '@/lib/chatbot/syncStartNodePhone';
import {
  listConnectedPhones,
  resolveBotPhoneNumberId,
  formatConnectedPhoneLabel,
  findConnectedPhone,
  type ConnectedPhone,
} from '@/lib/whatsapp/botPhoneBinding';
import {
  subscribeSlotConnections,
  saveSlotConnection,
  disconnectSlot,
  SLOTS,
  type NumberSlot,
  type SlotConnections,
  type WhatsAppNumberConnection,
} from '@/lib/whatsapp/numbers';

interface Bot {
  id: string;
  name: string;
  isActive: boolean;
  phoneNumberId?: string;
  numberId?: string;
}

type PhoneFilter = 'all' | string;

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 0 5.414 0 12.05c0 2.123.551 4.197 1.597 6.03l-1.602 5.8 5.883-1.543a11.86 11.86 0 005.815 1.526h.005c6.634 0 12.048-5.414 12.048-12.05 0-3.213-1.252-6.234-3.525-8.508z" />
  </svg>
);

const emptyConnections = (): SlotConnections => ({
  general: { connected: false },
  support: { connected: false },
  broadcast: { connected: false },
});

const ChatbotsPage = () => {
  const router = useRouter();
  const { currentUser } = useAuth();
  const { firestoreId, routeSegment, entityName, tenantPath } = useEntityRoute();
  const [bots, setBots] = useState<Bot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingBots, setUpdatingBots] = useState<string[]>([]);
  const [botToDelete, setBotToDelete] = useState<Bot | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const [connections, setConnections] = useState<SlotConnections>(emptyConnections());
  const [connectSlot, setConnectSlot] = useState<NumberSlot | null>(null);
  const [phoneFilter, setPhoneFilter] = useState<PhoneFilter>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createPhoneId, setCreatePhoneId] = useState('');

  useEffect(() => {
    if (!currentUser || !firestoreId) return;
    const botsCollection = collection(db, 'users', currentUser.uid, 'entities', firestoreId, 'chatbots');
    const unsubscribe = onSnapshot(
      botsCollection,
      (querySnapshot) => {
        setBots(querySnapshot.docs.map((d) => ({
          id: d.id,
          name: d.data().name || 'Unnamed Bot',
          isActive: isBotActiveValue(d.data().isActive),
          phoneNumberId: d.data().phoneNumberId || undefined,
          numberId: d.data().numberId || undefined,
        } as Bot)));
        setIsLoading(false);
      },
      (error) => {
        console.error('Error fetching bots:', error);
        toast.error('No se pudieron cargar los bots.');
        setIsLoading(false);
      }
    );
    return () => unsubscribe();
  }, [currentUser, firestoreId]);

  useEffect(() => {
    if (!tenantPath) return;
    const unsub = subscribeSlotConnections(tenantPath, setConnections);
    return () => unsub();
  }, [tenantPath]);

  const connectedPhones = useMemo(
    () => listConnectedPhones(connections),
    [connections]
  );

  const firstConnectedPhoneId = connectedPhones[0]?.phoneNumberId ?? '';

  const filteredBots = useMemo(() => {
    if (phoneFilter === 'all') return bots;
    return bots.filter(
      (b) => resolveBotPhoneNumberId(b, connections) === phoneFilter
    );
  }, [bots, phoneFilter, connections]);

  const stats = useMemo(() => ({
    total: bots.length,
    active: bots.filter((b) => b.isActive).length,
    connectedNumbers: connectedPhones.length,
  }), [bots, connectedPhones]);

  const nextEmptySlot = useMemo(
    () => SLOTS.find((s) => !connections[s.id].connected)?.id ?? null,
    [connections]
  );

  const openAddNumber = () => {
    if (!nextEmptySlot) {
      toast.message('Máximo 3 números. Edita o desconecta uno para agregar otro.');
      return;
    }
    setConnectSlot(nextEmptySlot);
  };

  const openCreateDialog = () => {
    setCreatePhoneId(firstConnectedPhoneId);
    setShowCreateDialog(true);
  };

  const bindBotToPhone = async (
    bot: Bot,
    phone: ConnectedPhone,
    options?: { activate?: boolean }
  ) => {
    if (!currentUser || !firestoreId) return;
    const botRef = doc(db, 'users', currentUser.uid, 'entities', firestoreId, 'chatbots', bot.id);
    const shouldActivate = options?.activate ?? bot.isActive;

    if (shouldActivate) {
      await toggleBotForPhone({
        db,
        userId: currentUser.uid,
        entityId: firestoreId,
        botId: bot.id,
        phoneNumberId: phone.phoneNumberId,
        numberId: phone.slot,
        activate: true,
      });
    } else {
      await updateDoc(botRef, {
        phoneNumberId: phone.phoneNumberId,
        numberId: phone.slot,
        updatedAt: new Date(),
      });
    }

    const digits = phoneDigitsFromConnection(connections[phone.slot]);
    await syncBotStartPhoneInFirestore(botRef, digits);
  };

  const handleCreateNewBot = async () => {
    if (!currentUser || !firestoreId) return;
    const phone = findConnectedPhone(connections, createPhoneId);
    if (!phone) {
      toast.error('Selecciona un número de WhatsApp conectado.');
      return;
    }
    setShowCreateDialog(false);
    setIsLoading(true);
    try {
      const counterRef = doc(db, 'users', currentUser.uid, 'entities', firestoreId, 'system_metadata', 'chatbot_counter');
      const newBotId = await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        const currentCount = counterDoc.exists() ? (counterDoc.data().count || 0) : 0;
        const nextCount = currentCount + 1;
        transaction.set(counterRef, { count: nextCount }, { merge: true });
        const formattedId = String(nextCount).padStart(8, '0');
        const botRef = doc(db, 'users', currentUser.uid, 'entities', firestoreId, 'chatbots', formattedId);
        transaction.set(botRef, {
          id: formattedId,
          name: 'New WhatsApp Bot',
          isActive: false,
          channel: 'whatsapp',
          botType: 'dm',
          targetPlatforms: ['whatsapp'],
          phoneNumberId: phone.phoneNumberId,
          numberId: phone.slot,
          createdAt: new Date(),
          flow: {
            nodes: [{
              id: '1',
              type: 'startNode',
              position: { x: 250, y: 5 },
              data: {
                label: 'Start',
                welcomeMessage: '¡Hola! ¿En qué puedo ayudarte?',
                triggerPhrase: 'Hola, quiero más información',
              },
            }],
            edges: [],
          },
        });
        return formattedId;
      });
      router.push(`/home/${routeSegment}/cto/automation/whatsappbots/${newBotId}`);
    } catch (error) {
      console.error('Error creating bot:', error);
      toast.error('No se pudo crear el chatbot.');
      setIsLoading(false);
    }
  };

  const handleToggleBotStatus = async (bot: Bot) => {
    if (!currentUser || !firestoreId) return;
    const phoneId = resolveBotPhoneNumberId(bot, connections);
    if (!phoneId) {
      toast.error('Vincula este bot a un número de WhatsApp antes de activarlo.');
      return;
    }
    const phone = findConnectedPhone(connections, phoneId);
    if (!phone) {
      toast.error('El número vinculado ya no está conectado. Elige otro número.');
      return;
    }
    setUpdatingBots((prev) => [...prev, bot.id]);
    try {
      const newStatus = !bot.isActive;
      await toggleBotForPhone({
        db,
        userId: currentUser.uid,
        entityId: firestoreId,
        botId: bot.id,
        phoneNumberId: phone.phoneNumberId,
        numberId: phone.slot,
        activate: newStatus,
      });
      toast.success(`Bot "${bot.name}" ${newStatus ? 'activado' : 'desactivado'}.`);
    } catch (error) {
      console.error('Error updating bot status:', error);
      toast.error('No se pudo actualizar el estado del bot.');
    } finally {
      setUpdatingBots((prev) => prev.filter((id) => id !== bot.id));
    }
  };

  const handleChangeBotPhone = async (bot: Bot, newPhoneId: string) => {
    if (!currentUser || !firestoreId) return;
    const currentPhoneId = resolveBotPhoneNumberId(bot, connections);
    if (currentPhoneId === newPhoneId) return;
    const phone = findConnectedPhone(connections, newPhoneId);
    if (!phone) {
      toast.error('Ese número no está conectado.');
      return;
    }
    setUpdatingBots((prev) => [...prev, bot.id]);
    try {
      await bindBotToPhone(bot, phone, { activate: bot.isActive });
      if (bot.isActive) {
        toast.success(`Bot activo en ${formatConnectedPhoneLabel(phone)}.`);
      } else {
        toast.success(`Bot vinculado a ${formatConnectedPhoneLabel(phone)}. Actívalo cuando quieras.`);
      }
    } catch (error) {
      console.error('Error changing bot number:', error);
      toast.error('No se pudo cambiar el número vinculado.');
    } finally {
      setUpdatingBots((prev) => prev.filter((id) => id !== bot.id));
    }
  };

  const confirmDelete = async () => {
    if (!botToDelete || deleteConfirmation !== 'delete') return;
    try {
      await deleteDoc(doc(db, 'users', currentUser!.uid, 'entities', firestoreId!, 'chatbots', botToDelete.id));
      toast.success(`Bot "${botToDelete.name}" eliminado.`);
      setBotToDelete(null);
    } catch (error) {
      console.error('Error deleting bot:', error);
      toast.error('Error al eliminar el bot.');
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans overflow-y-auto">
      <header className="sticky top-0 z-30 bg-[#050505]/90 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-5 md:px-8 py-5">
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={() => router.push(`/home/${routeSegment}/cto/automation`)}
              className="text-neutral-500 hover:text-white transition-colors shrink-0 p-0.5"
              aria-label="Volver"
            >
              <ChevronLeft className="w-5 h-5" strokeWidth={1.75} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl md:text-2xl font-medium tracking-tight text-white flex items-center gap-2.5">
                <WhatsAppIcon className="w-5 h-5 text-white/70 shrink-0" />
                WhatsApp Bots
              </h1>
              <p className="text-xs text-neutral-500 mt-0.5">
                {entityName ? (
                  <>
                    <span className="text-white/60">{entityName}</span>
                    <span className="mx-1.5 text-white/20">·</span>
                    <span className="font-mono text-white/40">/home/{routeSegment}</span>
                  </>
                ) : (
                  <>Gestiona tus flujos en <span className="font-mono">/home/{routeSegment}</span></>
                )}
              </p>
            </div>
            <button
              onClick={openCreateDialog}
              disabled={connectedPhones.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/15 bg-white/[0.04] text-white text-sm font-medium hover:bg-white/[0.08] hover:border-white/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" /> Crear Bot
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 md:px-8 py-8 space-y-8">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: 'Bots totales', value: stats.total, icon: Bot },
            { label: 'Bots activos', value: stats.active, icon: Power },
            { label: 'Números conectados', value: `${stats.connectedNumbers}/3`, icon: Phone, highlight: stats.connectedNumbers > 0 },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex items-center gap-4 px-5 py-4 rounded-2xl border border-white/[0.06] bg-white/[0.02]"
            >
              <stat.icon className={`w-4 h-4 shrink-0 ${stat.highlight ? 'text-[#25D366]' : 'text-white/50'}`} />
              <div>
                <p className={`text-2xl font-medium tracking-tight ${stat.highlight ? 'text-[#25D366]' : 'text-white'}`}>{stat.value}</p>
                <p className="text-[11px] text-neutral-500">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        <section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 md:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-sm font-medium text-white">Números conectados</h2>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                Hasta 3 números. Cada bot puede vincularse a cualquiera desde su tarjeta.
              </p>
            </div>
            <button
              onClick={openAddNumber}
              disabled={!nextEmptySlot}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-dashed border-white/15 text-xs text-neutral-300 hover:text-white hover:border-white/30 hover:bg-white/[0.04] transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> Añadir número
            </button>
          </div>
          {connectedPhones.length > 0 ? (
            <div className="mt-4 flex flex-col gap-2">
              {connectedPhones.map((phone) => {
                const activeBot = bots.find(
                  (b) =>
                    b.isActive &&
                    resolveBotPhoneNumberId(b, connections) === phone.phoneNumberId
                );
                return (
                  <div
                    key={phone.phoneNumberId}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/[0.06] bg-[#050505]/40"
                  >
                    <span className="w-2 h-2 rounded-full bg-[#25D366] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{formatConnectedPhoneLabel(phone)}</p>
                      {activeBot ? (
                        <p className="text-[10px] text-neutral-500 truncate mt-0.5">
                          Bot activo: <span className="text-neutral-400">{activeBot.name}</span>
                        </p>
                      ) : (
                        <p className="text-[10px] text-neutral-600 mt-0.5">Sin bot activo</p>
                      )}
                    </div>
                    <button
                      onClick={() => setConnectSlot(phone.slot)}
                      className="shrink-0 flex items-center gap-1 text-[10px] text-neutral-500 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-white/5"
                    >
                      <Settings2 className="w-3.5 h-3.5" /> Editar
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-4 py-8 text-center rounded-xl border border-dashed border-white/10">
              <Phone className="w-8 h-8 text-neutral-700 mx-auto mb-2" />
              <p className="text-sm text-neutral-400 mb-3">Aún no hay números conectados</p>
              <button
                onClick={openAddNumber}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/15 text-xs text-white hover:bg-white/[0.06] transition-all"
              >
                <Link2 className="w-3.5 h-3.5" /> Añadir primer número
              </button>
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
            <h2 className="text-sm font-medium text-white">Mis Bots</h2>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Filter className="w-3.5 h-3.5 text-neutral-600 mr-1" />
              {(['all', ...connectedPhones.map((p) => p.phoneNumberId)] as PhoneFilter[]).map((filter) => {
                const label =
                  filter === 'all'
                    ? 'Todos'
                    : formatConnectedPhoneLabel(
                        connectedPhones.find((p) => p.phoneNumberId === filter)!
                      );
                const count =
                  filter === 'all'
                    ? bots.length
                    : bots.filter(
                        (b) => resolveBotPhoneNumberId(b, connections) === filter
                      ).length;
                const isActive = phoneFilter === filter;
                return (
                  <button
                    key={filter}
                    onClick={() => setPhoneFilter(filter)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] transition-all ${
                      isActive
                        ? 'bg-white/10 text-white border border-white/15'
                        : 'text-neutral-500 hover:text-white border border-transparent'
                    }`}
                  >
                    {label}
                    <span className="ml-1.5 text-neutral-600">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-col justify-center items-center py-32 gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-neutral-500" />
              <p className="text-neutral-500 text-[10px] uppercase tracking-widest">Cargando...</p>
            </div>
          ) : connectedPhones.length === 0 ? (
            <div className="text-center py-20 bg-white/[0.02] rounded-2xl border border-dashed border-white/10">
              <Link2 size={36} className="text-neutral-700 mx-auto mb-4" />
              <h3 className="text-base font-medium text-white mb-2">Conecta tu primer número</h3>
              <p className="text-neutral-500 text-sm mb-6 max-w-md mx-auto">
                Para crear bots necesitas conectar al menos un número de WhatsApp Cloud API.
              </p>
              <button
                onClick={openAddNumber}
                className="inline-flex items-center gap-2 border border-white/15 bg-white/[0.04] text-white font-medium px-6 py-2.5 rounded-xl text-sm hover:bg-white/[0.08] transition-all"
              >
                <Link2 className="w-4 h-4" /> Conectar número
              </button>
            </div>
          ) : filteredBots.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredBots.map((bot) => (
                <BotCard
                  key={bot.id}
                  bot={bot}
                  connections={connections}
                  isUpdating={updatingBots.includes(bot.id)}
                  onOpen={() => router.push(`/home/${routeSegment}/cto/automation/whatsappbots/${bot.id}`)}
                  onDelete={() => { setBotToDelete(bot); setDeleteConfirmation(''); }}
                  onToggle={() => handleToggleBotStatus(bot)}
                  onChangePhone={(phoneId) => handleChangeBotPhone(bot, phoneId)}
                  connectedPhones={connectedPhones}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-white/[0.02] rounded-2xl border border-dashed border-white/10">
              <MessageCircle size={36} className="text-neutral-700 mx-auto mb-4" />
              <h3 className="text-base font-medium text-white mb-2">
                {phoneFilter === 'all' ? 'Aún no tienes bots' : 'Sin bots en este número'}
              </h3>
              <p className="text-neutral-500 text-sm mb-6">
                Crea un flujo automatizado y elige con qué número de WhatsApp responder.
              </p>
              <button
                onClick={openCreateDialog}
                className="inline-flex items-center gap-2 border border-white/15 hover:bg-white/5 font-medium px-6 py-2.5 rounded-xl text-sm transition-all"
              >
                <Plus className="w-4 h-4" /> Crear bot
              </button>
            </div>
          )}
        </section>
      </main>

      <Dialog open={!!botToDelete} onOpenChange={(open) => !open && setBotToDelete(null)}>
        <DialogContent className="bg-[#0a0a0a] border-white/10 text-white sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-medium tracking-tight">Eliminar Chatbot</DialogTitle>
            <DialogDescription className="text-neutral-400 text-xs">
              Confirma escribiendo <span className="text-white font-bold italic">&quot;delete&quot;</span> para eliminar <span className="text-white font-bold">&quot;{botToDelete?.name}&quot;</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              className="bg-white/5 border-white/10 text-white rounded-xl py-5 px-4 text-sm font-mono text-center tracking-widest"
              placeholder="delete"
              autoComplete="off"
            />
          </div>
          <DialogFooter className="flex gap-3">
            <button onClick={() => setBotToDelete(null)} className="flex-1 h-11 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl text-xs">
              Cancelar
            </button>
            <button disabled={deleteConfirmation !== 'delete'} onClick={confirmDelete} className="flex-1 h-11 border border-red-500/30 text-red-300 hover:bg-red-500/10 rounded-xl text-xs disabled:opacity-40">
              Eliminar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-[#0a0a0a] border-white/10 text-white sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-medium tracking-tight">Nuevo WhatsApp Bot</DialogTitle>
            <DialogDescription className="text-neutral-400 text-xs">
              Elige con qué número de WhatsApp quieres vincular este bot.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-neutral-500">Número de WhatsApp</label>
              <Select value={createPhoneId} onValueChange={setCreatePhoneId}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl h-11">
                  <SelectValue placeholder="Selecciona un número" />
                </SelectTrigger>
                <SelectContent className="bg-[#141414] border-white/10 text-white">
                  {connectedPhones.map((phone) => (
                    <SelectItem key={phone.phoneNumberId} value={phone.phoneNumberId} className="text-sm">
                      {formatConnectedPhoneLabel(phone)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {connectedPhones.length === 0 && (
              <button
                onClick={() => { setShowCreateDialog(false); openAddNumber(); }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-white/15 text-neutral-400 text-xs hover:text-white hover:border-white/25 transition-all"
              >
                <Link2 className="w-3.5 h-3.5" /> Conectar un número
              </button>
            )}
          </div>
          <DialogFooter className="flex gap-3">
            <button onClick={() => setShowCreateDialog(false)} className="flex-1 h-11 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl text-xs">
              Cancelar
            </button>
            <button
              onClick={handleCreateNewBot}
              disabled={!createPhoneId}
              className="flex-1 h-11 border border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08] rounded-xl text-xs font-medium disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Crear bot
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConnectNumberDialog
        open={!!connectSlot}
        slot={connectSlot}
        connection={connectSlot ? connections[connectSlot] : null}
        tenantPath={tenantPath}
        onClose={() => setConnectSlot(null)}
      />
    </div>
  );
};

interface BotCardProps {
  bot: Bot;
  connections: SlotConnections;
  connectedPhones: ConnectedPhone[];
  isUpdating: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onChangePhone: (phoneNumberId: string) => void;
}

function BotCard({
  bot,
  connections,
  connectedPhones,
  isUpdating,
  onOpen,
  onDelete,
  onToggle,
  onChangePhone,
}: BotCardProps) {
  const currentPhoneId = resolveBotPhoneNumberId(bot, connections) || '';
  const currentPhone = findConnectedPhone(connections, currentPhoneId);
  const isNumberConnected = !!currentPhone;

  return (
    <div className="group bg-white/[0.02] border border-white/[0.06] rounded-2xl hover:border-white/15 transition-all duration-300 flex flex-col overflow-hidden">
      <div onClick={onOpen} className="p-5 cursor-pointer flex-grow">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <WhatsAppIcon className="w-5 h-5 text-white/50 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-base font-medium text-white truncate leading-tight group-hover:text-white/80 transition-colors">
                {bot.name}
              </h3>
              <p className="text-[10px] text-neutral-600 font-mono mt-0.5">{bot.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`px-2.5 py-1 text-[9px] uppercase font-medium tracking-wider rounded-full ${
                bot.isActive
                  ? 'bg-white/10 text-white ring-1 ring-white/15'
                  : 'bg-white/5 text-neutral-500'
              }`}
            >
              {bot.isActive ? 'Activo' : 'Inactivo'}
            </span>
            <button
              className="h-7 w-7 flex items-center justify-center text-neutral-600 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <button
          onClick={onOpen}
          className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-white transition-colors"
        >
          Editar flujo <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      <div className="px-5 pb-4 space-y-2" onClick={(e) => e.stopPropagation()}>
        <label className="text-[10px] uppercase tracking-widest text-neutral-500 flex items-center gap-1.5">
          <Phone className="w-3 h-3" /> Número vinculado
        </label>
        <Select
          value={currentPhoneId || undefined}
          onValueChange={onChangePhone}
          disabled={isUpdating}
        >
          <SelectTrigger className="bg-white/[0.03] border-white/[0.08] text-white rounded-xl h-10 text-xs">
            <SelectValue placeholder="Elige un número">
              {isNumberConnected ? (
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#25D366]" />
                  {formatConnectedPhoneLabel(currentPhone)}
                </span>
              ) : (
                <span className="text-neutral-400">Sin número vinculado</span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-[#141414] border-white/10 text-white">
            {connectedPhones.map((phone) => (
              <SelectItem key={phone.phoneNumberId} value={phone.phoneNumberId} className="text-xs">
                {formatConnectedPhoneLabel(phone)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!isNumberConnected && connectedPhones.length > 0 && (
          <p className="text-[10px] text-neutral-500">Elige un número conectado para este bot.</p>
        )}
      </div>

      <div className="px-5 py-4 border-t border-white/[0.05] mt-auto">
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          disabled={isUpdating || (!isNumberConnected && !bot.isActive)}
          className={`w-full h-10 rounded-xl font-medium text-[11px] uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-40 ${
            bot.isActive
              ? 'border border-red-500/25 text-red-300 hover:bg-red-500/10'
              : 'border border-white/15 text-white/80 hover:bg-white/[0.05]'
          }`}
        >
          {isUpdating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Power className="h-3.5 w-3.5" />
              {bot.isActive ? 'Desactivar' : 'Activar'}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function ConnectNumberDialog({
  open,
  slot,
  connection,
  tenantPath,
  onClose,
}: {
  open: boolean;
  slot: NumberSlot | null;
  connection: WhatsAppNumberConnection | null;
  tenantPath: string;
  onClose: () => void;
}) {
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [displayPhoneNumber, setDisplayPhoneNumber] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && connection) {
      setPhoneNumberId(connection.phoneNumberId || '');
      setWabaId(connection.wabaId || '');
      setAccessToken(connection.accessToken || '');
      setDisplayPhoneNumber(connection.displayPhoneNumber || '');
    } else if (open) {
      setPhoneNumberId('');
      setWabaId('');
      setAccessToken('');
      setDisplayPhoneNumber('');
    }
  }, [open, connection]);

  const isEditing = !!connection?.connected;

  const handleSave = async () => {
    if (!tenantPath || !slot) return;
    if (!phoneNumberId.trim() || !accessToken.trim()) {
      toast.error('Necesitas Phone Number ID y Access Token.');
      return;
    }
    setSaving(true);
    try {
      await saveSlotConnection(tenantPath, slot, {
        phoneNumberId,
        wabaId,
        accessToken,
        displayPhoneNumber,
      });
      toast.success(isEditing ? 'Número actualizado.' : 'Número conectado.');
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!tenantPath || !slot) return;
    setSaving(true);
    try {
      await disconnectSlot(tenantPath, slot);
      toast.success('Número desconectado.');
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'No se pudo desconectar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#0a0a0a] border-white/10 text-white sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-medium tracking-tight">
            {isEditing ? 'Editar número' : 'Añadir número'}
          </DialogTitle>
          <DialogDescription className="text-neutral-400 text-xs">
            Credenciales de WhatsApp Cloud API. Puedes vincular cualquier bot a este número después.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-widest text-neutral-500">Phone Number ID</label>
              <Input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value.replace(/[^0-9]/g, ''))} placeholder="6768377..." className="bg-white/5 border-white/10 text-white rounded-xl text-xs font-mono" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-widest text-neutral-500">Número visible</label>
              <Input value={displayPhoneNumber} onChange={(e) => setDisplayPhoneNumber(e.target.value)} placeholder="+1 385 ..." className="bg-white/5 border-white/10 text-white rounded-xl text-xs" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-widest text-neutral-500">WABA ID</label>
            <Input value={wabaId} onChange={(e) => setWabaId(e.target.value.replace(/[^0-9]/g, ''))} placeholder="2530479..." className="bg-white/5 border-white/10 text-white rounded-xl text-xs font-mono" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-widest text-neutral-500">Access Token</label>
            <textarea value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="EAA..." className="w-full h-20 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-white font-mono resize-none outline-none focus:border-white/25" />
          </div>
        </div>

        <DialogFooter className="flex gap-3">
          {connection?.connected && (
            <button onClick={handleDisconnect} disabled={saving} className="h-11 px-4 border border-red-500/30 text-red-300 hover:bg-red-500/10 rounded-xl text-xs disabled:opacity-40">
              Desconectar
            </button>
          )}
          <button onClick={onClose} className="flex-1 h-11 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl text-xs">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} className="flex-1 h-11 border border-white/20 text-white hover:bg-white/10 rounded-xl text-xs disabled:opacity-40 flex items-center justify-center gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Guardar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ChatbotsPage;
