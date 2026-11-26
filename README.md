# AMPUX

**App publicada:** https://ampux.lautaroferrandi.com/ (cada push a `main` corre los tests, compila y publica con GitHub Actions).

Editor de guiones con formato estándar de la industria. Escribís y el editor formatea solo cada elemento (escena, acción, personaje, diálogo…), con Tab/Enter para pasar de uno a otro. Funciona en el navegador, guarda todo localmente (IndexedDB) y se puede instalar como app (PWA).

## Empezar

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests de Fountain, paginación y flujo Tab/Enter
npm run build    # build de producción en dist/
```

### Nube (Supabase)

1. Crear un proyecto en supabase.com y correr `supabase/schema.sql` en el SQL Editor.
2. Local: copiar `.env.example` como `.env.local` y completar URL y clave pública (Project Settings → API).
3. Publicada: cargar las mismas dos como *variables* del repo (`SUPABASE_URL`, `SUPABASE_ANON_KEY`); el workflow las usa al compilar.

Sin esas variables la app guarda solo en el navegador y no pide login.

### Cuentas (login)

Con Supabase configurado, AMPUX pide **usuario y contraseña**. Todos los usuarios ven y editan todos los guiones.

- Las cuentas se crean a mano en el panel de Supabase: **Authentication → Users → Add user → Create new user**, con email `usuario@lautaroferrandi.com` (el usuario es lo que va antes de la `@`), una contraseña y **Auto Confirm User** marcado.
- El registro abierto tiene que estar apagado (**Authentication → Sign In / Providers → Allow new users to sign up**).
- Para cambiar una contraseña olvidada: mismo panel, en el usuario.
- Las reglas que exigen sesión están en `supabase/login.sql` (y en `schema.sql` para proyectos nuevos).

### Tiempo real

Dos o más personas pueden editar el mismo guion a la vez y ven los cursores de los demás. Título, portada, ajustes y notas también se comparten. Sin conexión se sigue editando con una copia en el navegador y, al volver, los cambios se mezclan con los de los demás. Necesita correr `supabase/realtime.sql` y apagar **Realtime → Settings → Allow public access**.

Para probarlo en local sin Supabase: abrir dos pestañas con `http://localhost:5173/?collab=local&name=Ana` y `…&name=Beto`, y el mismo guion.

## Cómo se escribe

| Tecla | Qué hace |
|---|---|
| Enter | Pasa al siguiente elemento lógico (escena → acción, personaje → diálogo…). En un elemento vacío abre el menú de tipos. |
| Tab / Shift+Tab | Cambia el tipo del elemento (acción → personaje → transición → escena). En un diálogo con texto inserta una acotación. |
| ⌘1 … ⌘8 | Escena, Acción, Personaje, Acotación, Diálogo, Transición, Plano, General |
| Shift+Enter | Salto de línea dentro del mismo elemento |
| ⌘D | Diálogo dual (pone el personaje al lado del anterior) |
| ⌘S / ⌘F / ⌘Z | Guardar, buscar y reemplazar, deshacer |
| ⌘B / ⌘I / ⌘U | Negrita, cursiva y subrayado (también con los botones B I U de la barra). Salen en el PDF, Fountain y FDX. |
| ⌘⇧H | Resaltador: con la herramienta prendida, lo que se selecciona queda resaltado en naranja (pasar de nuevo lo despinta). Esc la apaga. |

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
- **Pulido con uso real**: resaltador (botón del marcador en la barra superior, ⌘⇧H); negrita, cursiva y subrayado; la barra superior ya no se corre al escribir el título; login con usuario y contraseña; edición en tiempo real (prototipo).

Fuente: [Courier Prime](https://github.com/quoteunquoteapps/CourierPrime) (SIL Open Font License).
