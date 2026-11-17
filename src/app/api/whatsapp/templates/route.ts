import { NextResponse } from 'next/server';
import axios from 'axios';
import { db } from '@/lib/firebase-admin';
import { guardApi } from '@/lib/apiAuth';

export async function GET(req: Request) {
    const denied = await guardApi(req);
    if (denied) return denied;
    try {
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');
        const entityId = searchParams.get('entityId');

        if (!userId || !entityId) {
            return NextResponse.json({ error: 'Missing userId or entityId' }, { status: 400 });
        }

        // Resolve credentials
        // Solo credenciales de la entidad (sin fallback a variables de entorno de la plataforma)
        let token: string | undefined;
        let wabaId = '';

        const applyCredentials = (source: any) => {
            if (!source) return;
            const resolvedToken = source.accessToken || source.token || source.access_token || source.pageAccessToken;
            const resolvedWaba = source.wabaId || source.whatsapp_business_account_id;
            if (resolvedToken && typeof resolvedToken === 'string' && resolvedToken.startsWith('EAA')) {
                token = resolvedToken;
            }
            if (resolvedWaba) {
                wabaId = String(resolvedWaba);
            }
        };

        const integrationsRef = db.collection(`users/${userId}/entities/${entityId}/integrations`);
        const [stdSnap, intSnap, allSnap] = await Promise.all([
            integrationsRef.doc('whatsapp').get(),
            integrationsRef.doc('whatsapp_internal').get(),
            integrationsRef.get()
        ]);

        applyCredentials(stdSnap.data());
        applyCredentials(intSnap.data());

        if (!token || !wabaId) {
            for (const doc of allSnap.docs) {
                if (doc.id === '_init') continue;
                applyCredentials(doc.data());
                if (token && wabaId) break;
            }
        }

        if (!token || !wabaId) {
            return NextResponse.json({ error: 'WhatsApp integration is not configured or lacks WABA ID.' }, { status: 400 });
        }

        // Fetch from Meta Graph API
        const response = await axios.get(`https://graph.facebook.com/v21.0/${wabaId}/message_templates`, {
            params: {
                access_token: token,
                limit: 100
            }
        });

        // Filter for APPROVED templates
        const templates = (response.data?.data || []).filter(
            (t: any) => t.status === 'APPROVED'
        );

        return NextResponse.json({ templates });
    } catch (error: any) {
        console.error('[WhatsApp Templates] Error:', error.response?.data || error.message);
        return NextResponse.json({
            error: 'Failed to fetch templates from Meta',
            details: error.response?.data || error.message
        }, { status: 500 });
    }
}
