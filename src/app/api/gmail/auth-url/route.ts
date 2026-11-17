import { NextResponse } from 'next/server';
import { guardApi } from '@/lib/apiAuth';
import { signOAuthState } from '@/lib/oauthState';

const CLIENT_ID = process.env.GMAIL_CLIENT_ID?.replace(/\"/g, '').trim();
const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI?.replace(/\"/g, '').trim();

export async function GET(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('u');
    const entityId = searchParams.get('e');
    const loginHint = searchParams.get('hint')?.trim() || '';
    const entityIdsParam = searchParams.get('entities')?.trim() || '';
    const mode = searchParams.get('mode')?.trim() || 'default';
    const entityIds = entityIdsParam
        ? entityIdsParam.split(',').map((id) => id.trim()).filter(Boolean)
        : [];

    if (!userId || !entityId) {
        return NextResponse.json({ error: 'Missing context' }, { status: 400 });
    }

    const host = req.headers.get('host');
    const protocol = req.headers.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');
    
    // Agnostic Rule: Use the dynamic host if available, otherwise fall back to env var
    const dynamicRedirect = host ? `${protocol}://${host}/api/gmail/callback` : REDIRECT_URI;

    if (!CLIENT_ID || !dynamicRedirect) {
        console.error('[Gmail Auth Error] Missing configuration (CLIENT_ID or REDIRECT_URI)');
        return NextResponse.json({ 
            error: 'Missing Gmail configuration', 
            details: 'Ensure GMAIL_CLIENT_ID is set and redirected properly.',
        }, { status: 500 });
    }

    const scopes = [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
    ];
    
    const prompt = mode === 'add' ? 'select_account consent' : 'consent';

    const state = signOAuthState({
        userId,
        entityId,
        entityIds: entityIds.length > 0 ? entityIds : [entityId],
        loginHint: loginHint || null,
        source: mode === 'add' ? 'add_account' : 'google_login',
        mode,
    });
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(dynamicRedirect!)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scopes.join(' '))}&` +
        `access_type=offline&` +
        `prompt=${encodeURIComponent(prompt)}&` +
        (loginHint && mode !== 'add' ? `login_hint=${encodeURIComponent(loginHint)}&` : '') +
        `state=${encodeURIComponent(state)}`;

    console.log(`[Gmail Auth] Agnostic URL Generated for ${entityId}. Host: ${host} | Using: ${dynamicRedirect}`);
    
    return NextResponse.json({ url: authUrl });
}
