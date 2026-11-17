'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ChannelBotsPage } from '@/components/automation/ChannelBotsPage';
import { getBotChannel } from '@/lib/automation/channels';

export default function ChannelBotsRoutePage() {
  const params = useParams();
  const router = useRouter();
  const channelSlug = params.channel as string;
  const channel = getBotChannel(channelSlug);

  useEffect(() => {
    if (channelSlug === 'whatsapp') {
      router.replace(`/home/${params.entityId}/cto/automation/whatsappbots`);
    }
  }, [channelSlug, params.entityId, router]);

  if (channelSlug === 'whatsapp') return null;

  if (!channel) {
    return (
      <div className="p-8 text-white bg-neutral-900 min-h-screen">
        <p>Canal no encontrado: {channelSlug}</p>
      </div>
    );
  }

  return <ChannelBotsPage channel={channel} />;
}
