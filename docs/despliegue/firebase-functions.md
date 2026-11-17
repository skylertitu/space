# 🔥 Despliegue de Firebase Cloud Functions y Base de Datos

Las funciones backend y las reglas de seguridad se despliegan mediante el Firebase CLI desde la raíz del proyecto.

---

## 1. Despliegue de Cloud Functions

```bash
# Compilar y desplegar todas las funciones backend
npm run deploy:functions
```

Este comando ejecuta internamente:
`npm --prefix "$RESOURCE_DIR" run build` y luego `firebase deploy --only functions`.

---

## 2. Despliegue de Reglas e Índices de Firestore

```bash
# Desplegar reglas de seguridad e índices de Firestore
firebase deploy --only firestore
```

Esto desplegará:
- [`firestore.rules`](../../firestore.rules)
- [`firestore.indexes.json`](../../firestore.indexes.json)

---

## 3. Despliegue de Reglas de Storage

```bash
# Desplegar reglas de Firebase Storage
firebase deploy --only storage
```

Esto desplegará:
- [`storage.rules`](../../storage.rules)
