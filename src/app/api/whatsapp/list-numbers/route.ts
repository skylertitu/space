import { NextResponse } from 'next/server';
import axios from 'axios';
import { guardApi } from '@/lib/apiAuth';

export const dynamic = 'force-dynamic';

const GRAPH = 'https://graph.facebook.com/v21.0';

type BusinessNumber = {
    phoneNumberId: string;
    displayPhoneNumber: string;
    verifiedName: string;
    wabaId: string;
};

function graphError(err: any): string {
    return err?.response?.data?.error?.message || 'Meta no devolvió los números de esa cuenta.';
}

async function phonesOfWaba(wabaId: string, accessToken: string): Promise<BusinessNumber[]> {
    const res = await axios.get(`${GRAPH}/${encodeURIComponent(wabaId)}/phone_numbers`, {
        params: {
            fields: 'id,display_phone_number,verified_name',
            access_token: accessToken,
        },
    });
    return (res.data?.data || []).map((phone: any) => ({
        phoneNumberId: String(phone.id),
        displayPhoneNumber: String(phone.display_phone_number || ''),
        verifiedName: String(phone.verified_name || ''),
        wabaId,
    }));
}

/**
 * Lista los números de una cuenta de WhatsApp Business (WABA) usando el token del cliente.
 * No guarda nada: solo deja elegir qué número conectar.
 */
export async function POST(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;

    try {
        const { accessToken, wabaId, userId } = await req.json();
        const token = String(accessToken || '').trim();
        if (!userId) {
            return NextResponse.json({ ok: false, message: 'Falta la sesión.' }, { status: 400 });
        }
        if (!token.startsWith('EAA')) {
            return NextResponse.json(
                { ok: false, message: 'Pega un token permanente de Meta. Empieza por EAA.' },
                { status: 400 }
            );
        }

        const accounts: string[] = [];
        const explicitWaba = String(wabaId || '').replace(/\D/g, '');
        if (explicitWaba) {
            accounts.push(explicitWaba);
        } else {
            const listed = await axios.get(`${GRAPH}/me/whatsapp_business_accounts`, {
                params: { access_token: token },
            });
            for (const account of listed.data?.data || []) {
                if (account?.id) accounts.push(String(account.id));
            }
        }

        if (accounts.length === 0) {
            return NextResponse.json({
                ok: false,
                message: 'No apareció ninguna cuenta de WhatsApp Business. Pega el WABA ID y vuelve a buscar.',
            }, { status: 400 });
        }

        const numbers: BusinessNumber[] = [];
        for (const id of accounts) {
            const found = await phonesOfWaba(id, token);
            numbers.push(...found);
        }

        if (numbers.length === 0) {
            return NextResponse.json({
                ok: false,
                message: 'Esa cuenta no tiene números de teléfono. Agrégalo en Meta Business y vuelve a buscar.',
            }, { status: 400 });
        }

        return NextResponse.json({ ok: true, numbers });
    } catch (err: any) {
        return NextResponse.json({ ok: false, message: graphError(err) }, { status: 400 });
    }
}
