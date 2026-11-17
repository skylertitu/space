import React from 'react';
import { cn } from '@/lib/utils';
import { CountryFlag } from '@/components/CountryFlag';
import {
    getContactHeaderNames,
    getContactPhoneDisplay,
    getWhatsAppDisplayName,
} from '@/lib/omnichannel/contactHeaderInfo';

interface ConversationContactMetaProps {
    card: Record<string, any>;
    compact?: boolean;
    highlight?: boolean;
}

export function ConversationContactMeta({ card, compact = false, highlight = false }: ConversationContactMetaProps) {
    const { whatsappName, botName } = getContactHeaderNames(card);
    const phoneDisplay = getContactPhoneDisplay(card);

    return (
        <div className="min-w-0 flex flex-col gap-0.5">
            <div className="flex items-baseline gap-x-1.5 min-w-0 flex-wrap">
                <span
                    className={cn(
                        'font-semibold truncate leading-tight',
                        compact ? 'text-[11px]' : 'text-[15px]',
                        highlight ? 'text-white' : 'text-neutral-300'
                    )}
                >
                    {whatsappName}
                </span>
                <span className="text-neutral-600 text-[10px] leading-none flex-shrink-0">|</span>
                {botName ? (
                    <span
                        className={cn(
                            'text-sky-300/95 font-medium truncate leading-tight',
                            compact ? 'text-[10px]' : 'text-[14px]'
                        )}
                        title="Nombre indicado en la conversación"
                    >
                        {botName}
                    </span>
                ) : (
                    <span
                        className={cn(
                            'text-neutral-500 italic truncate leading-tight',
                            compact ? 'text-[10px]' : 'text-[13px]'
                        )}
                    >
                        En espera del nombre
                    </span>
                )}
            </div>

            {phoneDisplay && (
                <div
                    className={cn(
                        'flex items-center gap-1 min-w-0 leading-none',
                        compact ? 'text-[9px]' : 'text-[11px]'
                    )}
                >
                    <CountryFlag iso={phoneDisplay.iso} country={phoneDisplay.country} size="sm" />
                    <span className="text-neutral-400 truncate">{phoneDisplay.country}</span>
                    <span className="text-neutral-600 flex-shrink-0">·</span>
                    <span className="text-neutral-500 font-mono truncate">{phoneDisplay.formatted}</span>
                </div>
            )}
        </div>
    );
}

export function getContactAvatarInitial(card: Record<string, any>): string {
    const { botName } = getContactHeaderNames(card);
    const whatsappName = getWhatsAppDisplayName(card);
    return (botName || whatsappName).charAt(0).toUpperCase();
}
