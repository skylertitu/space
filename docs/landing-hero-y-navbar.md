# Landing: hero y barra superior (2026-10-07)

Resumen de los cambios hechos a la portada (`/`): imagen del hero, título y párrafo animados, barra del chat, barra superior con megamenús y ajustes para smartphones e iPads. Los textos visibles están en inglés (portada) y en inglés/español (menús).

## Archivos

| Archivo | Qué es |
|---|---|
| `src/app/page.tsx` | Portada: imagen del hero, `WaveTitle`, `WaveParagraph`, distribución del hero |
| `src/components/landing/HeroAskRooseveltBar.tsx` | Barra del chat del hero |
| `src/components/landing/LandingNavbar.tsx` | Barra superior (escritorio y menú móvil) |
| `src/components/landing/navMenus.tsx` | Datos de los megamenús (nuevo) |
| `src/components/landing/navMenuText.ts` | Textos en `en`/`es` copiados del sitio de la empresa (nuevo) |
| `src/components/landing/SocialIcons.tsx` | Iconos de redes (nuevo) |
| `CLAUDE.md` | Se quitó el túnel manual de PowerShell del apartado de entorno |

## 1. Hero (`page.tsx`)

### Imagen
- Se reemplazó `/assets/Roosevelt Ai.gif` por `square.gif` (Firebase Storage, `roosevelt-491004`). Solo en el hero; el fondo de las secciones Showcase y Pillars conserva el GIF anterior.
- **Escritorio (≥ 1280 px):** centrada (`left-1/2`), ancho `110vw` con tope de 1080 px, a `47%` de la altura.
- **Smartphones e iPads (< 1280 px):** centrada en vertical y horizontal (`top-1/2`), ancho `min(max(120vw, 80svh), 125svh)`. Ocupa el tamaño de la pantalla; en teléfono y iPad vertical los bordes del GIF se recortan por los lados.

### Título (`WaveTitle`)
- "Welcome to the new era of autonomy with Roosevelt" aparece **letra por letra en ola**, de la primera letra a la última (0.045 s por letra).
- "Roosevelt" conserva el degradado azul: se pinta cada letra con el color que le toca del degradado (el degradado de texto no funciona con letras animadas por separado).
- Tras colapsarse el párrafo, el título **se repite sin parar**: más lento (0.11 s por letra, 1.1 s de movimiento), con 3 s de pausa entre pasadas.
- Tamaños: `28 px` móvil, `36 px` ≥ 640 px, `48 px` ≥ 768 px, `60 px` ≥ 1280 px.

### Párrafo (`WaveParagraph`)
- Texto único en un solo párrafo (Roosevelt, Royalty, Sterling, LUXOR).
- La ola **continúa desde el título**, a 0.007 s por letra.
- Cuando termina, se queda **4 s** y se **colapsa**. Entonces aparece una **flecha** (sin reservar espacio que mueva el texto) para volver a desplegarlo; despliega sin repetir la animación.
- Alineación: izquierda en móvil, justificado desde 768 px.

### Rendimiento y accesibilidad (`useLightMotion`)
- En pantallas < 768 px no se usa desenfoque (cientos de letras con `filter` pesan en móviles). Todas las letras terminan siempre con `filter: blur(0px)` (un error anterior dejaba el título borroso en el celular).
- Con "reducir movimiento" activado, el texto aparece sin animación.
- El título y el párrafo llevan `aria-label` con el texto completo; las letras sueltas van `aria-hidden`.

### Distribución para móviles e iPads
- `100vh` → `100svh` (no se corta con la barra de direcciones).
- Márgenes laterales de 20 px en teléfono, relleno inferior con `safe-area-inset-bottom` y menos espacio entre bloques.

## 2. Barra del chat (`HeroAskRooseveltBar.tsx`)

- Más ancha y alta: `max-w-3xl`; `56 px` de alto en móvil y `68 px` desde tablet. Texto `text-base` (16 px, evita el zoom de iOS al enfocar), en `semibold`.
- Se sube 19 px (`-top-[19px]` en `page.tsx`, solo la barra).
- **Modelos:** `Aether` (por defecto), `Synapse`, `Logos`, `Chronos`, `Mentis`. La opción elegida lleva un círculo azul (8 px). La lista es más compacta (menos interlineado). La selección todavía **no se envía a ningún lado**.
- **Botones circulares a la derecha:**
  - **Blanco con avión de papel:** enviar (`type="submit"`, lleva a `/login?register=true`).
  - **Azul:** grabar. Es `type="button"` y todavía no tiene acción.
  - Ambos de 40 px en móvil y 48 px desde tablet, con el azul casi pegado al borde derecho.
- **Fix de desborde:** el campo de texto no puede encogerse sin `min-w-0`, y empujaba el botón azul fuera de la barra en pantallas angostas. Se corrigió y se reduce el relleno en móvil.

## 3. Barra superior (`LandingNavbar.tsx`)

### Menús
Se copiaron del sitio de la empresa (`land-luxor-intelligence`) sin reemplazar los propios. Orden final (escritorio y móvil):

1. **Proyecto** (incluye: Nosotros/About, Equipo, Hoja de ruta, Documentación, Prensa y Medios, Donate, Private Sale, Presale, Founder y los apartados de Negocios: Negocios, Nuestros Socios, Mapa de Adopción)
2. **Producto** (Responsabilidad, Impacto Social)
3. **Infraestructura** (Funciones, Cerebro)
4. **Desarrollo** (Comenzar Proyecto, Documentación)
5. **Ecosistema** (14 activos con imagen + Socios, Casos de Uso, Mapa de Adopción, Github)
6. **Utilidad** (Staking, Gobernanza, Explorador + los apartados de Tokenomics: Distribución, Holders, Liquidez, Contrato)
7. **Seguridad**
8. **On-Chain** (Phantom, Raydium, DexScreener, Orb Markets, Solscan)

Decisiones:
- **Business** se fusionó dentro de **Proyecto**; **Tokenomics** dentro de **Utilidad**; **About** dentro de **Proyecto**.
- **Producto, Infraestructura y Desarrollo** son megamenús propios (mismo estilo). Sus textos en `navMenus.tsx` (`OWN_MENU_TEXT` y `getMegaMenus`) **los escribí yo**, en inglés y español; revisar redacción.
- Las rutas internas del otro sitio (`/team`, `/roadmap`, `/coming-soon`, etc.) apuntan a `https://www.luxorintelligence.com`. El enlace de "Roosevelt Super Intelligence" en Ecosistema usa `www.itsroosevelt.com`.
- Las tarjetas internas (`local: true`) abren en la misma pestaña; las externas, en pestaña nueva.
- Panel grande: tarjetas más juntas en vertical (`gap-y-0` en 3 columnas, `gap-y-1` en 2), mismo tamaño.
- Textos de los menús en blanco, `14 px`.

### Logo y botones
- Logo `64 px` móvil / `76 px` ≥ 768 px; "Roosevelt" a `30 px`, con 4 px de separación del logo.
- Sign In y Sign Up (escritorio): más anchas y altas (`px-11 py-2`) y en `semibold`.

### Iconos de redes (`SocialIcons.tsx`)
- Los 8 de la barra del sitio de la empresa: X, Telegram, **Instagram** (reemplazó a WhatsApp), Discord, GitHub, Constitution, Phantom y Solscan.
- Se ven en la barra solo desde 1536 px (no caben junto a los menús y los botones en anchos menores).
- Enlaces: Instagram → `https://www.instagram.com/roosevelt_labs`. **Los demás siguen siendo los de Luxor y están pendientes de cambiarse por los de Roosevelt.**

### Menú móvil
- Orden: fila del logo y idioma → **Sign In** y **Sign Up** (cápsulas, 56 px de alto, 16 px de separación; Sign Up en azul `#2563EB`) → menús (24 px, acordeones, filas de 48 px) → "Follow us" con los iconos en **2 filas de 4**, sin contenedor circular y repartidos a lo ancho.
- El panel hace scroll completo; el botón de hamburguesa es más grande.
- El acordeón tiene estado propio (`mobileExpanded`). Un error anterior impedía **cerrar** un menú abierto (el cierre "al tocar fuera" del panel de escritorio lo reabría).

### Táctil en iPad
- Con 1280 px o más (iPad Pro horizontal) se usan los menús de escritorio: ahora se abren al tocar y se cierran al tocar fuera.

## Pendientes

- **Anclas inexistentes:** la portada no tiene secciones con `id="about"`, `features`, `brain`, `responsibility`, `impact` ni `docs`. Esos enlaces no desplazan a ningún lado hasta crear los ids.
- **Enlaces de redes:** pasar de Luxor a Roosevelt (X, Telegram, Discord, GitHub, Constitution, Phantom, Solscan).
- **Modelos y grabación:** el modelo elegido y el botón azul no hacen nada todavía.
- **Textos de los menús propios:** revisar la redacción que escribí.
- **Tarjetas con datos heredados:** "Negocios" tiene la descripción "Utilidad en el mundo real" y "Nuestros Socios"/"Mapa de Adopción" tienen descripciones en inglés ("Partner with Luxor.", "Merchant directory.").
- **Pruebas:** nada se verificó en un dispositivo real; revisar en teléfono, iPad vertical y horizontal.
- **Consulta de marca:** los textos usan "superintelligence"/"Super Intelligence", sin "AI".
