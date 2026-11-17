# Roosevelt (Land-RAI) 🚀

Plataforma SaaS Multi-Tenant impulsada por Inteligencia Artificial diseñada como centro de mando unificado para la gestión, optimización y automatización de negocios y ecosistemas Web3.

---

## 📖 Documentación Organizada por Áreas

Toda la documentación técnica y operativa se encuentra organizada en la carpeta **[`docs/`](docs/)**:

* **[🏛️ Arquitectura del Sistema](docs/arquitectura/README.md)**: Estructura general, modelo multi-tenant por entidades y roles ejecutivos (CEO, COO, CMO, CTO).
* **[⚙️ Configuración y Entorno](docs/configuracion/README.md)**: Diccionario exhaustivo de variables de entorno y dominios autorizados.
* **[🔌 Centro de Integraciones](docs/integraciones/README.md)**: WhatsApp Cloud API, Google/Gmail OAuth 2.0, Stripe y Solana Web3.
* **[🚀 Despliegue y DevOps](docs/despliegue/README.md)**: Despliegue en Vercel, Firebase Cloud Functions y mantenimiento.

---

## 🛠️ Inicio Rápido

### Requisitos previos
- Node.js 20+
- Cuenta en Firebase y Google Cloud
- Cuenta en Vercel (para despliegue)

### Instalación y Ejecución Local

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env.local

# 3. Iniciar servidor de desarrollo
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador para ver la plataforma en funcionamiento.
