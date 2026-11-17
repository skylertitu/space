'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
    Bot,
    Hand,
    ArrowLeft,
    Plus,
    Copy,
    Trash2,
    Loader2,
    MoreVertical,
    Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { toast } from 'sonner';
import {
    subscribeBoards,
    createBoardFromBotGroups,
    deleteBoard,
    getBoard,
    resolveBoardKind,
    BOARD_KIND_LABELS,
    type CustomKanbanBoard,
    type CustomBoardKind,
} from '@/lib/kanban/customKanbanBoards';
import { filterGroupsForPrincipalBot, type PrincipalBotOption } from '@/lib/kanban/principalKanban';

const MANUAL_SYSTEM_BOARD = {
    id: 'system_manual',
    name: 'Kanban Manual CRM',
    description: '8 etapas de follow-up humano. Arrastra libremente.',
    href: (entityId: string) => `/home/${entityId}/workspace/manual`,
};

export default function KanbanHubPage() {
    const params = useParams();
    const router = useRouter();
    const entityId = params.entityId as string;
    const base = `/home/${entityId}/workspace`;
    const { currentUser, activeEntity } = useAuth();

    const [customBoards, setCustomBoards] = useState<CustomKanbanBoard[]>([]);
    const [principalBots, setPrincipalBots] = useState<PrincipalBotOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingBots, setLoadingBots] = useState(true);
    const [creating, setCreating] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [newBoardName, setNewBoardName] = useState('');
    const [selectedPrincipalBotId, setSelectedPrincipalBotId] = useState('');
    const [selectedBoardKind, setSelectedBoardKind] = useState<CustomBoardKind>('copy');
    const [duplicateFromId, setDuplicateFromId] = useState<string | null>(null);

    const getTenantPath = () => {
        if (!currentUser?.uid || !activeEntity) return '';
        return `users/${currentUser.uid}/entities/${activeEntity}`;
    };

    useEffect(() => {
        const tenantPath = getTenantPath();
        if (!tenantPath) return;

        const unsub = subscribeBoards(db, tenantPath, (boards) => {
            setCustomBoards(boards);
            setLoading(false);
        });
        return unsub;
    }, [currentUser?.uid, activeEntity]);

    useEffect(() => {
        const tenantPath = getTenantPath();
        if (!tenantPath) return;

        getDocs(collection(db, `${tenantPath}/chatbots`))
            .then((snap) => {
                const bots = snap.docs.map((d) => ({
                    id: d.id,
                    name: d.data().name || d.id,
                    isActive: d.data().isActive,
                }));
                setPrincipalBots(bots);
                if (bots.length && !selectedPrincipalBotId) {
                    setSelectedPrincipalBotId(bots[0].id);
                }
            })
            .finally(() => setLoadingBots(false));
    }, [currentUser?.uid, activeEntity]);

    const fetchBotGroups = async () => {
        const tenantPath = getTenantPath();
        if (!tenantPath) return [];
        const snap = await getDocs(
            query(collection(db, `${tenantPath}/kanban-groups`), orderBy('order', 'asc'))
        );
        return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    };

    const handleCreateBoard = async () => {
        const name = newBoardName.trim();
        if (!name) {
            toast.error('Escribe un nombre para el tablero');
            return;
        }

        const botId = selectedPrincipalBotId;
        if (!botId) {
            toast.error('Elige un Kamban principal (flujo de WhatsApp)');
            return;
        }

        setCreating(true);
        try {
            const tenantPath = getTenantPath();
            if (!tenantPath) throw new Error('Sin tenant');

            let parentBoard: CustomKanbanBoard | undefined;
            if (duplicateFromId) {
                const parent = await getBoard(db, tenantPath, duplicateFromId);
                if (parent) parentBoard = parent;
            }

            const groups = await fetchBotGroups();
            const botGroups = filterGroupsForPrincipalBot(groups, botId);

            if (!parentBoard && botGroups.length === 0) {
                toast.error('El Kamban principal no tiene columnas. Abre el flujo y sincroniza primero.');
                setCreating(false);
                return;
            }

            const boardId = await createBoardFromBotGroups(db, tenantPath, name, groups, {
                parentBoardId: duplicateFromId || undefined,
                parentBoard,
                botId: parentBoard?.botId || botId,
                boardKind: parentBoard ? resolveBoardKind(parentBoard) : selectedBoardKind,
            });

            toast.success(`Tablero "${name}" creado`);
            setCreateOpen(false);
            setNewBoardName('');
            setDuplicateFromId(null);
            router.push(`${base}/board/${boardId}`);
        } catch (err: any) {
            console.error(err);
            toast.error(err?.message || 'Error al crear tablero');
        } finally {
            setCreating(false);
        }
    };

    const handleDuplicate = (board: CustomKanbanBoard) => {
        setDuplicateFromId(board.id);
        setSelectedBoardKind(resolveBoardKind(board));
        if (board.botId) setSelectedPrincipalBotId(board.botId);
        setNewBoardName(`${board.name} (copia)`);
        setCreateOpen(true);
    };

    const openCreateDialog = () => {
        setDuplicateFromId(null);
        setNewBoardName('');
        setSelectedBoardKind('copy');
        if (principalBots.length && !selectedPrincipalBotId) {
            setSelectedPrincipalBotId(principalBots[0].id);
        }
        setCreateOpen(true);
    };

    const handleDelete = async (boardId: string, name: string) => {
        if (!confirm(`¿Eliminar el tablero "${name}"? Esta acción no se puede deshacer.`)) return;
        const tenantPath = getTenantPath();
        if (!tenantPath) return;
        try {
            await deleteBoard(db, tenantPath, boardId);
            toast.success('Tablero eliminado');
        } catch {
            toast.error('Error al eliminar tablero');
        }
    };

    return (
        <div className="min-h-screen bg-[#050505] text-white flex flex-col font-sans tracking-tight">
            <header className="border-b border-white/5 bg-black/40 backdrop-blur-xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Link
                        href={`${base}?role=coo`}
                        className="p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        <ArrowLeft size={16} />
                    </Link>
                    <div>
                        <p className="text-[9px] font-normal uppercase tracking-[0.2em] text-neutral-500">
                            COO · Organizador de Kambas
                        </p>
                        <h1 className="text-base font-normal tracking-tight">Hub</h1>
                    </div>
                </div>
                <Button
                    size="sm"
                    onClick={openCreateDialog}
                    className="bg-violet-600 hover:bg-violet-500 text-white h-8 text-xs"
                >
                    <Plus size={12} className="mr-1.5" />
                    Nuevo tablero
                </Button>
            </header>

            <main className="flex-1 p-4 md:p-8 overflow-y-auto">
                <div className="max-w-6xl mx-auto space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                            Todos los tableros
                        </p>
                        <span className="text-[9px] text-neutral-600">
                            {principalBots.length + 1 + customBoards.length} tableros
                        </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                        {loadingBots ? (
                            <div className="col-span-full flex items-center py-4 text-neutral-600 text-xs">
                                <Loader2 className="animate-spin mr-2" size={14} />
                                Cargando flujos...
                            </div>
                        ) : (
                            principalBots.map((bot) => (
                                <PrincipalBoardCard key={bot.id} bot={bot} entityId={entityId} />
                            ))
                        )}
                        <ManualBoardCard board={MANUAL_SYSTEM_BOARD} entityId={entityId} />

                        {loading ? (
                            <div className="col-span-full flex items-center justify-center py-8 text-neutral-600">
                                <Loader2 className="animate-spin mr-2" size={14} />
                                <span className="text-xs">Cargando...</span>
                            </div>
                        ) : (
                            customBoards.map((board) => (
                                <CustomBoardCard
                                    key={board.id}
                                    board={board}
                                    entityId={entityId}
                                    principalBots={principalBots}
                                    onDuplicate={() => handleDuplicate(board)}
                                    onDelete={() => handleDelete(board.id, board.name)}
                                />
                            ))
                        )}

                        {!loading && (
                            <button
                                type="button"
                                onClick={openCreateDialog}
                                className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-2.5 flex flex-col items-center justify-center gap-1.5 min-h-[88px] text-neutral-600 hover:border-violet-500/30 hover:text-violet-400 transition-colors"
                            >
                                <Plus size={14} />
                                <span className="text-[9px] text-center leading-tight">Nuevo tablero</span>
                            </button>
                        )}
                    </div>
                </div>
            </main>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="bg-[#0a0a0a] border-white/10 text-white max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-sm font-normal">
                            {duplicateFromId ? 'Duplicar tablero' : 'Nuevo tablero'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3 py-1">
                        {!duplicateFromId && (
                            <div className="space-y-1.5">
                                <Label className="text-[10px] text-neutral-500">Tipo de tablero</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(['copy', 'manual'] as const).map((kind) => {
                                        const meta = BOARD_KIND_LABELS[kind];
                                        const active = selectedBoardKind === kind;
                                        return (
                                            <button
                                                key={kind}
                                                type="button"
                                                onClick={() => setSelectedBoardKind(kind)}
                                                className={cn(
                                                    'rounded-lg border p-2.5 text-left transition-colors',
                                                    active
                                                        ? kind === 'copy'
                                                            ? 'border-violet-500/50 bg-violet-500/10'
                                                            : 'border-blue-500/50 bg-blue-500/10'
                                                        : 'border-white/10 bg-black/30 hover:border-white/20'
                                                )}
                                            >
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    {kind === 'copy' ? (
                                                        <Copy size={12} className={active ? 'text-violet-400' : 'text-neutral-500'} />
                                                    ) : (
                                                        <Hand size={12} className={active ? 'text-blue-400' : 'text-neutral-500'} />
                                                    )}
                                                    <span className={cn('text-[11px] font-medium', active ? 'text-white' : 'text-neutral-400')}>
                                                        {meta.title}
                                                    </span>
                                                </div>
                                                <p className="text-[9px] text-neutral-600 leading-snug">{meta.description}</p>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label className="text-[10px] text-neutral-500">Kamban principal (flujo WhatsApp)</Label>
                            <Select
                                value={selectedPrincipalBotId}
                                onValueChange={setSelectedPrincipalBotId}
                                disabled={!!duplicateFromId}
                            >
                                <SelectTrigger className="bg-black/40 border-white/10 h-8 text-sm">
                                    <SelectValue placeholder="Elige un flujo..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {principalBots.map((bot) => (
                                        <SelectItem key={bot.id} value={bot.id}>
                                            {bot.name}
                                            {bot.isActive ? ' · activo' : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-[10px] text-neutral-500">Nombre del tablero</Label>
                            <Input
                                value={newBoardName}
                                onChange={(e) => setNewBoardName(e.target.value)}
                                placeholder={selectedBoardKind === 'copy' ? 'Ej. Vista Gerencia...' : 'Ej. Mi organización...'}
                                className="bg-black/40 border-white/10 h-8 text-sm"
                                onKeyDown={(e) => e.key === 'Enter' && handleCreateBoard()}
                            />
                        </div>
                        <p className="text-[10px] text-neutral-600 leading-relaxed">
                            {duplicateFromId
                                ? 'Se duplicará la estructura del tablero elegido. Las tarjetas vienen del mismo flujo de WhatsApp.'
                                : selectedBoardKind === 'copy'
                                  ? 'Copia las columnas del Kamban Inamovible. Puedes fusionar columnas, mover tarjetas y el orden se guarda al reabrir.'
                                  : 'Empiezas con una bandeja. Creas tus columnas y organizas las tarjetas como quieras — todo se guarda al reabrir.'}
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)} className="border-white/10 h-8">
                            Cancelar
                        </Button>
                        <Button size="sm" onClick={handleCreateBoard} disabled={creating} className="bg-violet-600 hover:bg-violet-500 h-8">
                            {creating ? <Loader2 size={12} className="animate-spin mr-1.5" /> : <Plus size={12} className="mr-1.5" />}
                            Crear
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/** Tablero principal inamovible — uno por flujo de WhatsApp. */
function PrincipalBoardCard({
    bot,
    entityId,
}: {
    bot: PrincipalBotOption;
    entityId: string;
}) {
    return (
        <Link
            href={`/home/${entityId}/workspace/bot?botId=${bot.id}`}
            className={cn(
                'group flex flex-col rounded-xl border border-emerald-500/35 bg-[#0a0a0a] p-2.5 min-h-[88px]',
                'hover:border-emerald-400/50 hover:bg-emerald-950/20 transition-all'
            )}
        >
            <div className="flex items-start justify-between gap-1 mb-2">
                <div className="p-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 shrink-0">
                    <Bot className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <span className="inline-flex items-center gap-0.5 text-[7px] font-bold uppercase tracking-wider px-1 py-0.5 rounded border bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shrink-0">
                    <Lock size={7} />
                    Inamovible
                </span>
            </div>
            <h3 className="text-xs font-medium text-white truncate group-hover:text-emerald-100 transition-colors mb-0.5">
                {bot.name}
            </h3>
            <p className="text-[9px] text-neutral-600 line-clamp-2 leading-snug flex-1">
                Flujo WhatsApp · las tarjetas se mueven solas según el bot
            </p>
        </Link>
    );
}

/** Tablero manual del sistema (CRM follow-ups). */
function ManualBoardCard({
    board,
    entityId,
}: {
    board: typeof MANUAL_SYSTEM_BOARD;
    entityId: string;
}) {
    return (
        <Link
            href={board.href(entityId)}
            className="group flex flex-col rounded-xl border border-white/8 bg-[#0a0a0a] p-2.5 min-h-[88px] hover:border-blue-500/25 hover:bg-[#0d0d0d] transition-all"
        >
            <div className="flex items-start justify-between gap-1 mb-2">
                <div className="p-1.5 rounded-md bg-black border border-white/8 shrink-0">
                    <Hand className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <span className="text-[7px] font-bold uppercase tracking-wider px-1 py-0.5 rounded border bg-blue-500/10 text-blue-400/80 border-blue-500/20 shrink-0">
                    Manual
                </span>
            </div>
            <h3 className="text-xs font-medium text-neutral-300 truncate group-hover:text-white transition-colors mb-0.5">
                {board.name}
            </h3>
            <p className="text-[9px] text-neutral-600 line-clamp-2 leading-snug flex-1">{board.description}</p>
        </Link>
    );
}

/** Copia / vista manual personalizada. */
function CustomBoardCard({
    board,
    entityId,
    principalBots,
    onDuplicate,
    onDelete,
}: {
    board: CustomKanbanBoard;
    entityId: string;
    principalBots: PrincipalBotOption[];
    onDuplicate: () => void;
    onDelete: () => void;
}) {
    const mergedCount = board.columns?.filter((c) => c.sourceGroupIds.length > 1).length || 0;
    const colCount = board.columns?.length || 0;
    const sourceBot = principalBots.find((b) => b.id === board.botId);

    const boardKind = resolveBoardKind(board);
    const kindMeta = BOARD_KIND_LABELS[boardKind];
    const isCopy = boardKind === 'copy';

    return (
        <div className="group relative flex flex-col rounded-xl border border-white/8 bg-[#0a0a0a] p-2.5 min-h-[88px] hover:border-violet-500/20 hover:bg-[#0d0d0d] transition-all">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button className="absolute top-2 right-2 p-0.5 rounded text-neutral-700 hover:text-white hover:bg-white/5 z-10">
                        <MoreVertical size={11} />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-[#111] border-white/10">
                    <DropdownMenuItem onClick={onDuplicate} className="text-xs">
                        <Copy size={11} className="mr-2" />
                        Duplicar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onDelete} className="text-xs text-rose-400">
                        <Trash2 size={11} className="mr-2" />
                        Eliminar
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <Link href={`/home/${entityId}/workspace/board/${board.id}`} className="flex flex-col flex-1 min-w-0">
                <div className="flex items-start justify-between gap-1 mb-2 pr-4">
                    <div className="p-1.5 rounded-md bg-black border border-white/8 shrink-0">
                        {isCopy ? (
                            <Copy className="w-3.5 h-3.5 text-violet-400" />
                        ) : (
                            <Hand className="w-3.5 h-3.5 text-blue-400" />
                        )}
                    </div>
                    <span
                        className={cn(
                            'text-[7px] font-bold uppercase tracking-wider px-1 py-0.5 rounded border shrink-0',
                            isCopy
                                ? 'bg-violet-500/10 text-violet-400/80 border-violet-500/20'
                                : 'bg-blue-500/10 text-blue-400/80 border-blue-500/20'
                        )}
                    >
                        {kindMeta.short}
                    </span>
                </div>
                <h3 className="text-xs font-medium text-neutral-300 truncate group-hover:text-white transition-colors mb-0.5">
                    {board.name}
                </h3>
                <p className="text-[9px] text-neutral-600 line-clamp-2 leading-snug flex-1">
                    {colCount} col{mergedCount > 0 && isCopy ? ` · ${mergedCount} fusionadas` : ''}
                    {sourceBot ? ` · ${sourceBot.name}` : board.botId ? ` · ${board.botId}` : ''}
                </p>
            </Link>
        </div>
    );
}
