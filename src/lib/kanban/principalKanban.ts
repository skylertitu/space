import { isInboxGroup } from './botNodeGroups';
import { STARTER_CHATBOT_ID } from '@/lib/mold/starterChatbot';

/** Whether a kanban-group column belongs to a principal (inamovible) bot flow. */
export function groupBelongsToPrincipalBot(group: Record<string, any> | null | undefined, botId: string): boolean {
    if (!group) return false;
    if (isInboxGroup(group)) return true;
    if (!group.autoManaged) return false;
    if (group.botId) return String(group.botId) === String(botId);
    return String(botId) === STARTER_CHATBOT_ID;
}

export function filterGroupsForPrincipalBot(groups: any[], botId: string): any[] {
    return [...groups]
        .filter((g) => groupBelongsToPrincipalBot(g, botId))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export interface PrincipalBotOption {
    id: string;
    name: string;
    isActive?: boolean;
}
