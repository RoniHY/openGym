# Hally

Hally es un fork de [openGym](https://github.com/DuarteSantos8/openGym) (AGPL-3.0-or-later) para el
servicio de entrenamiento personal de Pedro. Es una versión modificada: agrega la relación
entrenador-cliente, el dolor por sesión y la nota para el entrenador. El código vive en la rama
`hally` de `https://github.com/RoniHY/openGym`; `main` se queda igual a upstream.

- Plan y análisis: [`HALLY-PLAN.md`](../../HALLY-PLAN.md).
- Estado y cómo probar: [`ESTADO.md`](../../ESTADO.md).
- Rutas del API de entrenador: [`API.md`](API.md).

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

Con Docker: `cp .env.example.hally .env`, ajustar `RP_ID` y `ORIGIN`, y `docker compose up -d --build`
(con `--build`, porque las imágenes publicadas son las de upstream, sin la capa de Hally).

Sin Docker (desarrollo en Windows, PowerShell):

```powershell
cd C:\Users\Pedro\sites\hally\api
$env:PORT='3000'; $env:DATA_DIR='C:\Users\Pedro\sites\hally\data'
$env:RP_ID='localhost'; $env:ORIGIN='http://localhost:5173'; $env:RP_NAME='Hally (dev)'
$env:FIRST_USER_ADMIN='1'; $env:INVITE_ONLY='1'; $env:ALLOW_GUEST='0'
$env:PASSWORD_LOGIN='1'; $env:DEFAULT_LANG='es'
node server.js
```

```powershell
cd C:\Users\Pedro\sites\hally\frontend
$env:API_TARGET='http://127.0.0.1:3000'; $env:API_ORIGIN='http://localhost:5173'
node node_modules/vite/bin/vite.js --port 5173 --strictPort
```

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
