# 📚 Centro de Documentación de Roosevelt

Bienvenido a la biblioteca oficial de documentación de **Roosevelt**. Toda la información técnica y de arquitectura está organizada por áreas temáticas:

---

## 📂 Carpetas Temáticas

### 1. [🏛️ Arquitectura del Sistema (`arquitectura/`)](arquitectura/README.md)
* [Visión General](arquitectura/README.md): Stack tecnológico y diseño de alto nivel.
* [Modelo Multi-Tenant y Base de Datos](arquitectura/modelo-multitenant.md): Estructura en Firestore (`users/{userId}/entities/{entityId}`).
* [Roles Ejecutivos del Núcleo](arquitectura/roles-ejecutivos.md): Módulos CEO, COO (Omnichannel/Kanban), CMO (CRM) y CTO (Automatizaciones).

### 2. [⚙️ Configuración y Entorno (`configuracion/`)](configuracion/README.md)
* [Variables de Entorno](configuracion/variables-entorno.md): Diccionario exhaustivo de claves locales y de producción en Vercel.
* [Dominios y Seguridad](configuracion/dominios-y-seguridad.md): Dominios autorizados en Firebase y encabezados de seguridad.

### 3. [🔌 Centro de Integraciones (`integraciones/`)](integraciones/README.md)
* [WhatsApp Cloud API](integraciones/whatsapp.md): Flujo de webhooks en Cloud Functions y chat en vivo.
* [Google Gmail OAuth 2.0](integraciones/gmail-oauth.md): Conexión de correos y guía para resolver la pantalla de verificación de Google.
* [Stripe](integraciones/stripe.md): Planes, suscripciones recurrentes y webhooks.
* [Solana Web3](integraciones/solana-web3.md): Wallets Phantom y tokens SPL.

### 4. [🚀 Despliegue y DevOps (`despliegue/`)](despliegue/README.md)
* [Despliegue en Vercel](despliegue/vercel.md): Configuración de build, conexión Git y caché.
* [Despliegue de Firebase Functions](despliegue/firebase-functions.md): Despliegue de funciones serverless, reglas e índices.
* [Mantenimiento y Scripts](despliegue/mantenimiento-y-scripts.md): Comandos de desarrollo, compilación y limpieza profunda.
