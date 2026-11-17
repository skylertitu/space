
import { MessagingAdapter } from './types';
import * as telegramAPI from '../telegramAPI';

export class TelegramAdapter implements MessagingAdapter {
    private ctx: telegramAPI.TelegramCtx;

    constructor(userId?: string, entityId?: string) {
        this.ctx = { userId, entityId };
    }

    async sendMessage(to: string, text: string): Promise<any> {
        return telegramAPI.sendTelegramMessage(to, text, this.ctx);
    }

    async sendMediaMessage(to: string, mediaUrl: string, caption: string, mediaType?: 'image' | 'video' | 'audio' | 'file'): Promise<any> {
        if (mediaType === 'image') {
            return telegramAPI.sendTelegramPhoto(to, mediaUrl, caption, this.ctx);
        } else if (mediaType === 'video' || mediaType === 'audio') {
            return telegramAPI.sendTelegramMedia(to, mediaUrl, mediaType, caption, this.ctx);
        } else {
            return telegramAPI.sendTelegramMedia(to, mediaUrl, 'document', caption, this.ctx);
        }
    }

    async sendButtonMessage(to: string, text: string, buttons: { id: string, title: string }[]): Promise<any> {
        return telegramAPI.sendTelegramButtons(to, text, buttons, this.ctx);
    }

    async sendListMessage(to: string, text: string, _buttonText: string, sections: { title: string, rows: { id: string, title: string, description?: string }[] }[]): Promise<any> {
        // Telegram doesn't have a native List Message like WhatsApp.
        // We flatten it into buttons (Inline Keyboard) if small, or plain text otherwise.
        const allOptions: any[] = [];
        sections.forEach(sec => allOptions.push(...sec.rows));

        if (allOptions.length <= 10) {
            return telegramAPI.sendTelegramButtons(to, text, allOptions, this.ctx);
        } else {
            let menuText = text + '\n';
            allOptions.forEach(opt => menuText += `- ${opt.title}\n`);
            return telegramAPI.sendTelegramMessage(to, menuText, this.ctx);
        }
    }

    async sendLocationMessage(to: string, lat: number, long: number, name: string, address: string): Promise<any> {
        await telegramAPI.sendTelegramLocation(to, lat, long, this.ctx);
        if (name || address) {
            await telegramAPI.sendTelegramMessage(to, `${name}\n${address}`, this.ctx);
        }
    }

    async markAsRead(messageId: string): Promise<any> {
        return telegramAPI.markTelegramMessageAsRead(messageId);
    }
}
