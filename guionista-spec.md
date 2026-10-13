# Guionista: editor de guiones estilo Celtx

## Contexto para Claude Code

Construí una webapp para escribir guiones con formato estándar de la industria (formato "Hollywood"), con el mismo flujo de trabajo que Celtx/Final Draft: escribís y el editor formatea solo cada elemento según el contexto, con Tab/Enter para cambiar de elemento.

**No uses el nombre, logo ni assets de Celtx.** Replicá la funcionalidad y la ergonomía, no la marca. Nombre de la app: "Guionista" (placeholder).

Trabajá por fases (ver al final). Al terminar cada fase, corré la app, probala contra los criterios de aceptación de esa fase y recién ahí pasá a la siguiente. Si una decisión técnica no está especificada acá, elegí la opción más simple y anotala en `DECISIONS.md`.

---

## Stack

- **Vite + React + TypeScript**
- **Editor:** ProseMirror (directo, o vía TipTap si simplifica). Cada elemento del guion es un tipo de nodo de bloque. No uses `contenteditable` a mano.
- **Estado/persistencia:** local-first con IndexedDB (via `idb` o Dexie). Autoguardado con debounce de 1 s. Sin backend en v1.
- **Export PDF:** generado con motor de paginación propio + `pdf-lib` (o `jsPDF`), con Courier Prime embebida. No uses `window.print()` como método principal.
- **PWA:** instalable, funciona offline.
- **Tests:** Vitest para el parser de Fountain, el motor de paginación y las reglas de Tab/Enter.

Fuente: **Courier Prime** (licencia OFL), servida local.

---

## Modelo de datos

```ts
type ElementType =
  | 'scene'          // Encabezado de escena
  | 'action'         // Acción / descripción
  | 'character'      // Nombre de personaje
  | 'parenthetical'  // Acotación
  | 'dialogue'       // Diálogo
  | 'transition'     // Transición
  | 'shot'           // Plano
  | 'general'        // Texto sin formato especial
  | 'act';           // Corte de acto / título de acto

interface ScriptElement {
  id: string;
  type: ElementType;
  text: string;
  sceneNumber?: string;   // solo para 'scene'; "12", "12A"
  dual?: boolean;         // diálogo dual (fase 3)
  tags?: TagRef[];        // desglose (fase 4)
  revision?: string;      // color de revisión (fase 4)
}

interface Project {
  id: string;
  title: string;
  titlePage: TitlePage;
  elements: ScriptElement[];
  settings: {
    pageSize: 'letter' | 'a4';
    sceneNumbers: 'none' | 'left' | 'both';
    showMoreContd: boolean;
    language: 'es' | 'en';   // afecta (MÁS)/(CONT.) vs (MORE)/(CONT'D)
  };
  updatedAt: number;
}

interface TitlePage {
  title: string;
  credit: string;      // "Escrito por"
  author: string;
  source?: string;     // "Basado en..."
  draftDate?: string;
  contact?: string;    // abajo a la izquierda
}
```

Los proyectos se guardan en IndexedDB. Un proyecto = un guion.

---

## Formato de página (crítico, tiene que ser exacto)

Medidas desde el borde izquierdo de la hoja. Courier 12 pt = 10 caracteres por pulgada, 6 líneas por pulgada.

| Elemento | Margen izq. | Ancho máx. | Mayúsculas | Espacio antes |
|---|---|---|---|---|
| Encabezado de escena | 1.5" | 6.0" | Sí | 1 línea (2 si no es el primero de la página: configurable) |
| Acción | 1.5" | 6.0" | No | 1 línea |
| Personaje | 3.7" | 3.3" | Sí | 1 línea |
| Acotación | 3.1" | 2.0" | No, entre paréntesis | 0 |
| Diálogo | 2.5" | 3.5" | No | 0 |
| Transición | alineada a la derecha, termina en 7.5" | — | Sí | 1 línea |
| Plano | 1.5" | 6.0" | Sí | 1 línea |
| Acto | centrado | — | Sí, subrayado | salto de página antes |

- Márgenes de página: superior 1", inferior 1", derecho 1".
- Número de página: arriba a la derecha, a 0.5" del borde superior, formato `12.`, desde la página 2. La portada no lleva número.
- Aprox. **55 líneas** de cuerpo por página en Letter. En A4 recalcular por altura disponible.
- Números de escena (si están activos): a la izquierda del encabezado, y opcionalmente también a la derecha.

### Reglas de corte de página

1. Un **encabezado de escena** nunca queda solo al final de la página: tiene que tener al menos 2 líneas de acción debajo, si no pasa a la página siguiente.
2. Un **personaje** nunca queda al final de la página separado de su diálogo.
3. Una **acotación** nunca queda al final de la página sola.
4. Un **diálogo** que no entra se puede partir por oración: al final de la página se pone `(MÁS)` centrado bajo el diálogo (posición de personaje), y en la página siguiente se repite `PERSONAJE (CONT.)`. Mínimo 2 líneas de diálogo a cada lado del corte; si no, se pasa entero.
5. La **acción** se puede partir por oración, mínimo 2 líneas a cada lado.
6. Una **transición** no puede quedar como primera línea de una página: arrastra la última línea del bloque anterior.
7. Si el mismo personaje vuelve a hablar después de una acción dentro de la misma escena, mostrar `(CONT.)` automáticamente (configurable).

El motor de paginación tiene que ser una **función pura**: `paginate(elements, settings) => Page[]`. La misma función alimenta la vista paginada del editor y el export PDF, para que lo que ves sea lo que se imprime.

---

## Editor: comportamiento de Tab y Enter

Este es el corazón de la app. Tiene que sentirse igual que Celtx.

### Enter (al final de un elemento con texto)

| Desde | Pasa a |
|---|---|
| Encabezado de escena | Acción |
| Acción | Acción |
| Personaje | Diálogo |
| Acotación | Diálogo |
| Diálogo | Acción |
| Transición | Encabezado de escena |
| Plano | Acción |
| Acto | Encabezado de escena |

### Enter en un elemento vacío
Abre el menú de selección de tipo de elemento (ver abajo) en vez de crear otro bloque vacío.

### Tab

| Desde (vacío) | Pasa a |
|---|---|
| Acción | Personaje |
| Personaje | Transición |
| Transición | Encabezado de escena |
| Encabezado de escena | Acción |
| Diálogo | Acotación |
| Acotación | Diálogo |

Tab en un elemento **con texto**: en Diálogo inserta una acotación; en Acción convierte el bloque en Personaje. Shift+Tab recorre el ciclo al revés.

Las dos tablas tienen que vivir en un único archivo de configuración (`src/editor/flow.ts`) para poder ajustarlas sin tocar la lógica.

### Atajos
- `Cmd/Ctrl + 1…8`: Escena, Acción, Personaje, Acotación, Diálogo, Transición, Plano, General.
- `Cmd/Ctrl + S`: forzar guardado.
- `Cmd/Ctrl + F`: buscar/reemplazar.
- `Cmd/Ctrl + Z / Shift+Z`: deshacer/rehacer (historial de ProseMirror).

### Detección automática
- Escribir al inicio de un bloque de Acción `INT.`, `EXT.`, `INT./EXT.`, `I/E` (y en español `INT.`/`EXT.`) → se convierte en Encabezado de escena.
- Una línea en mayúsculas que termina en `:` (`CORTE A:`, `CUT TO:`, `FUNDIDO A:`) → Transición.
- Escribir `(` al inicio de un bloque debajo de un Personaje o Diálogo → Acotación, con el paréntesis de cierre automático.

### Autocompletado
- **Personajes:** al escribir en un bloque Personaje, sugerir nombres ya usados en el guion (ordenados por frecuencia). Enter/Tab acepta. Incluir sufijos `(V.O.)`, `(O.S.)`, `(CONT.)` como opciones.
- **Escenas:** en Encabezado de escena, autocompletar en tres partes: prefijo (`INT.`/`EXT.`…) → locación (ya usadas) → momento del día (`DÍA`, `NOCHE`, `CONTINUO`, `MÁS TARDE`, `MOMENTOS DESPUÉS` + los ya usados).
- **Transiciones:** lista fija + las ya usadas.

### Selector de tipo de elemento
Dropdown en la barra superior que muestra el tipo del bloque actual y permite cambiarlo. Además, en el margen izquierdo de cada bloque, una etiqueta tenue con el tipo (activable en ajustes).

---

## Interfaz

Layout de tres zonas, modo claro y oscuro:

1. **Barra superior:** nombre del proyecto (editable), selector de tipo de elemento, contador de páginas, indicador de guardado ("Guardado" / "Guardando…"), botones de exportar y ajustes.
2. **Panel izquierdo (colapsable):** navegador de escenas. Lista numerada de encabezados con número de página. Click = salta a la escena. Arrastrar = reordenar escenas (mueve la escena entera con su contenido). Buscador para filtrar.
3. **Centro:** el guion como **páginas blancas tipo hoja** sobre fondo gris, con sombra, separadas, mostrando el corte de página real, (MÁS)/(CONT.) y números de página. Zoom 75–150 %.
4. **Panel derecho (colapsable, fase 2+):** notas de la escena actual / desglose.

Vista alternativa (toggle): **modo borrador** sin paginación, scroll continuo, para escribir sin distracciones.

Pantalla de inicio: grilla de proyectos con título, fecha de modificación y cantidad de páginas. Crear, duplicar, renombrar, borrar (con confirmación).

---

## Import / Export

- **Fountain** (`.fountain`): import y export. Es el formato de texto plano estándar; implementá el parser siguiendo la spec oficial de fountain.io (forced elements con `!`, `@`, `>`, `.`, centrado con `> <`, notas `[[ ]]`, boneyard `/* */`, title page). Los tests tienen que cubrir cada regla.
- **PDF:** con portada opcional, números de escena opcionales, idéntico a la vista paginada.
- **Final Draft** (`.fdx`): import y export (es XML; fase 3).
- **JSON** propio del proyecto para backup completo.
- **Texto plano** (`.txt`) con el formato aproximado en monoespaciado.

---

## Fases

### Fase 1: Editor base (MVP)
- Proyecto único guardado en IndexedDB.
- Los 9 tipos de elemento con su formato visual.
- Tab/Enter según las tablas, atajos de teclado, detección automática.
- Autocompletado de personajes y locaciones.
- Vista paginada con todas las reglas de corte, (MÁS)/(CONT.), números de página.
- Export PDF y Fountain. Import Fountain.

**Aceptación:**
- Escribir una escena completa usando solo teclado (Tab/Enter) sin tocar el mouse.
- Importar un `.fountain` de referencia (ej. *Big Fish* del sitio de Fountain) y que el conteo de páginas quede dentro de ±1 página respecto del PDF original.
- El PDF exportado tiene los márgenes de la tabla (verificar midiendo en el PDF).
- Recargar la página no pierde nada.

### Fase 2: Gestión y navegación
- Múltiples proyectos + pantalla de inicio.
- Navegador de escenas con drag & drop.
- Portada editable.
- Buscar y reemplazar.
- Notas por escena.
- Modo borrador, modo oscuro, zoom.
- Estadísticas: páginas, escenas, palabras, líneas de diálogo por personaje, duración estimada (1 página ≈ 1 minuto).

### Fase 3: Tarjetas y formatos
- **Tablero de tarjetas (index cards):** cada escena es una tarjeta con encabezado + sinopsis editable + color. Reordenar tarjetas reordena el guion.
- Diálogo dual (dos personajes en columnas).
- Import/export `.fdx`.
- Numeración de escenas bloqueada (al insertar entre la 5 y la 6 aparece la 5A).

### Fase 4: Producción
- **Desglose (breakdown):** seleccionar texto y etiquetarlo como Elenco, Utilería, Vestuario, Locación, Vehículo, FX, Sonido, etc. (con colores). Reporte de desglose por escena exportable a CSV/PDF.
- Reportes: lista de personajes con escenas en las que aparecen, lista de locaciones, escenas por día/noche.
- **Revisiones:** modo revisión con colores estándar (Blanco, Azul, Rosa, Amarillo, Verde, Dorado…), asterisco en el margen derecho de las líneas modificadas, y export solo de páginas cambiadas.
- Historial de versiones (snapshots manuales con nombre).

---

## Estructura sugerida

```
src/
  editor/
    schema.ts        // nodos ProseMirror por tipo de elemento
    flow.ts          // tablas Tab/Enter
    keymap.ts
    autodetect.ts
    autocomplete.ts
  pagination/
    paginate.ts      // función pura
    rules.ts         // reglas de corte
    metrics.ts       // medidas, chars por línea por elemento
  formats/
    fountain/  parse.ts  serialize.ts
    fdx/
    pdf/       render.ts
  storage/
    db.ts
  ui/
    TopBar.tsx  SceneNavigator.tsx  PageView.tsx  DraftView.tsx
    CardBoard.tsx  Home.tsx  Settings.tsx
  i18n/
    es.ts  en.ts
```

## Notas de implementación

- Calculá el wrap de líneas por **cantidad de caracteres** según el ancho de cada elemento (6.0" = 60 caracteres, 3.5" = 35, etc.), no midiendo píxeles. Courier es monoespaciada, así que es exacto y rápido, y garantiza que la vista y el PDF coincidan.
- La paginación tiene que recalcular de forma incremental o con debounce para que tipear en un guion de 120 páginas no se trabe (objetivo: < 16 ms por pulsación en el editor; la repaginación puede ir en un Web Worker).
- UI en español por defecto, con inglés como opción.
