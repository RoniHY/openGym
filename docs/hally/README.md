# Hally

Hally es un fork de [openGym](https://github.com/DuarteSantos8/openGym) (AGPL-3.0-or-later) para el
servicio de entrenamiento personal de Pedro. Es una versión modificada: agrega la relación
entrenador-cliente, el dolor por sesión y la nota para el entrenador. El código vive en la rama
`hally` de `https://github.com/RoniHY/openGym`; `main` se queda igual a upstream.

- Plan y análisis: [`HALLY-PLAN.md`](../../HALLY-PLAN.md).
- Estado y cómo probar: [`ESTADO.md`](../../ESTADO.md).
- Rutas del API de entrenador: [`API.md`](API.md).
- Capturas del recorrido: esta misma carpeta (`01-…png` en adelante).

## Qué agrega

**Para el entrenador**

- **Rol.** El admin marca a un perfil como entrenador en Admin → usuario → "Make trainer".
- **Mis clientes** (`/entrenador`, ícono de persona en Inicio y fila en Ajustes → Cuenta). Por
  cliente: última sesión, sesiones hechas contra planeadas de la semana, último dolor, notas sin
  leer y si entrena en este momento. Arriba queda quien necesita revisión.
- **Detalle del cliente** (`/entrenador/c/<id>`), solo lectura: sesiones con sus series y RIR, la
  nota y el dolor de cada una; peso corporal; rutinas completas y plan de la semana.
- **Códigos de invitación.** Los crea el entrenador en "Mis clientes". Quien crea su perfil con
  el código queda ligado a ese entrenador.

**Para el cliente**

- **Dolor por sesión.** Al terminar: escala 0–10, zona y nota. Al abrir la siguiente sesión, si
  la anterior dolió, la app pregunta si empeoró al día siguiente. La regla está a la vista: hasta
  3/10 durante y sin empeorar al día siguiente está bien; si no, avísale a tu entrenador.
- **Nota para tu entrenador.** Es la nota de sesión de siempre, con ese nombre cuando hay
  entrenador ligado, y con un campo más en la pantalla de cierre.
- **Tu entrenador** (Ajustes → Cuenta): quién es, qué puede ver, y cómo dejarlo. También ahí se
  canjea un código si el perfil ya existía.

Cualquiera de los dos puede terminar el vínculo. El entrenador nunca escribe en los datos del
cliente.

## Instancia privada (fase 0)

Las variables están en [`.env.example.hally`](../../.env.example.hally):

| Variable | Valor | Para qué |
|---|---|---|
| `FIRST_USER_ADMIN` | `1` | El primer perfil queda como admin. Pedro crea el suyo antes de compartir la dirección. |
| `INVITE_ONLY` | `1` | Un perfil nuevo necesita código de invitación. |
| `ALLOW_GUEST` | `0` | Quita "Continuar sin cuenta". |
| `PASSWORD_LOGIN` | `1` | Usuario y contraseña junto a las passkeys. |
| `DEFAULT_LANG` | `es` | Pantalla de entrada y perfiles nuevos en español. |
| `RP_NAME` | `Hally` | El nombre que muestra el diálogo de la passkey. |

### Arranque en dos pasos

Con `INVITE_ONLY=1` y la instancia vacía nadie puede crear el primer perfil: todavía no hay admin
que genere el primer código. Así que la primera vez:

1. Arrancar **sin** `INVITE_ONLY` (y con `FIRST_USER_ADMIN=1`).
2. Pedro crea su perfil. Queda como admin.
3. Apagar, poner `INVITE_ONLY=1` y volver a arrancar.
4. Pedro entra a Ajustes → Cuenta → Admin dashboard → su usuario → "Make trainer".
5. En Inicio aparece el ícono de persona: "Mis clientes" → "Código nuevo".

Con Docker: `cp .env.example.hally .env`, ajustar `RP_ID` y `ORIGIN`, y `docker compose up -d --build`
(con `--build`, porque las imágenes publicadas son las de upstream, sin la capa de Hally).

Sin Docker (desarrollo en Windows, PowerShell):

```powershell
cd C:\Users\Pedro\sites\hally\api
$env:PORT='3000'; $env:DATA_DIR='C:\Users\Pedro\sites\hally\data'
$env:RP_ID='localhost'; $env:ORIGIN='http://localhost:5173'; $env:RP_NAME='Hally (dev)'
$env:FIRST_USER_ADMIN='1'; $env:ALLOW_GUEST='0'; $env:PASSWORD_LOGIN='1'; $env:DEFAULT_LANG='es'
$env:INVITE_ONLY='1'      # quitar esta línea en el primer arranque
node server.js
```

```powershell
cd C:\Users\Pedro\sites\hally\frontend
$env:API_TARGET='http://127.0.0.1:3000'; $env:API_ORIGIN='http://localhost:5173'
node node_modules/vite/bin/vite.js --port 5173 --strictPort
```

## Dónde vive el código

Regla del fork: código de Hally en archivos nuevos; en los archivos de upstream, toques de una
línea. Así un `git merge upstream/main` casi nunca choca.

**Archivos nuevos**

| Archivo | Qué es |
|---|---|
| `api/trainer.js` | Rol, vínculo, guardia `requireTrainerOf` y rutas `/api/trainer/*` |
| `frontend/src/lib/hally-coaching.js` | Lectura de `/api/trainer/me` y las llamadas al API |
| `frontend/src/lib/hally-pain.js` | Reglas del dolor: forma del registro, veredicto, pregunta del día siguiente |
| `frontend/src/lib/hally-note.js` | Cómo se llama y cómo se guarda la nota de sesión |
| `frontend/src/lib/hally-trainer.js` | Resumen por cliente de "Mis clientes" |
| `frontend/src/lib/hally-client.js` | Lectura del detalle de un cliente |
| `frontend/src/lib/hally-i18n.js` | Une las cadenas de Hally al paquete de idioma |
| `frontend/src/locales/hally/es.js` | Cadenas de Hally en español de México |
| `frontend/src/store/useHally.js` | Si el perfil es entrenador y si tiene uno |
| `frontend/src/views/Trainer.jsx`, `TrainerClient.jsx` | Las dos pantallas del entrenador |
| `frontend/src/components/Hally*.jsx` | Paso de dolor, filas de cuenta, botón de Inicio, interruptor en Admin |
| `frontend/src/hally.css` | Los pocos estilos propios |

Cada `lib/hally-*.js` tiene su test al lado; las pantallas y componentes también.

**Toques en archivos de upstream**

| Archivo | Toque |
|---|---|
| `api/server.js` | Importa `trainer.js`; liga al perfil nuevo donde se canjea la invitación (2 líneas, passkey y contraseña); la invitación de un admin entrenador lleva `trainerId`; al borrar una cuenta se van sus vínculos; monta las rutas (1 línea) |
| `api/Dockerfile` | `trainer.js` en la línea `COPY` |
| `frontend/src/App.jsx` | Las dos rutas `/entrenador` |
| `frontend/src/views/Home.jsx` | `<HallyHomeButton />` |
| `frontend/src/views/Settings.jsx` | `<HallyAccountRows />` (2 lugares), enlace al código del fork, nombre |
| `frontend/src/views/Admin.jsx` | `<HallyTrainerToggle />` |
| `frontend/src/views/Workout.jsx` | `<PainFollowUp />` y el rótulo de los dos botones de la nota |
| `frontend/src/sheets.jsx` | `<HallyFinishStep />` en el cierre y el rótulo de la nota (2 títulos, 2 placeholders) |
| `frontend/src/lib/finish-workout.js` | `pain` en la lista blanca de la sesión terminada |
| `frontend/src/lib/i18n.js` | `withHally(...)` al cargar el paquete |
| `frontend/src/locales/es.js` | El AI Coach pasa de "Entrenador" a "Coach IA" (72 líneas) |
| `frontend/scripts/check-locales.mjs`, `check-source-strings.mjs` | Leen también el paquete de Hally |
| `frontend/index.html`, `public/manifest.json`, `views/Login.jsx` | El nombre Hally |
| `frontend/src/views/Settings.reset.test.jsx` | El enlace esperado ahora es el del fork |

**Desviaciones de `HALLY-PLAN.md` §5, y por qué**

- La guardia `requireTrainerOf` vive en `api/trainer.js` y no junto a `requireAdmin` en
  `server.js`: mismo comportamiento, y `server.js` se queda en toques de una línea.
- Las rutas nuevas no están en `api/openapi.yaml` sino en [`API.md`](API.md): el test de upstream
  compara ese archivo contra `server.js` y `coach/routes.js`, y tocarlo era chocar en cada merge.
- Las cadenas de Hally no van dentro de `locales/es.js` sino en `locales/hally/es.js`: upstream
  agrega claves a `es.js` en cada versión y cada merge habría chocado ahí.
- `data/coaching/<clientId>.json` guarda `{ trainerId, seen }` y no solo `{ seen }`: sin el dueño
  de las marcas, un entrenador nuevo heredaría lo que leyó el anterior.
- Se agregó `POST /api/trainer/join` (un perfil que ya existe canjea un código) porque sin eso
  desligarse por error no tenía regreso.

## Idiomas

El fork se queda con español (por defecto) e inglés. La clave de cada cadena es el inglés, como en
upstream. Una cadena nueva de Hally solo necesita su traducción en `locales/hally/es.js`; en los
otros 16 idiomas se lee en inglés. `node scripts/check-locales.mjs` sigue exigiendo que los 18
paquetes de upstream tengan las mismas claves, y para el de Hally exige: que esté en español, que
no esté vacía, que conserve los `{0}` y que no reuse una clave de upstream.

Español de México en lo nuevo (tú y ustedes). Lo que ya traía upstream no se retradujo, salvo el
AI Coach: en español se llamaba "Entrenador" y ahora es "Coach IA", para que "Entrenador" sea solo
el humano. Un test (`lib/hally-i18n.test.js`) falla si un merge de upstream trae de vuelta la
palabra en una cadena del Coach.

## Licencia y código fuente

La AGPL obliga a ofrecer el código a quien usa la app por red. Por eso el enlace "Código fuente" de
Ajustes → Acerca de apunta a la rama `hally` del fork, y esa rama tiene que estar al día con lo
desplegado. Nada de secretos, datos de clientes ni `.env` en el repo (`data/` y `.env` están en
`.gitignore`).

La media del catálogo (`catalogue/media/`) no es AGPL: está licenciada por Gym visual para usarse
dentro de openGym. Se conserva sin modificar junto con `NOTICE.md`. **Ningún agente de IA debe abrir,
describir ni procesar esos archivos.**

## Marca

Mínima por ahora: el nombre Hally en el título de la página, en `manifest.json` y en la pantalla de
entrada. Los íconos siguen siendo los de openGym.
