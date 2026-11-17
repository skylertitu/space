# 💳 Integración con Stripe (Suscripciones y Facturación)

Roosevelt integra Stripe para gestionar los planes de pago y cobros recurrentes de los usuarios y entidades.

---

## 1. Configuración de Productos y Precios
Los planes de suscripción se configuran en el Dashboard de Stripe:
- **Planes soportados:** Básico, Profesional y Enterprise.
- **Facturación:** Mensual o anual.

---

## 2. Eventos de Webhook Soportados

El endpoint escucha en `/api/stripe/webhook` los siguientes eventos clave:

| Evento | Acción en Roosevelt |
| :--- | :--- |
| `checkout.session.completed` | Activa la suscripción y habilita las funciones premium de la entidad. |
| `invoice.payment_succeeded` | Registra el pago y renueva la vigencia de la suscripción. |
| `customer.subscription.deleted` | Cancela el plan y revoca el acceso a funciones avanzadas. |
| `invoice.payment_failed` | Notifica al usuario en el panel y marca la cuenta en período de gracia. |
