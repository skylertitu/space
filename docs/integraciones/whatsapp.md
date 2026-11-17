# 💬 Integración con WhatsApp (Meta Cloud API & Webhooks)

La integración con WhatsApp permite la comunicación bidireccional entre clientes y los agentes de IA o humanos dentro de la suite Roosevelt.

---

## 1. Arquitectura de Conexión

```
Cliente en WhatsApp 
       │ (Mensaje de texto / audio)
       ▼
Meta Cloud API
       │ (HTTP POST Webhook)
       ▼
Firebase Cloud Function (/whatsappWebhook)
       │ (Guarda mensaje y dispara triggers)
       ▼
Firestore (`coo/whatsapp/conversations/{id}`)
       │ (Snapshot listener / Socket.IO)
       ▼
Bandeja Omnichannel de Roosevelt (`/home/[entityId]/coo/whatsapp`)
```

---

## 2. Configuración en Meta Developers

1. Accede a [developers.facebook.com](https://developers.facebook.com) y abre tu aplicación.
2. En el panel izquierdo, selecciona **WhatsApp** → **Configuración**.
3. En la sección **Webhook**:
   - **URL de devolución de llamada:** `https://us-central1-roosevelt-491004.cloudfunctions.net/whatsappWebhook` (o la URL de tu endpoint).
   - **Token de verificación:** El mismo valor definido en `kamban_VERIFY_TOKEN`.
4. En **Campos de suscripción**, marca: `messages`.
