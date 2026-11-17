import type { Node } from 'reactflow';
import type { DocumentReference } from 'firebase/firestore';
import { getDoc, updateDoc } from 'firebase/firestore';
import type { WhatsAppNumberConnection } from '@/lib/whatsapp/numbers';

/** E.164 digits for wa.me links from a slot connection. */
export function phoneDigitsFromConnection(conn?: WhatsAppNumberConnection | null): string {
  const raw = conn?.displayPhoneNumber || '';
  return raw.replace(/\D/g, '');
}

/** Update start node phone in a flow when the bot's WhatsApp slot changes. */
export function patchStartNodePhone(nodes: Node[], phoneDigits: string): Node[] {
  if (!phoneDigits) return nodes;
  return nodes.map((n) => {
    if (n.type !== 'startNode') return n;
    if (n.data?.phoneNumber === phoneDigits) return n;
    return { ...n, data: { ...n.data, phoneNumber: phoneDigits } };
  });
}

export function flowNeedsStartPhoneSync(nodes: Node[], phoneDigits: string): boolean {
  if (!phoneDigits) return false;
  const start = nodes.find((n) => n.type === 'startNode');
  if (!start) return false;
  return String(start.data?.phoneNumber || '').replace(/\D/g, '') !== phoneDigits;
}

/** Persist start-node phone when a bot's WhatsApp slot changes (list page, etc.). */
export async function syncBotStartPhoneInFirestore(
  botRef: DocumentReference,
  phoneDigits: string,
): Promise<void> {
  if (!phoneDigits) return;
  const snap = await getDoc(botRef);
  if (!snap.exists()) return;
  const flow = snap.data()?.flow as { nodes?: Node[] } | undefined;
  const nodes = flow?.nodes || [];
  if (!flowNeedsStartPhoneSync(nodes, phoneDigits)) return;
  await updateDoc(botRef, {
    'flow.nodes': patchStartNodePhone(nodes, phoneDigits),
    updatedAt: new Date(),
  });
}
