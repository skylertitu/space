# 🛠️ Mantenimiento y Scripts de Utilidad

Este documento lista los comandos disponibles en `package.json` para el ciclo de vida del proyecto.

---

## 1. Scripts de Desarrollo

* `npm run dev`: Inicia el servidor de Next.js en `http://localhost:3000` con Webpack y polling habilitado (`WATCHPACK_POLLING=true`).
* `npm run dev:turbo`: Inicia el servidor utilizando Turbopack para compilación rápida.
* `npm run dev:clean`: Ejecuta una limpieza profunda de carpetas temporales y arranca el servidor.

---

## 2. Scripts de Compilación y Limpieza

* `npm run build`: Compila la aplicación para producción (`next build`).
* `npm run clean`: Elimina de forma segura las carpetas de caché `.next`, `.turbo`, `out`, `node_modules/.cache` y `tsconfig.tsbuildinfo`.
* `npm run build:clean`: Limpia las cachés y genera un build completamente nuevo desde cero.
* `npm run lint`: Ejecuta ESLint sobre el código en `src/`.
