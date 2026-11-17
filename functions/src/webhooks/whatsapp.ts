import * as functions from 'firebase-functions';
import axios from 'axios';
import { ROOSEVELT_API_BASE } from '../config';
import { regionalFunctions } from '../region';

/**
 * WhatsApp webhook compatibility endpoint (Firebase → Vercel).
 * Meta may still point at Cloud Functions; this proxies to the Next.js queue engine on Vercel.
 * Recommended Meta callback: https://www.byroosevelt.com/api/whatsapp/webhook
 */
export const whatsappWebhook = regionalFunctions.https.onRequest(async (req, res) => {
    const target = `${ROOSEVELT_API_BASE.replace(/\/$/, '')}/api/whatsapp/webhook`;

    try {
        if (req.method === 'GET') {
            const response = await axios.get(target, {
                params: req.query,
                validateStatus: () => true,
                responseType: 'text',
                timeout: 15000,
            });
            res.status(response.status).send(response.data);
            return;
        }

        if (req.method === 'POST') {
            const response = await axios.post(target, req.body, {
                params: req.query,
                headers: {
                    'Content-Type': req.headers['content-type'] || 'application/json',
                },
                validateStatus: () => true,
                timeout: 55000,
            });

            if (typeof response.data === 'object' && response.data !== null) {
                res.status(response.status).json(response.data);
            } else {
                res.status(response.status).send(response.data);
            }
            return;
        }

        res.status(405).send('Method Not Allowed');
    } catch (err: any) {
        functions.logger.error('[WhatsApp Proxy] Failed forwarding to Vercel:', err.message);
        res.status(502).send('WEBHOOK_PROXY_ERROR');
    }
});
