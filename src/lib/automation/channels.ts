import React from 'react';
import { Facebook, Instagram, Send, Mail, Twitter, MessageSquare, Linkedin, Music2, Ghost } from 'lucide-react';
import { ChannelIcons } from '@/components/automation/ChannelIcons';

export type BotChannelSlug =
    | 'whatsapp'
    | 'messenger'
    | 'instagram-dm'
    | 'instagram-comments'
    | 'facebook-comments'
    | 'x'
    | 'x-comments'
    | 'telegram'
    | 'tiktok'
    | 'tiktok-comments'
    | 'snapchat'
    | 'snapchat-comments'
    | 'linkedin'
    | 'linkedin-comments'
    | 'gmail';

export interface BotChannelConfig {
    slug: BotChannelSlug;
    title: string;
    shortTitle: string;
    description: string;
    action: string;
    /** Firestore subcollection under entities/{entityId}/ */
    collection: string;
    /** For WhatsApp keep legacy `chatbots` collection — do not change. */
    enginePlatform: string;
    integrationId: string | null;
    webhookReady: boolean;
    botType: 'dm' | 'comments' | 'email';
    iconColor: string;
    activeBg: string;
    activeBorder: string;
    listHref: (entityId: string) => string;
    Icon: React.FC<{ className?: string }>;
}

const e = (entityId: string, slug: string) => `/home/${entityId}/cto/automation/bots/${slug}`;

export const BOT_CHANNELS: BotChannelConfig[] = [
    {
        slug: 'whatsapp',
        title: 'WhatsApp Bots',
        shortTitle: 'WhatsApp',
        description: 'Construye y despliega bots de WhatsApp para gestionar conversaciones automáticamente 24/7.',
        action: 'Ir a WhatsApp Bots',
        collection: 'chatbots',
        enginePlatform: 'whatsapp',
        integrationId: 'whatsapp',
        webhookReady: true,
        botType: 'dm',
        iconColor: 'text-[#25D366]',
        activeBg: 'bg-[#25D366]/10',
        activeBorder: 'border-[#25D366]/30',
        listHref: (entityId) => `/home/${entityId}/cto/automation/whatsappbots`,
        Icon: ChannelIcons.WhatsApp,
    },
    {
        slug: 'messenger',
        title: 'Messenger Bots',
        shortTitle: 'Messenger',
        description: 'Automatiza respuestas en Facebook Messenger sin mezclar con otros canales.',
        action: 'Ir a Messenger Bots',
        collection: 'messenger-bots',
        enginePlatform: 'messenger',
        integrationId: 'messenger',
        webhookReady: true,
        botType: 'dm',
        iconColor: 'text-[#0084FF]',
        activeBg: 'bg-[#0084FF]/10',
        activeBorder: 'border-[#0084FF]/30',
        listHref: (id) => e(id, 'messenger'),
        Icon: Facebook,
    },
    {
        slug: 'instagram-dm',
        title: 'Instagram DM Bots',
        shortTitle: 'Instagram DM',
        description: 'Bots exclusivos para mensajes directos de Instagram.',
        action: 'Ir a Instagram DM Bots',
        collection: 'instagram-dm-bots',
        enginePlatform: 'instagram',
        integrationId: 'instagram',
        webhookReady: true,
        botType: 'dm',
        iconColor: 'text-[#E1306C]',
        activeBg: 'bg-[#E1306C]/10',
        activeBorder: 'border-[#E1306C]/30',
        listHref: (id) => e(id, 'instagram-dm'),
        Icon: Instagram,
    },
    {
        slug: 'instagram-comments',
        title: 'Instagram Comentarios Bots',
        shortTitle: 'IG Comentarios',
        description: 'Responde automáticamente comentarios en publicaciones de Instagram.',
        action: 'Ir a Comentarios IG',
        collection: 'instagram-comment-bots',
        enginePlatform: 'instagram_comments',
        integrationId: 'instagram',
        webhookReady: true,
        botType: 'comments',
        iconColor: 'text-[#F77737]',
        activeBg: 'bg-[#F77737]/10',
        activeBorder: 'border-[#F77737]/30',
        listHref: (id) => e(id, 'instagram-comments'),
        Icon: MessageSquare,
    },
    {
        slug: 'facebook-comments',
        title: 'Facebook Comentarios Bots',
        shortTitle: 'FB Comentarios',
        description: 'Automatiza respuestas a comentarios en tu página de Facebook.',
        action: 'Ir a Comentarios FB',
        collection: 'facebook-comment-bots',
        enginePlatform: 'facebook_comments',
        integrationId: 'messenger',
        webhookReady: true,
        botType: 'comments',
        iconColor: 'text-[#1877F2]',
        activeBg: 'bg-[#1877F2]/10',
        activeBorder: 'border-[#1877F2]/30',
        listHref: (id) => e(id, 'facebook-comments'),
        Icon: Facebook,
    },
    {
        slug: 'x',
        title: 'X DM Bots',
        shortTitle: 'X DM',
        description: 'Bots para mensajes directos (DM) en X — separado de respuestas públicas.',
        action: 'Ir a X DM Bots',
        collection: 'x-bots',
        enginePlatform: 'x_twitter',
        integrationId: 'x_twitter',
        webhookReady: true,
        botType: 'dm',
        iconColor: 'text-white',
        activeBg: 'bg-white/10',
        activeBorder: 'border-white/30',
        listHref: (id) => e(id, 'x'),
        Icon: Twitter,
    },
    {
        slug: 'x-comments',
        title: 'X Comentarios Bots',
        shortTitle: 'X Comentarios',
        description: 'Responde automáticamente a @menciones, respuestas y citas en X.',
        action: 'Ir a X Comentarios',
        collection: 'x-comment-bots',
        enginePlatform: 'x_twitter_comments',
        integrationId: 'x_twitter',
        webhookReady: true,
        botType: 'comments',
        iconColor: 'text-neutral-200',
        activeBg: 'bg-neutral-500/10',
        activeBorder: 'border-neutral-400/30',
        listHref: (id) => e(id, 'x-comments'),
        Icon: MessageSquare,
    },
    {
        slug: 'telegram',
        title: 'Telegram Bots',
        shortTitle: 'Telegram',
        description: 'Automatiza conversaciones en Telegram de forma independiente.',
        action: 'Ir a Telegram Bots',
        collection: 'telegram-bots',
        enginePlatform: 'telegram',
        integrationId: 'telegram',
        webhookReady: true,
        botType: 'dm',
        iconColor: 'text-[#0088cc]',
        activeBg: 'bg-[#0088cc]/10',
        activeBorder: 'border-[#0088cc]/30',
        listHref: (id) => e(id, 'telegram'),
        Icon: Send,
    },
    {
        slug: 'tiktok',
        title: 'TikTok DM Bots',
        shortTitle: 'TikTok DM',
        description: 'Bots para mensajes directos de TikTok.',
        action: 'Ir a TikTok DM Bots',
        collection: 'tiktok-bots',
        enginePlatform: 'tiktok',
        integrationId: 'tiktok',
        webhookReady: false,
        botType: 'dm',
        iconColor: 'text-[#FE2C55]',
        activeBg: 'bg-[#FE2C55]/10',
        activeBorder: 'border-[#FE2C55]/30',
        listHref: (id) => e(id, 'tiktok'),
        Icon: Music2,
    },
    {
        slug: 'tiktok-comments',
        title: 'TikTok Comentarios Bots',
        shortTitle: 'TikTok Comentarios',
        description: 'Responde automáticamente comentarios en videos de TikTok.',
        action: 'Ir a TikTok Comentarios',
        collection: 'tiktok-comment-bots',
        enginePlatform: 'tiktok_comments',
        integrationId: 'tiktok',
        webhookReady: false,
        botType: 'comments',
        iconColor: 'text-[#25F4EE]',
        activeBg: 'bg-[#25F4EE]/10',
        activeBorder: 'border-[#25F4EE]/30',
        listHref: (id) => e(id, 'tiktok-comments'),
        Icon: MessageSquare,
    },
    {
        slug: 'snapchat',
        title: 'Snapchat DM Bots',
        shortTitle: 'Snapchat DM',
        description: 'Bots para mensajes directos de Snapchat.',
        action: 'Ir a Snapchat DM Bots',
        collection: 'snapchat-bots',
        enginePlatform: 'snapchat',
        integrationId: 'snapchat',
        webhookReady: false,
        botType: 'dm',
        iconColor: 'text-[#FFFC00]',
        activeBg: 'bg-[#FFFC00]/10',
        activeBorder: 'border-[#FFFC00]/30',
        listHref: (id) => e(id, 'snapchat'),
        Icon: Ghost,
    },
    {
        slug: 'snapchat-comments',
        title: 'Snapchat Comentarios Bots',
        shortTitle: 'Snapchat Comentarios',
        description: 'Responde a interacciones y respuestas en historias o contenido público.',
        action: 'Ir a Snapchat Comentarios',
        collection: 'snapchat-comment-bots',
        enginePlatform: 'snapchat_comments',
        integrationId: 'snapchat',
        webhookReady: false,
        botType: 'comments',
        iconColor: 'text-[#FFFC00]',
        activeBg: 'bg-[#FFFC00]/10',
        activeBorder: 'border-[#FFFC00]/30',
        listHref: (id) => e(id, 'snapchat-comments'),
        Icon: MessageSquare,
    },
    {
        slug: 'linkedin',
        title: 'LinkedIn DM Bots',
        shortTitle: 'LinkedIn DM',
        description: 'Bots para mensajes directos de LinkedIn.',
        action: 'Ir a LinkedIn DM Bots',
        collection: 'linkedin-bots',
        enginePlatform: 'linkedin',
        integrationId: 'linkedin',
        webhookReady: false,
        botType: 'dm',
        iconColor: 'text-[#0A66C2]',
        activeBg: 'bg-[#0A66C2]/10',
        activeBorder: 'border-[#0A66C2]/30',
        listHref: (id) => e(id, 'linkedin'),
        Icon: Linkedin,
    },
    {
        slug: 'linkedin-comments',
        title: 'LinkedIn Comentarios Bots',
        shortTitle: 'LinkedIn Comentarios',
        description: 'Responde automáticamente comentarios en publicaciones de LinkedIn.',
        action: 'Ir a LinkedIn Comentarios',
        collection: 'linkedin-comment-bots',
        enginePlatform: 'linkedin_comments',
        integrationId: 'linkedin',
        webhookReady: false,
        botType: 'comments',
        iconColor: 'text-[#378FE9]',
        activeBg: 'bg-[#378FE9]/10',
        activeBorder: 'border-[#378FE9]/30',
        listHref: (id) => e(id, 'linkedin-comments'),
        Icon: MessageSquare,
    },
    {
        slug: 'gmail',
        title: 'Gmail Bots',
        shortTitle: 'Gmail',
        description: 'Automatiza respuestas por correo con flujos dedicados a Gmail.',
        action: 'Ir a Gmail Bots',
        collection: 'gmail-bots',
        enginePlatform: 'gmail',
        integrationId: 'gmail',
        webhookReady: true,
        botType: 'email',
        iconColor: 'text-[#EA4335]',
        activeBg: 'bg-[#EA4335]/10',
        activeBorder: 'border-[#EA4335]/30',
        listHref: (id) => e(id, 'gmail'),
        Icon: Mail,
    },
];

export const BOT_CHANNEL_MAP = Object.fromEntries(
    BOT_CHANNELS.map((c) => [c.slug, c])
) as Record<BotChannelSlug, BotChannelConfig>;

export function getBotChannel(slug: string): BotChannelConfig | null {
    return BOT_CHANNEL_MAP[slug as BotChannelSlug] || null;
}

export { resolveBotsCollectionName, isIsolatedBotCollection } from './botStorage';
