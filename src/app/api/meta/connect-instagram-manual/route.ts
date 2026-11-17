import { NextResponse } from 'next/server';
import axios from 'axios';
import { db, admin } from '@/lib/firebase-admin';
import { guardApi } from '@/lib/apiAuth';
import { claimFromStoredIntegration } from '@/lib/integrationClaims';

export const dynamic = 'force-dynamic';

/**
 * Manual Instagram connection for HTTPS-less local dev or advanced setup.
 * Validates a Page Access Token and stores integrations/instagram.
 */
export async function POST(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;
    try {
        const { userId, entityId, pageAccessToken, pageId, instagramId, username } = await req.json();

        if (!userId || !entityId || !pageAccessToken?.trim()) {
            return NextResponse.json(
                { error: 'Faltan userId, entityId o pageAccessToken.' },
                { status: 400 }
            );
        }

        const token = String(pageAccessToken).trim();
        const entityPath = `users/${userId}/entities/${entityId}`;

        // Token from Meta → Instagram → "Generar token" (starts with IGAAP / IGAAV)
        const isInstagramAppToken = /^IGAA/i.test(token);
        if (isInstagramAppToken && instagramId) {
            const igId = String(instagramId).trim();
            const profileRes = await axios.get(`https://graph.facebook.com/v21.0/${igId}`, {
                params: { fields: 'id,username,name', access_token: token },
            });

            const igAccount = profileRes.data;
            if (!igAccount?.id) {
                return NextResponse.json({ error: 'instagramId inválido.' }, { status: 400 });
            }

            const instagramConfig = {
                instagramId: igAccount.id,
                username: igAccount.username || username || '',
                name: igAccount.name || '',
                pageId: pageId ? String(pageId).trim() : '',
                accessToken: token,
                tokenType: 'Instagram App Token',
                status: 'Connected',
                provider: 'instagram',
                connectedVia: 'instagram_app_token',
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            await db.doc(`${entityPath}/integrations/instagram`).set(instagramConfig, { merge: true });

            const claim = await claimFromStoredIntegration('instagram', { userId, entityId });
            if (!claim.ok) {
                await db.doc(`${entityPath}/integrations/instagram`).set({ status: 'Disconnected' }, { merge: true });
                return NextResponse.json({ error: claim.message }, { status: claim.reason === 'conflict' ? 409 : 403 });
            }

            const resolvedPageId = pageId ? String(pageId).trim() : '';
            if (resolvedPageId) {
                try {
                    await axios.post(`https://graph.facebook.com/v21.0/${resolvedPageId}/subscribed_apps`, {
                        subscribed_fields: [
                            'messages',
                            'messaging_postbacks',
                            'messaging_optins',
                            'message_deliveries',
                            'message_reads',
                            'feed',
                            'comments',
                            'live_comments',
                        ],
                        access_token: token,
                    });
                } catch (subErr: any) {
                    console.warn('[connect-instagram-manual] IGAAP webhook subscribe warning:', subErr.response?.data || subErr.message);
                }
            }

            return NextResponse.json({
                success: true,
                instagramId: igAccount.id,
                username: igAccount.username,
                tokenType: 'instagram_app_token',
                webhookSubscribed: !!resolvedPageId,
                ...(resolvedPageId ? {} : {
                    warning:
                        'Sin pageId no se suscribieron webhooks de comentarios. Agrega el ID de la Fanpage de Facebook vinculada a tu IG.',
                }),
            });
        }

        let resolvedPageId = pageId ? String(pageId).trim() : '';

        if (!resolvedPageId) {
            const meRes = await axios.get('https://graph.facebook.com/v21.0/me/accounts', {
                params: {
                    fields: 'id,name,access_token,instagram_business_account{id,username,name}',
                    access_token: token,
                },
            });

            const pagesWithIg = (meRes.data?.data || []).filter(
                (p: { instagram_business_account?: { id: string } }) => p.instagram_business_account?.id
            );

            if (pagesWithIg.length === 0) {
                return NextResponse.json(
                    {
                        error:
                            'No se encontró ninguna Fanpage con Instagram Business vinculado a este token. ' +
                            'Usa un Page Access Token de una página conectada a tu cuenta IG profesional.',
                    },
                    { status: 400 }
                );
            }

            if (pagesWithIg.length > 1) {
                return NextResponse.json({
                    error: 'multiple_pages',
                    message: 'Varias páginas detectadas. Indica pageId en el formulario.',
                    pages: pagesWithIg.map((p: any) => ({
                        pageId: p.id,
                        pageName: p.name,
                        username: p.instagram_business_account?.username,
                        instagramId: p.instagram_business_account?.id,
                    })),
                }, { status: 400 });
            }

            resolvedPageId = pagesWithIg[0].id;
        }

        const pageRes = await axios.get(`https://graph.facebook.com/v21.0/${resolvedPageId}`, {
            params: {
                fields: 'id,name,access_token,instagram_business_account{id,username,name}',
                access_token: token,
            },
        });

        const page = pageRes.data;
        const igAccount = page?.instagram_business_account;

        if (!igAccount?.id) {
            return NextResponse.json(
                {
                    error:
                        'Esta Fanpage no tiene Instagram Business vinculado. ' +
                        'En Meta Business Suite vincula tu cuenta IG profesional a la página.',
                },
                { status: 400 }
            );
        }

        const permanentToken = page.access_token || token;

        try {
            await axios.post(`https://graph.facebook.com/v21.0/${resolvedPageId}/subscribed_apps`, {
                subscribed_fields: [
                    'messages',
                    'messaging_postbacks',
                    'messaging_optins',
                    'message_deliveries',
                    'message_reads',
                    'feed',
                    'comments',
                    'live_comments',
                ],
                access_token: permanentToken,
            });
        } catch (subErr: any) {
            console.warn('[connect-instagram-manual] Webhook subscribe warning:', subErr.response?.data || subErr.message);
        }

        const entityPathPage = `users/${userId}/entities/${entityId}`;
        const instagramConfig = {
            instagramId: igAccount.id,
            username: igAccount.username || igAccount.name || '',
            name: page.name || '',
            pageId: resolvedPageId,
            accessToken: permanentToken,
            tokenType: 'Permanente (manual)',
            status: 'Connected',
            provider: 'instagram',
            connectedVia: 'manual',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        await db.doc(`${entityPathPage}/integrations/instagram`).set(instagramConfig, { merge: true });

        const claim = await claimFromStoredIntegration('instagram', { userId, entityId });
        if (!claim.ok) {
            await db.doc(`${entityPathPage}/integrations/instagram`).set({ status: 'Disconnected' }, { merge: true });
            return NextResponse.json({ error: claim.message }, { status: claim.reason === 'conflict' ? 409 : 403 });
        }

        return NextResponse.json({
            success: true,
            instagramId: igAccount.id,
            username: igAccount.username,
            pageId: resolvedPageId,
        });    } catch (error: any) {
        const metaError = error.response?.data?.error;
        const detail = metaError?.message || error.message;
        console.error('[connect-instagram-manual]', metaError || error.message);
        return NextResponse.json(
            { error: 'Token inválido o sin permisos.', details: detail },
            { status: 400 }
        );
    }
}
