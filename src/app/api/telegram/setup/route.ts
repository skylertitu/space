import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { guardApi } from '@/lib/apiAuth';
import { db } from '@/lib/firebase-admin';
import { newTelegramSecret } from '@/lib/webhookSignature';

export async function POST(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;
    try {
        const body = await req.json();
        const { botToken, userId, entityId, domain } = body;

        if (!userId || !entityId || !botToken) {
            return NextResponse.json({ success: false, error: `Missing context: u=${userId}, e=${entityId}, t=${!!botToken}` }, { status: 400 });
        }

        // Construct and ENCODE the webhook URL (Crucial for multi-tenant params)
        const webhookUrl = `https://${domain}/api/telegram/webhook?u=${userId}&e=${entityId}`;

        console.log(`[Telegram Setup] Registering webhook: ${webhookUrl}`);

        // secret_token por entidad: Telegram lo reenvía en la cabecera X-Telegram-Bot-Api-Secret-Token
        // y el webhook lo exige, de modo que conocer la URL (u/e) ya no basta para inyectar mensajes.
        const webhookSecret = newTelegramSecret();
        const response = await fetch(
            `https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}&secret_token=${webhookSecret}`
        );
        const data = await response.json();

        if (data.ok) {
            await db.doc(`users/${userId}/entities/${entityId}/integrations/telegram_internal`).set(
                { webhookSecret, webhookSecretUpdatedAt: new Date().toISOString() },
                { merge: true }
            );

            // Fetch Bot Info to get the username (Rule: Agnostic Brand)
            const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
            const meData = await meRes.json();
            const botName = meData.ok ? `@${meData.result.username}` : 'Telegram Bot';
            const botId = meData.ok ? String(meData.result.id) : '';
            const secretHash = createHash('sha256').update(webhookSecret).digest('hex');
            await db.doc(`system_mappings/telegram_secrets/items/${secretHash}`).set({
                userId,
                entityId,
                botId,
                updatedAt: new Date().toISOString(),
            });

            return NextResponse.json({ 
                success: true, 
                message: 'Webhook registered successfully', 
                botName,
                botId,
                telegram: data 
            });
        } else {
            return NextResponse.json({ success: false, error: data.description || 'Failed to register webhook' }, { status: 400 });
        }
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
