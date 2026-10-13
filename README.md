# AMPUX

**App publicada:** https://lautarovolcan.github.io/AMPUX/ (cada push a `main` corre los tests, compila y publica con GitHub Actions).

Editor de guiones con formato estándar de la industria. Escribís y el editor formatea solo cada elemento (escena, acción, personaje, diálogo…), con Tab/Enter para pasar de uno a otro. Funciona en el navegador, guarda todo localmente (IndexedDB) y se puede instalar como app (PWA).

## Empezar

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests de Fountain, paginación y flujo Tab/Enter
npm run build    # build de producción en dist/
```

## Cómo se escribe

| Tecla | Qué hace |
|---|---|
| Enter | Pasa al siguiente elemento lógico (escena → acción, personaje → diálogo…). En un elemento vacío abre el menú de tipos. |
| Tab / Shift+Tab | Cambia el tipo del elemento (acción → personaje → transición → escena). En un diálogo con texto inserta una acotación. |
| ⌘1 … ⌘8 | Escena, Acción, Personaje, Acotación, Diálogo, Transición, Plano, General |
| Shift+Enter | Salto de línea dentro del mismo elemento |
| ⌘D | Diálogo dual (pone el personaje al lado del anterior) |
| ⌘S / ⌘F / ⌘Z | Guardar, buscar y reemplazar, deshacer |

Detección automática: `INT.` / `EXT.` al inicio de una acción la convierte en encabezado; una línea en mayúsculas que termina en `:` pasa a transición; `(` debajo de un personaje crea una acotación.

Las tablas de Tab/Enter viven en `src/editor/flow.ts`.

## Estructura

```
src/
  editor/       ProseMirror: esquema, flujo Tab/Enter, keymap, autodetección,
                autocompletado, vista paginada y buscar/reemplazar
  pagination/   paginate() — función pura que alimenta la vista y el PDF
  formats/      Fountain y Final Draft .fdx (import/export), PDF (pdf-lib + Courier Prime), TXT, JSON
  reports/      reportes de producción (desglose, personajes, locaciones, día/noche) → CSV / PDF
  storage/      IndexedDB (proyectos e historial de versiones)
  ui/           React: inicio, barra superior, navegador de escenas, paneles, diálogos
  i18n/         español / inglés
tests/          Vitest
```

## Estado

- **Fase 1** (editor base, paginación, PDF, Fountain) — hecha.
- **Fase 2** (múltiples proyectos, navegador con drag & drop, portada, buscar/reemplazar, notas, modo borrador, modo oscuro, zoom, estadísticas) — hecha.
- **Fase 3** (tablero de tarjetas con sinopsis y color, diálogo dual, import/export `.fdx`, numeración de escenas bloqueada) — hecha.
- **Fase 4** (desglose con etiquetas, reportes CSV/PDF, modo revisión con colores y asteriscos, exportar páginas cambiadas, historial de versiones) — hecha. Todo vive en el menú **Producción** de la barra superior.

Fuente: [Courier Prime](https://github.com/quoteunquoteapps/CourierPrime) (SIL Open Font License).
