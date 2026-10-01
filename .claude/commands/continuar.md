---
description: Retomar el trabajo de Módulos a medida donde quedó la última sesión
---

Retomá el trabajo siguiendo el protocolo "Al empezar" de `CLAUDE.md`:

1. Corré `git status`, `git branch --show-current` y `git log --oneline -5`.
   - Si hay cambios sin commitear o la rama no es la que indica `docs/modulos/PLAN.md` §1, avisame antes de seguir.
   - Si la rama existe en el remoto, hacé `git pull`.
2. Leé `docs/modulos/PLAN.md` §1 (estado y próximo paso), la entrada más reciente de `docs/modulos/BITACORA.md` y el paso del plan que corresponde, con lo que ese paso pide leer.
3. Si en esta computadora faltan dependencias, el cliente de Prisma o los `.env`, seguí `docs/modulos/PLAN.md` §3 y decime qué falta.
4. Corré las verificaciones de `docs/modulos/PLAN.md` §2.1. Si algo no da verde, decímelo antes de tocar código.
5. Respondeme con:
   - dónde quedó el trabajo, en 3 a 5 líneas;
   - el próximo paso y qué vas a hacer exactamente;
   - lo que está esperando una decisión mía o de ROMA (PLAN §6).

   Esperá mi confirmación antes de empezar.

Si escribí algo después del comando, tomalo como indicación del paso a encarar o de un cambio de prioridad: $ARGUMENTS
