# Bitácora: Módulos a medida

Una entrada por sesión, la más reciente arriba. La completa la sesión al cerrar (`/cerrar-sesion`). Sirve para retomar en otra computadora u otro día sin tener que explicar nada. En las entradas no van datos personales de clientes: se usan ids cortos y cantidades.

## Plantilla

```markdown
## AAAA-MM-DD · equipo <nombre> · rama <rama>

**Pasos:** F?.? (estado al cerrar)

**Hecho:**
- ...

**Quedó a medias (si aplica):** archivo, función y qué falta exactamente.

**Decisiones nuevas:** DECISIONES #...

**Verificaciones:** tests N/N, check:optimizer, tsc frontend y backend, build.

**Commits:** hash y mensaje, o "sin commit: los cambios están solo en este equipo".

**Próximo paso:** F?.?, y lo primero que hay que hacer.

**Esperando a Gonzalo o a ROMA:** P? (ver PLAN §6).
```

---

## 2026-10-01 · equipo Pinformatico15 · rama main

**Pasos:**
- F1, F0.1 y F0.2 terminados.
- Plan de trabajo armado.

**Hecho:**
- **Análisis de la spec contra el código real.** La spec da por existente `useFormDraft`: llegó con el pull de `6018f7a` (manejo de sesión y borradores). El paquete de referencia se movió a `docs/modulos/`, que es la ruta que usa la spec.
- **F1, motor de fórmulas.**
  - `frontend/src/lib/moduleFormula.ts` y su copia en `backend/src/shared/`.
  - Tests con la paridad 305/305.
  - `scripts/sync-optimizer.mjs` sincroniza los dos archivos compartidos.
  - Datos del catálogo e imágenes en `backend/prisma/data/`.
- **Auditoría de paridad de cálculo.** Workflow de 29 agentes, con verificación adversarial de cada hallazgo. Resultado: DECISIONES 0.1 a 0.6 y reglas R1 a R8.
- **F0.1, optimizador.** El desempate usaba el id de pieza, que lleva el número de fila, y las mismas piezas en otro orden podían dar otra cantidad de placas. Ejemplo con el catálogo: 2 o 3 placas. Se corrigió en `cutOptimizer.ts`, con los tests T36 a T38, que fallan con el código anterior.
- **F0.2, impacto en producción.**
  - Backup `carpinteria_2026-10-01_03-00-01.backup`, que está en Descargas de este equipo y no en el repo.
  - Se restauró en el contenedor Docker descartable `carpinteria-analisis-db`, en `127.0.0.1:55432`.
  - Resultado: la corrección no cambia ningún pedido.
  - Además aparecieron 7 constancias abiertas calculadas con el estimador viejo (DECISIONES 0.5).
- **Comparación con el estimador viejo** (DECISIONES 0.6). El viejo daba menos placas porque 138 de sus 307 placas no se pueden cortar con guillotina. El optimizador actual no es peor.
- **Plan de trabajo:**
  - `docs/modulos/PLAN.md` y esta bitácora;
  - `CLAUDE.md` en la raíz;
  - los comandos `/continuar` y `/cerrar-sesion` en `.claude/commands/`;
  - `.gitignore` para backups y configuración local.

**Verificaciones:**
- frontend `npm test`: 38 de 38 del optimizador y 12 de 12 del motor;
- `check:optimizer` en verde;
- `tsc` en verde en frontend y backend.

**Commits:** por pedido de Gonzalo, en `main` y separados por tema: F0.1, F1, docs del paquete y plan, y CLAUDE.md con los comandos. Push a `origin/main` (ver `git log`). La rama local `feature/modulos-a-medida` queda sin uso.

**Fuera del repo, solo en este equipo:**
- el backup en Descargas;
- el contenedor `carpinteria-analisis-db`;
- los scripts de la medición F0.2, en el directorio temporal de la sesión.

Para repetir la medición en otra computadora: restaurar un backup (PLAN §7) y usar el script que va a dejar F0.3.

**Próximo paso:**
1. F0.1b: desplegar frontend y backend juntos.
2. F0.3: presupuesto exacto con una función compartida.

**Esperando a Gonzalo o a ROMA:**
- P1: Herrajes.
- P2: las 7 constancias.
- P3: placas reales del taller.
- P4: despliegue de F0.1.
- P6: dos modelos que no entran en la placa.
- P7: placa de 26000.
- P8: el contenedor con el backup.
