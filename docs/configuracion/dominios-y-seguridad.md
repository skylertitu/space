# 🛡️ Dominios Autorizados y Seguridad

Para que la autenticación con proveedores sociales (Google Sign-In) y los popups de conexión funcionen sin bloqueos del navegador, deben configurarse los siguientes dominios:

---

## 1. Firebase Authentication: Dominios Autorizados

En [Firebase Console](https://console.firebase.google.com/) → **Authentication** → **Settings** → **Authorized domains**:

Asegúrate de agregar:
- `localhost` (para desarrollo local)
- `roosevelt-two.vercel.app` (despliegue en Vercel)
- `byroosevelt.com` (dominio oficial en producción)
- `roosevelt-491004.firebaseapp.com` (dominio por defecto)

> Si falta alguno de estos dominios, Firebase arrojará el error `auth/unauthorized-domain` cuando un usuario intente iniciar sesión con Google.

---

## 2. Encabezados de Seguridad (Next.js)

En [`next.config.mjs`](../../next.config.mjs), la aplicación incluye el encabezado:

```javascript
headers: [
  {
    key: 'Cross-Origin-Opener-Policy',
    value: 'same-origin-allow-popups',
  }
]
```

Este encabezado es imprescindible para permitir que los popups de **Google Sign-In**, **Gmail OAuth** y **Phantom Wallet** puedan comunicarse de regreso con la ventana principal de Roosevelt tras completar la autenticación.
