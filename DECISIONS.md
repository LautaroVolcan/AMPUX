# Decisiones técnicas

Decisiones que el spec no fijaba, tomadas eligiendo la opción más simple.

## Editor
- **ProseMirror directo** (sin TipTap): el esquema es chico (9 nodos de bloque + `hard_break`) y TipTap no simplificaba nada.
- **Sin marcas de estilo** (negrita/cursiva/subrayado) en v1. Al importar Fountain, `*`, `**`, `_` se quitan del texto.
- **Saltos de línea dentro de un elemento** con Shift+Enter (nodo `hard_break`, se guarda como `\n`). Hace falta para la acción y el diálogo multilínea de Fountain.
- **Tab con texto** en tipos que el spec no menciona (personaje, escena, transición, acotación) aplica el mismo ciclo que en vacío.
- **Acotaciones**: el usuario ve y edita los paréntesis; al convertir a acotación se agregan `()` y al salir se quitan.
- **Autodetección** no corre sobre pegados ni cuando el tipo se cambió a mano (para que se pueda forzar "acción" sobre `INT. …`).
- **Autocompletado de personajes**: los sufijos `(V.O.)`, `(O.S.)`, `(CONT.)` aparecen al escribir un nombre conocido seguido de espacio. Si el texto ya coincide exacto con una opción, no se muestra el menú, para que Enter siga funcionando como siempre.

## Paginación
- **Líneas por página**: `round((alto − 2") × 6) + 1` → 55 en Letter, 59 en A4. En A4 se mantienen los márgenes izquierdos de Letter.
- **Corte de línea**: greedy por caracteres; corta en espacios y también **después de un guion entre palabras** (`owner-|and`), igual que el navegador. Así la vista y el PDF coinciden: con *Big Fish* las 122 hojas de la vista miden exactamente 11".
- **Corte por oración**: una línea "termina oración" si acaba en `. ! ? … : ;` (con comillas/paréntesis opcionales) o `--`.
- **Regla 4** (diálogo): además del corte por oración, se permite cortar entre dos elementos de diálogo (antes de una acotación). Nunca después de una acotación ni con el personaje solo.
- **Regla 6** (transición): se lleva a la página siguiente el *bloque anterior entero* (no solo su última línea), y solo si ese bloque empezó en la misma página. Si no, la transición queda arriba de la página.
- **Regla 7** (CONT. automático) se reinicia en cada escena, transición o acto, y solo cuenta si hubo acción/plano/general entre los dos parlamentos.
- **Repaginado** con debounce de 120 ms en el hilo principal (Big Fish tarda ~5 ms; tipear cuesta ~1 ms por pulsación). No hizo falta un Web Worker.
- **Vista paginada**: un único documento ProseMirror; los cortes son *widget decorations* que dibujan el resto de la hoja, el espacio gris, el número de página y (MÁS)/(CONT.). Un corte a mitad de párrafo es un widget en línea con `display:block`.

## Fountain
- `#` (sección de nivel 1) ↔ elemento **Acto**. Las demás secciones y las sinopsis (`=`) se ignoran.
- Centrado `> texto <` y letras `~` se importan como **General**.
- Saltos de página `===` se ignoran (la paginación es automática).
- **Plano** se exporta como acción en mayúsculas (Fountain no tiene plano).
- Claves de portada reconocidas: Title, Credit, Author/Authors, Source, Draft date/Date, Contact.
- Al importar se adivina el idioma (DAY/NIGHT vs DÍA/NOCHE) para usar (MORE)/(CONT'D) o (MÁS)/(CONT.).

## Datos y UI
- **Notas por escena** en `project.notes`, indexadas por el id del encabezado.
- **Preferencias del navegador** (tema, idioma de la interfaz, zoom, paneles, modo) en `localStorage`; los ajustes del guion (página, números de escena, idioma del guion…) van en el proyecto.
- **Zoom** con la propiedad CSS `zoom` (75–150 %).
- **Ícono PWA** en SVG (`sizes: any`).
- Ruta del proyecto abierto en el hash (`#/p/<id>`), para que recargar vuelva al mismo guion.

## Fase 3
- **Tarjetas**: la sinopsis y el color viven como atributos del nodo de escena (`synopsis`, `color`), así viajan con la escena al reordenar y entran en el deshacer. El tablero es una vista más (Páginas / Borrador / Tarjetas); el editor queda montado pero oculto.
- **Sin sinopsis**, la tarjeta muestra como sugerencia las primeras palabras de la escena.
- **Colores**: seis fijos (rojo, naranja, amarillo, verde, azul, violeta). Al importar `.fdx` se elige el más cercano.
- **Diálogo dual**: se marca el *segundo* personaje (`dual: true`, igual que el `^` de Fountain). Su bloque va en la columna derecha y el bloque de diálogo anterior en la izquierda. Columnas: izquierda desde 1.5", derecha desde 4.5"; diálogo de 2.8", personaje a +0.9", acotación a +0.4" con 2.0". El par nunca se parte entre páginas: si no entra, pasa entero a la siguiente.
- En el editor, la columna izquierda es `float: left` y la derecha fluye al lado; el elemento siguiente hace `clear: both`.
- **Numeración bloqueada** (Ajustes): al activarla, cada escena guarda su número actual. Una escena nueva recibe su número apenas se crea (5A, 5B…; antes de la 1 es A1; al final continúa 13, 14…) y lo conserva aunque se mueva. Las escenas borradas dejan el hueco. Al desactivarla se vuelve a la numeración correlativa. Al copiar y pegar una escena, la copia no hereda el número.
- Si un `.fountain` o `.fdx` importado trae números de escena, el proyecto se abre con la numeración bloqueada.
- **Fountain**: `= texto` se guarda como sinopsis de la escena anterior y se exporta igual.
- **FDX**: el acto se exporta como `New Act` (y se importan `New Act`, `Act Break` y `End of Act`). Los tipos desconocidos pasan a Acción. Los estilos de texto (negrita, etc.) se descartan. Para la portada se toman los textos centrados en orden (título, crédito, autor, fuente), el alineado a la izquierda como contacto y el alineado a la derecha como fecha.
- Los tests de `.fdx` corren con jsdom, porque happy-dom no parsea XML.
