# 🌐 Despliegue de Frontend en Vercel

El frontend de Roosevelt está optimizado para ejecutarse en la infraestructura serverless y Edge de **Vercel**.

---

## 1. Conexión con el Repositorio Git
- **Repositorio:** `https://github.com/admluxorsys/land-rai`
- **Rama principal:** `main`
- **Framework Preset:** Next.js
- **Build Command:** `next build` (o `npm run build`)
- **Output Directory:** `.next`

---

## 2. Variables de Entorno en Vercel
Antes de realizar el despliegue, asegúrate de haber cargado todas las claves en **Vercel → Project Settings → Environment Variables**:
- Variables de Firebase (`NEXT_PUBLIC_FIREBASE_*`)
- Clave de Gemini (`GEMINI_API_KEY`)
- Credenciales de Gmail (`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI`)
- Claves de Stripe (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`)
- Claves de Meta/WhatsApp (`kamban_VERIFY_TOKEN`, `NEXT_PUBLIC_META_APP_ID`, `META_APP_SECRET`)

---

## 3. Redespliegues y Limpieza de Caché
Si necesitas forzar un redespliegue sin caché en Vercel:
1. Ve a la pestaña **Deployments**.
2. En el último despliegue, pulsa los tres puntos `...` y selecciona **Redeploy**.
3. Marca la casilla **"Redeploy without existing build cache"**.
