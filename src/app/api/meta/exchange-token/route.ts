import { NextResponse } from 'next/server';
import axios from 'axios';
import { guardApi } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;
    try {
        const { shortLivedToken, pageId, instagramId } = await req.json();

        // Limpieza de variables de entorno por si vienen con espacios o comillas desde Vercel
        const APP_ID = (process.env.NEXT_PUBLIC_META_APP_ID || '').trim().replace(/['"]/g, '');
        const APP_SECRET = (process.env.META_APP_SECRET || '').trim().replace(/['"]/g, '');

        if (!APP_ID || !APP_SECRET) {
            console.error('[exchange-token] ❌ Missing Meta credentials (META_APP_SECRET or NEXT_PUBLIC_META_APP_ID).');
            return NextResponse.json({
                error: 'Credenciales de servidor no configuradas. Configura META_APP_SECRET y NEXT_PUBLIC_META_APP_ID en Vercel.'
            }, { status: 500 });
        }

        // STEP 1: Exchange short-lived user token → long-lived user token (60 days)
        const longLivedUserRes = await axios.get(`https://graph.facebook.com/v21.0/oauth/access_token`, {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: APP_ID,
                client_secret: APP_SECRET,
                fb_exchange_token: shortLivedToken
            }
        });

        const longLivedUserToken = longLivedUserRes.data.access_token;

        // STEP 2: Get Page Access Token (Permanent)
        // Note: For Instagram, we need the Page Token associated with the IG account
        const targetId = pageId || 'me';
        const pageTokenRes = await axios.get(`https://graph.facebook.com/v21.0/${targetId}`, {
            params: {
                fields: 'access_token,name',
                access_token: longLivedUserToken
            }
        });

        const permanentToken = pageTokenRes.data.access_token;

        // STEP 3: Automatic Webhook Subscription (The "Agnostic Rule" - Works for any entity)
        // We subscribe the page to the app so we receive real-time messages
        try {
            await axios.post(`https://graph.facebook.com/v21.0/${targetId}/subscribed_apps`, {
                subscribed_fields: ['messages', 'messaging_postbacks', 'messaging_optins', 'message_deliveries', 'message_reads', 'feed', 'comments'],
                access_token: permanentToken
            });
            console.log(`[exchange-token] ✅ Webhook subscribed for Page ${targetId}`);
        } catch (subErr: any) {
            console.error('[exchange-token] ⚠️ Webhook subscription failed (but token is valid):', subErr.response?.data || subErr.message);
        }

        return NextResponse.json({
            accessToken: permanentToken,
            tokenType: 'permanent',
            pageName: pageTokenRes.data.name || 'Meta Page'
        });

    } catch (error: any) {
        console.error('[exchange-token] ❌ Fatal error:', error.response?.data || error.message);
        return NextResponse.json({ 
            error: 'Error al procesar el token permanente.',
            details: error.response?.data?.error?.message || error.message
        }, { status: 500 });
    }
}
