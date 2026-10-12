# Hally sobre openGym: plan de arranque

Análisis del 11-oct-2026 (noche) sobre el fork `RoniHY/openGym` (upstream `DuarteSantos8/openGym`, v1.4.1, commit `464355ef`). En este paso no se modificó código de la app: solo setup y lectura.

**En una frase:** openGym ya es casi todo lo que la spec de Hally pedía para quien entrena (fases 1 a 6), corre en esta máquina sin Docker, y ya está en español. Lo que no existe es justo lo del servicio: la relación entrenador-cliente, el PAR-Q+, el dolor por sesión y los landmarks MEV/MAV/MRV. Antes de construir hay una decisión de licencia que es de Pedro (la media del catálogo, §5.5).

Las secciones siguen la numeración del encargo: 2 levantar en local, 3 mapa del repo, 4 brechas, 5 propuesta para la capa de entrenador.

---

## 2. Levantar en local

### Resultado

Corre desde fuente con Node 22, sin Docker ni Postgres. No hay base de datos que instalar: el API guarda todo en archivos JSON dentro de una carpeta.

| Pieza | Puerto | Qué es |
|---|---|---|
| API (`api/server.js`) | `3000` | Node puro (`node:http`), sin framework |
| Front (`frontend/`, Vite dev) | `5173` | React 19; hace proxy de `/api` al 3000 y sirve la media desde `catalogue/media` |
| Datos | n/a | `C:\Users\Pedro\sites\hally\data\` (ignorada por git) |

Abrir **http://localhost:5173**. Tiene que ser `localhost` tal cual (no `127.0.0.1` ni la IP de la red): las passkeys solo funcionan en `localhost` o con HTTPS.

### Comandos que funcionaron (PowerShell)

Instalación, una sola vez (son los mismos pasos que usan los Dockerfile del repo):

```powershell
cd C:\Users\Pedro\sites\hally\api
npm ci --omit=dev --omit=optional      # 41 paquetes, 2 s

cd C:\Users\Pedro\sites\hally\frontend
npm ci --ignore-scripts
```

Un ajuste de git en este clon, ya aplicado: `git config core.autocrlf false` y volver a extraer los archivos. La máquina tenía `autocrlf=true`, que deja los archivos con finales de línea de Windows, y el repo trae tests que comparan archivos byte por byte. No cambia ningún contenido (`git status` sigue limpio).

API (terminal 1):

```powershell
cd C:\Users\Pedro\sites\hally\api
$env:PORT='3000'
$env:DATA_DIR='C:\Users\Pedro\sites\hally\data'
$env:RP_ID='localhost'
$env:ORIGIN='http://localhost:5173'
$env:RP_NAME='Hally (dev)'
$env:PASSWORD_LOGIN='1'
$env:FIRST_USER_ADMIN='1'
$env:DEFAULT_LANG='es'
node server.js
# imprime: gym-api on :3000 (rpID=localhost, origin=http://localhost:5173)
```

Front (terminal 2):

```powershell
cd C:\Users\Pedro\sites\hally\frontend
$env:API_TARGET='http://127.0.0.1:3000'
$env:API_ORIGIN='http://localhost:5173'
node node_modules/vite/bin/vite.js --port 5173 --strictPort
```

Por qué cada variable:

- `DATA_DIR`: el default es `/data` (pensado para el contenedor). Sin esto escribiría en `C:\data`.
- `ORIGIN` y `API_ORIGIN` deben ser exactamente la dirección de la barra del navegador. El API rechaza escrituras que vengan de otro origen (protección CSRF) y la verificación de la passkey compara contra `ORIGIN`. El default del repo es `:8080` (el puerto del contenedor web), por eso se cambia a `:5173`.
- `PASSWORD_LOGIN=1`: agrega usuario y contraseña junto a las passkeys. Hace falta para entrar desde el panel Browser de AO y desde cualquier navegador embebido.
- `FIRST_USER_ADMIN=1`: el primer perfil que se cree en una instancia vacía queda como admin. **Pedro debe crear su perfil primero.** Hoy la instancia está vacía (`users: 0`).
- `DEFAULT_LANG=es`: la pantalla de entrada y los perfiles nuevos arrancan en español.
- El API no lee `.env` por sí solo (eso lo hace `docker compose`); por eso van como variables de entorno.

### Verificación hecha

| Qué | Resultado |
|---|---|
| `GET /api/health` directo y por el proxy de Vite | `{"ok":true,"users":0,"writable":true}` |
| `GET /api/config` | `password_login: true`, `default_lang: "es"`, `allow_guest: true` |
| Media del catálogo (`/exercise-media/still/0001.webp`) | 200, `image/webp` |
| Pantalla de entrada en el panel Browser de AO | En español: "Iniciar sesión con passkey", "Iniciar sesión con contraseña", "Crear perfil nuevo", "Continuar sin cuenta" |
| Alta de perfil con contraseña, sesión, `PUT /api/data`, `GET /api/admin/users` | Funciona de punta a punta por el proxy; el primer perfil salió con `admin: true` |
| Tests del front (`npx vitest run`) | 5,052 de 5,060 pasan; 8 fallan en 4 archivos (ver nota) |
| Tests del API (`npm test`) | 574 de 596 pasan; 22 fallan (ver nota) |
| Build de producción del front (`vite build`) | Compila en 2.3 s; `frontend/dist` pesa 24 MB y está ignorado por git |

El perfil de la prueba (`prueba-setup`) se borró después y el API se reinició con la carpeta de datos limpia, para que el primer perfil real sea el de Pedro.

Nota sobre los tests: la lista de fallas está en `ESTADO.md`. No se investigaron una por una. No vienen de cambios nuestros, porque no hay cambios: es el código de upstream corriendo en Windows, y su CI corre en Linux. En el API, por el nombre de cada test, 17 de las 22 son del AI Coach (que no se usa) y las otras 5 son de permisos de archivo y escritura en disco; ninguna es de registro, sesión, sincronización o admin. Antes de corregir los finales de línea fallaban 25.

No se probó: registro con passkey en un navegador real, la app instalada como PWA, el flujo completo de una sesión de entrenamiento en pantalla, ni el build de producción servido detrás de un proxy.

### Procesos que quedaron corriendo

Se lanzaron desacoplados para que la vista previa siga viva: `node server.js` (API) y Vite. Los logs están en `data\dev-api.out.log` y `data\dev-web.out.log`. Para apagarlos:

```powershell
Get-NetTCPConnection -LocalPort 3000,5173 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess }
```

### ¿Hace falta Docker?

Para desarrollar, no. Para producción tampoco es obligatorio, pero es el camino que el proyecto documenta y prueba (dos contenedores: `api` y `web` con nginx). Sin Docker habría que replicar a mano lo que hace `web/nginx.conf.template`: servir `frontend/dist`, servir `catalogue/media` en `/exercise-media/` y pasar `/api` al Node, todo en un mismo origen con HTTPS.

Tres cosas del despliegue que conviene saber desde ahora:

1. **No cabe en Vercel.** El API es un proceso Node de larga vida que escribe archivos en disco. Necesita un servidor con disco persistente (un VPS, o el servidor Debian que Pedro ya tiene, con un túnel de Cloudflare enfrente).
2. **El teléfono del cliente necesita HTTPS con dominio.** Las passkeys no funcionan sobre `http://192.168.x.x`. Alternativa sin passkey: `PASSWORD_LOGIN=1`.
3. **El dominio se decide antes de dar de alta clientes.** Las passkeys quedan atadas al `RP_ID`; cambiarlo después las invalida todas.

---

## 3. Mapa del repo

### Estructura

| Carpeta | Qué contiene |
|---|---|
| `api/` | Backend. `server.js` (2,709 líneas, un solo archivo, rutas en un objeto `routes['MÉTODO /ruta']`). Módulos: `password.js`, `passkeys-store.js`, `device-link.js`, `media.js`, `sync-stamps.js`, `queue.js`, `nudge.js`, `rate-limit.js`, `durable.js`. `coach/` es el AI Coach opcional. `openapi.yaml` documenta cada ruta. Tres dependencias: `@simplewebauthn/server`, `web-push`, `undici`. |
| `frontend/` | La app. `src/views/` (una pantalla por archivo), `src/components/`, `src/store/` (Zustand), `src/lib/` (lógica pura con su test al lado), `src/locales/` (18 idiomas), `src/sheets.jsx` (3,422 líneas: todas las hojas modales). `android/` e `ios/` son los cascarones de Capacitor. `public/sw.js` y `manifest.json` son la PWA. |
| `web/` | No es código de app: es el `Dockerfile` que compila el front y lo sirve con nginx, más la plantilla de nginx. |
| `catalogue/` | El catálogo de ejercicios. `exercises/<id>.json` (6,554, uno por archivo, en inglés), `i18n/<idioma>.json` (traducciones), `media/still` y `media/clip` (imagen y animación, 220 MB), `browse/` (páginas generadas). |
| `mcp/` | Servidor MCP opcional, de solo lectura, por stdio. Lee la misma carpeta de datos y expone rutinas, sesiones, peso, 1RM y balance muscular de **un** usuario a un cliente LLM. No forma parte del despliegue. |
| `scripts/` | Utilidades de build: `catalogue/validate.mjs` y `catalogue/build.mjs` (regeneran los datos de la app a partir del catálogo), `build-api-docs.mjs`, scripts de media y de CI. |
| `docs/` | Guías (`SELF_HOSTING.md`, `AI_COACH.md`, `MOBILE.md`, `API.md`, `DATA_IMPORTS.md`, `FAQ.md`) y notas de diseño en `docs/dev/` (`FATIGUE_SETS_MODEL.md`, `SET_TYPES.md`, `LIST_VIEW.md`, `COMBINE_ROUTINES.md`). |
| `website/`, `helm/`, `kubernetes/`, `contrib/nix/` | Sitio del proyecto y variantes de despliegue. No se usan. |

### Stack real

| Tema | Qué usa openGym | Contra la spec de Hally |
|---|---|---|
| Front | React 19 + Vite 8 + React Router 7 + Zustand 5. JavaScript, sin TypeScript, sin linter, CSS propio (sin Tailwind ni librería de componentes). Gráficas y mapa muscular hechos a mano (`LineChart.jsx`, `BodyMap.jsx`). | La spec pedía Next.js + TS + Tailwind + shadcn + Recharts. Nada de eso aplica. |
| Backend | Node sin framework, un archivo. | La spec pedía Supabase. |
| Base de datos | **No hay.** Dos tipos de archivo JSON en `DATA_DIR`: `db.json` (usuarios, credenciales, suscripciones push, invitaciones) y `state-<uid>.json` (todo el entrenamiento de un usuario en un solo documento). Escritura atómica (temporal + rename) y copia `db.json.bak`. | Sin SQL, sin migraciones, sin RLS. Upstream tiene abierto mover esto a una base de datos (issue #191). |
| Auth | Passkeys (WebAuthn) como entrada principal. Sesión en cookie firmada con HMAC (`data/secret`), 90 días. Opcional: contraseña (`PASSWORD_LOGIN`, scrypt), correo como alias de entrada, código para sumar otro dispositivo, emparejar la app móvil con un código. Modo invitado: todo en el navegador, nunca toca el servidor. | La spec pedía Supabase Auth con email y Google. No hay Google ni correo de verificación: el servidor nunca manda correos. |
| Sync | La app es *local primero*: el estado completo vive en `localStorage` (`gym_state_v1`) y se empuja al servidor con retardo (`PUT /api/data`). Cada 30 s pregunta la revisión (`GET /api/data/rev`). Los conflictos se resuelven registro por registro con sellos de tiempo (`frontend/src/lib/sync-merge.js`, 1,138 líneas; `api/sync-stamps.js`). | Cumple de sobra lo de "cola local, nadie pierde una serie sin señal". |
| Notificaciones | Web Push con llaves VAPID que se generan solas: fin de descanso, recordatorio del día, aviso de sesión no hecha. | No estaba en la spec. |
| Móvil | PWA instalable y, aparte, app Android/iOS con Capacitor. | La spec dejaba la PWA para la fase 6. |

### Modelo de datos

**`db.json` (servidor):**

```
users[]   { id, name, created, admin?, disabled?, invitedBy?, pw?, email?, ... }
creds[]   passkeys por usuario
subs[]    suscripciones push
invites[] { code, note, createdBy, created, usedBy?, usedAt? }
```

**`state-<uid>.json` (un documento por usuario; la forma está en `DEF`, `frontend/src/store/useStore.js:87`):**

| Qué | Clave | Forma |
|---|---|---|
| Perfil | no existe como tabla | El "perfil" es el usuario de `db.json` más los ajustes dentro del estado: `unit`, `lang`, `body` (figura hombre o mujer), `theme`, `effort` (`none` / `rir` / `rpe`), `restSec`, `weekStart`. **No guarda nivel, lugar de entrenamiento, fecha de nacimiento ni altura.** |
| Rutinas | `routines[]` | `{ id, name, emoji, ex: [{ id, sets, reps, repsMin?, setsMax?, weight, mode, restSec?, note?, sg?, side?, ... }], excludeFromProgression? }` |
| Plan semanal | `week`, `dayPlan`, `queue`, `rotation` | `week`: día de la semana → rutinas. `dayPlan`: cambios por fecha. `queue` / `rotation`: rutinas en bucle (A → B → C) en vez de días fijos. |
| Sesión en curso | `active` | Pertenece al dispositivo que la corre: al bajar el estado del servidor se conserva la sesión local. |
| Sesiones | `workouts[]` | `{ id, d, start, end, routineIds, name, bw, entries[], prs[], note?, media? }` |
| Series | `workouts[].entries[].sets[]` | `{ w, r, done, rir? \| rpe?, phase?/warmup?, type? (dropset / restpause), failure?, sides? }`. Series por tiempo: `{ sec, w }`. Cardio: `{ min, speed }`. |
| Récords | `workouts[].prs[]` + derivados | Los PR de peso se marcan al terminar (`sheets.jsx:3369`). El "mejor" histórico se calcula al vuelo (`bestWeightFor`, `lib/history.js:444`). `exWeights` guarda el peso de trabajo actual por ejercicio. |
| Peso corporal | `bodyweight[]` | `{ d, w, t }`, uno por día. Meta en `targetW`. |
| Medidas | `measurements[]` | Cintura, pecho, etc., en cm (`lib/measurements.js`). |
| Notas | `workouts[].note`, `entries[].note`, `exNotes`, `dayNotes` | Nota de sesión, nota por ejercicio, nota fija por ejercicio, y nota por día libre con etiqueta (`sick`, `travel`, `rest`, `injured`). |
| Ejercicios propios | `customEx[]` | Con una foto o video, guardado en `data/uploads/<uid>/`. |

El catálogo no vive en los datos: se compila dentro de la app desde `catalogue/`.

### Perfiles, admin e invitaciones

- **Perfiles.** Cada persona crea su perfil y sus datos quedan aislados en su archivo. Por default el alta es abierta.
- **Admin.** Es admin quien tenga `admin: true` en `db.json` (lo pone `FIRST_USER_ADMIN`) o cuyo id esté en `ADMIN_UIDS`. La verificación es del lado del servidor (`isAdmin`, `server.js:149`; `requireAdmin`, `server.js:616`).
- **Panel de admin** (`frontend/src/views/Admin.jsx`, rutas `/api/admin/*` en `server.js:2408` a `2570`):
  - Lista de usuarios: número de sesiones, última sesión, última sincronización, quién está entrenando ahora mismo.
  - Detalle de un usuario: **historial completo de sesiones con sus series**, peso corporal, y las rutinas solo por nombre y número de ejercicios. Es de solo lectura. No ve fotos ni videos del usuario.
  - Deshabilitar o borrar cuentas, generar código para restablecer contraseña.
  - Bitácora de actividad (`data/audit.log`): entradas, salidas, intentos fallidos, acciones de admin.
- **Solo por invitación.** Con `INVITE_ONLY=1` un perfil nuevo necesita un código que genera el admin (`POST /api/admin/invites/new`, con una nota de hasta 60 caracteres). `ALLOW_GUEST=0` quita "Continuar sin cuenta". Los dos suelen ir juntos.

### Dónde viven las reglas de progresión y el mapa muscular

| Qué | Archivo | Notas |
|---|---|---|
| Motor de progresión | `frontend/src/lib/progression.js` (819 líneas) | Políticas: `off`, `linear`, `greyskull`, `double` (progresión doble), `triple`, `time`. `nextPrescription` (línea 445) decide el siguiente peso; `stallCount` (401) cuenta estancamientos; descarga por ejercicio al 90% tras 3 estancamientos (`DELOAD_FACTOR`, `DELOAD_AFTER`, líneas 55–56). |
| Qué abre la siguiente sesión | `frontend/src/lib/session-start.js` | Prellenado desde el plan o desde la última sesión (`startFrom`). |
| 1RM estimado | `frontend/src/lib/onerm.js` | Epley por default, siete fórmulas y un promedio ponderado; tope de 12 reps. |
| Esfuerzo (RIR / RPE) | `frontend/src/lib/effort.js` | Todo se agrega en RIR; "serie dura" es RIR ≤ 3. |
| Fatiga y recuperación | `frontend/src/lib/recovery.js` (540 líneas), `recovery-view.js`, diseño en `docs/dev/FATIGUE_SETS_MODEL.md` | Estímulo en series duras, vida media de 24, 30 o 48 h según el músculo. |
| Músculos y volumen | `frontend/src/lib/muscles.js` | 18 músculos (`MUSCLES`, línea 18). Primario cuenta 1.0, secundario 0.4 (`SECONDARY`, línea 84). `loadOfRoutine`, `loadOfWeeklyPlan`. |
| Mapa muscular (dibujo) | `frontend/src/lib/body-paths.js` + `frontend/src/components/BodyMap.jsx` | Geometría derivada de MuscleMap (MIT). Frente y espalda, figura de hombre o mujer. |
| Mapa por ejercicio | `catalogue/exercises/<id>.json` (`target`, `secondaryMuscles`, `muscleMap` opcional) y `frontend/src/lib/exercise-muscle-*.json` | |
| Cierre de sesión | `frontend/src/lib/finish-workout.js`, `finish-compare.js` | Qué se guarda al terminar y la comparación "la vez pasada / hoy / la próxima". |

Regla del proyecto (CONTRIBUTING): todo lo que decide qué se levanta después, o que lee una sesión registrada, es una función pura en `src/lib` con su test al lado.

---

## 4. Análisis de brechas

Lectura rápida: de las 13 piezas de la spec, 7 ya existen, 6 están parciales y ninguna falta por completo. De las 8 del servicio, 1 ya existe, 4 están parciales y 3 no existen.

### 4.1 Features de la spec de Hally

| # | Feature | Estado | Dónde está | Qué falta para Hally |
|---|---|---|---|---|
| 1 | Sesión activa con temporizador y "la vez pasada" | **Ya lo tiene** | `views/Workout.jsx` (2,089 líneas), `lib/workout-model.js`, `lib/session-start.js`. Temporizador: `components/RestTimer.jsx` + `store/useUI.js:222–343`, calculado contra un `endsAt` (no acumula `setInterval`), con −15 s, +15 s, pausa y saltar, sonido, vibración y push si la app está en segundo plano (`POST /api/push/rest-timer`). La línea "La última vez" o "Mejor serie" (se alterna con un toque): `Workout.jsx:237–255`. Descanso por ejercicio: `sheets.jsx:1879` (`restSec`). | Nada. Trae además superseries, drop sets, calentamientos, series por tiempo y cardio. |
| 2 | RIR | **Ya lo tiene** (apagado por default) | `lib/effort.js`, `lib/history.js:101–140` (`EFFORT`, `effortOf`). Selector con colores y explicación por nivel. Acepta RIR o RPE. | Prenderlo por default en perfiles nuevos (`freshState`, `useStore.js:259`). |
| 3 | e1RM | **Ya lo tiene** | `lib/onerm.js`; gráficas en `views/Stats.jsx` ("Progreso por ejercicio", "1RM est."). | La comparación del resumen final usa peso máximo y luego reps totales (`lib/finish-compare.js:18`), no Δ% de e1RM. Ver fila 7. |
| 4 | Series efectivas por músculo con MEV/MAV/MRV | **Parcial** | Series efectivas: `lib/muscles.js:256` (`loadOf`), primario 1.0 y secundario 0.4. Tarjeta "Volumen muscular semanal" en Stats (planeado contra hecho, y modo "series duras"): `Stats.jsx:382–398`. | **MEV/MAV/MRV no existe en ninguna parte del repo.** Falta la tabla de landmarks por músculo, su ajuste por nivel, que sean editables y las tres marcas en las barras. Ojo: la spec cuenta el secundario como 0.5 y openGym como 0.4, y los músculos no coinciden uno a uno (openGym tiene un solo `deltoids`; la spec separa frontal y posterior). |
| 5 | Heatmap de fatiga | **Ya lo tiene** | `lib/recovery.js:455` (`fatigueOf`), `components/BodyMap.jsx`, tarjeta "Fatiga / Fuerza" en `Stats.jsx:136`. Con su línea de explicación ("La fatiga indica cuánto tiempo ha pasado desde el último entrenamiento de cada músculo…"). | El modelo es más elaborado que el de la spec (pondera por RIR y por carga crónica). Usa 3 estados (listo, recuperando, fatigado), no 4 bandas, y no normaliza contra MRV porque no hay landmarks. |
| 6 | Sugerencia de progresión y deload | **Parcial** | Progresión: `lib/progression.js:445`; la línea de sugerencia en la sesión: `Workout.jsx:682`. La política `double` es la regla de la spec (tope del rango → sube; dentro → repite y busca una rep). Descarga por ejercicio al 90% tras 3 estancamientos. | (a) La progresión no mira el RIR: la spec pide `rir ≥ 2` para subir. (b) El estancamiento se cuenta por dentro (`stallCount`) y dispara la descarga, pero no encontré una etiqueta de "estancado" en pantalla. (c) **No existe la recomendación de semana de descarga** (las tres reglas de la spec 3.6, que además dependen de MRV). Upstream planea semanas de descarga programadas, no recomendadas, para v1.4.1 (issue #159). |
| 7 | Resumen post-sesión | **Parcial** | `FinishSummary`, `sheets.jsx:3308`; `lib/finish-compare.js`. Muestra duración, volumen, PRs de peso y de e1RM, por ejercicio "la vez pasada / hoy / la próxima", mapa muscular de la sesión y "compartir como imagen". | Δ% de e1RM por ejercicio y las series por músculo en número (hoy es solo el mapa). |
| 8 | Dashboard | **Ya lo tiene** | `views/Home.jsx` (sesión de hoy, tira de la semana, racha, peso) y `views/Stats.jsx` (actividad de 12 meses, volumen semanal, balance muscular, fatiga, progreso por ejercicio, esfuerzo, peso, medidas, fotos de progreso, balance estructural). | El semáforo de volumen contra landmarks (depende de la fila 4). |
| 9 | Peso corporal | **Ya lo tiene** | `bodyweight[]`, registro en `sheets.jsx:307`, meta `targetW`, `lib/bodyweight.js`, gráfica en Stats. Además medidas (`views/Measurements.jsx`) y fotos de progreso (`views/ProgressPhotos.jsx`). | No guarda altura. |
| 10 | PWA offline | **Ya lo tiene** | `frontend/public/sw.js`, `manifest.json`, estado local primero y sync con fusión (`lib/sync-merge.js`). La app instalada precarga la media de los ejercicios del plan. Aparte hay app Android/iOS (Capacitor). | Nada. |
| 11 | Onboarding | **Parcial** | Bienvenida en `views/Home.jsx` → "Cargar plan inicial" (PPL, Upper/Lower, Full Body, 5×5, con sustitución por equipo: `lib/starter.js`) o "Crear mi propio plan". Perfiles de equipo (`lib/equipment.js`). | No pregunta nivel, peso, altura ni fecha de nacimiento, y no hay plantilla Bro Split. El cuestionario que sí existe (`views/CoachIntake.jsx`: objetivo, experiencia, días, duración, equipo, limitaciones) solo alimenta al AI Coach y no se guarda como ficha. Para el servicio el onboarding es otro: código de invitación → perfil → PAR-Q+. |
| 12 | Constructor de rutinas con barra de volumen semanal | **Parcial** | `views/RoutineEdit.jsx` (601 líneas): reordenar arrastrando, series, reps o rango, descanso, política de progresión, calentamientos, superseries, notas, ejercicios propios con foto, copiar, imprimir a PDF. Por rutina muestra "Qué trabaja esta sesión" con el mapa (`RoutineEdit.jsx:571–582`). | **La barra semanal en vivo dentro del constructor no existe.** El volumen semanal planeado está en Stats, no en el editor, y sin marcas MEV/MAV/MRV. Es la pantalla que la spec llama "la mejor de todo el producto". |
| 13 | Catálogo en español | **Parcial**, pero muy por encima de lo que había | `catalogue/i18n/es.json`: los 5,632 ejercicios base tienen nombre en español (los 922 restantes son la variante con figura femenina del mismo ejercicio). 1,324 tienen además las instrucciones en español. | Las descripciones cortas están solo en inglés (0 de 5,632) y 4,308 ejercicios tienen las instrucciones en inglés. El español es de España ("Túmbate", "Pulsa"), no de México. Para comparar: en cinfit había 208 ejercicios traducidos de 654. |

### 4.2 Necesidades del servicio de entrenamiento

| # | Necesidad | Estado | Dónde está o qué es lo más cercano | Qué falta |
|---|---|---|---|---|
| 14 | Relación entrenador-cliente | **No existe** | Nada en `main` relaciona a dos usuarios. Sí está en el roadmap de upstream: v1.4.7, 21-feb-2027 (`ROADMAP.md:196`), issue #119 abierto, con dos implementaciones de la comunidad (ver §5.1). | Todo: el rol, el vínculo y los permisos. |
| 15 | Que el entrenador vea a varios clientes y sus registros | **Parcial** | El panel de admin hace justo eso para todos los usuarios de la instancia: `views/Admin.jsx`, `GET /api/admin/users`, `GET /api/admin/user?id=` (`server.js:2408–2452`). Sesiones completas con series, RIR y nota de sesión; peso corporal; quién entrena ahora. | Es de admin, no de entrenador: no filtra por "mis clientes" y viene pegado a borrar cuentas. De las rutinas solo da nombre y número de ejercicios. No hay tendencia de e1RM, adherencia, dolor ni notas por cliente. |
| 16 | Asignar rutina a un cliente | **Parcial** (manual) | Compartir plan por archivo: `lib/plan-share.js` (`buildPlanBundle`, `parsePlan`, `mergePlan`), en Plan → "Exportar archivo del plan" / "Importar archivo del plan". El entrenador arma la rutina en su perfil, exporta, y el cliente importa. | Que sea dentro de la app: elegir cliente, enviar, y que el cliente la reciba y la acepte. Un ejercicio propio del entrenador no viaja al cliente. |
| 17 | Cuestionario de ingreso tipo PAR-Q+ | **No existe** | Lo más cercano es `views/CoachIntake.jsx` (ver fila 11), con el aviso "El Entrenador no es médico ni fisioterapeuta. Si algo te duele, consulta a un profesional". | El cuestionario, guardar las respuestas con fecha, la constancia de autorización de médico o fisio y que el entrenador las vea. |
| 18 | Registro de dolor por sesión | **No existe** como dato | Hay texto libre: nota de sesión (`sheets.jsx:3096`), nota por ejercicio, y la etiqueta `injured` en las notas de día (`lib/day-notes.js:21`). | Escala 0–10 por sesión, zona, y si empeoró al día siguiente (la regla de Pedro: hasta 3/10 durante, sin empeorar al otro día). |
| 19 | Nota libre del cliente al entrenador | **Parcial** | La nota de sesión ya se guarda en la sesión (`workouts[].note`) y ya viaja en la respuesta de `GET /api/admin/user`. | `Admin.jsx` no la pinta en la lista. Falta rotularla como nota para el entrenador, marca de leída y respuesta del entrenador. |
| 20 | Adherencia semanal | **Parcial** | Para el propio usuario: `lib/queue.js:181` (`weekTally` → hechas y planeadas de la semana), racha de semanas (`lib/history.js:882`), aviso de sesión no hecha (`api/nudge.js`), días justificados con nota. | La vista del entrenador: adherencia por cliente y por semana, con historia. |
| 21 | UI 100% en español | **Ya lo tiene** (casi) | `frontend/src/locales/es.js`: 2,258 cadenas traducidas; el CI (`frontend/scripts/check-locales.mjs`) obliga a que los 18 idiomas tengan las mismas claves. `DEFAULT_LANG=es`. | Es español de España. **El AI Coach ya se llama "Entrenador" en la UI en español**, así que el rol humano necesita otro nombre o hay que renombrar al Coach. Los nombres de las rutinas de inicio quedan en inglés a propósito ("Push Day"). La marca dice openGym. El panel de admin tiene cadenas sin traducir ("sets", "exercise … of …", `Admin.jsx:146` y `315`). Y lo del catálogo (fila 13). |

### 4.3 Lo que openGym trae y la spec no pedía

Útil para el servicio, sin costo: superseries y drop sets, series por tiempo y cardio, medidas corporales, fotos de progreso por sesión, perfiles de equipo (casa o gym), rutinas en rotación, importar historial de Hevy y CSV (`docs/DATA_IMPORTS.md`), imprimir la rutina a PDF, compartir sesión como imagen, y el servidor MCP para leer los datos de un cliente desde un LLM (sirve para preparar la revisión a 4 semanas).

Fuera del alcance de Hally y se puede dejar apagado: AI Coach (viene apagado), tarjetas de check-in del gym, balance estructural.

---

## 5. Propuesta técnica para la capa de entrenador

### 5.1 Lo que ya existe en upstream

El issue #119 ("optional Personal trainer role") está abierto y en el roadmap para v1.4.7 (21-feb-2027). Hay dos implementaciones de la comunidad:

| | A. MR de `trapy` (GitLab !79, "Add personal trainer mode") | B. Variante ligera de `hcke` (comentario en #119) |
|---|---|---|
| Vínculo | El alumno teclea un código de un solo uso del entrenador | El admin nombra entrenadores y les asigna atletas |
| Qué ve el entrenador | Entra al "contexto" del alumno y reutiliza las pantallas reales (Plan, Stats, Historial) en solo lectura, con un banner | La misma vista de solo lectura que ya da el admin |
| Asignar plan | El entrenador escribe el plan del alumno (`/api/assign`, con lista blanca de campos) | El plan llega como tarjeta y el atleta decide Aplicar o Descartar; nunca se escribe en su archivo |
| Extras | Biblioteca de plantillas, notas privadas por alumno | Ninguno |
| Tamaño | 36 archivos, pantalla nueva `Trainer.jsx` | "Un módulo de rutas y una pantalla" |
| Estado | Abierto, **con conflictos**: está sobre v1.2.14 y `main` va en v1.4.1 | No encontré código publicado |

Ninguna de las dos cubre PAR-Q+, dolor, nota al entrenador ni adherencia. Eso es de Hally.

Consecuencia: lo que se construya aquí va a convivir con lo que upstream termine aceptando. Conviene parecerse a esas formas y aislar el código propio (§5.6).

### 5.2 Cómo meter el rol en el modelo de perfiles y auth

**¿Extender el panel de admin?** Sí su camino de datos, no su permiso.

- Sí: `GET /api/admin/user` ya lee el archivo de otro usuario y lo devuelve saneado (`readState` + `records`), y `Admin.jsx` ya pinta la lista y el detalle. Es la base.
- No: admin también puede borrar cuentas, restablecer contraseñas y leer la bitácora. Como rol de entrenador es demasiado, y no sabe qué clientes son de quién.

Propuesta:

1. **Rol.** `users[].trainer: true` en `db.json`, que lo pone el admin. Mismo patrón que `admin: true`.
2. **Vínculo.** Una lista nueva `db.coaching[]: { trainerId, clientId, since, via }`. La invitación gana un campo `trainerId`: al canjear el código, el perfil nuevo queda ligado a ese entrenador. El código es el consentimiento, igual que en la propuesta A. Cualquiera de los dos puede desligarse.
3. **Guardia.** `requireTrainerOf(req, res, clientId)` junto a `requireAdmin` (`server.js:616`): pasa si quien llama es entrenador ligado a ese cliente.
4. **Módulo aparte.** Las rutas van en `api/trainer.js` y se montan con una línea, igual que el Coach (`...coachRoutes({ json, readBody, readSession, requireAdmin })`, `server.js:2576`). Así `server.js` casi no se toca.

Con un solo entrenador (Pedro), admin y entrenador son la misma persona. El rol separado cuesta poco y evita rehacer permisos después.

**Dónde vive cada dato.** La restricción que manda es que `PUT /api/data` sincroniza el documento completo del usuario. Si el entrenador escribiera en el archivo del cliente, la siguiente sincronización del teléfono del cliente lo podría pisar.

| Dato | Quién lo escribe | Dónde vive | Por qué |
|---|---|---|---|
| Dolor, nota al entrenador, PAR-Q+ | El cliente | En su propio estado (`state-<uid>.json`) | Se sincroniza solo y funciona sin señal. El servidor no necesita almacenamiento nuevo: el entrenador lo lee con las rutas de lectura. |
| Plan asignado, respuesta del entrenador, notas privadas | El entrenador | En un archivo aparte del servidor (`data/coaching/<clientId>.json`) | No lo pisa la sincronización del cliente. El cliente lo consulta y, si acepta el plan, entra por `parsePlan` → `mergePlan`, que ya existe. |

### 5.3 Campos y archivos nuevos

No hay tablas. Son claves nuevas en los JSON:

| Dónde | Clave | Forma propuesta |
|---|---|---|
| `db.json` | `users[].trainer` | `true` |
| `db.json` | `coaching[]` | `{ trainerId, clientId, since, via }` |
| `db.json` | `invites[].trainerId` | id del entrenador que invita |
| Estado del cliente | `workouts[].pain` | `{ during: 0–10, area?, worseNextDay?: true \| false, note? }` |
| Estado del cliente | `workouts[].note` | Ya existe; cambia el rótulo a "Nota para tu entrenador" |
| Estado del cliente | `intake` | `{ parq: { version, answers, signedAt, signedName }, clearance: { needed, by?, at? }, goal?, injuries?, _ts }` |
| Estado (todos) | `landmarks` | `{ [músculo]: { mev, mavMin, mavMax, mrv }, _ts }` más `level` |
| `data/coaching/<clientId>.json` | archivo nuevo | `{ pendingPlan?, messages[], privateNotes[], seen }` |

Tres puntos donde un campo nuevo se pierde si no se declara:

- `buildCompletedWorkout` (`lib/finish-workout.js:68`) arma la sesión terminada con lista blanca. Hay que agregar `pain`.
- `lib/sync-merge.js` tiene listas de claves que se fusionan de forma especial (`STAMPED_MAPS`, `OWN_MERGE`, `PER_KEY`). `intake` y `landmarks` tienen que entrar a la adecuada, con su test.
- El respaldo y la importación en JSON, y las etiquetas del servidor MCP (`mcp/src/labels.js`).

### 5.4 Pantallas y esfuerzo

Escala: **S** hasta un día, **M** de 2 a 4 días, **L** de una a dos semanas. Es trabajo de un worker más la revisión de Pedro, con tests. No incluye traducir cada cadena nueva a los 18 idiomas (ver la nota al final de esta sección).

**Fase 0. Piloto sin código (configuración).** Alcanza para Alery.

| Pieza | Cómo | Esfuerzo |
|---|---|---|
| Instancia privada | `INVITE_ONLY=1`, `ALLOW_GUEST=0`, `PASSWORD_LOGIN=1`, `DEFAULT_LANG=es`, Pedro como admin | S (requiere el despliegue con HTTPS) |
| Ver al cliente | Panel de admin: sesiones, series, peso | Ya está |
| Asignar rutina | Pedro arma la rutina en su perfil → exporta el archivo de plan → lo manda por WhatsApp → el cliente lo importa | Ya está |
| Nota y dolor | El cliente escribe en la nota de sesión; el dolor va como texto ("rodilla 2/10") | Ya está, pero el panel de admin no pinta la nota (se ve en el JSON) |

**Fase 1. Capa de entrenador.**

| # | Pieza | Qué es | Esfuerzo |
|---|---|---|---|
| 1 | Rol y vínculo | `trainer`, `coaching[]`, invitación con entrenador, guardia, `api/trainer.js` con `GET /api/trainer/clients` y `GET /api/trainer/client` | S |
| 2 | "Mis clientes" | Pantalla nueva `views/Trainer.jsx` sobre la lista de `Admin.jsx`: última sesión, adherencia de la semana, último dolor, nota sin leer, quién entrena ahora | M |
| 3 | Detalle del cliente (básico) | Sesiones con series, RIR, nota y dolor; peso; rutinas completas | M |
| 4 | Detalle del cliente (completo) | Reutilizar Stats e Historial con el estado del cliente en un contexto de solo lectura con banner (la técnica del MR !79) | L |
| 5 | Dolor por sesión | Paso en el cierre de sesión: 0–10, zona, nota. Pregunta "¿empeoró al día siguiente?" al abrir la siguiente | S |
| 6 | Nota para el entrenador | Rotular la nota de sesión, pintarla en la vista del entrenador, marca de leída | S |
| 7 | Respuesta del entrenador | Mensaje corto por sesión, guardado en el archivo aparte | M |
| 8 | Asignar plan en la app | Elegir rutinas propias y días → enviar; del lado del cliente, tarjeta "Plan de tu entrenador" con Aplicar o Descartar (`mergePlan`) | M |
| 9 | PAR-Q+ de ingreso | Asistente al primer ingreso del cliente, respuestas con fecha y nombre, constancia de autorización, visible para el entrenador | M |
| 10 | Adherencia semanal | Función pura (planeadas contra hechas por semana, con días justificados) sobre el estado del cliente, y su vista | S a M |
| 11 | Notas privadas del entrenador | Por cliente, en el archivo aparte | S |

**Fase 2. Lo de la spec que falta** (se puede portar desde cinfit: `web/lib/training/landmarks.js`, `volumen.js` y sus tests son código de Pedro).

| # | Pieza | Esfuerzo |
|---|---|---|
| 12 | Landmarks MEV/MAV/MRV: defaults, ajuste por nivel, editables, marcas en las barras de Stats | M |
| 13 | Barra de volumen semanal en vivo dentro del constructor de rutinas | M |
| 14 | Recomendación de semana de descarga (las reglas 3.6 de la spec; depende de la 12) | M |
| 15 | Onboarding con nivel, peso y altura; RIR prendido por default | S |
| 16 | Δ% de e1RM en el resumen y etiqueta de "estancado" | S |

**Transversales.**

| # | Pieza | Esfuerzo |
|---|---|---|
| 17 | Marca Hally: nombre, íconos, `manifest.json`, pantalla de entrada, enlace al código del fork | S |
| 18 | Español de México en la UI y en los ~150 ejercicios más comunes | M |
| 19 | Despliegue: servidor, dominio, HTTPS, respaldos de `data/` | M |

Orden sugerido: fase 0 ya, para el piloto. Luego 1, 5, 6, 2 y 3, que es lo mínimo para dar seguimiento de verdad. Después 9 y 8. La fase 2 al final.

**Nota sobre idiomas.** El CI de upstream exige que los 18 paquetes de idioma tengan exactamente las mismas claves. Cada cadena nueva de Hally implica 18 traducciones, o relajar esa verificación en el fork a español e inglés. Lo segundo es más barato y aleja el fork de upstream. Es decisión de Pedro (§5.7).

### 5.5 Licencias

No soy abogado; esto es lo que dicen los archivos del repo.

**AGPL-3.0-or-later (el código).**

- Hally será AGPL completo, incluida la capa de entrenador y lo que se porte de cinfit. Pedro conserva el derecho sobre lo que él escriba, pero no puede cerrar la obra derivada.
- La AGPL obliga a ofrecer el código fuente **a quien use la app por red**, no solo a quien reciba una copia. Para un cliente que entra a Hally desde su teléfono, eso significa: el fork público y al día con lo desplegado, y un enlace al código dentro de la app. Hoy el enlace de Ajustes apunta al repo de upstream (`Settings.jsx:834`); hay que apuntarlo al fork.
- El fork de GitHub ya es público (un fork de un repo público no se puede volver privado). Nada de secretos, datos de clientes ni `.env` en el repo; `data/` y `.env` ya están en `.gitignore`.
- Cobrar por el servicio no lo prohíbe la AGPL.
- Hay que conservar `LICENSE`, `NOTICE.md` y los avisos de copyright, y dejar claro que es una versión modificada.
- Hally figura en la lista de invenciones previas de los contratos de Remotto como "all source code and IP". Con el fork, lo propio de Pedro son sus cambios y adiciones, no la base.

**La media del catálogo (imágenes y animaciones). No es AGPL.**

Lo confirmé en los dos archivos:

- `catalogue/media/NOTICE.md`: la media está licenciada a openGym por Gym visual, "strictly for use within the openGym application"; no se puede copiar fuera de openGym, enlazar directo ni dársela a ningún sistema de IA.
- `NOTICE.md` (raíz) precisa el caso de los forks: *"A non-commercial fork of openGym may keep the unmodified 180 px media together with this notice. A commercial fork, or any other use, needs its own licence from gymvisual.com."*

Entonces lo de "en un fork que sigue siendo openGym sí se usa" es cierto **solo si el fork no es comercial**. Hally acompaña un servicio que se cobra (500 y 2,000 MXN), así que lo más probable es que cuente como uso comercial. Opciones:

| Opción | Qué implica |
|---|---|
| A. Licencia propia de Gym visual | Conserva las 6,554 animaciones. Hay que pedir precio y condiciones en gymvisual.com. |
| B. Quitar la media | La app sigue funcionando: un ejercicio sin archivo muestra un recuadro. Se pierde la demostración visual. |
| C. Media propia o libre | Sustituir por imágenes de dominio público (free-exercise-db, lo que usaba cinfit) o por fotos y videos de Pedro en los ejercicios de sus rutinas. Cubre menos ejercicios. |
| D. Preguntar | Escribir a upstream o a Gym visual si una instancia privada de un entrenador con clientes de pago cuenta como comercial. |

Mientras eso se decide, el uso local para desarrollo y el piloto sin cobro no cambian nada.

Regla para los agentes que trabajen en este repo: **no abrir, describir ni procesar los archivos de `catalogue/media/`** con herramientas de IA. En este paso no se abrió ninguno; solo se comprobó que el servidor responde 200.

**Texto del catálogo.** Los 1,324 ejercicios originales vienen de ExerciseDB bajo MIT; lo demás (ejercicios nuevos, descripciones, traducciones) es AGPL de openGym. Se puede corregir y traducir dentro del fork.

**Geometría del mapa muscular.** MIT (MuscleMap). Sin restricción práctica.

### 5.6 Cómo convivir con upstream

Upstream saca versión cada dos semanas y los archivos grandes cambian seguido (`server.js`, `sheets.jsx`, `Workout.jsx`). Para que actualizar no sea un problema:

- Código de Hally en archivos nuevos: `api/trainer.js`, `views/Trainer*.jsx`, `lib/hally-*.js` con sus tests.
- En los archivos de upstream, toques de una línea (montar rutas, sumar un campo a la lista blanca, una entrada de menú).
- `git fetch upstream` y merge en cada versión. La rama `main` del fork se queda igual a upstream; el trabajo va en una rama propia.
- Seguir el issue #119. Si upstream acepta un rol de entrenador, conviene adoptar el suyo y dejar encima solo lo de Hally (PAR-Q+, dolor, adherencia).

### 5.7 Decisiones que son de Pedro

1. **Media del catálogo:** opción A, B, C o D de §5.5. Es la única que puede frenar el uso con clientes de pago.
2. **Dónde vive Hally:** servidor y dominio. No puede ser Vercel, y el dominio se fija antes de registrar clientes.
3. **Forma de la capa de entrenador:** la propuesta de §5.2 (rol propio, lectura sobre el camino de admin, el plan llega y el cliente lo acepta), o portar el MR !79, que es más completo y más caro de mantener.
4. **Idiomas:** mantener los 18 o dejar español e inglés en el fork.
5. **Alcance del piloto con Alery:** fase 0 tal cual, o esperar a tener dolor y nota (piezas 5 y 6).
6. **Qué se porta de cinfit:** landmarks y barra de volumen (fase 2), o se deja el volumen como lo trae openGym.
