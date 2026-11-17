'use client';

import { useParams } from 'next/navigation';
import { ChannelBotEditorPage } from '@/components/automation/ChannelBotEditorPage';
import { getBotChannel } from '@/lib/automation/channels';

export default function ChannelBotEditorRoutePage() {
  const params = useParams();
  const channel = getBotChannel(params.channel as string);
  const botId = params.id as string;

  if (!channel) {
    return (
      <div className="p-8 text-white bg-neutral-900 min-h-screen">
        <p>Canal no encontrado.</p>
      </div>
    );
  }

  return <ChannelBotEditorPage channel={channel} botId={botId} />;
}
