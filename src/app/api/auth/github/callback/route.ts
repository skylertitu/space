import { NextResponse } from 'next/server';
import { verifyOAuthState } from '@/lib/oauthState';

export async function GET(req: Request) {
    const { searchParams, origin } = new URL(req.url);
    const code = searchParams.get('code');
    const stateRaw = searchParams.get('state') || '';

    let projectId = '';
    let entityRoute = '';
    try {
        const parsed = verifyOAuthState(stateRaw);
        if (!parsed) throw new Error('state inválido o expirado');
        projectId = parsed.projectId || '';
        // Solo segmentos de ruta seguros (evita redirecciones arbitrarias).
        if (typeof parsed.entityRoute === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(parsed.entityRoute)) {
            entityRoute = parsed.entityRoute;
        }
    } catch {
        // state might not be parseable, that's ok
    }

    // Vuelve a la entidad del cliente que inició el flujo (nunca a una entidad fija).
    const webBuilderPath = entityRoute ? `/home/${entityRoute}/cto/web-builder` : '/home';

    if (!code) {
        return NextResponse.redirect(`${origin}${webBuilderPath}?github_error=no_code`);
    }

    try {
        // Exchange code for access token
        const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code,
            }),
        });

        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;

        if (!accessToken) {
            console.error('[GitHub OAuth] Token exchange failed:', tokenData);
            return NextResponse.redirect(`${origin}${webBuilderPath}?github_error=token_failed`);
        }

        // Get GitHub user info
        const userRes = await fetch('https://api.github.com/user', {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/vnd.github.v3+json',
            },
        });
        const userData = await userRes.json();

        // Build redirect back to the web builder with success
        const redirectUrl = new URL(`${origin}${webBuilderPath}`);
        if (projectId) redirectUrl.searchParams.set('projectId', projectId);
        redirectUrl.searchParams.set('github_connected', '1');
        redirectUrl.searchParams.set('github_user', userData.login || '');

        // Set the token as an HttpOnly cookie so the git route can use it
        const response = NextResponse.redirect(redirectUrl.toString());
        response.cookies.set('github_token', accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 * 30, // 30 days
        });

        return response;
    } catch (error: any) {
        console.error('[GitHub OAuth] Error:', error);
        return NextResponse.redirect(`${origin}${webBuilderPath}?github_error=${encodeURIComponent(error.message)}`);
    }
}

