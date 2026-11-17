import { SLOTS, normalizeNumberSlot, type NumberSlot, type SlotConnections } from './numbers';

export interface ConnectedPhone {
  phoneNumberId: string;
  displayPhoneNumber?: string;
  slot: NumberSlot;
}

export interface BotPhoneFields {
  phoneNumberId?: string;
  numberId?: string;
}

/** All WhatsApp numbers currently connected on the tenant. */
export function listConnectedPhones(connections: SlotConnections): ConnectedPhone[] {
  const out: ConnectedPhone[] = [];
  for (const slot of SLOTS) {
    const conn = connections[slot.id];
    const phoneNumberId = conn?.phoneNumberId?.trim();
    if (conn?.connected && phoneNumberId) {
      out.push({
        phoneNumberId,
        displayPhoneNumber: conn.displayPhoneNumber,
        slot: slot.id,
      });
    }
  }
  return out;
}

export function formatConnectedPhoneLabel(phone: ConnectedPhone): string {
  const display = phone.displayPhoneNumber?.trim();
  if (display) return display;
  return phone.phoneNumberId;
}

/** Resolve which Meta phone_number_id a bot is bound to (direct field or legacy slot). */
export function resolveBotPhoneNumberId(
  bot: BotPhoneFields,
  connections: SlotConnections
): string | null {
  const direct = String(bot.phoneNumberId || '').trim();
  if (direct) return direct;
  const slot = normalizeNumberSlot(bot.numberId);
  const conn = connections[slot];
  const fromSlot = conn?.phoneNumberId?.trim();
  return fromSlot || null;
}

export function findConnectedPhone(
  connections: SlotConnections,
  phoneNumberId: string
): ConnectedPhone | null {
  const id = phoneNumberId.trim();
  if (!id) return null;
  return listConnectedPhones(connections).find((p) => p.phoneNumberId === id) || null;
}

export function slotForPhoneNumberId(
  connections: SlotConnections,
  phoneNumberId: string
): NumberSlot | null {
  return findConnectedPhone(connections, phoneNumberId)?.slot ?? null;
}
