import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { guardApi } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

async function validateStripeSecretKey(secretKey: string) {
    const stripe = new Stripe(secretKey);

    try {
        await stripe.balance.retrieve();
        return;
    } catch (balanceError: unknown) {
        const balanceMessage =
            balanceError instanceof Error ? balanceError.message : String(balanceError);

        // Restricted keys may lack Balance — fall back to a lighter read.
        if (!/permission|scope|authorized/i.test(balanceMessage)) {
            throw balanceError;
        }

        await stripe.customers.list({ limit: 1 });
    }
}

export async function POST(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;
    try {
        const body = await req.json();
        const publishableKey = String(body.publishableKey || '').trim();
        const secretKey = String(body.secretKey || '').trim();

        if (!publishableKey || !secretKey) {
            return NextResponse.json(
                { error: 'Faltan publishableKey o secretKey.' },
                { status: 400 }
            );
        }

        if (!secretKey.startsWith('sk_test_') && !secretKey.startsWith('sk_live_')) {
            return NextResponse.json(
                { error: 'La Secret Key debe empezar con sk_test_ o sk_live_.' },
                { status: 400 }
            );
        }

        if (!publishableKey.startsWith('pk_test_') && !publishableKey.startsWith('pk_live_')) {
            return NextResponse.json(
                { error: 'La Publishable Key debe empezar con pk_test_ o pk_live_.' },
                { status: 400 }
            );
        }

        const livemode = secretKey.startsWith('sk_live_');
        if (livemode !== publishableKey.startsWith('pk_live_')) {
            return NextResponse.json(
                { error: 'La Publishable Key y la Secret Key deben ser del mismo modo (test o live).' },
                { status: 400 }
            );
        }

        await validateStripeSecretKey(secretKey);

        return NextResponse.json({
            ok: true,
            mode: livemode ? 'live' : 'test',
            livemode,
        });
    } catch (error: unknown) {
        const raw = error instanceof Error ? error.message : 'No se pudo conectar Stripe.';
        const message = raw.includes('Invalid API Key')
            ? 'La Secret Key de Stripe no es válida. Copia de nuevo desde el Dashboard.'
            : raw.includes('No such API key')
              ? 'La Secret Key no existe o fue revocada en Stripe.'
              : raw;

        console.error('[Stripe Connect]', error);
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
