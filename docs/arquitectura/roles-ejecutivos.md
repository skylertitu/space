# 👔 Roles Ejecutivos del Núcleo (`/home/[entityId]/`)

Para organizar las operaciones de cualquier empresa, Roosevelt divide sus funcionalidades en cuatro roles ejecutivos clave:

---

### 1. CEO (Chief Executive Officer)
* **Ruta:** `/home/[entityId]/ceo`
* **Propósito:** Tablero de comando estratégico y visión macro.
* **Funciones:**
  - Métricas globales de rendimiento del negocio.
  - Indicadores clave de conversión y crecimiento.
  - Resumen ejecutivo diario asistido por IA.

---

### 2. COO (Chief Operating Officer)
* **Ruta:** `/home/[entityId]/coo`
* **Propósito:** Operaciones diarias, atención de prospectos y flujo de trabajo.
* **Módulos:**
  - **Omnichannel (`/coo/omnichannel`):** Bandeja unificada de conversaciones multicanal.
  - **WhatsApp (`/coo/whatsapp`):** Chat en tiempo real, gestión de estados y transferencias a agentes.
  - **Kanban (`/coo/kamban`):** Tablero interactivo con drag & drop para el seguimiento de postulaciones, clientes y embudos de conversión.

---

### 3. CMO (Chief Marketing Officer)
* **Ruta:** `/home/[entityId]/cmo`
* **Propósito:** Captación, gestión y fidelización de clientes.
* **Módulos:**
  - **CRM (`/cmo/crm`):** Directorio centralizado de contactos, historial y etiquetas.
  - **Campañas (`/cmo/campaigns`):** Envío y seguimiento de comunicaciones comerciales masivas.

---

### 4. CTO (Chief Technology Officer)
* **Ruta:** `/home/[entityId]/cto`
* **Propósito:** Infraestructura, integraciones y lógica de automatización.
* **Módulos:**
  - **Integraciones (`/cto/integrations`):** Centro de control para conectar WhatsApp Cloud API, Gmail, Stripe y Supabase.
  - **Creador de Bots (`/cto/automation/whatsappbots`):** Editor visual de respuestas automáticas y flujos inteligentes.
  - **Orquestador (`/cto/orchestrator`):** Coordinación entre agentes de IA y herramientas externas.
  - **Voice Center (`/cto/voice-center`):** Asistentes de voz y llamadas automatizadas.
