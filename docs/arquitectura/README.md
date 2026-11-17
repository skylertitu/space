# 🏛️ Arquitectura del Sistema Roosevelt

Esta carpeta documenta la arquitectura técnica, el modelo de datos y los patrones de diseño de **Roosevelt**.

---

## 📑 Documentos en esta sección

1. **[Modelo Multi-Tenant y Base de Datos](modelo-multitenant.md)**
   - Jerarquía de colecciones en Firestore (`users/{userId}/entities/{entityId}`).
   - Aislamiento de datos y multi-empresa.
   - Seguridad por entidad y ciclo de vida de los datos.

2. **[Roles Ejecutivos del Núcleo](roles-ejecutivos.md)**
   - Desglose de los módulos operativos de la suite:
     - **CEO**: Estrategia y métricas.
     - **COO**: Omnichannel, WhatsApp y Kanban de aplicaciones.
     - **CMO**: CRM de contactos y campañas.
     - **CTO**: Automatizaciones, Orquestador y centro de conexiones.

---

## 🛠️ Stack Tecnológico
- **Frontend:** Next.js 16 (App Router), React 18, Tailwind CSS, Framer Motion, Radix UI.
- **Backend Serverless:** Firebase Cloud Functions (Node.js 20, TypeScript).
- **Base de Datos & Auth:** Firebase Client SDK v12, Firebase Admin v13, Firestore, Storage.
- **Tipografía y Diseño:** Tipografía Outfit, modo oscuro profundo con frosted glass modals y efectos de partículas.
