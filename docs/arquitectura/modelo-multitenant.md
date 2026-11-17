# 🏢 Modelo Multi-Tenant y Base de Datos

Roosevelt está diseñado desde sus cimientos como una plataforma **Multi-Tenant jerárquica**, donde cada usuario registrado puede ser dueño o miembro de múltiples **Entidades** (empresas, sucursales o marcas independientes).

---

## 1. Estructura Jerárquica en Firestore

```
firestore/
  ├── users/{userId}
  │     ├── email: string
  │     ├── createdAt: timestamp
  │     ├── lastLogin: timestamp
  │     │
  │     └── entities/{entityId}
  │           ├── name: string
  │           ├── slug: string
  │           ├── createdAt: timestamp
  │           │
  │           ├── settings/general
  │           │     └── theme: "dark"
  │           │
  │           ├── integrations/
  │           │     ├── whatsapp (estado, token, número)
  │           │     ├── gmail_internal (cuentas autorizadas)
  │           │     └── stripe (customerId, subscriptionStatus)
  │           │
  │           ├── crm/contacts/{contactId}
  │           ├── kamban/{cardId}
  │           ├── bots/{botId}
  │           └── coo/whatsapp/conversations/{convId}
```

---

## 2. Aislamiento y Seguridad de Datos

1. **Contexto Activo de Entidad:**  
   Cuando un usuario navega por la plataforma (`/home/[entityId]/...`), todas las llamadas a la base de datos se circunscriben estrictamente a la ruta de esa `entityId`.
2. **Reglas de Seguridad (`firestore.rules`):**  
   Se asegura que solo el `userId` autenticado que posee la entidad pueda leer y escribir sus documentos.
3. **Molds de Entidad:**  
   Al crear una nueva entidad, se ejecuta una función de inicialización (`provisionEntityMold`) que aprovisiona las columnas por defecto del Kanban, el bot de bienvenida y la configuración inicial de integraciones.
