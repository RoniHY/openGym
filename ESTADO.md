# Estado de Hally (fork de openGym)

Última actualización: 11-oct-2026, noche. El plan completo está en `HALLY-PLAN.md`.

## Hecho

- **Fork:** `https://github.com/RoniHY/openGym` (público), de `DuarteSantos8/openGym`. No se hizo push de nada.
- **Clon:** `C:\Users\Pedro\sites\hally`, rama `main` en `464355ef` (v1.4.1). Remotos: `origin` (el fork) y `upstream` (el original).
- **Corre en local sin Docker:** API en `:3000`, front en `http://localhost:5173`. Comandos en `HALLY-PLAN.md` §2.
- **Datos:** `data/` (ignorada por git). La instancia está vacía; el primer perfil que se cree queda como admin.
- **Verificado:** salud del API, pantalla de entrada en español, alta de perfil con contraseña, sincronización y lista de admin de punta a punta, build de producción.
- **Análisis:** mapa del repo, brechas contra la spec y contra el servicio, propuesta de la capa de entrenador y licencias.
- **Ajuste local de git:** `core.autocrlf=false` en este clon (finales de línea como en el repo).

## Sin commitear

`HALLY-PLAN.md` y `ESTADO.md` están sin seguimiento en el clon. No se creó rama ni commit. El código de la app no se tocó.

## Procesos corriendo

Dos procesos `node` desacoplados (API y Vite). Para apagarlos:

```powershell
Get-NetTCPConnection -LocalPort 3000,5173 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess }
```

Si la máquina se reinicia hay que volver a lanzarlos con los comandos de `HALLY-PLAN.md` §2.

## Tests de upstream en esta máquina (sin cambios nuestros)

**API: 574 de 596 pasan, 22 fallan.**

- 17 del AI Coach, por el nombre del test: 46, 48, 49, 50, 51, 73, 94, 96, 99, 106 a 112 y 325.
- 5 de permisos de archivo y escritura en disco: 84 (`atomicWrite`), 364 (`db.json` ilegible), 385 y 483 (carpeta de datos sin permiso de escritura), 405 (carpetas 0700 y archivos 0600).

**Front: 5,052 de 5,060 pasan, 8 fallan en 4 archivos.**

- `scripts/check-mobile-bundle.test.mjs` (4)
- `src/lib/rest-alert.native.test.js` (2)
- `src/lib/backup-media.test.js` (1, por tiempo agotado)
- `src/sheets.day-note.test.jsx` (1)

No se investigó la causa de ninguna. El CI de upstream corre en Linux. Corriendo junto con otra carga, el front además da fallas por tiempo agotado que cambian de una corrida a otra.

## No se probó

- Registro con passkey en un navegador real.
- Una sesión de entrenamiento completa en pantalla (se leyó el código, no se recorrió la UI).
- La app instalada como PWA y el modo sin señal.
- El build de producción servido detrás de un proxy con HTTPS.

## Pendiente: decisiones de Pedro

1. **Media del catálogo.** `NOTICE.md` solo permite conservarla en un fork no comercial. Hally acompaña un servicio de pago. Opciones en `HALLY-PLAN.md` §5.5.
2. **Dónde vive Hally.** Necesita un servidor con disco (no Vercel) y un dominio con HTTPS, fijado antes de registrar clientes.
3. **Forma de la capa de entrenador.** Rol propio y ligero (propuesta de §5.2) o portar el MR de la comunidad.
4. **Idiomas.** Mantener los 18 o dejar español e inglés.
5. **Piloto con Alery.** Arrancar con la fase 0 (sin código) o esperar a dolor y nota.
6. **Qué se porta de cinfit.** Landmarks MEV/MAV/MRV y barra de volumen.

## Pendiente: trabajo

- Pedro crea su perfil en `http://localhost:5173` (queda como admin) y recorre una sesión.
- Crear la rama de trabajo del fork; `main` se queda igual a upstream.
- Fase 0: variables de instancia privada y despliegue.
- Fase 1 en el orden de `HALLY-PLAN.md` §5.4.

## Reglas para quien siga

- No abrir ni procesar con IA los archivos de `catalogue/media/` (lo prohíbe su licencia).
- El repo de cinfit (`C:\Users\Pedro\Documents\proyectos\Vibecoding`) no se toca.
- Lógica de entrenamiento: función pura en `frontend/src/lib` con su test al lado. Sin dependencias nuevas, sin TypeScript.
- Código de Hally en archivos nuevos; en los archivos de upstream, toques de una línea.
