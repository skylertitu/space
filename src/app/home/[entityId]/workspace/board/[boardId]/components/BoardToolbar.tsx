'use client';

import React, { useMemo, useState } from 'react';
import {
    Merge,
    Split,
    Plus,
    ArrowUpDown,
    Calendar,
    Globe,
    Radio,
    Clock,
    X,
    Columns3,
    SlidersHorizontal,
    ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { BoardColumn, CustomBoardFilters, CustomBoardKind, CustomBoardSortMode } from '@/lib/kanban/customKanbanBoards';
import {
    mergeBoardColumns,
    splitBoardColumn,
    addManualColumn,
    DEFAULT_BOARD_FILTERS,
} from '@/lib/kanban/customKanbanBoards';
import {
    collectFilterOptions,
    getCountryLabel,
    hasActiveFilters,
} from '@/lib/kanban/customKanbanFilters';

type ToolbarTab = 'columns' | 'filters' | 'sort';

function Chip({
    active,
    onClick,
    children,
    onRemove,
}: {
    active?: boolean;
    onClick?: () => void;
    children: React.ReactNode;
    onRemove?: () => void;
}) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] border transition-colors',
                active
                    ? 'bg-violet-600/25 border-violet-500/40 text-violet-100'
                    : 'bg-white/[0.04] border-white/10 text-neutral-400 hover:text-neutral-200'
            )}
        >
            {onClick ? (
                <button type="button" onClick={onClick} className="truncate max-w-[120px]">
                    {children}
                </button>
            ) : (
                <span className="truncate max-w-[120px]">{children}</span>
            )}
            {onRemove && (
                <button type="button" onClick={onRemove} className="text-neutral-500 hover:text-white">
                    <X size={10} />
                </button>
            )}
        </span>
    );
}

interface BoardToolbarProps {
    boardKind: CustomBoardKind;
    columns: BoardColumn[];
    filters: CustomBoardFilters;
    sortMode: CustomBoardSortMode;
    groupsById: Record<string, any>;
    allCards: any[];
    onColumnsChange: (columns: BoardColumn[]) => void;
    onFiltersChange: (filters: CustomBoardFilters) => void;
    onSortModeChange: (mode: CustomBoardSortMode) => void;
}

const CHANNEL_LABELS: Record<string, string> = {
    whatsapp: 'WA',
    instagram: 'IG',
    messenger: 'FB',
    telegram: 'TG',
    gmail: 'Mail',
    x: 'X',
    tiktok: 'TT',
    snapchat: 'SC',
    web: 'Web',
    others: '·',
};

const SORT_LABELS: Record<CustomBoardSortMode, string> = {
    last_activity: 'Actividad',
    fifo: 'Antiguo',
    lifo: 'Reciente',
    manual: 'Manual',
};

const DATE_LABELS: Record<string, string> = {
    all: 'Todas',
    today: 'Hoy',
    yesterday: 'Ayer',
    week: 'Semana',
    month: 'Mes',
    custom: 'Rango',
};

export default function BoardToolbar({
    boardKind,
    columns,
    filters,
    sortMode,
    groupsById,
    allCards,
    onColumnsChange,
    onFiltersChange,
    onSortModeChange,
}: BoardToolbarProps) {
    const [tab, setTab] = useState<ToolbarTab>('columns');
    const [expanded, setExpanded] = useState(true);
    const [selectedCols, setSelectedCols] = useState<string[]>([]);
    const [mergeName, setMergeName] = useState('');
    const [newColName, setNewColName] = useState('');

    const sorted = [...columns].sort((a, b) => a.order - b.order);
    const { countries, channels } = useMemo(() => collectFilterOptions(allCards), [allCards]);
    const filtersOn = hasActiveFilters(filters);

    const toggleCol = (id: string) => {
        setSelectedCols((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const canMerge = boardKind === 'copy';
    const canSplit = canMerge &&
        selectedCols.length === 1 &&
        (columns.find((c) => c.id === selectedCols[0])?.sourceGroupIds.length ?? 0) > 1;

    const patchFilters = (patch: Partial<CustomBoardFilters>) => {
        onFiltersChange({ ...filters, ...patch });
    };

    const activeFilterChips = useMemo(() => {
        const chips: { label: string; clear: () => void }[] = [];
        if (filters.dateRange !== 'all') {
            chips.push({
                label: DATE_LABELS[filters.dateRange] || filters.dateRange,
                clear: () => patchFilters({ dateRange: 'all', customDateFrom: undefined, customDateTo: undefined }),
            });
        }
        if (filters.country && filters.country !== 'all') {
            chips.push({
                label: getCountryLabel(filters.country),
                clear: () => patchFilters({ country: 'all' }),
            });
        }
        if (filters.channel && filters.channel !== 'all') {
            chips.push({
                label: CHANNEL_LABELS[filters.channel] || filters.channel,
                clear: () => patchFilters({ channel: 'all' }),
            });
        }
        if (filters.unreadOnly) chips.push({ label: 'No leídos', clear: () => patchFilters({ unreadOnly: false }) });
        if (filters.unassignedOnly) chips.push({ label: 'Sin asignar', clear: () => patchFilters({ unassignedOnly: false }) });
        if (filters.noResponseHours) {
            chips.push({
                label: `+${filters.noResponseHours}h`,
                clear: () => patchFilters({ noResponseHours: undefined }),
            });
        }
        if (filters.keyword?.trim()) {
            chips.push({ label: `"${filters.keyword}"`, clear: () => patchFilters({ keyword: '' }) });
        }
        return chips;
    }, [filters]);

    const tabs: { id: ToolbarTab; label: string; icon: React.ElementType; badge?: number }[] = [
        { id: 'columns', label: 'Columnas', icon: Columns3 },
        { id: 'filters', label: 'Filtros', icon: SlidersHorizontal, badge: activeFilterChips.length || undefined },
        { id: 'sort', label: 'Orden', icon: ArrowUpDown },
    ];

    return (
        <div className="border-b border-white/5 bg-[#080808]">
            {/* Barra compacta siempre visible */}
            <div className="flex items-center gap-1 px-3 py-1.5">
                <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-white/[0.03] border border-white/5">
                    {tabs.map(({ id, label, icon: Icon, badge }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => {
                                setTab(id);
                                setExpanded(true);
                            }}
                            className={cn(
                                'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors',
                                tab === id && expanded
                                    ? 'bg-violet-600/30 text-violet-100'
                                    : 'text-neutral-500 hover:text-neutral-300'
                            )}
                        >
                            <Icon size={11} />
                            <span className="hidden sm:inline">{label}</span>
                            {badge ? (
                                <span className="min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-violet-500 text-[8px] text-white px-0.5">
                                    {badge}
                                </span>
                            ) : null}
                        </button>
                    ))}
                </div>

                {/* Chips activos (siempre visibles, compactos) */}
                <div className="flex-1 flex items-center gap-1 overflow-x-auto no-scrollbar min-w-0">
                    <Chip active>{SORT_LABELS[sortMode]}</Chip>
                    {activeFilterChips.slice(0, 4).map((c) => (
                        <Chip key={c.label} onRemove={c.clear}>
                            {c.label}
                        </Chip>
                    ))}
                    {activeFilterChips.length > 4 && (
                        <span className="text-[9px] text-neutral-600">+{activeFilterChips.length - 4}</span>
                    )}
                </div>

                {filtersOn && (
                    <button
                        type="button"
                        onClick={() => onFiltersChange({ ...DEFAULT_BOARD_FILTERS })}
                        className="text-[9px] text-rose-400/80 hover:text-rose-300 shrink-0 px-1.5"
                    >
                        Limpiar
                    </button>
                )}

                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    className="p-1 rounded-md text-neutral-600 hover:text-white hover:bg-white/5 shrink-0"
                    aria-label={expanded ? 'Ocultar panel' : 'Mostrar panel'}
                >
                    <ChevronDown size={14} className={cn('transition-transform', expanded && 'rotate-180')} />
                </button>
            </div>

            {/* Panel expandible — solo el tab activo */}
            {expanded && (
                <div className="px-3 pb-2.5 pt-0 border-t border-white/[0.03]">
                    {tab === 'columns' && (
                        <div className="space-y-2 pt-2">
                            <div className="flex flex-wrap gap-1 max-h-[72px] overflow-y-auto">
                                {sorted.map((col) => (
                                    <button
                                        key={col.id}
                                        type="button"
                                        onClick={() => toggleCol(col.id)}
                                        className={cn(
                                            'px-2 py-1 rounded-md text-[10px] border truncate max-w-[130px] transition-colors',
                                            selectedCols.includes(col.id)
                                                ? 'bg-violet-500/25 border-violet-500/50 text-violet-100'
                                                : 'bg-white/[0.02] border-white/8 text-neutral-500 hover:border-white/15'
                                        )}
                                        title={col.name}
                                    >
                                        {col.name}
                                        {col.sourceGroupIds.length > 1 && (
                                            <span className="text-violet-400 ml-0.5">×{col.sourceGroupIds.length}</span>
                                        )}
                                    </button>
                                ))}
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                                {canMerge && selectedCols.length >= 2 ? (
                                    <>
                                        <Input
                                            value={mergeName}
                                            onChange={(e) => setMergeName(e.target.value)}
                                            placeholder="Nombre de columna fusionada"
                                            className="h-7 flex-1 min-w-[140px] max-w-xs bg-black/50 border-white/10 text-[10px]"
                                            onKeyDown={(e) => e.key === 'Enter' && mergeName.trim() && onColumnsChange(mergeBoardColumns(columns, selectedCols, mergeName.trim()))}
                                        />
                                        <Button
                                            size="sm"
                                            disabled={!mergeName.trim()}
                                            onClick={() => {
                                                onColumnsChange(mergeBoardColumns(columns, selectedCols, mergeName.trim()));
                                                setSelectedCols([]);
                                                setMergeName('');
                                            }}
                                            className="h-7 text-[10px] bg-violet-600 hover:bg-violet-500"
                                        >
                                            <Merge size={11} className="mr-1" />
                                            Fusionar {selectedCols.length}
                                        </Button>
                                    </>
                                ) : canMerge ? (
                                    <p className="text-[9px] text-neutral-600">
                                        Selecciona 2+ columnas para fusionar
                                        {selectedCols.length === 1 && ' · 1 seleccionada'}
                                    </p>
                                ) : (
                                    <p className="text-[9px] text-neutral-600">
                                        Tablero manual — crea columnas y arrastra tarjetas libremente
                                    </p>
                                )}
                                {canMerge && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={!canSplit}
                                        onClick={() => {
                                            onColumnsChange(splitBoardColumn(columns, selectedCols[0], groupsById));
                                            setSelectedCols([]);
                                        }}
                                        className="h-7 text-[10px] border-white/10 ml-auto"
                                    >
                                        <Split size={11} className="mr-1" />
                                        Separar
                                    </Button>
                                )}
                                <Input
                                    value={newColName}
                                    onChange={(e) => setNewColName(e.target.value)}
                                    placeholder="Nueva columna..."
                                    className="h-7 w-28 bg-black/50 border-white/10 text-[10px]"
                                />
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        if (!newColName.trim()) return;
                                        const name = newColName.trim();
                                        onColumnsChange(addManualColumn(columns, name));
                                        setNewColName('');
                                        toast.success(`Columna "${name}" creada y guardada`);
                                    }}
                                    className="h-7 text-[10px] border-white/10"
                                >
                                    <Plus size={11} />
                                </Button>
                            </div>
                        </div>
                    )}

                    {tab === 'filters' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 pt-2">
                            {/* Fecha */}
                            <div>
                                <p className="text-[9px] uppercase tracking-wider text-neutral-600 mb-1 flex items-center gap-1">
                                    <Calendar size={9} /> Fecha
                                </p>
                                <div className="flex flex-wrap gap-1">
                                    {(['all', 'today', 'yesterday', 'week', 'month', 'custom'] as const).map((r) => (
                                        <Chip
                                            key={r}
                                            active={filters.dateRange === r}
                                            onClick={() => patchFilters({ dateRange: r })}
                                        >
                                            {DATE_LABELS[r]}
                                        </Chip>
                                    ))}
                                </div>
                                {filters.dateRange === 'custom' && (
                                    <div className="flex gap-1 mt-1">
                                        <Input type="date" value={filters.customDateFrom || ''} onChange={(e) => patchFilters({ customDateFrom: e.target.value })} className="h-6 text-[9px] bg-black/50 border-white/10 flex-1" />
                                        <Input type="date" value={filters.customDateTo || ''} onChange={(e) => patchFilters({ customDateTo: e.target.value })} className="h-6 text-[9px] bg-black/50 border-white/10 flex-1" />
                                    </div>
                                )}
                            </div>

                            {/* Hora + Estado */}
                            <div>
                                <p className="text-[9px] uppercase tracking-wider text-neutral-600 mb-1 flex items-center gap-1">
                                    <Clock size={9} /> Hora · Estado
                                </p>
                                <div className="flex gap-1 mb-1">
                                    <Input type="number" min={0} max={23} placeholder="Desde" value={filters.hourFrom ?? ''} onChange={(e) => patchFilters({ hourFrom: e.target.value ? Number(e.target.value) : undefined })} className="h-6 w-16 text-[9px] bg-black/50 border-white/10" />
                                    <Input type="number" min={0} max={23} placeholder="Hasta" value={filters.hourTo ?? ''} onChange={(e) => patchFilters({ hourTo: e.target.value ? Number(e.target.value) : undefined })} className="h-6 w-16 text-[9px] bg-black/50 border-white/10" />
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    <Chip active={!!filters.unreadOnly} onClick={() => patchFilters({ unreadOnly: !filters.unreadOnly })}>No leídos</Chip>
                                    <Chip active={!!filters.unassignedOnly} onClick={() => patchFilters({ unassignedOnly: !filters.unassignedOnly })}>Sin asignar</Chip>
                                    <Chip active={filters.noResponseHours === 24} onClick={() => patchFilters({ noResponseHours: filters.noResponseHours === 24 ? undefined : 24 })}>+24h</Chip>
                                    <Chip active={filters.noResponseHours === 72} onClick={() => patchFilters({ noResponseHours: filters.noResponseHours === 72 ? undefined : 72 })}>+72h</Chip>
                                </div>
                                <Input value={filters.keyword || ''} onChange={(e) => patchFilters({ keyword: e.target.value })} placeholder="Palabra clave..." className="h-6 mt-1 text-[9px] bg-black/50 border-white/10" />
                            </div>

                            {/* País + Canal */}
                            <div>
                                <p className="text-[9px] uppercase tracking-wider text-neutral-600 mb-1 flex items-center gap-1">
                                    <Globe size={9} /> País · <Radio size={9} /> Canal
                                </p>
                                <div className="flex flex-wrap gap-1 mb-1">
                                    <Chip active={!filters.country || filters.country === 'all'} onClick={() => patchFilters({ country: 'all' })}>Todos</Chip>
                                    {countries.map((code) => (
                                        <Chip key={code} active={filters.country === code} onClick={() => patchFilters({ country: code })}>
                                            {getCountryLabel(code)}
                                        </Chip>
                                    ))}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    <Chip active={!filters.channel || filters.channel === 'all'} onClick={() => patchFilters({ channel: 'all' })}>Todos</Chip>
                                    {channels.map((ch) => (
                                        <Chip key={ch} active={filters.channel === ch} onClick={() => patchFilters({ channel: ch })}>
                                            {CHANNEL_LABELS[ch] || ch}
                                        </Chip>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {tab === 'sort' && (
                        <div className="flex flex-wrap gap-1.5 pt-2">
                            {(Object.keys(SORT_LABELS) as CustomBoardSortMode[]).map((mode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => onSortModeChange(mode)}
                                    className={cn(
                                        'px-4 py-2 rounded-lg text-[11px] font-medium border transition-all',
                                        sortMode === mode
                                            ? 'bg-violet-600/25 border-violet-500/50 text-violet-100 shadow-[0_0_12px_-4px_rgba(139,92,246,0.4)]'
                                            : 'bg-white/[0.02] border-white/10 text-neutral-500 hover:text-white'
                                    )}
                                >
                                    {SORT_LABELS[mode]}
                                </button>
                            ))}
                            <p className="w-full text-[9px] text-neutral-600 mt-1">
                                {sortMode === 'manual'
                                    ? 'Arrastra tarjetas para definir el orden dentro de cada columna.'
                                    : 'El orden se aplica dentro de cada columna del tablero.'}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
