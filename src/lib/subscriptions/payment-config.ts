export type SubscriptionPaymentMethod = 'sol' | 'usdc' | 'lxr' | 'usdt';

export interface SubscriptionPaymentConfig {
  method: SubscriptionPaymentMethod;
  label: string;
  mint: string | null;
  decimals: number;
}

export const SUBSCRIPTION_TREASURY_WALLET =
  process.env.NEXT_PUBLIC_TREASURY_WALLET || 'Ao8RqGikw3joMDo25nb3s3c7WcP6ouazJJnA1twirDAT';

const rawRpcUrl = (process.env.NEXT_PUBLIC_SOLANA_RPC_URL || '').trim().replace(/^['"]|['"]$/g, '');
export const SUBSCRIPTION_RPC_URL =
  rawRpcUrl.startsWith('http://') || rawRpcUrl.startsWith('https://')
    ? rawRpcUrl
    : 'https://api.mainnet-beta.solana.com';

/** How long a QR checkout session stays open before showing as expired */
export const SUBSCRIPTION_QR_EXPIRATION_MINUTES = 60;

export const SOLANA_PAYMENT_CONFIG: Record<SubscriptionPaymentMethod, SubscriptionPaymentConfig> = {
  sol: {
    method: 'sol',
    label: 'SOL',
    mint: null,
    decimals: 9,
  },
  usdc: {
    method: 'usdc',
    label: 'USDC',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
  },
  usdt: {
    method: 'usdt',
    label: 'USDT',
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    decimals: 6,
  },
  lxr: {
    method: 'lxr',
    label: 'LXR',
    mint: '7Qm6qUCXGZfGBYYFzq2kTbwTDah5r3d9DcPJHRT8Wdth',
    decimals: 6,
  },
};

export function getSubscriptionPaymentConfig(method: SubscriptionPaymentMethod): SubscriptionPaymentConfig {
  return SOLANA_PAYMENT_CONFIG[method];
}

export function getSubscriptionCurrentDocPath(userId: string, entityId?: string) {
  if (entityId && entityId !== 'default' && entityId !== 'undefined') {
    return `users/${userId}/entities/${entityId}/subscriptions/current`;
  }
  return `users/${userId}/subscriptions/current`;
}

export function getSubscriptionPaymentRequestsCollectionPath(userId: string, entityId?: string) {
  if (entityId && entityId !== 'default' && entityId !== 'undefined') {
    return `users/${userId}/entities/${entityId}/paymentRequests`;
  }
  return `users/${userId}/paymentRequests`;
}
