# Estado de Hally (fork de openGym)

Última actualización: 12-oct-2026. El plan completo está en `HALLY-PLAN.md`; qué agrega Hally y dónde vive el código, en `docs/hally/README.md`.

## En una frase

La rama `hally` ya tiene la fase 0 (instancia privada y marca mínima) y las cinco piezas de la fase 1 que se pidieron (1, 5, 6, 2 y 3): rol de entrenador y vínculo con clientes, dolor por sesión, nota para el entrenador, "Mis clientes" y detalle del cliente. Todo probado con tests y recorrido de punta a punta en un navegador real. Falta desplegarlo: sigue corriendo solo en esta máquina.

## Hecho

Rama `hally` en `https://github.com/RoniHY/openGym` (pública). `main` se queda igual a upstream (v1.4.1, `464355ef`).

| Commit | Qué |
|---|---|
| `docs(hally): plan y estado` | `HALLY-PLAN.md` y este archivo |
| `feat(hally): fase 0…` | `.env.example.hally`, enlace "Código fuente" al fork, nombre Hally en título, `manifest.json` y pantalla de entrada |
| `feat(hally): idiomas es/en y Coach IA` | Cadenas de Hally en `locales/hally/es.js`, verificación de idiomas relajada, AI Coach renombrado a "Coach IA" |
| `feat(hally): rol de entrenador… (pieza 1)` | `api/trainer.js`, `users[].trainer`, `db.coaching[]`, `invites[].trainerId`, guardia `requireTrainerOf`, rutas `/api/trainer/*`, interruptor en Admin, filas en Ajustes → Cuenta |
| `feat(hally): dolor por sesión (pieza 5)` | Paso 0–10 + zona + nota al cerrar la sesión, `workouts[].pain`, pregunta del día siguiente |
| `feat(hally): nota para el entrenador (pieza 6)` | Rótulo "Nota para tu entrenador", campo en el cierre, marca de leída |
| `feat(hally): pantalla 'Mis clientes' (pieza 2)` | `/entrenador`, códigos de invitación |
| `feat(hally): detalle del cliente… (pieza 3)` | `/entrenador/c/<id>`, solo lectura |
| `fix(hally): sin tn()…` y `fix(hally): pulidos…` | Lo que destaparon la suite completa y el recorrido |

Decisiones de Pedro del 12-oct ya aplicadas: base openGym con fork público AGPL; la media del catálogo se conserva; idiomas español (por defecto) e inglés; español de México en lo nuevo; el rol humano es "Entrenador" y el AI Coach pasa a "Coach IA".

## Cómo probar

### La instancia de Pedro (vacía, esperando su perfil)

Ya está corriendo con el código nuevo: API en `:3000` y front en `http://localhost:5173`. Tiene que ser `localhost` tal cual.

1. Abrir `http://localhost:5173` → "Crear perfil nuevo". El primero queda como admin.
2. Apagar el API, agregar `INVITE_ONLY=1` y volver a arrancarlo (comandos en `docs/hally/README.md`). **Hoy corre sin `INVITE_ONLY`**, porque con la instancia vacía nadie podría crear el primer perfil.
3. Ajustes → Cuenta → Panel de administración → tu usuario → "Make trainer".
4. En Inicio aparece el ícono de persona: "Mis clientes" → "Código nuevo".
5. El cliente crea su perfil con ese código (en otro navegador o en una ventana privada) y queda ligado.

Para apagar los dos procesos:

```powershell
Get-NetTCPConnection -LocalPort 3000,5173 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess }
```

### La demo del recorrido (ya con datos)

En `data/demo-recorrido/` quedó la instancia con la que se hizo el recorrido: Pedro (admin y entrenador) y "Cliente demo" con dos sesiones, dolor y notas. Las contraseñas y los comandos para levantarla en `:3100` / `:5273` están en `data/demo-recorrido/LEEME.txt` (la carpeta `data/` está ignorada por git). No está corriendo.

### Tests y build

```powershell
cd C:\Users\Pedro\sites\hally\api;      npm test
cd C:\Users\Pedro\sites\hally\frontend; npx vitest run --maxWorkers=4
node scripts/check-locales.mjs
node node_modules/vite/bin/vite.js build
```

## Verificación del 12-oct

| Qué | Resultado |
|---|---|
| Tests del API | 602 de 624 pasan. Fallan 22, **los mismos 22 de upstream** de antes (comparados por nombre). 28 tests nuevos, todos pasan. |
| Tests del front (`--maxWorkers=4`) | 5,172 de 5,177 pasan. Fallan 5, todos de upstream y ya listados: `check-mobile-bundle.test.mjs` (4) y `sheets.day-note.test.jsx` (1). 117 tests nuevos, todos pasan. |
| `check-locales.mjs` | 18 idiomas con 2,258 claves cada uno, y 106 cadenas de Hally en español |
| Build de producción | Compila |
| Recorrido en navegador | Completo (abajo) |

**Sobre los tests del front en esta máquina.** Con `npx vitest run` a secas (20 procesos a la vez) salen además entre 7 y 13 fallas por tiempo agotado que cambian de una corrida a otra; en dos corridas no se repitió el mismo grupo. Con `--maxWorkers=4` desaparecen, y los archivos que fallaron pasan solos. Las 3 fallas que la versión anterior de este archivo atribuía a upstream (`rest-alert.native` ×2 y `backup-media` ×1) eran de ese tipo: con 4 procesos pasan.

### Recorrido

Hecho en una instancia aparte (`data/demo-recorrido`, puertos 3100 y 5273) para no ocupar la de Pedro. Capturas en `docs/hally/`:

| Captura | Paso |
|---|---|
| `01-entrada` | Pantalla de entrada: Hally, en español, sin "Continuar sin cuenta" |
| `02`, `03` | Admin → Pedro → "Make trainer" |
| `04-inicio-entrenador-con-aviso` | Inicio de Pedro con el ícono de "Mis clientes" y su punto de aviso |
| `05-mis-clientes-codigo` | Código de invitación creado |
| `06-cliente-alta-con-codigo` | "Cliente demo" crea su perfil con el código |
| `07-cliente-tu-entrenador` | El cliente ve quién es su entrenador y qué puede ver |
| `08`, `09` | Sesión del cliente con RIR y "Nota para tu entrenador" |
| `10-mis-clientes-entrenando-ahora` | Pedro ve al cliente entrenando en ese momento |
| `11-cliente-cierre-dolor-y-nota` | Cierre de sesión: dolor 0–10, zona, nota, la regla y la nota para el entrenador |
| `12-mis-clientes-dolor-y-nota` | Pedro ve última sesión, semana 1/3, dolor y nota sin leer |
| `13`, `14` | Detalle del cliente: sesiones con series y RIR, nota, dolor; rutinas completas y plan de la semana |
| `15`, `16` | Al abrir la siguiente sesión: "¿Empeoró al día siguiente?" y el aviso |
| `17-cliente-historial-dolor-editable` | El cliente puede corregir el dolor desde su Historial |

También se probó en el navegador: marcar una nota como leída (queda en `data/coaching/<clientId>.json`), cancelar un código sin usar, y que el dolor sobrevive a cambiar la fecha de la sesión. Que una nota reescrita vuelva a salir sin leer está cubierto por los tests del API, no por el recorrido.

**No se pudo con `ao browser`.** El panel Browser de AO estaba oculto: los clics no llegaban a la página y las capturas se caían por tiempo. El recorrido se hizo con Edge en modo headless manejado por el protocolo de DevTools (clics y tecleo reales sobre la misma app), con un script de un solo uso que no está en el repo.

**Media del catálogo en las capturas.** Una captura de la pantalla de entrenamiento salió con la miniatura de un ejercicio (media de Gym visual). Se borró junto con las otras tres de esa pantalla, y todas se repitieron con la instancia de demo respondiendo 502 a `/exercise-media/` y con el capturador negándose a guardar si había media en pantalla. Ninguna de las 17 capturas del repo trae media del catálogo. No se abrió ningún archivo de `catalogue/media/`.

## No se probó

- Registro con passkey (el recorrido usó contraseña).
- Desligarse desde la pantalla, de cualquiera de los dos lados. Está cubierto por tests del API y de las pantallas, no por el recorrido.
- Dos entrenadores en la misma instancia, fuera de los tests del API.
- La app instalada como PWA, el modo sin señal y la app de Android/iOS.
- El build de producción servido detrás de un proxy con HTTPS, y Docker. El `Dockerfile` del API ya copia `trainer.js` (hay un test que lo vigila), pero la imagen no se construyó.
- El calendario de 28 días ni varias semanas de datos: el cliente de demo tiene dos sesiones.

## Pendiente

**Decisiones de Pedro**

1. **Dónde vive Hally.** Servidor con disco (no Vercel) y dominio con HTTPS, fijado antes de registrar clientes: las passkeys quedan atadas al dominio.
2. **Códigos creados desde Admin.** Hoy, si el admin también es entrenador, un código hecho en Admin liga igual que uno hecho en "Mis clientes". Si prefieres que Admin nunca ligue, es una línea.
3. **Íconos y nombre en el resto de la app.** Varias cadenas de upstream siguen diciendo openGym ("Conecta la app de openGym…").

**Trabajo que sigue, en el orden de `HALLY-PLAN.md` §5.4**

- Pieza 9, PAR-Q+ de ingreso. Pieza 8, asignar plan dentro de la app.
- Pieza 7, respuesta del entrenador. Pieza 10, adherencia semana por semana (hoy solo se ve la semana en curso). Pieza 11, notas privadas. Pieza 4, detalle completo con Stats e Historial.
- Pieza 19, despliegue. Pieza 18, español de México en lo que ya traía upstream.

**Detalles conocidos**

- Un ejercicio propio del cliente no está en el catálogo del entrenador, así que su carga se lee como la de una barra ("0×12" en vez de "12" para uno de peso corporal).
- Si el cliente no contesta "¿empeoró al día siguiente?", la pregunta vuelve en cada sesión hasta que registre otra. No hay forma de contestarla sin abrir una sesión.
- El panel de Admin sigue en inglés (es de upstream y no está en los paquetes de idioma); el interruptor de entrenador también.
- Las rutas nuevas están documentadas en `docs/hally/API.md`, no en `api/openapi.yaml`.

## Reglas para quien siga

- No abrir ni procesar con IA los archivos de `catalogue/media/` (lo prohíbe su licencia). Ojo con las capturas de pantallas que muestran ejercicios.
- El repo de cinfit (`C:\Users\Pedro\Documents\proyectos\Vibecoding`) no se toca.
- Lógica de entrenamiento: función pura en `frontend/src/lib` con su test al lado. Sin dependencias nuevas, sin TypeScript.
- Código de Hally en archivos nuevos; en los archivos de upstream, toques de una línea. La lista está en `docs/hally/README.md`.
- Cadenas nuevas: `t('English')` en el código y su traducción en `locales/hally/es.js`. No usar `tn()` con cadenas propias (upstream exige formas en ruso, ucraniano y polaco para cada una).
- Tests del front con `--maxWorkers=4` en esta máquina.
