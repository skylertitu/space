import { Firestore } from 'firebase/firestore';
import {
    getPrimaryPlatform,
    isBotActiveValue,
    normalizeTargetPlatforms,
    updateExclusiveBotForChannel,
    updateExclusiveBotForPhone,
} from '@/lib/automation/botActivation';

export { normalizeTargetPlatforms, getPrimaryPlatform, isBotActiveValue };

interface UpdateExclusiveBotOptions {
    db: Firestore;
    userId: string;
    entityId: string;
    botId: string;
    platformId: string | null;
    activate?: boolean;
}

/** WhatsApp-only: exclusive activation in the legacy `chatbots` collection. */
export const updateExclusiveBotPlatform = async (opts: UpdateExclusiveBotOptions) =>
    updateExclusiveBotForChannel({ ...opts, botsCollection: 'chatbots' });

interface ToggleBotForPhoneOptions {
    db: Firestore;
    userId: string;
    entityId: string;
    botId: string;
    phoneNumberId: string;
    numberId?: string;
    activate: boolean;
}

/** WhatsApp: one active bot per phone_number_id in the `chatbots` collection. */
export const toggleBotForPhone = async (opts: ToggleBotForPhoneOptions) =>
    updateExclusiveBotForPhone({ ...opts, botsCollection: 'chatbots' });

/** @deprecated Use toggleBotForPhone */
export const toggleBotForNumber = toggleBotForPhone;
