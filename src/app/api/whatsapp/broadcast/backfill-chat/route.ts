import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { backfillBroadcastConversations } from '@/lib/broadcast/backfillBroadcastConversations';
import { guardApi } from '@/lib/apiAuth';
import { requireSuite } from '@/lib/subscriptions/entitlements.server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;
    try {
        const { userId, entityId, broadcastId } = await req.json();
        const suiteDenied = await requireSuite(userId, entityId, 'cmo');
        if (suiteDenied) return suiteDenied;
        if (!userId || !entityId || !broadcastId) {
            return NextResponse.json(
                { error: 'Missing userId, entityId or broadcastId' },
                { status: 400 }
            );
        }

        const result = await backfillBroadcastConversations({ db, userId, entityId, broadcastId });

        return NextResponse.json({
            ok: true,
            ...result,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Backfill failed';
        console.error('[Broadcast backfill-chat]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
