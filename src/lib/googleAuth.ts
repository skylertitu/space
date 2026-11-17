import axios from 'axios';
import { db } from './firebase-admin';
import { signOAuthState } from './oauthState';
import {
    getDefaultGmailAccountId,
    gmailAccountSecretPath,
    toGmailAccountId,
} from './gmail/accounts.server';

const CLIENT_ID = process.env.GMAIL_CLIENT_ID?.trim();
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET?.trim();
const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI?.trim();

export async function getGoogleAuthUrl(userId: string, entityId: string) {
    const scopes = [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
    ];

    const state = encodeURIComponent(signOAuthState({ userId, entityId }));
    const url =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(REDIRECT_URI!)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scopes.join(' '))}&` +
        `access_type=offline&` +
        `prompt=consent&` +
        `state=${state}`;

    console.log(`[GoogleAuth Lib] Generating URL. ClientID: ${CLIENT_ID?.substring(0, 5)}... RedirectURI: ${REDIRECT_URI}`);
    return url;
}

export async function exchangeCodeForTokens(code: string) {
    const response = await axios.post('https://oauth2.googleapis.com/token', {
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
    });

    return response.data;
}

export async function refreshGoogleToken(refreshToken: string) {
    const response = await axios.post('https://oauth2.googleapis.com/token', {
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token',
    });

    return response.data;
}

async function resolveGmailSecretRef(userId: string, entityId: string, accountId?: string | null) {
    const resolvedAccountId = accountId || (await getDefaultGmailAccountId(userId, entityId));
    if (resolvedAccountId) {
        const accountRef = db.doc(gmailAccountSecretPath(userId, entityId, resolvedAccountId));
        const accountSnap = await accountRef.get();
        if (accountSnap.exists) {
            return { ref: accountRef, accountId: resolvedAccountId };
        }
    }

    // Legacy single-account fallback
    const legacyRef = db.doc(`users/${userId}/entities/${entityId}/integrations/gmail_internal`);
    const legacySnap = await legacyRef.get();
    if (legacySnap.exists) {
        return { ref: legacyRef, accountId: resolvedAccountId || 'legacy' };
    }

    throw new Error('Gmail not connected');
}

export async function getGmailAccessToken(userId: string, entityId: string, accountId?: string) {
    const { ref: docRef } = await resolveGmailSecretRef(userId, entityId, accountId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) throw new Error('Gmail not connected');

    const data = docSnap.data()!;
    const now = Date.now();

    if (data.expiresAt && data.expiresAt > now + 300000) {
        return data.accessToken;
    }

    if (!data.refreshToken) throw new Error('No refresh token available');

    const refreshed = await refreshGoogleToken(data.refreshToken);
    const newAccessToken = refreshed.access_token;
    const expiresAt = Date.now() + refreshed.expires_in * 1000;

    await docRef.update({
        accessToken: newAccessToken,
        expiresAt,
    });

    return newAccessToken;
}

export async function getGmailAccessTokenForEmail(userId: string, entityId: string, email: string) {
    return getGmailAccessToken(userId, entityId, toGmailAccountId(email));
}
