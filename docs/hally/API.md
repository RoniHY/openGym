# API de entrenador (Hally)

Rutas propias de Hally. Viven en `api/trainer.js` y se montan con una línea en `api/server.js`. No
están en `api/openapi.yaml`, que se deja como el archivo de upstream (su test compara ese archivo
contra `server.js` y `coach/routes.js`, y no ve `trainer.js`).

Todas responden JSON y usan la misma sesión que el resto del API (cookie firmada, o `Authorization:
Bearer` en la app móvil). Las de escritura pasan por el mismo guardia CSRF.

## Modelo

| Dónde | Clave | Forma |
|---|---|---|
| `db.json` | `users[].trainer` | `true`. Lo pone un admin. |
| `db.json` | `coaching[]` | `{ trainerId, clientId, since, via }`. Un cliente tiene un solo entrenador. |
| `db.json` | `invites[].trainerId` | Id del entrenador que creó el código. Al canjearlo, el perfil nuevo queda ligado. |
| Estado del cliente | `workouts[].pain` | `{ during: 0–10, area?, worseNextDay?, note? }`. Lo escribe la app del cliente. |
| Estado del cliente | `workouts[].note` | Ya existía. Es la nota para el entrenador. |
| `data/coaching/<clientId>.json` | archivo | `{ trainerId, seen: { <workoutId>: <huella de la nota> } }`. Lo escribe el entrenador. |

Reglas:

- Un vínculo cuenta mientras existan los dos perfiles y el entrenador conserve el rol. Si el admin
  quita el rol, el entrenador deja de leer de inmediato; los vínculos se conservan y vuelven a
  contar si el rol regresa.
- El entrenador nunca escribe en el archivo del cliente (`state-<uid>.json`): `PUT /api/data`
  sincroniza el documento completo desde el teléfono del cliente y lo pisaría.
- Una nota cuenta como leída por su texto. Si el cliente la reescribe, vuelve a salir sin leer.
- Las marcas de leído son del entrenador que las puso. Si el cliente cambia de entrenador, el
  nuevo empieza con todo sin leer.
- Al desligarse (cualquiera de los dos) o al borrar la cuenta, se borra `data/coaching/<clientId>.json`.

## Rutas

### Cualquier perfil con sesión

| Ruta | Qué hace |
|---|---|
| `GET /api/trainer/me` | `{ trainer, clients, coach }`. `coach` es `{ id, name, since }` o `null`. |
| `POST /api/trainer/unlink` | Termina el vínculo. El entrenador manda `{ clientId }`; el cliente manda `{}`. 404 si no hay vínculo. |
| `POST /api/trainer/join` | `{ code }`. Un perfil que ya existe canjea un código de entrenador y queda ligado. 403 si el código no sirve. |

### Entrenador (`users[].trainer`)

| Ruta | Qué hace |
|---|---|
| `GET /api/trainer/clients` | Una fila por cliente: última sesión, último dolor, notas sin leer, si entrena ahora, y el recorte del plan (`plan`) con el que la app calcula hechas contra planeadas de la semana. |
| `GET /api/trainer/client?id=` | Un cliente, solo lectura: sesiones con series, RIR, nota y dolor; peso corporal; rutinas completas; plan; ejercicios propios; `unread` con los ids de sesiones con nota sin leer. Sin fotos ni videos, sin correo ni datos de acceso. 403 si no es su cliente (o si el perfil no existe: la respuesta es la misma). |
| `POST /api/trainer/seen` | `{ clientId, ids? }`. Marca como leídas las notas de esas sesiones, o todas si no se manda `ids`. |
| `GET /api/trainer/invites` | Sus códigos de invitación. |
| `POST /api/trainer/invites/new` | `{ note? }`. Crea un código que liga al perfil que lo canjee. |
| `POST /api/trainer/invites/revoke` | `{ code }`. Solo códigos propios sin usar. |

### Admin

| Ruta | Qué hace |
|---|---|
| `GET /api/trainer/role?id=` | `{ id, trainer, clients, coach }` de un perfil. |
| `POST /api/trainer/role` | `{ id, trainer }`. Da o quita el rol. |

El panel de admin sigue igual. Un código creado en Admin por un admin que además es entrenador
también lleva `trainerId`; el de un admin que no es entrenador no liga a nadie.

## Bitácora

Eventos nuevos en `data/audit.log`: `admin.trainer.grant`, `admin.trainer.revoke`, `trainer.link`,
`trainer.unlink`, `trainer.invite.create`, `trainer.invite.revoke`, `trainer.denied`.
