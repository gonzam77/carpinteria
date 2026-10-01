# Carpintería · ROMA Amoblamientos

Sistema de gestión de solicitudes de corte de placas de melamina para ROMA Amoblamientos. El responsable del proyecto es Gonzalo (`gonzam77`). Se responde y se escribe la interfaz en español rioplatense, con el tono del sistema ("Cargá", "Elegí").

- `frontend/`: React, MUI y Vite.
- `backend/`: Express, Prisma 7 y PostgreSQL 16.
- Código de cálculo compartido: `frontend/src/lib/cutOptimizer.ts` y `frontend/src/lib/moduleFormula.ts`. Se copian a `backend/src/shared/` con `npm run sync:optimizer`.

## Trabajo en curso: Módulos a medida

- **Plan y estado, la fuente de verdad del avance:** [docs/modulos/PLAN.md](docs/modulos/PLAN.md)
- **Qué se hizo en cada sesión:** [docs/modulos/BITACORA.md](docs/modulos/BITACORA.md)
- **Decisiones tomadas:** [docs/modulos/DECISIONES.md](docs/modulos/DECISIONES.md)
- **Qué construir:** [docs/modulos/ESPECIFICACION-MODULOS-A-MEDIDA.md](docs/modulos/ESPECIFICACION-MODULOS-A-MEDIDA.md)

`docs/modulos/` es material de referencia. El código de producción va en su lugar dentro de `frontend/` y `backend/`.

## Protocolo de sesión

**Al empezar** (o con `/continuar`):
1. `git status` y `git pull` de la rama que indica PLAN §1 (hoy `main`). Avisar si hay cambios sin commitear.
2. Leer PLAN §1, la última entrada de la bitácora y lo que el paso a encarar pide leer.
   - Si `git log` muestra commits posteriores a la última entrada de la bitácora, o hay cambios sin commitear, es que una sesión se cortó sin cerrar. En ese caso, reconstruir qué se hizo con `git log` y `git diff` y avisar antes de seguir.
3. Si es una computadora nueva, seguir PLAN §3.
4. Correr las verificaciones de PLAN §2.1 y avisar si algo no da verde antes de tocar código.
5. Resumir en pocas líneas dónde quedó el trabajo, proponer el próximo paso y esperar la confirmación.

**Al terminar** (o con `/cerrar-sesion`):
1. Actualizar el estado del paso en PLAN §1 y en el paso mismo.
2. Agregar una entrada en la bitácora, con la plantilla de ese archivo.
3. Registrar las decisiones nuevas en DECISIONES.md.
4. Proponer el commit y el push con un mensaje. Ejecutarlos solo con el OK de Gonzalo.

## Reglas no negociables

1. **Paridad de cálculo, siempre prioritaria.** Para las mismas piezas, la cantidad de placas y cada componente del presupuesto tienen que dar exactamente igual se carguen como solicitud de corte o desde módulos. También tienen que coincidir en todas las pantallas y servicios: plano, constancia, listado de materiales, reserva de stock y dashboard. Para cumplirlo:
   - todo cálculo de placas y presupuesto pasa por el código compartido, sin fórmulas duplicadas;
   - cada cambio que toque esos cálculos lleva un test de paridad;
   - el optimizador no puede depender del orden ni de la partición de las filas (tests T36 a T38).
2. **No romper el flujo de los carpinteros:** listado, carga, edición, exportación, stock, notificaciones y dashboard (spec §0.3 y checklist §15).
3. **Código compartido:** se edita solo en `frontend/src/lib/` y después se corre `npm run sync:optimizer`. `npm run check:optimizer` tiene que dar verde.
4. **Base de datos:**
   - toda tabla o columna nueva va con una migración Prisma nueva;
   - nunca editar migraciones viejas;
   - nunca correr `prisma migrate reset` ni borrar `prisma/migrations` (el "reset" del README es solo para una base descartable);
   - las migraciones se prueban sobre una copia de un backup (PLAN §7).
5. **Datos de producción:**
   - los backups nunca se versionan;
   - nunca se copian nombres ni teléfonos de clientes a commits, logs ni mensajes;
   - se restauran solo en un contenedor local descartable.
6. **Commit y push solo con el OK de Gonzalo.**
   - Se trabaja directo sobre `main`, que también es lo que se despliega. Por eso:
     - todo commit deja verdes las verificaciones;
     - las pantallas a medio hacer no se agregan al menú ni a las rutas;
     - las migraciones no rompen lo existente.
   - Los commits van separados por paso o por tema.
   - Para deshacer algo ya subido se usa `git revert`, nunca `push --force`.
7. **Estilo:** sin dependencias nuevas salvo que sean imprescindibles; validación con zod; mensajes de error en español, claros y accionables; MUI y el `theme.ts` existente.
8. **Antes de la Fase 6 (Herrajes)**, preguntar si el cliente la contrató.

## Comandos

```bash
npm run install:all                     # dependencias de backend y frontend
cd frontend && npm test                 # tests del optimizador y del motor de fórmulas
npm run sync:optimizer                  # copia el código compartido al backend
npm run check:optimizer                 # falla si las copias difieren
cd frontend && npx tsc --noEmit
cd backend && npx tsc --noEmit
cd backend && npx prisma generate       # después de cada pull que cambie schema.prisma
npm run build                           # build completo, incluye check:optimizer
```

## Entorno

- Node 22 o superior: los tests usan `--experimental-strip-types`.
- Docker Desktop para la base local.
- Windows, con PowerShell y Git Bash. En Git Bash hay que anteponer `MSYS_NO_PATHCONV=1` a `docker cp` y `docker exec` cuando llevan rutas.
- El árbol de trabajo usa CRLF (`core.autocrlf=true`).
- Los `.env` no están en el repo: las variables necesarias están en PLAN §3.
