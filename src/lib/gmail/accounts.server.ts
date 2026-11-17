import { db } from '@/lib/firebase-admin';
import * as admin from 'firebase-admin';
import {
    GmailAccountSummary,
    GmailRegistry,
    getEmailDomain,
    getGmailAccountType,
    gmailAccountPublicPath,
    gmailAccountSecretPath,
    gmailRegistryPath,
    toGmailAccountId,
} from './accounts';

export async function listGmailAccounts(userId: string, entityId: string): Promise<GmailAccountSummary[]> {
    const registrySnap = await db.doc(gmailRegistryPath(userId, entityId)).get();
    const registry = registrySnap.data() as GmailRegistry | undefined;
    if (registry?.accounts?.length) return registry.accounts;

    const accountsSnap = await db.collection(`${gmailRegistryPath(userId, entityId)}/accounts`).get();
    if (!accountsSnap.empty) {
        return accountsSnap.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
                id: docSnap.id,
                email: String(data.email || ''),
                domain: String(data.domain || getEmailDomain(String(data.email || ''))),
                accountType: data.accountType || getGmailAccountType(String(data.email || '')),
                isDefault: !!data.isDefault,
                status: String(data.status || 'Connected'),
                watchStatus: data.watchStatus,
            } satisfies GmailAccountSummary;
        });
    }

    // Legacy single-account migration shape
    if (registrySnap.exists) {
        const legacy = registrySnap.data() || {};
        const email = String(legacy.email || legacy.gmailAddress || '').trim();
        if (email && legacy.status === 'Connected') {
            const accountId = toGmailAccountId(email);
            return [
                {
                    id: accountId,
                    email,
                    domain: getEmailDomain(email),
                    accountType: getGmailAccountType(email),
                    isDefault: true,
                    status: 'Connected',
                    watchStatus: legacy.watchStatus,
                },
            ];
        }
    }

    return [];
}

export async function getDefaultGmailAccountId(userId: string, entityId: string): Promise<string | null> {
    const accounts = await listGmailAccounts(userId, entityId);
    if (accounts.length === 0) return null;
    return accounts.find((a) => a.isDefault)?.id || accounts[0].id;
}

export async function syncGmailRegistry(userId: string, entityId: string) {
    const accountsCol = db.collection(`${gmailRegistryPath(userId, entityId)}/accounts`);
    const snap = await accountsCol.get();
    const accounts: GmailAccountSummary[] = snap.docs.map((docSnap) => {
        const data = docSnap.data();
        const email = String(data.email || '');
        return {
            id: docSnap.id,
            email,
            domain: String(data.domain || getEmailDomain(email)),
            accountType: data.accountType || getGmailAccountType(email),
            isDefault: !!data.isDefault,
            status: String(data.status || 'Connected'),
            watchStatus: data.watchStatus,
        };
    });

    if (accounts.length === 0) {
        await db.doc(gmailRegistryPath(userId, entityId)).set(
            {
                status: 'Disconnected',
                defaultAccountId: null,
                accountCount: 0,
                accounts: [],
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
        );
        return [];
    }

    if (!accounts.some((a) => a.isDefault)) {
        accounts[0].isDefault = true;
        await accountsCol.doc(accounts[0].id).set({ isDefault: true }, { merge: true });
    }

    const defaultAccountId = accounts.find((a) => a.isDefault)?.id || accounts[0].id;

    await db.doc(gmailRegistryPath(userId, entityId)).set(
        {
            status: 'Connected',
            defaultAccountId,
            accountCount: accounts.length,
            accounts,
            email: accounts.find((a) => a.id === defaultAccountId)?.email || accounts[0].email,
            gmailAddress: accounts.find((a) => a.id === defaultAccountId)?.email || accounts[0].email,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
    );

    return accounts;
}

export async function saveGmailAccount(params: {
    userId: string;
    entityId: string;
    email: string;
    tokens: {
        access_token?: string | null;
        refresh_token?: string | null;
        expiry_date?: number | null;
    };
    watchMeta?: Record<string, unknown>;
    linkedFromGoogleLogin?: boolean;
    makeDefault?: boolean;
}) {
    const { userId, entityId, email, tokens, watchMeta, linkedFromGoogleLogin, makeDefault } = params;
    const accountId = toGmailAccountId(email);
    const domain = getEmailDomain(email);
    const accountType = getGmailAccountType(email);
    const existingAccounts = await listGmailAccounts(userId, entityId);
    const isFirst = existingAccounts.length === 0;
    const isDefault = makeDefault ?? isFirst;

    const accountData = {
        email,
        gmailAddress: email,
        domain,
        accountType,
        accountTypeLabel: accountType === 'workspace' ? 'Google Workspace' : 'Gmail personal',
        status: 'Connected',
        watchStatus: watchMeta?.watchStatus || 'pending',
        isDefault,
        linkedFromGoogleLogin: !!linkedFromGoogleLogin,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(watchMeta || {}),
    };

    const secretData = {
        email,
        gmailAddress: email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiryDate: tokens.expiry_date || null,
        expiresAt: typeof tokens.expiry_date === 'number' ? tokens.expiry_date : null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(watchMeta || {}),
    };

    if (isDefault && existingAccounts.length > 0) {
        await Promise.all(
            existingAccounts
                .filter((a) => a.id !== accountId && a.isDefault)
                .map((a) =>
                    db.doc(gmailAccountPublicPath(userId, entityId, a.id)).set({ isDefault: false }, { merge: true })
                )
        );
    }

    await db.doc(gmailAccountPublicPath(userId, entityId, accountId)).set(accountData, { merge: true });
    await db.doc(gmailAccountSecretPath(userId, entityId, accountId)).set(secretData, { merge: true });

    await syncGmailRegistry(userId, entityId);
    return accountId;
}

export { gmailAccountPublicPath, gmailAccountSecretPath, gmailRegistryPath, toGmailAccountId };
