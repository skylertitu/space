# 🔐 Diccionario Completo de Variables de Entorno

Este documento especifica cada variable requerida por **Roosevelt**.

---

## 1. Firebase (Web Client)

Variables públicas requeridas por Next.js para inicializar Firebase en el navegador:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=roosevelt-491004.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=roosevelt-491004
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=roosevelt-491004.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1020063608717
NEXT_PUBLIC_FIREBASE_APP_ID=1:1020063608717:web:98de72709bcfdbe1dd17c4
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-0TKKBFH291
```

---

## 2. Modelos de Inteligencia Artificial

```env
GEMINI_API_KEY=AIzaSy...
```
* **Uso:** Procesamiento de prompts, respuestas de agentes y resumen de actividades.
* **Obtención:** [Google AI Studio](https://aistudio.google.com/).

---

## 3. Meta / WhatsApp Cloud API

```env
kamban_VERIFY_TOKEN=tu_token_secreto
NEXT_PUBLIC_META_APP_ID=1234567890
META_APP_SECRET=tu_app_secret_de_meta
```
* **Uso:** Validación de webhooks de WhatsApp y enlace con la app de Facebook Developers.

---

## 4. Google / Gmail OAuth 2.0

```env
GMAIL_CLIENT_ID=xxxxx.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-xxxxx
GMAIL_REDIRECT_URI=https://roosevelt-two.vercel.app/api/gmail/callback
```
* **Uso:** Sincronización de correos de Gmail en la suite.
* **Importante:** Si estas variables no están en Vercel, la aplicación arrojará el error `Ensure GMAIL_CLIENT_ID is set`.

---

## 5. Stripe (Pagos)

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

---

## 6. Supabase

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```
