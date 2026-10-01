---
description: Cerrar la sesión dejando el plan, la bitácora y las decisiones al día
---

Cerrá la sesión siguiendo el protocolo "Al terminar" de `CLAUDE.md`:

1. Corré las verificaciones de `docs/modulos/PLAN.md` §2.1 y anotá el resultado real, aunque algo falle.
2. Actualizá `docs/modulos/PLAN.md`:
   - en §1: fecha, rama, último paso terminado, próximo paso y la tabla de estados;
   - el estado del paso en §5;
   - las decisiones pendientes de §6 que se hayan resuelto o agregado.
3. Agregá arriba de todo en `docs/modulos/BITACORA.md` una entrada con la plantilla de ese archivo. Incluí:
   - el nombre del equipo (`hostname`);
   - qué quedó a medias, con archivo y función;
   - el próximo paso concreto.

   No pongas nombres ni teléfonos de clientes.
4. Registrá en `docs/modulos/DECISIONES.md`, con número, toda decisión nueva de la sesión.
5. Mostrame un resumen de los cambios (`git status` y `git diff --stat`) y proponé uno o más commits con mensajes que nombren el paso, por ejemplo `F2.1: esquema del catálogo de módulos`.
   - **No hagas commit ni push hasta que yo lo apruebe.**
   - Si apruebo, hacé el push de la rama, para que la próxima sesión pueda seguir desde otra computadora.

Notas adicionales para esta sesión: $ARGUMENTS
