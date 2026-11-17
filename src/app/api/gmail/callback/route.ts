import { NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { db } from '@/lib/firebase-admin';
import { saveGmailAccount } from '@/lib/gmail/accounts.server';
import * as admin from 'firebase-admin';
import { verifyOAuthState } from '@/lib/oauthState';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code || !state) {
        return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
    }

    // El state lo firma /api/gmail/auth-url (ruta autenticada). Sin firma válida, se rechaza.
    const statePayload = verifyOAuthState(state);
    if (!statePayload || !statePayload.userId || !statePayload.entityId) {
        return NextResponse.json({ error: 'State inválido o expirado. Vuelve a iniciar la conexión.' }, { status: 400 });
    }
    const { entityId, userId } = statePayload;
    const entityIds: string[] =
        Array.isArray(statePayload.entityIds) && statePayload.entityIds.length > 0
            ? statePayload.entityIds
            : [entityId];
    const linkedFromGoogleLogin = statePayload.source === 'google_login';
    const addAccount = statePayload.mode === 'add';

    const host = req.headers.get('host');
    const protocol = req.headers.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');
    const redirectUri = host
        ? `${protocol}://${host}/api/gmail/callback`
        : process.env.GMAIL_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL}/api/gmail/callback`;

    const oauth2Client = new OAuth2Client(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        redirectUri
    );

    try {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const profileData = await profileRes.json().catch(() => null);

        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const userInfo = await userInfoRes.json().catch(() => null);

        const email =
            profileData?.emailAddress?.trim?.() ||
            userInfo?.email?.trim?.() ||
            null;

        if (!email) {
            throw new Error('No se pudo obtener el correo de la cuenta de Gmail autorizada.');
        }

        const accountsSnap = await db.collectionGroup('accounts').where('email', '==', email).get();
        let isAlreadyConnected = false;
        accountsSnap.forEach((docSnap) => {
            const path = docSnap.ref.path;
            const isSameUserEntity = entityIds.some((id) =>
                path.includes(`users/${userId}/entities/${id}/integrations/gmail/accounts`)
            );
            if (!isSameUserEntity) {
                isAlreadyConnected = true;
            }
        });

        if (isAlreadyConnected) {
            throw new Error(`Esta cuenta (${email}) ya está vinculada a otro usuario en la plataforma.`);
        }

        let watchMeta: Record<string, unknown> = { watchStatus: 'pending' };

        try {
            const watchResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${tokens.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    labelIds: ['INBOX'],
                    topicName: process.env.GMAIL_PUBSUB_TOPIC,
                }),
            });

            const watchData = await watchResponse.json().catch(() => null);

            if (!watchResponse.ok) {
                const watchError = watchData?.error?.message || watchData?.error || `HTTP ${watchResponse.status}`;
                throw new Error(`Gmail Watch API: ${watchError}`);
            }

            watchMeta = {
                status: 'Connected',
                watchStatus: 'active',
                watchHistoryId: watchData?.historyId || null,
                watchExpiration: watchData?.expiration ? Number(watchData.expiration) : null,
                watchActivatedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastHistoryId: watchData?.historyId || null,
                lastError: admin.firestore.FieldValue.delete(),
            };
        } catch (watchError: unknown) {
            console.error('Gmail Watch Error:', watchError);
            const detailedError = watchError instanceof Error ? watchError.message : String(watchError);
            watchMeta = {
                status: 'Connected',
                watchStatus: 'error',
                lastError: `Google API Error: ${detailedError}`,
            };
        }

        await Promise.all(
            entityIds.map((targetEntityId) =>
                saveGmailAccount({
                    userId,
                    entityId: targetEntityId,
                    email,
                    tokens,
                    watchMeta,
                    linkedFromGoogleLogin,
                    makeDefault: addAccount ? undefined : true,
                })
            )
        );

        return new NextResponse(
            `
            <html>
                <head><meta charset="utf-8"></head>
                <body style="font-family:sans-serif;text-align:center;padding:50px;background:#111;color:#fff;">
                    <script>
                        if (window.opener) {
                            window.opener.postMessage('gmail-auth-success', '*');
                            window.close();
                        } else {
                            window.location.href = '/home/${entityId}/cto/integrations';
                        }
                    </script>
                    <h2 style="color:#4CAF50;">Conexion Exitosa</h2>
                    <p>Cuenta ${email} vinculada.</p>
                </body>
            </html>
        `,
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('Gmail Callback Error:', errMsg);
        return new NextResponse(
            `
            <html>
                <head><meta charset="utf-8"></head>
                <body style="font-family:sans-serif;text-align:center;padding:50px;background:#111;color:#fff;">
                    <script>
                        if (window.opener) window.opener.postMessage('gmail-auth-error', '*');
                    </script>
                    <h2 style="color:#EA4335;">Error de Conexion con Gmail</h2>
                    <p>No se pudo completar la autenticacion.</p>
                    <pre style="background:#222;padding:16px;border-radius:8px;text-align:left;font-size:12px;color:#f87171;white-space:pre-wrap;word-break:break-all;">${errMsg}</pre>
                    <p style="color:#888;font-size:12px;">Puedes cerrar esta ventana.</p>
                </body>
            </html>
        `,
            { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
    }
}
