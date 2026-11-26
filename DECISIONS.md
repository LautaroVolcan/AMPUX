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
- **FDX**: el acto se exporta como `New Act` (y se importan `New Act`, `Act Break` y `End of Act`). Los tipos desconocidos pasan a Acción. Los estilos de texto se importan y exportan desde el 25/11/2026 (ver “Negrita, cursiva y subrayado”). Para la portada se toman los textos centrados en orden (título, crédito, autor, fuente), el alineado a la izquierda como contacto y el alineado a la derecha como fecha.
- Los tests de `.fdx` corren con jsdom, porque happy-dom no parsea XML.

## Fase 4
- **Desglose**: las etiquetas son *marks* de ProseMirror (`tag`, con `excludes: ''` para que se puedan superponer categorías). Así siguen al texto cuando se edita alrededor. En el modelo se guardan como `tags: [{category, from, to}]` sobre el texto del elemento.
- 13 categorías fijas: Elenco, Extras, Utilería, Vestuario, Maquillaje y peluquería, Locación, Escenografía, Vehículos, Animales, Efectos especiales, Efectos visuales, Sonido, Música.
- Las etiquetas solo se ven resaltadas en **modo desglose**, para que la vista normal siga limpia. En ese modo, al seleccionar texto aparece la paleta de categorías y, con el cursor sobre una etiqueta, la opción de quitarla.
- Las etiquetas no se exportan a Fountain ni a FDX (Fountain no las soporta; el `TagData` de FDX queda pendiente). El backup JSON y el historial sí las conservan.
- **Reportes**: el largo de cada escena se mide en octavos de página a partir de las líneas que ocupa en la paginación real (mínimo 1/8). En el reporte de personajes también entra el elenco etiquetado que no habla. El CSV lleva BOM para que Excel abra bien los acentos. El PDF de reportes es una tabla monoespaciada apaisada.
- **Revisiones**: granularidad por *elemento*, no por línea. Si cambia el texto o el tipo de un elemento con el modo revisión activo, el elemento entero queda marcado con el color actual y cada una de sus líneas lleva asterisco. Si se borra un elemento, se marca el que queda en su lugar. Etiquetar, mover escenas, importar y restaurar versiones no marcan.
- Los asteriscos solo se muestran para la revisión *actual*. Las marcas de revisiones anteriores quedan guardadas pero no se ven.
- 10 colores en el orden estándar: Blanco, Azul, Rosa, Amarillo, Verde, Dorado, Beige, Salmón, Cereza, Canela.
- "Exportar páginas cambiadas" genera un PDF solo con las páginas que tienen cambios de la revisión actual, conservando su numeración, con "Rev. Color (fecha)" en el encabezado y sin portada.
- **Versiones**: se guardan en un almacén nuevo de IndexedDB (`snapshots`). La base pasó a la versión 2: la migración solo agrega ese almacén y no toca los proyectos guardados (hay un test de compatibilidad, y se probó en el navegador abriendo una base v1 con datos). Restaurar guarda primero el estado actual como versión ("Antes de restaurar…"), así nunca se pierde nada. Borrar un proyecto borra también sus versiones.
- **Deploy**: GitHub Pages publica el `dist/` que genera un workflow de GitHub Actions (`.github/workflows/deploy.yml`), con `VITE_BASE=/AMPUX/` (desde el 17/10/2026, `VITE_BASE=/`: la app se sirve en `ampux.lautaroferrandi.com`).

## Nube y carpetas
- **Supabase** sin login: la URL y la clave pública (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) se compilan en la app. Todos ven y editan todo. Sin esas variables la app funciona como antes, solo en el navegador. Esquema en `supabase/schema.sql`.
- **Nada se borra de verdad**: no hay política `DELETE`; borrar un guion, carpeta o versión marca `deleted = true` (se recupera desde el panel de Supabase).
- **IndexedDB sigue siendo la copia local** (local-first). Guardar escribe en el navegador y encola la subida (como mucho cada 2 s; al ocultar la pestaña se sube ya). Sin conexión, reintenta cada 15 s y el indicador dice "Guardado en este equipo".
- **Gana la copia más nueva** según `updatedAt`, al listar y al abrir. Si dos personas editan el mismo guion a la vez, gana el último que guarda (no hay fusión).
- **Migración**: al abrir la pantalla de Proyectos, los guiones que solo están en el navegador se suben, salvo los que no tienen texto (se descartan). Las versiones locales se suben una vez por sesión.
- **Carpetas**: un solo nivel, `folderId` opcional en el proyecto (columna `folder_id` en la nube). La base local pasó a la versión 3, que solo agrega el almacén `folders`. Borrar una carpeta pasa sus guiones a la raíz. Se mueve con el menú (Mover a…) o arrastrando la tarjeta a la carpeta o a "Proyectos".

## Resaltador
- Es un *mark* de ProseMirror (`highlight`, se dibuja como `<mark class="hl">`), así sigue al texto al editar alrededor. No es inclusivo: escribir justo después de un tramo resaltado no lo estira.
- En el modelo se guarda como `highlights: [{from, to}]` sobre el texto del elemento, igual que las etiquetas. Es un campo opcional: los guiones viejos no lo tienen y abren igual; no hay cambios en Supabase (va dentro de `data`).
- Un solo color, naranja de resaltador (`--hl`; en oscuro es translúcido para que el texto se siga leyendo).
- **Herramienta**, no formato: con el resaltador prendido, al soltar el mouse se resalta lo seleccionado y el cursor queda al final, para que se vea el color. Si todo lo seleccionado ya estaba resaltado, lo despinta; si estaba a medias, lo completa. El arrastre puede terminar fuera de la hoja.
- Se prende con el botón del marcador o ⌘⇧H, y se apaga igual o con Esc. Si se prende con texto ya seleccionado, lo resalta (sirve para hacerlo con el teclado). No se guarda entre sesiones. Es excluyente con el modo desglose, porque los dos actúan al seleccionar.
- Se deshace con ⌘Z. No cuenta como revisión.
- Es una marca de trabajo: **no se exporta** a PDF, Fountain ni FDX. El backup JSON y el historial de versiones sí lo conservan.
- Si alguien guarda el guion desde una versión vieja de la app (anterior al resaltador), los resaltados se pierden: esa versión no conoce el campo.

## Negrita, cursiva y subrayado
- Tres *marks* de ProseMirror (`bold`, `italic`, `underline`; se dibujan como `<strong>`, `<em>`, `<u>`). En el modelo: `styles: [{style, from, to}]` por elemento, opcional como `tags` y `highlights`. No hay cambios en Supabase.
- ⌘B / ⌘I / ⌘U y los botones B I U de la barra. Funcionan como en un procesador de texto: si toda la selección ya tiene el estilo, lo quita; si no, lo aplica. Sin selección valen para lo que se escriba. Los botones muestran el estado del cursor o de toda la selección.
- Al pegar desde otras apps se respetan `<b>/<strong>`, `<i>/<em>`, `<u>` y los estilos en línea equivalentes (se ignora el `<b style="font-weight:normal">` de Google Docs).
- No cuentan como revisión (no cambian el texto).
- **Paginación**: no cambia. Las cuatro variantes de Courier Prime tienen el mismo ancho (hay un test) y la vista con todo en negrita/cursiva sigue midiendo 11" por hoja.
- **PDF**: cada línea se dibuja por tramos con su variante (Regular, Bold, Italic, BoldItalic) y el subrayado como línea. Solo se descargan e incrustan las variantes que el guion usa. Los bloques de la paginación traen `lineStarts` para ubicar los estilos en cada línea.
- **Fountain**: `*cursiva*`, `**negrita**`, `***ambas***`, `_subrayado_` (combinables: `_**así**_`). Al exportar, `*` y `_` literales se escapan (`\*`, `\_`) y los espacios del borde de un tramo quedan fuera de las marcas, porque Fountain no admite marcas pegadas a un espacio. Por eso, un espacio justo en un cambio de estilo pierde el estilo en la ida y vuelta (p. ej. `***puede*** *ser*`). En las acotaciones los paréntesis quedan fuera del énfasis (`(*así*)`), porque `*(así)*` se leería como diálogo. Un encabezado o transición con énfasis se exporta forzado (`.`, `>`), para que se vuelva a leer igual.
- **FDX**: un `<Text>` por tramo con `Style="Bold+Italic+Underline"`, como Final Draft. Al importar se leen esos tres e ignoran los demás (`AllCaps`, etc.).

## Barra superior
- El título no mueve el centro: izquierda y derecha son `flex: 1 1 0` (reparten el sobrante en partes iguales); la derecha no baja de su contenido y la izquierda se achica, cortando el título con "…". El estado de guardado tiene ancho fijo para que "Guardando…" no haga saltar nada.
- En pantallas medianas se compacta lo accesorio, en este orden: ≤1360 px se ocultan la palabra AMPUX, el texto de "Exportar" y el de "Guardado" (queda el punto, con el texto como *tooltip*); ≤1180 px el zoom y las páginas.

## Login
- **Supabase Auth** con usuario y contraseña. Las contraseñas las guarda Supabase (cifradas, en `auth.users`); AMPUX nunca las ve ni las guarda.
- Supabase pide email: el usuario `lautaro` es `lautaro@lautaroferrandi.com` (dominio propio; como las cuentas se confirman a mano y no hay recuperación por mail, nunca se le escribe a esa dirección). Si alguien escribe un email completo, se usa tal cual. No hay "olvidé mi contraseña": se cambia desde el panel.
- **Cuentas solo a mano** desde el panel; el registro abierto está apagado. Todos los usuarios ven y editan todo (como antes del login).
- Reglas: `leer`, `crear` y `editar` pasan de `anon, authenticated` a solo `authenticated` (`supabase/login.sql`). Sigue sin haber `DELETE`. Sin sesión, la clave pública ya no alcanza para ver nada.
- Sin Supabase configurado (desarrollo local) no hay login y la app es solo local, como antes.
- **Local-first con login**: la sesión se guarda en el navegador (`localStorage`, clave `ampux.auth`). Si hay una sesión guardada se entra enseguida, aunque no haya conexión o el token esté vencido; se trabaja contra la copia local y, al volver la red, Supabase renueva el token solo (después de un intento fallido espera hasta ~1 min, por su propio *cooldown*) y se sube lo pendiente. Solo se vuelve al login si la sesión deja de estar guardada: se tocó "Salir" o Supabase la invalidó (cuenta borrada, contraseña cambiada).
- "Salir" sube lo pendiente y cierra la sesión de este navegador. La copia local de los guiones queda (todos los usuarios ven todo de todas formas).
- Probado con un Supabase simulado en Playwright: entrar, contraseña incorrecta, recargar, salir, sin conexión con el token vencido, reconexión (renueva y sube) y sesión invalidada (vuelve al login).

## Tiempo real (prototipo, etapa 1)
- **Yjs + y-prosemirror.** El guion de cada proyecto vive en un `Y.Doc` (fragmento `script`) que se mezcla entre navegadores sin perder cambios. Nodos, atributos (ids, números de escena, revisión) y marcas (estilos, resaltado, etiquetas superpuestas) viajan tal cual.
- **Transporte**: un canal privado de Supabase Realtime por guion (`ampux:project:<id>`, *broadcast*). Las reglas de `realtime.messages` dejan entrar solo a usuarios con sesión (`supabase/realtime.sql`); además hay que apagar "Allow public access" en Realtime → Settings. Mensajes: `u` (cambios, agrupados cada 60 ms por el límite de 100 mensajes/s del plan gratis), `s1`/`s2` (al conectar, cada uno manda lo que le falta al otro) y `a` (presencia: nombre, color, cursor).
- **Estado guardado**: tabla `project_docs` (estado de Yjs en base64). Se guarda cada 3 s mientras hay cambios, mezclando antes con lo guardado (así no se pisa nada que no llegó por el canal). Si un guion todavía no tiene estado, lo crea el primero que lo abre con `insert … on conflict do nothing` y todos se quedan con el guardado: si cada uno armara el suyo desde el JSON, al mezclarlos el texto saldría duplicado.
- **El JSON de `projects` sigue igual** (lista, versiones, exports, versiones viejas de la app). Cada navegador lo sigue guardando; en vivo se marca con `liveSavedAt`. Al abrir, si el JSON se editó **fuera** del tiempo real (`liveSavedAt !== updatedAt`: sin conexión o con una versión vieja) y es más nuevo que el estado compartido, se aplica al documento como una edición más. No se comparan relojes de distintas computadoras para los guardados en vivo.
- **Plugins**: ids automáticos, `INT.` → escena y modo revisión ignoran los cambios remotos (los marca y-prosemirror). Si no, los dos navegadores harían la misma conversión y se duplicarían elementos. Cada uno marca sus propias revisiones.
- **⌘Z** pasa a ser el de Yjs: deshace solo lo propio. Sin tiempo real se sigue usando el historial de ProseMirror.
- **Cursores de otros**: línea y nombre con un color por usuario (8 colores que no se confunden con el resaltador). Ocupan ancho y alto cero: no corren el texto ni la paginación (probado: las hojas siguen midiendo 11").
- **Sin Supabase, sin sesión o sin conexión al abrir**: el editor funciona como siempre, solo con la copia local.
- **Modo de prueba sin Supabase**: `?collab=local&name=Nombre` une las pestañas del mismo navegador (BroadcastChannel + localStorage).
- **Pendiente (etapas 2 y 3)**: título, portada, ajustes y notas siguen con "gana el último que guarda"; offline real (hoy, editar sin conexión y volver aplica tu versión encima, y puede borrar lo que otro escribió mientras tanto; la solución es `y-indexeddb`); cambios de más de ~180 KB de una vez (pegar un guion entero) no viajan en vivo, los demás los ven al reabrir; dos usuarios pueden tocar el mismo color; indicador de quién está conectado.
