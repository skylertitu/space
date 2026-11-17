# ✉️ Integración con Gmail y Google OAuth 2.0

Esta integración permite a los usuarios conectar sus cuentas de correo para que los agentes inteligentes puedan redactar borradores, enviar confirmaciones y dar seguimiento a clientes.

---

## 1. Flujo de Autorización

1. El usuario hace clic en conectar Gmail en `/home/[entityId]/cto/integrations`.
2. El frontend consulta [`/api/gmail/auth-url`](../../src/app/api/gmail/auth-url/route.ts) para generar la URL de consentimiento con los siguientes ámbitos:
   - `gmail.readonly` (Lectura de emails)
   - `gmail.send` (Envío de emails)
   - `userinfo.email`
   - `userinfo.profile`
3. Se abre un popup en Google para que el usuario acepte los permisos.
4. Google redirige a `/api/gmail/callback`, donde se canjean los tokens (`access_token` y `refresh_token`), los cuales se guardan cifrados en Firestore.

---

## 2. Diagnóstico: "Google no ha verificado esta app / App peligrosa"

### ¿Por qué aparece esta pantalla?
Google clasifica el acceso a la bandeja de entrada (`gmail.readonly` y `gmail.send`) como **Ámbitos Restringidos (Restricted Scopes)**. Cualquier aplicación que solicite estos permisos sin haber completado la verificación formal de Google mostrará una advertencia de seguridad.

### Soluciones:
* **Modo Desarrollo / Pruebas Internas:**
  1. Ve a [Google Cloud Console](https://console.cloud.google.com) → **APIs y servicios** → **Pantalla de consentimiento de OAuth**.
  2. Añade los correos de tu equipo a la sección **"Usuarios de prueba" (Test users)**.
  3. Al ingresar, el usuario debe pulsar en *"Configuración avanzada"* → *"Ir a Roosevelt (no seguro)"*.
* **Modo Producción (Público general):**
  1. Publica una Política de Privacidad y Términos de Servicio en tu dominio.
  2. En Google Cloud Console, pulsa en **"Preparar para verificación"**.
  3. Google solicitará un video de demostración en YouTube explicando para qué usa la IA los correos de los usuarios y completar la autoevaluación CASA Tier 2.
