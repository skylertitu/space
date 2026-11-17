import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Connection, ParsedInstruction, ParsedTransactionWithMeta, PublicKey } from '@solana/web3.js';
import { db } from '@/lib/firebase-admin';
import {
  getSubscriptionCurrentDocPath,
  getSubscriptionPaymentConfig,
  getSubscriptionPaymentRequestsCollectionPath,
  SUBSCRIPTION_RPC_URL,
  type SubscriptionPaymentMethod,
} from './payment-config';

export type SubscriptionPaymentStatus = 'pending' | 'paid' | 'expired';

export interface SubscriptionPaymentOrder {
  requestId: string;
  userId: string;
  entityId: string;
  plan: string;
  paymentMethod: SubscriptionPaymentMethod;
  recipientWallet: string;
  reference: string;
  status: SubscriptionPaymentStatus;
  qrUrl: string;
  planPriceUSD: number;
  chargeUSD?: number;
  priorCreditUSD?: number;
  isUpgrade?: boolean;
  billingCycle?: 'monthly' | 'annual';
  priorPlan?: string | null;
  expectedAmountUi: string;
  expectedAmountRaw: string;
  tokenDecimals: number;
  tokenMint: string | null;
  billingData: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  paidAt?: string;
  paymentSignature?: string;
}

interface VerificationResult {
  signature: string;
}

function getSolanaConnection() {
  const rpcUrl = SUBSCRIPTION_RPC_URL && SUBSCRIPTION_RPC_URL.startsWith('http')
    ? SUBSCRIPTION_RPC_URL
    : 'https://api.mainnet-beta.solana.com';
  return new Connection(rpcUrl, 'confirmed');
}

function getPaymentRequestDocRef(userId: string, entityId: string, requestId: string) {
  return db.doc(`${getSubscriptionPaymentRequestsCollectionPath(userId, entityId)}/${requestId}`);
}

function isExpired(expiresAt: string) {
  return Date.now() > new Date(expiresAt).getTime();
}

function getParsedAccountKeys(transaction: ParsedTransactionWithMeta) {
  return transaction.transaction.message.accountKeys.map((entry) => {
    const candidate = entry as { pubkey?: PublicKey; toBase58?: () => string };

    if (candidate.pubkey) {
      return candidate.pubkey.toBase58();
    }

    if (candidate.toBase58) {
      return candidate.toBase58();
    }

    return String(entry);
  });
}

function getParsedInstructions(transaction: ParsedTransactionWithMeta) {
  return transaction.transaction.message.instructions.filter(
    (instruction): instruction is ParsedInstruction => 'parsed' in instruction
  );
}

function verifySolTransfer(transaction: ParsedTransactionWithMeta, order: SubscriptionPaymentOrder) {
  const instructions = getParsedInstructions(transaction);

  return instructions.some((instruction) => {
    if (instruction.program !== 'system') {
      return false;
    }

    const parsed = instruction.parsed as { type?: string; info?: Record<string, unknown> };
    if (parsed.type !== 'transfer' || !parsed.info) {
      return false;
    }

    return (
      String(parsed.info.destination || '') === order.recipientWallet &&
      String(parsed.info.lamports || '') === order.expectedAmountRaw
    );
  });
}

function verifySplTransfer(transaction: ParsedTransactionWithMeta, order: SubscriptionPaymentOrder) {
  if (!order.tokenMint) {
    return false;
  }

  const recipientAta = getAssociatedTokenAddressSync(
    new PublicKey(order.tokenMint),
    new PublicKey(order.recipientWallet),
    true
  ).toBase58();

  const instructions = getParsedInstructions(transaction);

  return instructions.some((instruction) => {
    if (instruction.program !== 'spl-token' && instruction.program !== 'spl-token-2022') {
      return false;
    }

    const parsed = instruction.parsed as { type?: string; info?: Record<string, any> };
    if (!parsed.type || !parsed.info) {
      return false;
    }

    if (parsed.type !== 'transfer' && parsed.type !== 'transferChecked') {
      return false;
    }

    const rawAmount =
      parsed.info.tokenAmount?.amount ||
      parsed.info.amount ||
      parsed.info.tokenAmount?.uiAmountString;

    const mint = parsed.info.mint ? String(parsed.info.mint) : order.tokenMint;

    return (
      String(parsed.info.destination || '') === recipientAta &&
      mint === order.tokenMint &&
      String(rawAmount || '') === order.expectedAmountRaw
    );
  });
}

export async function findMatchingPayment(order: SubscriptionPaymentOrder): Promise<VerificationResult | null> {
  const connection = getSolanaConnection();
  const signatures = await connection.getSignaturesForAddress(new PublicKey(order.reference), {
    limit: 10,
  });

  for (const signatureInfo of signatures) {
    if (signatureInfo.err) {
      continue;
    }

    const transaction = await connection.getParsedTransaction(signatureInfo.signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!transaction || transaction.meta?.err) {
      continue;
    }

    const accountKeys = getParsedAccountKeys(transaction);
    if (!accountKeys.includes(order.reference)) {
      continue;
    }

    const matches =
      order.paymentMethod === 'sol'
        ? verifySolTransfer(transaction, order)
        : verifySplTransfer(transaction, order);

    if (matches) {
      return { signature: signatureInfo.signature };
    }
  }

  return null;
}

export async function markOrderExpired(order: SubscriptionPaymentOrder) {
  await getPaymentRequestDocRef(order.userId, order.entityId, order.requestId).set(
    {
      status: 'expired',
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
}

export async function activateSubscriptionFromOrder(order: SubscriptionPaymentOrder, signature: string) {
  const now = new Date();
  const subRef = db.doc(getSubscriptionCurrentDocPath(order.userId, order.entityId));
  const existingSnap = order.isUpgrade ? await subRef.get() : null;
  const existing = existingSnap?.exists ? existingSnap.data() : null;

  let expiresAtIso: string;
  let activatedAtIso: string;

  if (order.isUpgrade && existing?.expiresAt) {
    expiresAtIso = String(existing.expiresAt);
    activatedAtIso = String(existing.activatedAt || existing.updatedAt || now.toISOString());
  } else {
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + (order.billingCycle === 'annual' ? 365 : 30));
    expiresAtIso = expiresAt.toISOString();
    activatedAtIso = now.toISOString();
  }

  await getPaymentRequestDocRef(order.userId, order.entityId, order.requestId).set(
    {
      status: 'paid',
      paymentSignature: signature,
      paidAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    { merge: true }
  );

  await subRef.set(
    {
      status: 'active',
      trial: false,
      billingCycle: order.billingCycle ?? 'monthly',
      plan: order.plan,
      priceUSD: order.planPriceUSD,
      paymentMethod: order.paymentMethod,
      paymentSignature: signature,
      activatedAt: activatedAtIso,
      expiresAt: expiresAtIso,
      updatedAt: now.toISOString(),
      cancelAtPeriodEnd: false,
      cancelledAt: null,
      billing: order.billingData || null,
      ...(order.isUpgrade
        ? {
            lastUpgradeAt: now.toISOString(),
            lastUpgradeChargeUSD: order.chargeUSD ?? order.planPriceUSD,
            priorCreditApplied: order.priorCreditUSD ?? 0,
          }
        : {}),
    },
    { merge: true }
  );
}

export async function getPaymentOrder(userId: string, entityId: string, requestId: string) {
  const snapshot = await getPaymentRequestDocRef(userId, entityId, requestId).get();

  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() as SubscriptionPaymentOrder;

  if (data.requestId !== requestId || data.userId !== userId || data.entityId !== entityId) {
    return null;
  }

  return data;
}

export async function resolvePaymentOrderStatus(order: SubscriptionPaymentOrder) {
  if (order.status === 'paid') {
    return order;
  }

  // Always check the blockchain first — a user may pay after the QR timer shows expired.
  const payment = await findMatchingPayment(order);
  if (payment) {
    await activateSubscriptionFromOrder(order, payment.signature);
    return {
      ...order,
      status: 'paid' as const,
      paymentSignature: payment.signature,
      paidAt: new Date().toISOString(),
    };
  }

  if (order.status === 'expired' || isExpired(order.expiresAt)) {
    await markOrderExpired(order);
    return {
      ...order,
      status: 'expired' as const,
    };
  }

  return order;
}

export async function recoverUserPaymentOrders(userId: string, entityId: string) {
  const collectionPath = getSubscriptionPaymentRequestsCollectionPath(userId, entityId);
  const snapshot = await db.collection(collectionPath).where('status', 'in', ['pending', 'expired']).get();

  const results: Array<{ requestId: string; status: SubscriptionPaymentStatus }> = [];

  for (const docSnap of snapshot.docs) {
    const order = docSnap.data() as SubscriptionPaymentOrder;
    const resolved = await resolvePaymentOrderStatus(order);
    results.push({ requestId: resolved.requestId, status: resolved.status });
  }

  return results;
}

export function validatePaymentOrderPayload(order: {
  paymentMethod: SubscriptionPaymentMethod;
  expectedAmountRaw: string;
  expectedAmountUi: string;
}) {
  const config = getSubscriptionPaymentConfig(order.paymentMethod);

  if (!/^\d+$/.test(order.expectedAmountRaw)) {
    throw new Error('Invalid raw amount');
  }

  if (!/^\d+(\.\d+)?$/.test(order.expectedAmountUi)) {
    throw new Error('Invalid UI amount');
  }

  return config;
}
