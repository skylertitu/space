import { CheckCircle2, AlertCircle, MessageSquare, Radio } from 'lucide-react';
import Link from 'next/link';
import type { WhatsAppIntegrationHealth } from '@/lib/omnichannel/whatsappIntegrationStatus';

interface Props {
    health: WhatsAppIntegrationHealth;
    entityId: string;
    compact?: boolean;
}

export function WhatsAppReadinessPanel({ health, entityId, compact = false }: Props) {
    const items = [
        { ok: health.hasPhoneNumberId, label: 'Phone Number ID', detail: health.phoneNumberId || 'No configurado' },
        { ok: health.hasWabaId, label: 'WABA ID', detail: health.wabaId || 'Opcional' },
        { ok: health.hasAccessToken, label: 'Access Token (Meta)', detail: health.hasAccessToken ? 'Configurado' : 'Falta — no podrás enviar desde omnicanal' },
        { ok: health.canReceive, label: 'Bot / Webhook', detail: health.canReceive ? 'Puede recibir mensajes' : 'Revisar webhook' },
        { ok: health.canSend, label: 'Omnicanal (enviar)', detail: health.canSend ? 'Listo para escribir al cliente' : 'Completa Phone ID + Token' },
    ];

    if (compact) {
        return (
            <div className={`p-4 rounded-2xl border text-left ${health.canSend ? 'bg-emerald-500/5 border-emerald-500/25' : 'bg-amber-500/5 border-amber-500/25'}`}>
                <div className="flex items-center gap-2 mb-2">
                    {health.canSend ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-amber-400" />}
                    <span className={`text-[11px] font-bold uppercase tracking-widest ${health.canSend ? 'text-emerald-300' : 'text-amber-300'}`}>
                        {health.label}
                    </span>
                </div>
                <p className="text-[10px] text-white/45 leading-relaxed">
                    {health.canSend
                        ? 'Puedes tomar el chat en Omnicanal y responder al cliente.'
                        : 'El bot puede recibir, pero para enviar mensajes manuales necesitas Phone ID y Access Token guardados.'}
                </p>
            </div>
        );
    }

    return (
        <div className={`w-full p-5 rounded-2xl border text-left space-y-4 ${health.canSend ? 'bg-emerald-500/[0.06] border-emerald-500/25' : 'bg-amber-500/[0.06] border-amber-500/25'}`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        {health.canSend ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <AlertCircle className="w-5 h-5 text-amber-400" />}
                        <h4 className={`text-sm font-semibold ${health.canSend ? 'text-emerald-200' : 'text-amber-200'}`}>
                            {health.canSend ? 'Listo para escribir en Omnicanal' : 'Configuración pendiente para enviar'}
                        </h4>
                    </div>
                    {health.displayPhoneNumber && (
                        <p className="text-[11px] text-white/50 font-mono">{health.displayPhoneNumber}</p>
                    )}
                </div>
                {health.canSend && (
                    <Link
                        href={`/home/${entityId}/coo/omnichannel`}
                        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-emerald-600/20 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider text-emerald-200 hover:bg-emerald-600/30 transition-colors"
                    >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Ir a Omnicanal
                    </Link>
                )}
            </div>

            <ul className="space-y-2">
                {items.map((item) => (
                    <li key={item.label} className="flex items-start gap-2.5 text-[11px]">
                        <span className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${item.ok ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-neutral-500'}`}>
                            {item.ok ? '✓' : '·'}
                        </span>
                        <div>
                            <span className="text-white/80 font-medium">{item.label}</span>
                            <span className="text-white/40"> — {item.detail}</span>
                        </div>
                    </li>
                ))}
            </ul>

            <p className="text-[10px] text-white/35 flex items-center gap-1.5 pt-1 border-t border-white/5">
                <Radio className="w-3 h-3" />
                Configuración exclusiva de esta entidad ({entityId})
            </p>
        </div>
    );
}
