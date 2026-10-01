# Paquete de desarrollo: Módulos a medida (ROMA)

## Qué hay acá

- `ESPECIFICACION-MODULOS-A-MEDIDA.md`: requerimientos completos (negocio, arquitectura, datos, API, UI, pruebas, fases y decisiones pendientes).
- `modulos-muebles.json` + `imagenes/`: los 33 modelos de `muebles.xlsx` convertidos, para la carga inicial.
- `referencia/moduleFormula.ts` + `moduleFormula.test.ts`: motor de fórmulas de referencia, sin `eval`. Ya da los mismos resultados que el Excel en las 305 piezas.
- `Prototipo - Modulos a medida.html`: el prototipo que aprobó el cliente. Abrilo con doble clic.

## Cómo arrancar

1. Copiá esta carpeta al repositorio como `docs/modulos/`.
2. Abrí Claude en la raíz del repositorio y pasale este mensaje:

> Vas a desarrollar la ampliación "Módulos a medida" del sistema. La especificación completa está en `docs/modulos/ESPECIFICACION-MODULOS-A-MEDIDA.md`: leela entera antes de tocar código, junto con los archivos que nombra la sección 3. Respetá las reglas de la sección 0.3; lo más importante es no romper el flujo actual de solicitudes de corte de los carpinteros. Trabajá por fases (sección 18), con un commit por fase, y empezá por la Fase 1: mové el motor de `docs/modulos/referencia/` a `frontend/src/lib/moduleFormula.ts`, sincronizalo al backend extendiendo `scripts/sync-optimizer.mjs` y dejá el test de paridad con las 305 piezas en verde. Antes de la Fase 6 (Herrajes), preguntame si el cliente la contrató. Las dudas de negocio que no estén resueltas en la sección 19 anotalas en `docs/modulos/DECISIONES.md` y seguí con la opción por defecto.

3. Probar el motor solo (requiere Node 22 o superior):

```bash
cd docs/modulos/referencia
node --test --experimental-strip-types moduleFormula.test.ts
```
