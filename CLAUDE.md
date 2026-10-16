# AMPUX — estado del proyecto y cómo seguir

Editor de guiones con formato de la industria (estilo Celtx/Final Draft), local-first, en el navegador.
Spec original: `guionista-spec.md` (allí la app se llamaba "Guionista"; el nombre real es **AMPUX**).
Decisiones técnicas: `DECISIONS.md`. Uso y estructura: `README.md`.

## Estado (última sesión: 13/10/2026)

- **Las 4 fases del spec están hechas**: editor + paginación + PDF/Fountain (1), proyectos, navegador de escenas, portada, buscar/reemplazar, notas, borrador, oscuro, zoom, estadísticas (2), tarjetas, diálogo dual, `.fdx`, numeración bloqueada (3), desglose, reportes CSV/PDF, revisiones con colores, historial de versiones (4).
- 94 tests en verde (`npm test`). Con *Big Fish* (fountain.io) da 122 páginas y cada hoja de la vista mide exactamente 11": vista y PDF coinciden.
- **Publicada**: https://lautarovolcan.github.io/AMPUX/ — repo `LautaroVolcan/AMPUX`, rama `main`.
- Último commit: `cdf2c1f Fase 4: desglose, reportes, revisiones y versiones`.

## Etapa actual: pulido con uso real

Una amiga de Lautaro usa la versión publicada. La idea es juntar su feedback y pulir.
Ideas pendientes que ya surgieron (sin priorizar):
- Negrita / cursiva / subrayado (hoy no hay; se pierden al importar Fountain/FDX).
- Exportar etiquetas de desglose a FDX (`TagData`).
- Revisiones con granularidad por línea (hoy es por elemento).
- Mover escenas con el teclado en el navegador lateral.
- Probar el `.fdx` exportado en Final Draft real (solo se verificó ida y vuelta en AMPUX).
- Sincronización con Supabase y carpetas (sesión 16/10/2026). Pendiente: edición simultánea (hoy gana el último que guarda) y, si hace falta, login.

## Reglas importantes

- **No romper los datos guardados.** Los guiones están en Supabase (tablas `projects`, `folders`, `snapshots`; ver `supabase/schema.sql`) y en IndexedDB (`ampux`, versión 3: stores `projects`, `snapshots`, `folders`) del navegador de quien la usa. La sincronización vive en `src/storage/db.ts`. Cualquier cambio de modelo debe ser aditivo: campos nuevos opcionales o completados en `normalizeProject` (`src/storage/db.ts`), migraciones que solo agregan stores. Hay un test de compatibilidad en `tests/phase4.test.ts`.
- **Cada push a `main` publica.** `.github/workflows/deploy.yml` corre tests, compila con `VITE_BASE=/AMPUX/` y despliega a Pages. Confirmar con Lautaro antes de commitear o pushear.
- La paginación (`src/pagination/paginate.ts`) es una función pura y alimenta la vista y el PDF. Si se toca el corte de líneas, verificar que las hojas sigan midiendo 11" (ver abajo).
- Las tablas de Tab/Enter viven en `src/editor/flow.ts`.

## Trabajo con Lautaro

- Escribe en español rioplatense; responder igual.
- Estética **minimalista** (grises neutros, sin adornos, modo claro y oscuro).
- Le gusta ver el avance en un puerto local: `npm run dev` → http://localhost:5173.
- Usa VS Code y GitHub (CLI `gh` autenticada como `LautaroVolcan`).

## Comandos

```bash
npm install
npm run dev                          # http://localhost:5173
npm test                             # Vitest
VITE_BASE=/AMPUX/ npm run build      # build igual al de Pages (salida en dist/)
gh run list --limit 3                # estado de los deploys
```

Para verificar la vista paginada en un navegador real se usó Playwright (instalado fuera del repo): importar Big Fish y comprobar que la distancia entre los separadores `.pg-gap` sea 11 × 96 + 28 px.
