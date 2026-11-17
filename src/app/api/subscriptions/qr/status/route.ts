import { NextRequest, NextResponse } from 'next/server';
import { getPaymentOrder, resolvePaymentOrderStatus } from '@/lib/subscriptions/qr-payment';
import { guardApi } from '@/lib/apiAuth';

export async function GET(request: NextRequest) {
    const denied = await guardApi(request);
    if (denied) return denied;
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    const entityId = request.nextUrl.searchParams.get('entityId');
    const requestId = request.nextUrl.searchParams.get('requestId');

    if (!userId || !entityId || !requestId) {
      return NextResponse.json(
        { error: 'Missing required query params (userId, entityId, requestId)' },
        { status: 400 }
      );
    }

    const order = await getPaymentOrder(userId, entityId, requestId);
    if (!order) {
      return NextResponse.json({ error: 'Payment request not found' }, { status: 404 });
    }

    const resolved = await resolvePaymentOrderStatus(order);

    return NextResponse.json({
      requestId: resolved.requestId,
      status: resolved.status,
      expiresAt: resolved.expiresAt,
      paidAt: resolved.paidAt || null,
      paymentSignature: resolved.paymentSignature || null,
    });
  } catch (error: any) {
    console.error('[API] subscriptions/qr/status error:', error);
    return NextResponse.json(
      { error: error.message || 'Unable to resolve subscription payment status' },
      { status: 500 }
    );
  }
}
