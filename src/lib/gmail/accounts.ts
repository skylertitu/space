export type GmailAccountType = 'personal' | 'workspace';

export interface GmailAccountSummary {
    id: string;
    email: string;
    domain: string;
    accountType: GmailAccountType;
    isDefault: boolean;
    status: string;
    watchStatus?: string;
}

export interface GmailRegistry {
    status?: string;
    defaultAccountId?: string | null;
    accountCount?: number;
    accounts?: GmailAccountSummary[];
    email?: string;
}

const PERSONAL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

export function toGmailAccountId(email: string): string {
    return email
        .toLowerCase()
        .trim()
        .replace(/@/g, '_at_')
        .replace(/[^a-z0-9._-]/g, '_');
}

export function getEmailDomain(email: string): string {
    return email.split('@')[1]?.toLowerCase().trim() || '';
}

export function getGmailAccountType(email: string): GmailAccountType {
    const domain = getEmailDomain(email);
    return PERSONAL_DOMAINS.has(domain) ? 'personal' : 'workspace';
}

export function getGmailAccountTypeLabel(type: GmailAccountType): string {
    return type === 'workspace' ? 'Google Workspace' : 'Gmail personal';
}

export function isGmailRegistryConnected(registry?: GmailRegistry | null): boolean {
    if (!registry) return false;
    if (registry.status === 'Connected') return true;
    return (registry.accountCount ?? registry.accounts?.length ?? 0) > 0;
}

export function getGmailConnectionStateFromRegistry(
    user: { providerData?: { providerId: string }[] } | null | undefined,
    registry?: GmailRegistry | null
): 'connected' | 'pending_authorization' | 'not_connected' {
    if (isGmailRegistryConnected(registry)) return 'connected';
    const isGoogle = !!user?.providerData?.some((p) => p.providerId === 'google.com');
    if (isGoogle) return 'pending_authorization';
    return 'not_connected';
}

export function gmailRegistryPath(userId: string, entityId: string) {
    return `users/${userId}/entities/${entityId}/integrations/gmail`;
}

export function gmailAccountPublicPath(userId: string, entityId: string, accountId: string) {
    return `${gmailRegistryPath(userId, entityId)}/accounts/${accountId}`;
}

export function gmailAccountSecretPath(userId: string, entityId: string, accountId: string) {
    return `users/${userId}/entities/${entityId}/integrations/gmail_internal/accounts/${accountId}`;
}
