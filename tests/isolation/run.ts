/**
 * Pruebas de aislamiento multi-tenant. Corren SOLO contra el emulador de Firestore (nunca producción).
 *   npm run test:isolation
 * Dos clientes falsos (A y B) con integraciones propias: ningún evento/credencial de uno debe tocar al otro.
 */
import crypto from 'crypto';
import axios from 'axios';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error('ABORTADO: FIRESTORE_EMULATOR_HOST no está definido. Estas pruebas solo corren contra el emulador.');
    process.exit(2);
}
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'demo-roosevelt-test';
process.env.GCLOUD_PROJECT = 'demo-roosevelt-test';
process.env.META_APP_SECRET = 'test_meta_secret';
process.env.TWITTER_CONSUMER_SECRET = 'test_x_secret';
process.env.GMAIL_CLIENT_SECRET = 'test_gmail_secret';
process.env.WEBHOOK_SIGNATURE_MODE = 'enforce';
process.env.API_AUTH_MODE = 'log'; // las rutas privadas se prueban sin token de Firebase (la verificación de token tiene su propio guard)
process.env.WHATSAPP_ACCESS_TOKEN = 'EAA_PLATFORM_OWNER_TOKEN'; // el dueño de la plataforma: NUNCA debe usarse para un cliente
process.env.WHATSAPP_PHONE_NUMBER_ID = 'PHONE_PLATFORM_OWNER';

// ---- Sin red real: todo lo saliente se registra y se simula ----
const outbound: { url: string; auth: string }[] = [];
(globalThis as any).fetch = async (url: any, init: any = {}) => {
    outbound.push({ url: String(url), auth: JSON.stringify(init?.headers || {}) + String(url) });
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
};
axios.defaults.adapter = async (config: any) => {
    outbound.push({ url: String(config.url), auth: JSON.stringify(config.headers || {}) + JSON.stringify(config.params || {}) + String(config.url) });
    // Simula Graph: GET /{id}?access_token=... confirma el id salvo con tokens "FAKE" (no controlan nada)
    const m = /graph\.facebook\.com\/v[\d.]+\/([^/?]+)$/.exec(String(config.url));
    if (String(config.method || 'get').toLowerCase() === 'get' && m && config.params?.access_token) {
        if (String(config.params.access_token).includes('FAKE')) {
            const err: any = new Error('Request failed with status code 400'); err.response = { status: 400, data: { error: { message: 'Invalid OAuth access token' } } }; throw err;
        }
        return { data: { id: decodeURIComponent(m[1]), username: 'u', name: 'n' }, status: 200, statusText: 'OK', headers: {}, config } as any;
    }
    return { data: { messages: [{ id: 'wamid.TEST' }], data: [] }, status: 200, statusText: 'OK', headers: {}, config } as any;
};

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = '') {
    if (ok) { passed++; console.log(`  ✅ ${name}`); }
    else { failures.push(name); console.log(`  ❌ ${name} ${detail}`); }
}

const A = { uid: 'uidAAAAAAAAAAAA', ent: 'entA' };
const B = { uid: 'uidBBBBBBBBBBBB', ent: 'entB' };
const C = { uid: 'uidCCCCCCCCCCCC', ent: 'entC' }; // cliente sin credenciales
const D = { uid: 'uidDDDDDDDDDDDD', ent: 'entD' }; // intenta secuestrar la página de A
const E = { uid: 'uidEEEEEEEEEEEE', ent: 'entE' }; // reclama los mismos ids que D (conflicto)
const path = (t: { uid: string; ent: string }) => `users/${t.uid}/entities/${t.ent}`;

async function listTree(db: FirebaseFirestore.Firestore, docPath: string, out: Set<string> = new Set()) {
    const ref = db.doc(docPath);
    for (const col of await ref.listCollections()) {
        for (const d of await col.listDocuments()) {
            out.add(d.path);
            await listTree(db, d.path, out);
        }
    }
    return out;
}
const sign = (body: string, secret = 'test_meta_secret') => 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');

async function main() {
    const { db } = await import('../../src/lib/firebase-admin');

    // ---------- Datos sembrados ----------
    for (const t of [A, B, C, D, E]) await db.doc(path(t)).set({ name: t.ent, type: 'empresa' });
    const seed = (t: any, id: string, data: any) => db.doc(`${path(t)}/integrations/${id}`).set({ status: 'Connected', ...data });
    await seed(A, 'messenger', { provider: 'messenger', pageId: 'PAGE_A', accessToken: 'EAA_TOKEN_A', pageAccessToken: 'EAA_TOKEN_A' });
    await seed(B, 'messenger', { provider: 'messenger', pageId: 'PAGE_B', accessToken: 'EAA_TOKEN_B', pageAccessToken: 'EAA_TOKEN_B' });
    await seed(A, 'whatsapp', { phoneNumberId: 'PHONE_A', accessToken: 'EAA_WA_A', wabaId: 'WABA_A' });
    await seed(B, 'whatsapp', { phoneNumberId: 'PHONE_B', accessToken: 'EAA_WA_B', wabaId: 'WABA_B' });
    await seed(A, 'x_twitter', { provider: 'x_twitter', twitterUserId: 'XA', twitterHandle: 'cuenta_a' });
    await seed(B, 'x_twitter', { provider: 'x_twitter', twitterUserId: 'XB', twitterHandle: 'cuenta_b' });
    await seed(A, 'telegram', { provider: 'telegram', botToken: '111:AAA' });
    await db.doc(`${path(A)}/integrations/telegram_internal`).set({ webhookSecret: 'secretA' });
    // D reclama la misma página que A (ataque de secuestro)
    await seed(D, 'messenger', { provider: 'messenger', pageId: 'PAGE_A', accessToken: 'EAA_TOKEN_D', pageAccessToken: 'EAA_TOKEN_D' });

    // D y E reclaman el mismo número de WhatsApp, cuenta de X y correo de Gmail
    for (const t of [D, E]) {
        await seed(t, 'whatsapp', { phoneNumberId: 'PHONE_SHARED', accessToken: 'EAA_WA_' + t.ent });
        await seed(t, 'x_twitter', { provider: 'x_twitter', twitterUserId: 'XSHARED', twitterHandle: 'compartida' });
        await db.doc(`${path(t)}/integrations/gmail/accounts/shared_x_com`).set({ gmailAddress: 'shared@x.com', email: 'shared@x.com', status: 'Connected' });
    }

    // =====================================================================
    console.log('\n1) Reglas de Firestore (cliente web)');
    const env = await initializeTestEnvironment({
        projectId: 'demo-roosevelt-test',
        firestore: { rules: readFileSync((process.env.ROOT_DIR || '.') + '/firestore.rules', 'utf8'), host: process.env.FIRESTORE_EMULATOR_HOST!.split(':')[0], port: Number(process.env.FIRESTORE_EMULATOR_HOST!.split(':')[1]) },
    });
    await env.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().doc(`${path(B)}/integrations/messenger`).set({ pageAccessToken: 'EAA_TOKEN_B', pageId: 'PAGE_B' });
        await ctx.firestore().doc(`${path(A)}/integrations/messenger`).set({ pageAccessToken: 'EAA_TOKEN_A', pageId: 'PAGE_A' });
    });
    const asA = env.authenticatedContext(A.uid).firestore();
    const anon = env.unauthenticatedContext().firestore();
    await assertSucceeds(asA.doc(`${path(A)}/integrations/messenger`).get());
    check('A lee sus propias integraciones', true);
    await assertSucceeds(asA.doc(`${path(A)}/integrations/messenger`).set({ pageId: 'PAGE_A', pageAccessToken: 'EAA_TOKEN_A' }));
    check('A escribe sus propias integraciones', true);
    check('A NO lee integraciones de B', await assertFails(asA.doc(`${path(B)}/integrations/messenger`).get()).then(() => true, () => false));
    check('A NO escribe en integraciones de B', await assertFails(asA.doc(`${path(B)}/integrations/messenger`).set({ pageId: 'X' })).then(() => true, () => false));
    check('A NO crea entidades bajo el uid de B', await assertFails(asA.doc(`users/${B.uid}/entities/nueva`).set({ a: 1 })).then(() => true, () => false));
    check('A NO consulta collectionGroup(integrations)', await assertFails(asA.collectionGroup('integrations').get()).then(() => true, () => false));
    check('A NO consulta collectionGroup(cards) de todos', await assertFails(asA.collectionGroup('cards').get()).then(() => true, () => false));
    check('A NO crea colecciones raíz', await assertFails(asA.doc('mi_coleccion/doc1').set({ a: 1 })).then(() => true, () => false));
    check('A NO lee system_mappings', await assertFails(asA.doc('system_mappings/whatsapp_numbers/numbers/PHONE_B').get()).then(() => true, () => false));
    check('A NO escribe en integration_claims (solo el servidor)', await assertFails(asA.doc('integration_claims/messenger__PAGE_B').set({ userId: A.uid, entityId: A.ent })).then(() => true, () => false));
    check('A NO lee integration_claims', await assertFails(asA.doc('integration_claims/messenger__PAGE_B').get()).then(() => true, () => false));
    check('Sin sesión NO lee nada', await assertFails(anon.doc(`${path(A)}/integrations/messenger`).get()).then(() => true, () => false));
    await env.cleanup();

    // =====================================================================
    console.log('\n2) Webhook de Meta (Messenger/Instagram)');
    const metaRoute = await import('../../src/app/api/meta/webhook/route');
    const metaBody = (pageId: string, text: string) => JSON.stringify({
        object: 'page',
        entry: [{ id: pageId, time: Date.now(), messaging: [{ sender: { id: 'CLIENTE_1' }, recipient: { id: pageId }, timestamp: Date.now(), message: { mid: 'm_' + crypto.randomUUID(), text } }] }],
    });
    const postMeta = (raw: string, sig?: string) => metaRoute.POST(new Request('http://localhost/api/meta/webhook', { method: 'POST', headers: { 'content-type': 'application/json', ...(sig ? { 'x-hub-signature-256': sig } : {}) }, body: raw }));

    let beforeA = await listTree(db, path(A)), beforeB = await listTree(db, path(B));
    let raw = metaBody('PAGE_B', 'hola B');
    let res = await postMeta(raw, 'sha256=' + '0'.repeat(64));
    check('Firma falsa → 401', res.status === 401);
    res = await postMeta(raw);
    check('Sin firma → 401', res.status === 401);
    check('Firma falsa no escribió nada en B', (await listTree(db, path(B))).size === beforeB.size);

    res = await postMeta(raw, sign(raw));
    check('Firma válida para página de B → 200', res.status === 200, `status=${res.status}`);
    const afterB = await listTree(db, path(B)), afterA = await listTree(db, path(A));
    check('El mensaje de PAGE_B llegó a la entidad B', afterB.size > beforeB.size, `antes=${beforeB.size} después=${afterB.size}`);
    check('El mensaje de PAGE_B NO tocó la entidad A', afterA.size === beforeA.size);

    // Secuestro: D reclama PAGE_A (igual que A). Nadie debe recibirlo.
    const beforeD = await listTree(db, path(D)); beforeA = await listTree(db, path(A));
    raw = metaBody('PAGE_A', 'mensaje de un cliente real de A');
    res = await postMeta(raw, sign(raw));
    const j: any = await res.json().catch(() => ({}));
    check('Página reclamada por dos usuarios → ignorada (ambiguous_tenant)', j.ignored === 'ambiguous_tenant', JSON.stringify(j));
    check('El atacante D NO recibió el mensaje', (await listTree(db, path(D))).size === beforeD.size);
    check('La víctima A tampoco recibe (conflicto bloqueado)', (await listTree(db, path(A))).size === beforeA.size);

    // =====================================================================
    console.log('\n3) Webhook de WhatsApp');
    const waRoute = await import('../../src/app/api/whatsapp/webhook/route');
    const waBody = (phoneId: string, text: string) => JSON.stringify({
        object: 'whatsapp_business_account',
        entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '1555', phone_number_id: phoneId },
            contacts: [{ profile: { name: 'Cliente' }, wa_id: '5215550001' }], messages: [{ from: '5215550001', id: 'wamid.' + crypto.randomUUID(), timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }] } }] }],
    });
    const postWa = (raw: string, sig?: string) => waRoute.POST(new Request('http://localhost/api/whatsapp/webhook', { method: 'POST', headers: { 'content-type': 'application/json', ...(sig ? { 'x-hub-signature-256': sig } : {}) }, body: raw }));
    beforeA = await listTree(db, path(A)); beforeB = await listTree(db, path(B));
    raw = waBody('PHONE_A', 'hola A por whatsapp');
    res = await postWa(raw, 'sha256=' + 'f'.repeat(64));
    check('WhatsApp con firma falsa → 401', res.status === 401);
    res = await postWa(raw, sign(raw));
    check('WhatsApp con firma válida → 200', res.status === 200, `status=${res.status}`);
    check('Mensaje de PHONE_A llegó a A', (await listTree(db, path(A))).size > beforeA.size);
    check('Mensaje de PHONE_A NO tocó a B', (await listTree(db, path(B))).size === beforeB.size);
    const unmapped = waBody('PHONE_NADIE', 'huérfano');
    res = await postWa(unmapped, sign(unmapped));
    check('Número no mapeado → ignorado, sin caer en otro tenant', ((await res.json()) as any).ignored === 'tenant_not_mapped');

    // =====================================================================
    console.log('\n4) Envío de WhatsApp: credenciales solo del cliente');
    const { sendWhatsAppMessage } = await import('../../src/lib/sendProviders');
    outbound.length = 0;
    let threw = false;
    try { await sendWhatsAppMessage('5215550009', 'hola', { userId: C.uid, entityId: C.ent }); } catch { threw = true; }
    check('Cliente SIN credenciales → error (no usa el token del dueño)', threw);
    check('Nada salió hacia Meta con el token de la plataforma', !outbound.some((o) => o.auth.includes('EAA_PLATFORM_OWNER_TOKEN') || o.auth.includes('PHONE_PLATFORM_OWNER')));
    outbound.length = 0;
    await sendWhatsAppMessage('5215550009', 'hola', { userId: B.uid, entityId: B.ent });
    check('Cliente B envía con SU token y SU número', outbound.some((o) => o.auth.includes('EAA_WA_B') && o.url.includes('PHONE_B')));
    check('B nunca usa el token de A ni el de la plataforma', !outbound.some((o) => o.auth.includes('EAA_WA_A') || o.auth.includes('EAA_PLATFORM_OWNER_TOKEN')));

    // =====================================================================
    console.log('\n5) X / Twitter: resolución de tenant');
    const { resolveTwitterTenant } = await import('../../src/lib/xWebhookHelpers');
    check('for_user_id de A → entidad A', (await resolveTwitterTenant({ for_user_id: 'XA' }))?.entityId === A.ent);
    check('for_user_id de B → entidad B', (await resolveTwitterTenant({ for_user_id: 'XB' }))?.entityId === B.ent);
    check('Id desconocido → null (sin fallback a otro tenant)', (await resolveTwitterTenant({ for_user_id: 'XNADIE' })) === null);
    check('Sin handle ni id coincidente → null (no matchea undefined===undefined)', (await resolveTwitterTenant({ for_user_id: 'XNADIE', user: {} })) === null);
    const twRoute = await import('../../src/app/api/twitter/webhook/route');
    const twRaw = JSON.stringify({ for_user_id: 'XA', tweet_create_events: [] });
    res = await twRoute.POST(new Request('http://localhost/api/twitter/webhook', { method: 'POST', headers: { 'x-twitter-webhooks-signature': 'sha256=falsa' }, body: twRaw }));
    check('X con firma falsa → 401', res.status === 401);

    // =====================================================================
    console.log('\n6) Telegram');
    const tgRoute = await import('../../src/app/api/telegram/webhook/route');
    const tgBody = JSON.stringify({ update_id: 1, message: { message_id: 7, chat: { id: 99001, type: 'private' }, from: { id: 99001, first_name: 'Tg' }, text: 'hola bot' } });
    const postTg = (u: string, e: string, secret?: string) => tgRoute.POST(new Request(`http://localhost/api/telegram/webhook?u=${u}&e=${e}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(secret ? { 'x-telegram-bot-api-secret-token': secret } : {}) }, body: tgBody }));
    beforeA = await listTree(db, path(A));
    res = await postTg(A.uid, A.ent, 'incorrecto');
    check('Telegram con secret incorrecto → 401', res.status === 401);
    res = await postTg(A.uid, A.ent);
    check('Telegram sin secret → 401', res.status === 401);
    check('Rechazados no escribieron nada', (await listTree(db, path(A))).size === beforeA.size);
    beforeB = await listTree(db, path(B));
    res = await postTg(A.uid, A.ent, 'secretA');
    check('Telegram con el secret de A → 200', res.status === 200, `status=${res.status}`);
    check('Telegram de A creó datos en A', (await listTree(db, path(A))).size > beforeA.size);
    check('Telegram de A NO tocó a B', (await listTree(db, path(B))).size === beforeB.size);

    // =====================================================================
    console.log('\n7) OAuth state de Gmail');
    const gmailCb = await import('../../src/app/api/gmail/callback/route');
    const forged = Buffer.from(JSON.stringify({ userId: B.uid, entityId: B.ent })).toString('base64');
    res = await gmailCb.GET(new Request(`http://localhost/api/gmail/callback?code=abc&state=${encodeURIComponent(forged)}`));
    check('State forjado (sin firma) → 400', res.status === 400);
    const { signOAuthState } = await import('../../src/lib/oauthState');
    const forged2 = signOAuthState({ userId: A.uid, entityId: A.ent }).split('.')[0] + '.' + 'x'.repeat(43);
    res = await gmailCb.GET(new Request(`http://localhost/api/gmail/callback?code=abc&state=${encodeURIComponent(forged2)}`));
    check('State con firma inválida → 400', res.status === 400);

    // =====================================================================
    console.log('\n8) Anti-secuestro: el mismo id reclamado por dos usuarios no se entrega a nadie');
    const beforeDE = (await listTree(db, path(D))).size + (await listTree(db, path(E))).size;
    raw = waBody('PHONE_SHARED', 'mensaje para un número disputado');
    res = await postWa(raw, sign(raw));
    check('WhatsApp: número reclamado por D y E → ignorado', ((await res.json()) as any).ignored === 'tenant_not_mapped');
    check('X: cuenta reclamada por D y E → null', (await resolveTwitterTenant({ for_user_id: 'XSHARED' })) === null);
    const gmailRoute = await import('../../src/app/api/gmail/webhook/route');
    const pubsub = (email: string) => JSON.stringify({ message: { data: Buffer.from(JSON.stringify({ emailAddress: email, historyId: '1' })).toString('base64') } });
    res = await gmailRoute.POST(new Request('http://localhost/api/gmail/webhook', { method: 'POST', body: pubsub('shared@x.com') }));
    check('Gmail sin token de Pub/Sub (enforce) → 401', res.status === 401);
    process.env.WEBHOOK_SIGNATURE_MODE = 'log'; // solo para ejercitar la resolución de tenant
    res = await gmailRoute.POST(new Request('http://localhost/api/gmail/webhook', { method: 'POST', body: pubsub('shared@x.com') }));
    check('Gmail: correo reclamado por D y E → ignorado', ((await res.json()) as any).ignored === 'ambiguous_tenant');
    process.env.WEBHOOK_SIGNATURE_MODE = 'enforce';
    check('Ni D ni E recibieron nada', (await listTree(db, path(D))).size + (await listTree(db, path(E))).size === beforeDE);

    // =====================================================================
    console.log('\n9) Reclamos verificados (integration_claims)');
    const claimRoute = await import('../../src/app/api/integrations/claim/route');
    const claimPost = (provider: string, t: { uid: string; ent: string }) => claimRoute.POST(new Request('http://localhost/api/integrations/claim', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider, userId: t.uid, entityId: t.ent }) }));
    const F = { uid: 'uidFFFFFFFFFFFF', ent: 'entF' }, G = { uid: 'uidGGGGGGGGGGGG', ent: 'entG' };
    for (const t of [F, G]) await db.doc(path(t)).set({ name: t.ent, type: 'empresa' });
    // (la sección 1 sobrescribió el doc de A con datos de prueba de reglas: se restaura el estado real)
    await seed(A, 'messenger', { provider: 'messenger', pageId: 'PAGE_A', accessToken: 'EAA_TOKEN_A', pageAccessToken: 'EAA_TOKEN_A' });
    await seed(B, 'messenger', { provider: 'messenger', pageId: 'PAGE_B', accessToken: 'EAA_TOKEN_B', pageAccessToken: 'EAA_TOKEN_B' });
    await seed(F, 'messenger', { provider: 'messenger', pageId: 'PAGE_F', accessToken: 'EAA_F_OK' });
    await seed(G, 'messenger', { provider: 'messenger', pageId: 'PAGE_F', accessToken: 'EAA_FAKE_G' }); // atacante: escribió el id de F con un token que no controla nada

    res = await claimPost('messenger', G);
    check('Atacante con token falso NO puede reclamar la página (403)', res.status === 403, `status=${res.status}`);
    res = await claimPost('messenger', F);
    check('El dueño real reclama su página (200)', res.status === 200, `status=${res.status}`);
    await db.doc(`${path(G)}/integrations/messenger`).set({ accessToken: 'EAA_G_OK' }, { merge: true }); // atacante consigue un token válido de otra página
    res = await claimPost('messenger', G);
    check('Segundo reclamante del mismo id → 409 conflicto', res.status === 409, `status=${res.status}`);

    const beforeF = (await listTree(db, path(F))).size, beforeG = (await listTree(db, path(G))).size;
    raw = metaBody('PAGE_F', 'mensaje para F');
    res = await postMeta(raw, sign(raw));
    check('PAGE_F con reclamo → 200', res.status === 200, `status=${res.status}`);
    check('El mensaje llegó al dueño reclamado (F)', (await listTree(db, path(F))).size > beforeF);
    check('El atacante G NO lo recibió aunque escribió el id', (await listTree(db, path(G))).size === beforeG);

    // La víctima A (bloqueada por el conflicto con D en la sección 2) recupera su página al reclamarla
    res = await claimPost('messenger', A);
    check('A reclama PAGE_A (token válido)', res.status === 200, `status=${res.status}`);
    res = await claimPost('messenger', D);
    check('D (que falsificó PAGE_A) recibe 409 al intentar reclamarla', res.status === 409, `status=${res.status}`);
    const beforeA9 = (await listTree(db, path(A))).size, beforeD9 = (await listTree(db, path(D))).size;
    raw = metaBody('PAGE_A', 'mensaje real para A');
    res = await postMeta(raw, sign(raw));
    check('PAGE_A ahora se entrega a A', (await listTree(db, path(A))).size > beforeA9);
    check('y NO a D', (await listTree(db, path(D))).size === beforeD9);

    res = await claimPost('whatsapp', B);
    check('B reclama su número de WhatsApp (200)', res.status === 200, `status=${res.status}`);
    check('El reclamo de WhatsApp quedó registrado para B', (await db.doc('integration_claims/whatsapp__PHONE_B').get()).data()?.entityId === B.ent);

    // Modo require: ids sin reclamo verificado no se entregan
    await seed(C, 'messenger', { provider: 'messenger', pageId: 'PAGE_SIN_RECLAMO', accessToken: 'EAA_C' });
    await seed(C, 'whatsapp', { phoneNumberId: 'PHONE_SIN_RECLAMO', accessToken: 'EAA_C' });
    process.env.INTEGRATION_CLAIMS_MODE = 'require';
    raw = metaBody('PAGE_SIN_RECLAMO', 'x');
    res = await postMeta(raw, sign(raw));
    check('require: página sin reclamo → ignorada', ((await res.json()) as any).ignored === 'unclaimed');
    raw = waBody('PHONE_SIN_RECLAMO', 'x');
    res = await postWa(raw, sign(raw));
    check('require: número sin reclamo → ignorado', ((await res.json()) as any).ignored === 'tenant_not_mapped');
    raw = waBody('PHONE_B', 'con reclamo');
    res = await postWa(raw, sign(raw));
    check('require: número con reclamo sigue funcionando', res.status === 200 && ((await res.json()) as any).ignored === undefined);
    delete process.env.INTEGRATION_CLAIMS_MODE;

    // =====================================================================
    console.log('\n10) Suscripciones: el plan no se puede falsificar');
    const subEnv = await initializeTestEnvironment({
        projectId: 'demo-roosevelt-test',
        firestore: { rules: readFileSync((process.env.ROOT_DIR || '.') + '/firestore.rules', 'utf8'), host: process.env.FIRESTORE_EMULATOR_HOST!.split(':')[0], port: Number(process.env.FIRESTORE_EMULATOR_HOST!.split(':')[1]) },
    });
    await subEnv.withSecurityRulesDisabled(async (ctx) => {
        await ctx.firestore().doc(`${path(A)}/subscriptions/current`).set({ status: 'active', plan: 'starter' });
        await ctx.firestore().doc(`${path(A)}/contacts/c1`).set({ name: 'x' });
    });
    const sA = subEnv.authenticatedContext(A.uid).firestore();
    await assertSucceeds(sA.doc(`${path(A)}/subscriptions/current`).get());
    check('El dueño LEE su suscripción', true);
    check('El dueño NO puede escribir su suscripción (plan enterprise falso)', await assertFails(sA.doc(`${path(A)}/subscriptions/current`).set({ status: 'active', plan: 'enterprise' })).then(() => true, () => false));
    check('El dueño NO puede escribir la suscripción a nivel de usuario', await assertFails(sA.doc(`users/${A.uid}/subscriptions/current`).set({ status: 'active', plan: 'enterprise' })).then(() => true, () => false));
    check('El dueño NO puede crear órdenes de pago "pagadas"', await assertFails(sA.doc(`${path(A)}/paymentRequests/r1`).set({ status: 'paid' })).then(() => true, () => false));
    check('El dueño NO puede borrar su suscripción para esquivar límites', await assertFails(sA.doc(`${path(A)}/subscriptions/current`).delete()).then(() => true, () => false));
    await assertSucceeds(sA.doc(`${path(A)}/contacts/c2`).set({ name: 'ok' }));
    check('El dueño SÍ sigue escribiendo el resto de su entidad', true);
    await assertSucceeds(sA.doc(`users/${A.uid}/entities/entNueva`).set({ name: 'n', type: 'empresa' }));
    check('El dueño SÍ crea entidades', true);
    check('A NO lee la suscripción de B', await assertFails(sA.doc(`${path(B)}/subscriptions/current`).get()).then(() => true, () => false));
    await subEnv.cleanup();

    const { getEntityEntitlements, requireSuite, requireOrgChart } = await import('../../src/lib/subscriptions/entitlements.server');
    const iso = (days: number) => new Date(Date.now() + days * 864e5).toISOString();
    const mk = async (ent: string, type: string, sub?: any) => {
        const t = { uid: 'uidPLAN' + ent, ent };
        await db.doc(path(t)).set({ name: ent, type });
        if (sub) await db.doc(`${path(t)}/subscriptions/current`).set(sub);
        return t;
    };
    const tStarter = await mk('pStarter', 'empresa', { status: 'active', plan: 'starter', expiresAt: iso(10) });
    const tStandard = await mk('pStandard', 'empresa', { status: 'active', plan: 'standard', expiresAt: iso(10) });
    const tPro = await mk('pPro', 'empresa', { status: 'active', plan: 'pro', expiresAt: iso(10) });
    const tPlus = await mk('pPlus', 'empresa', { status: 'active', plan: 'plus', expiresAt: iso(10) });
    const tEnt = await mk('pEnt', 'empresa', { status: 'active', plan: 'enterprise', expiresAt: iso(10) });
    const tExpired = await mk('pExpired', 'empresa', { status: 'active', plan: 'pro', expiresAt: iso(-1) });
    const tNone = await mk('pNone', 'empresa');
    const tPersona = await mk('pPersona', 'persona');
    const tBogus = await mk('pBogus', 'empresa', { status: 'active', plan: 'galactico', expiresAt: iso(10) });
    const suitesOf = async (t: any) => (await getEntityEntitlements(t.uid, t.ent)).suites.slice().sort().join(',');
    check('Starter → solo CTO y COO', (await suitesOf(tStarter)) === 'coo,cto');
    check('Standard → CTO, COO, CMO y CHRO', (await suitesOf(tStandard)) === 'chro,cmo,coo,cto');
    check('Pro → las 12 suites', (await getEntityEntitlements(tPro.uid, tPro.ent)).suites.length === 12);
    check('Plan heredado "plus" se trata como Pro', (await getEntityEntitlements(tPlus.uid, tPlus.ent)).plan === 'pro');
    check('Solo Enterprise desbloquea el organigrama', (await getEntityEntitlements(tEnt.uid, tEnt.ent)).orgChart === true && (await getEntityEntitlements(tPro.uid, tPro.ent)).orgChart === false && (await getEntityEntitlements(tStarter.uid, tStarter.ent)).orgChart === false);
    check('Suscripción vencida → sin acceso', (await getEntityEntitlements(tExpired.uid, tExpired.ent)).active === false);
    check('Sin suscripción → sin acceso', (await getEntityEntitlements(tNone.uid, tNone.ent)).active === false);
    check('Plan desconocido → sin acceso', (await getEntityEntitlements(tBogus.uid, tBogus.ent)).active === false);
    check('Perfil personal → gratuito', (await getEntityEntitlements(tPersona.uid, tPersona.ent)).free === true);

    process.env.SUBSCRIPTION_ENFORCEMENT = 'enforce';
    check('enforce: Starter no entra a CMO (402)', (await requireSuite(tStarter.uid, tStarter.ent, 'cmo'))?.status === 402);
    check('enforce: Starter sí entra a CTO', (await requireSuite(tStarter.uid, tStarter.ent, 'cto')) === null);
    check('enforce: Standard sí entra a CMO', (await requireSuite(tStandard.uid, tStandard.ent, 'cmo')) === null);
    check('enforce: Standard no entra a CFO', (await requireSuite(tStandard.uid, tStandard.ent, 'cfo'))?.status === 402);
    check('enforce: sin suscripción no entra a nada', (await requireSuite(tNone.uid, tNone.ent, 'cto'))?.status === 402);
    check('enforce: Pro no accede al organigrama', (await requireOrgChart(tPro.uid, tPro.ent))?.status === 402);
    check('enforce: Enterprise sí accede al organigrama', (await requireOrgChart(tEnt.uid, tEnt.ent)) === null);
    process.env.SUBSCRIPTION_ENFORCEMENT = 'log';
    check('log: no bloquea (solo registra)', (await requireSuite(tNone.uid, tNone.ent, 'cto')) === null);
    delete process.env.SUBSCRIPTION_ENFORCEMENT;

    // --- Canje de códigos de prueba gratuita (servidor) ---
    const redeemRoute = await import('../../src/app/api/subscriptions/redeem/route');
    const redeemAs = (uid: string, ent: string, code: string) => redeemRoute.POST(new Request('http://localhost/api/subscriptions/redeem', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: uid, entityId: ent, code }) }));
    const mkEntity = async (uid: string, ent: string) => { await db.doc(`users/${uid}/entities/${ent}`).set({ name: ent, type: 'empresa' }); return { uid, ent }; };
    delete process.env.SUBSCRIPTION_ACCESS_CODES; delete process.env.SUBSCRIPTION_CODE_EXEMPT_UIDS; delete process.env.SUBSCRIPTION_ACCESS_CODE_MAX_PER_ACCOUNT;

    check('El código público antiguo "roosevelt2025" ya NO funciona', (await redeemAs('uidRX0', 'e0', 'roosevelt2025')).status === 400);
    const trialCases: Array<[string, string, string]> = [['Itsroosevelt', 'starter', 'coo,cto'], ['LUXORINTELLIGENCE', 'standard', 'chro,cmo,coo,cto'], ['excelsiorstandard', 'pro', ''], ['  Occidentstandard ', 'enterprise', '']];
    for (const [i, [code, plan]] of trialCases.entries()) {
        const t = await mkEntity('uidTRIAL' + i, 'eT' + i);
        const r = await redeemAs(t.uid, t.ent, code);
        const ent = await getEntityEntitlements(t.uid, t.ent);
        check(`Código "${code.trim()}" → plan ${plan}`, r.status === 200 && ent.plan === plan, `status=${r.status} plan=${ent.plan}`);
    }
    const tE = { uid: 'uidTRIAL3', ent: 'eT3' };
    check('Occidentstandard desbloquea el organigrama', (await getEntityEntitlements(tE.uid, tE.ent)).orgChart === true);
    const tS = { uid: 'uidTRIAL0', ent: 'eT0' };
    const subDoc = (await db.doc(`${path(tS)}/subscriptions/current`).get()).data()!;
    const days = (new Date(subDoc.expiresAt).getTime() - Date.now()) / 864e5;
    check('La prueba dura 30 días (no 365)', days > 29.9 && days < 30.1, `días=${days.toFixed(2)}`);
    check('La prueba queda marcada como gratuita (precio 0)', subDoc.priceUSD === 0 && subDoc.trial === true);

    check('Segundo canje en el mismo entorno → 409', (await redeemAs(tS.uid, tS.ent, 'Itsroosevelt')).status === 409);
    await mkEntity(tS.uid, 'eOtro');
    check('Otra entidad de la misma cuenta → 409 (una prueba por cuenta)', (await redeemAs(tS.uid, 'eOtro', 'Itsroosevelt')).status === 409);
    process.env.SUBSCRIPTION_CODE_EXEMPT_UIDS = 'uidTRIAL0,uidOtro';
    check('Cuenta exenta (dueño de la plataforma) sí puede canjear en otra entidad', (await redeemAs(tS.uid, 'eOtro', 'Itsroosevelt')).status === 200);
    delete process.env.SUBSCRIPTION_CODE_EXEMPT_UIDS;

    // Vence a los 30 días: se vuelve a bloquear y no se puede repetir
    await db.doc(`${path(tS)}/subscriptions/current`).set({ expiresAt: new Date(Date.now() - 1000).toISOString() }, { merge: true });
    check('Prueba vencida → vuelve a bloquearse', (await getEntityEntitlements(tS.uid, tS.ent)).active === false);
    check('Los datos siguen ahí tras el vencimiento', (await db.doc(`${path(tS)}/contacts/dato`).set({ ok: 1 }).then(() => true)) && (await db.doc(`${path(tS)}/contacts/dato`).get()).exists);
    check('Prueba vencida: no se puede volver a canjear (hay que pagar)', (await redeemAs(tS.uid, tS.ent, 'Occidentstandard')).status === 409);

    // La prueba no cuenta como suscripción pagada al cobrar
    const { resolveUpgradeChargeForUser } = await import('../../src/lib/subscriptions/upgrade-pricing-server');
    const tT = { uid: 'uidTRIAL1', ent: 'eT1' };
    const q = await resolveUpgradeChargeForUser({ userId: tT.uid, entityId: tT.ent, targetPlanId: 'pro' });
    check('Pagar tras la prueba cobra el precio completo (sin crédito ni herencia del vencimiento)', q.hasActive === false && q.chargeUSD === 199.99);

    // No se pisa una suscripción de pago vigente
    const tPaid = await mkEntity('uidPAID', 'ePaid');
    await db.doc(`${path(tPaid)}/subscriptions/current`).set({ status: 'active', plan: 'pro', priceUSD: 199.99, paymentMethod: 'card_stripe', expiresAt: iso(20) });
    check('Con suscripción de pago vigente el código no la reemplaza (409)', (await redeemAs(tPaid.uid, tPaid.ent, 'Itsroosevelt')).status === 409);

    // Fuerza bruta: el contador es por cuenta (crear entidades no lo reinicia)
    const tBrute = await mkEntity('uidBRUTE', 'eB1');
    await mkEntity('uidBRUTE', 'eB2');
    let last = 0;
    for (let i = 0; i < 6; i++) last = (await redeemAs(tBrute.uid, 'eB1', 'adivinando' + i)).status;
    check('Fuerza bruta: tras 5 fallos → 429', last === 429);
    check('El bloqueo es por cuenta: otra entidad de la misma cuenta también', (await redeemAs('uidBRUTE', 'eB2', 'Itsroosevelt')).status === 429);

    // Cambiar los códigos sin tocar el código fuente
    process.env.SUBSCRIPTION_ACCESS_CODES = 'MiCodigoNuevo:starter:7';
    const tNew = await mkEntity('uidNEWCODE', 'eN');
    check('Con SUBSCRIPTION_ACCESS_CODES los códigos por defecto dejan de valer', (await redeemAs(tNew.uid, tNew.ent, 'Itsroosevelt')).status === 400);
    check('El código definido por entorno funciona (7 días)', (await redeemAs(tNew.uid, tNew.ent, 'micodigonuevo')).status === 200);
    const nd = (await db.doc(`${path(tNew)}/subscriptions/current`).get()).data()!;
    check('y dura los días configurados', Math.round((new Date(nd.expiresAt).getTime() - Date.now()) / 864e5) === 7);
    delete process.env.SUBSCRIPTION_ACCESS_CODES;

    // --- Intentos de falsificar el plan o el monto ---
    const upgradeRoute = await import('../../src/app/api/subscriptions/upgrade/route');
    const upgrade = (t: any, plan: string) => upgradeRoute.POST(new Request('http://localhost/api/subscriptions/upgrade', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: t.uid, entityId: t.ent, plan }) }) as any);
    check('Mejora a Enterprise sin pagar la diferencia → rechazada', (await upgrade(tStarter, 'enterprise')).status === 400);
    check('Mejora de Starter a Pro sin pagar la diferencia → rechazada', (await upgrade(tStarter, 'pro')).status === 400);
    check('El plan de Starter no cambió', (await getEntityEntitlements(tStarter.uid, tStarter.ent)).plan === 'starter');

    const verifyRoute = await import('../../src/app/api/subscriptions/verify/route');
    check('Ruta heredada /verify cerrada (410)', (await verifyRoute.POST()).status === 410);

    const qrRoute = await import('../../src/app/api/subscriptions/qr/create/route');
    const tQr = await mk('pQr', 'empresa');
    const qrCreate = (body: any) => qrRoute.POST(new Request('http://localhost/api/subscriptions/qr/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: tQr.uid, entityId: tQr.ent, ...body }) }) as any);
    let r = await qrCreate({ plan: 'pro', paymentMethod: 'usdc', chargeUSD: 1, expectedAmountUi: '0.000001', expectedAmountRaw: '1' });
    check('QR: cobro de $1 por el plan Pro → rechazado (400)', r.status === 400, `status=${r.status}`);
    r = await qrCreate({ plan: 'enterprise', paymentMethod: 'usdc', chargeUSD: 1, expectedAmountUi: '1', expectedAmountRaw: '1000000' });
    check('QR: cobro de $1 por Enterprise → rechazado (400)', r.status === 400, `status=${r.status}`);
    r = await qrCreate({ plan: 'galactico', paymentMethod: 'usdc', chargeUSD: 1, expectedAmountUi: '1', expectedAmountRaw: '1000000' });
    check('QR: plan inexistente → rechazado (400)', r.status === 400, `status=${r.status}`);
    r = await qrCreate({ plan: 'pro', paymentMethod: 'usdc', chargeUSD: 199.99, expectedAmountUi: '0.000001', expectedAmountRaw: '1' });
    const qrJson: any = await r.json();
    check('QR: precio correcto pero monto de tokens falso → se crea la orden', r.status === 200, `status=${r.status} ${JSON.stringify(qrJson)}`);
    const order = (await db.doc(`${path(tQr)}/paymentRequests/${qrJson.requestId}`).get()).data();
    check('QR: el servidor ignoró el monto falso y fijó 199.99 USDC', order?.expectedAmountRaw === '199990000', `raw=${order?.expectedAmountRaw}`);

    // --- Enterprise se compra como los demás planes ---
    const tQrE = await mk('pQrE', 'empresa');
    const qrCreateE = (body: any) => qrRoute.POST(new Request('http://localhost/api/subscriptions/qr/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: tQrE.uid, entityId: tQrE.ent, ...body }) }) as any);
    r = await qrCreateE({ plan: 'enterprise', paymentMethod: 'usdc', chargeUSD: 999.99 });
    const qrE: any = await r.json();
    check('Enterprise: pago con Solana (USDC) a $999.99/mes → orden creada', r.status === 200, `status=${r.status} ${JSON.stringify(qrE)}`);
    const orderE = (await db.doc(`${path(tQrE)}/paymentRequests/${qrE.requestId}`).get()).data();
    check('Enterprise: el servidor fijó 999.99 USDC', orderE?.expectedAmountRaw === '999990000' && orderE?.plan === 'enterprise', `raw=${orderE?.expectedAmountRaw}`);
    r = await qrCreateE({ plan: 'enterprise', paymentMethod: 'usdt', chargeUSD: 799.99 * 12 });
    const qrAnnual: any = await r.json();
    check('Enterprise: ciclo anual ($799.99 x 12) aceptado', r.status === 200, `status=${r.status}`);
    const annualOrder = (await db.doc(`${path(tQrE)}/paymentRequests/${qrAnnual.requestId}`).get()).data() as any;
    check('La orden anual queda marcada como anual', annualOrder?.billingCycle === 'annual');
    check('La orden mensual queda marcada como mensual', orderE?.billingCycle === 'monthly');
    const { activateSubscriptionFromOrder } = await import('../../src/lib/subscriptions/qr-payment');
    await activateSubscriptionFromOrder(annualOrder, 'sigAnual');
    const subA = (await db.doc(`${path(tQrE)}/subscriptions/current`).get()).data()!;
    const daysA = (new Date(subA.expiresAt).getTime() - Date.now()) / 864e5;
    check('Pagar el año da 365 días de acceso (antes daba solo 30)', daysA > 364.9 && daysA < 365.1, `días=${daysA.toFixed(1)}`);
    await activateSubscriptionFromOrder({ ...annualOrder, billingCycle: 'monthly', isUpgrade: false } as any, 'sigMensual');
    const subM = (await db.doc(`${path(tQrE)}/subscriptions/current`).get()).data()!;
    const daysM = (new Date(subM.expiresAt).getTime() - Date.now()) / 864e5;
    check('Pagar un mes da 30 días', daysM > 29.9 && daysM < 30.1, `días=${daysM.toFixed(1)}`);
    const { resolveUpgradeChargeForUser: ruc } = await import('../../src/lib/subscriptions/upgrade-pricing-server');
    const upPro = await ruc({ userId: tPro.uid, entityId: tPro.ent, targetPlanId: 'enterprise' });
    check('Pro → Enterprise cobra solo la diferencia ($800.00)', upPro.hasActive === true && Math.abs((upPro as any).chargeUSD - 800) < 0.01, `charge=${(upPro as any).chargeUSD}`);
    const { subscriptionsEnforced } = await import('../../src/lib/subscriptions/entitlements.server');
    delete process.env.SUBSCRIPTION_ENFORCEMENT;
    check('El bloqueo está ACTIVO por defecto', subscriptionsEnforced() === true);
    check('Perfil de empresa sin plan queda bloqueado por defecto', (await requireSuite(tNone.uid, tNone.ent, 'cto'))?.status === 402);
    check('Perfil personal sigue siendo gratuito por defecto', (await requireSuite(tPersona.uid, tPersona.ent, 'cto')) === null);
    const tCreator = await mk('pCreador', 'creador');
    check('Perfil profesional (creador) también requiere plan', (await getEntityEntitlements(tCreator.uid, tCreator.ent)).active === false);


    // --- Bloqueo real en rutas API por suite ---
    const bcRoute = await import('../../src/app/api/whatsapp/broadcast/send/route');
    const bcSend = (t: any) => bcRoute.POST(new Request('http://localhost/api/whatsapp/broadcast/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: t.uid, entityId: t.ent, broadcastId: 'b1' }) }) as any);
    process.env.SUBSCRIPTION_ENFORCEMENT = 'enforce';
    let rb = await bcSend(tStarter);
    check('enforce: difusión (CMO) con plan Starter → 402', rb.status === 402, `status=${rb.status}`);
    rb = await bcSend(tNone);
    check('enforce: difusión sin suscripción → 402', rb.status === 402, `status=${rb.status}`);
    rb = await bcSend(tStandard);
    check('enforce: difusión con plan Standard no se bloquea por plan', rb.status !== 402, `status=${rb.status}`);
    process.env.SUBSCRIPTION_ENFORCEMENT = 'log';
    rb = await bcSend(tStarter);
    check('log: difusión con Starter no se bloquea (solo se registra)', rb.status !== 402, `status=${rb.status}`);
    delete process.env.SUBSCRIPTION_ENFORCEMENT;

    // =====================================================================
    console.log('\n11) Renovación automática de tarjeta');
    const { runRenewals, scheduleRenewal } = await import('../../src/lib/subscriptions/renewals.server');
    const { applyStripePayment } = await import('../../src/lib/subscriptions/stripe-activation');
    const { grossFromNet } = await import('../../src/lib/subscriptions/stripe-pricing');
    const DAYMS = 864e5;
    const calls: any[] = [];
    let chargeResult: any = { ok: true, paymentIntentId: 'pi_renew_1' };
    const fakeCharger = async (req: any) => { calls.push(req); return typeof chargeResult === 'function' ? chargeResult(req) : chargeResult; };
    const mkCard = async (ent: string, over: any, expiresInMs: number) => {
        const t = await mk(ent, 'empresa', {
            status: 'active', plan: 'standard', billingCycle: 'monthly', paymentMethod: 'card_stripe', recurring: true,
            stripeCustomerId: 'cus_' + ent, stripePaymentMethodId: 'pm_' + ent, priceUSD: 99.99, activatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + expiresInMs).toISOString(), ...over,
        });
        const sub = (await db.doc(`${path(t)}/subscriptions/current`).get()).data()!;
        await scheduleRenewal(t.uid, t.ent, sub.expiresAt);
        return { t, sub };
    };
    const readSub = async (t: any) => (await db.doc(`${path(t)}/subscriptions/current`).get()).data()!;
    const queued = async (t: any) => (await db.doc(`subscription_renewals/${t.uid}__${t.ent}`).get()).exists;

    // Cobro mensual a punto de vencer
    const R1 = await mkCard('rMensual', {}, 12 * 3600e3);
    let sum = await runRenewals({ charger: fakeCharger });
    check('Renueva la tarjeta que vence en menos de un día', sum.renewed >= 1 && calls.some((c) => c.customerId === 'cus_rMensual'));
    const c1 = calls.find((c) => c.customerId === 'cus_rMensual');
    check('Cobra el precio del catálogo + comisión ($99.99 → ' + grossFromNet(99.99).amountInCents + ' centavos)', c1?.amountInCents === grossFromNet(99.99).amountInCents, `cents=${c1?.amountInCents}`);
    check('El cobro lleva metadatos de renovación y clave de idempotencia', c1?.metadata?.renewal === 'true' && c1?.metadata?.plan === 'standard' && String(c1?.idempotencyKey).includes(R1.sub.expiresAt));
    const after1 = await readSub(R1.t);
    const ext = (new Date(after1.expiresAt).getTime() - new Date(R1.sub.expiresAt).getTime()) / DAYMS;
    check('Extiende desde el vencimiento (no pierde los días ya pagados): +30 días', ext > 29.9 && ext < 30.1, `ext=${ext.toFixed(2)}`);
    check('Queda al día (renewalStatus ok) y reagendada para el próximo ciclo', after1.renewalStatus === 'ok' && (await queued(R1.t)));
    const callsBefore = calls.length;
    await runRenewals({ charger: fakeCharger });
    check('Una segunda ejecución del cron no vuelve a cobrar', calls.length === callsBefore);

    // Anual
    const R2 = await mkCard('rAnual', { plan: 'enterprise', billingCycle: 'annual', priceUSD: 799.99 * 12 }, 6 * 3600e3);
    await runRenewals({ charger: fakeCharger });
    const c2 = calls.find((c) => c.customerId === 'cus_rAnual');
    check('Anual: cobra $799.99 x 12', c2?.amountInCents === grossFromNet(799.99 * 12).amountInCents, `cents=${c2?.amountInCents}`);
    const ext2 = (new Date((await readSub(R2.t)).expiresAt).getTime() - new Date(R2.sub.expiresAt).getTime()) / DAYMS;
    check('Anual: +365 días', ext2 > 364.9 && ext2 < 365.1, `ext=${ext2.toFixed(1)}`);

    // Aún no toca
    const R5 = await mkCard('rLejos', {}, 20 * DAYMS);
    const n0 = calls.length;
    await runRenewals({ charger: fakeCharger });
    check('Si faltan 20 días no cobra todavía', calls.length === n0 && !calls.some((c) => c.customerId === 'cus_rLejos'));

    // Cobro fallido: gracia y bloqueo
    chargeResult = { ok: false, code: 'card_declined', message: 'declined' };
    const R3 = await mkCard('rFalla', {}, -1 * DAYMS); // venció hace 1 día
    sum = await runRenewals({ charger: fakeCharger });
    const failed = await readSub(R3.t);
    check('Cobro fallido → past_due y se reintentará', failed.renewalStatus === 'past_due' && failed.renewalError === 'card_declined' && (await queued(R3.t)));
    check('Dentro de los días de gracia conserva el acceso', (await getEntityEntitlements(R3.t.uid, R3.t.ent)).active === true);
    const R4 = await mkCard('rGraciaFin', { renewalStatus: 'past_due' }, -5 * DAYMS); // venció hace 5 días (> 3 de gracia)
    await db.doc(`${path(R4.t)}/contacts/dato`).set({ ok: 1 });
    await runRenewals({ charger: fakeCharger });
    check('Pasada la gracia sin poder cobrar → se bloquea', (await getEntityEntitlements(R4.t.uid, R4.t.ent)).active === false && (await readSub(R4.t)).status === 'expired');
    check('Y deja de reintentarse', !(await queued(R4.t)));
    check('Los datos del cliente se conservan', (await db.doc(`${path(R4.t)}/contacts/dato`).get()).exists);
    chargeResult = { ok: true, paymentIntentId: 'pi_renew_2' };

    // Renovación cancelada por el cliente
    const R6 = await mkCard('rCancelada', { cancelAtPeriodEnd: true }, 12 * 3600e3);
    const n1 = calls.length;
    await runRenewals({ charger: fakeCharger });
    check('Cancelada: no se cobra', calls.length === n1 && !calls.some((c) => c.customerId === 'cus_rCancelada'));
    await db.doc(`${path(R6.t)}/subscriptions/current`).set({ expiresAt: new Date(Date.now() - 1000).toISOString() }, { merge: true });
    await db.doc(`subscription_renewals/${R6.t.uid}__${R6.t.ent}`).set({ userId: R6.t.uid, entityId: R6.t.ent, renewAt: new Date(Date.now() - 1000).toISOString(), expiresAt: '' });
    await runRenewals({ charger: fakeCharger });
    check('Cancelada: vence al final del período pagado y se bloquea', (await getEntityEntitlements(R6.t.uid, R6.t.ent)).active === false && !(await queued(R6.t)));

    // Solana no se renueva sola
    const R7 = await mkCard('rSolana', { paymentMethod: 'usdc', recurring: false }, 12 * 3600e3);
    const n2 = calls.length;
    await runRenewals({ charger: fakeCharger });
    check('Pagos con Solana no se cobran automáticamente', calls.length === n2 && !(await queued(R7.t)));

    // Idempotencia del registro de pagos
    const tIdem = await mk('pIdem', 'empresa');
    const idem = { userId: tIdem.uid, entityId: tIdem.ent, plan: 'pro', billingCycle: 'monthly' as const, netAmountUSD: 199.99, paymentIntentId: 'pi_x', customerId: 'c', paymentMethodId: 'p' };
    await applyStripePayment(idem);
    const e1 = (await readSub(tIdem)).expiresAt;
    await applyStripePayment(idem);
    check('El mismo cobro notificado dos veces (webhook + activate) no suma días dos veces', (await readSub(tIdem)).expiresAt === e1);

    // Cancelación por entidad y cron protegido
    const cancelRoute = await import('../../src/app/api/subscriptions/cancel/route');
    await cancelRoute.POST(new Request('http://localhost/api/subscriptions/cancel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: tIdem.uid, entityId: tIdem.ent }) }) as any);
    check('Cancelar renovación marca la suscripción DE LA ENTIDAD', (await readSub(tIdem)).cancelAtPeriodEnd === true);

    for (const d of await db.collection('subscription_renewals').listDocuments()) await d.delete();
    const renewRoute = await import('../../src/app/api/subscriptions/renew/route');
    const cron = (auth?: string) => renewRoute.GET(new Request('http://localhost/api/subscriptions/renew', { headers: auth ? { authorization: auth } : {} }));
    delete process.env.CRON_SECRET;
    check('Cron sin CRON_SECRET → 503', (await cron('Bearer x')).status === 503);
    process.env.CRON_SECRET = 'secreto-cron';
    check('Cron sin credencial → 401', (await cron()).status === 401);
    check('Cron con credencial incorrecta → 401', (await cron('Bearer otro-secreto')).status === 401);
    check('Cron con la credencial correcta → 200', (await cron('Bearer secreto-cron')).status === 200);
    delete process.env.CRON_SECRET;

    // =====================================================================
    console.log(`\nResultado: ${passed} OK, ${failures.length} fallos`);
    if (failures.length) { console.log('Fallos:\n - ' + failures.join('\n - ')); process.exit(1); }
    process.exit(0);
}
main().catch((e) => { console.error('Error en la suite:', e); process.exit(1); });
