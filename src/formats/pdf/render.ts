import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Project, TitlePage } from '../../types';
import { paginate } from '../../pagination/paginate';
import { METRICS, pageGeometry } from '../../pagination/metrics';
import { dualMetrics } from '../../pagination/dual';

const PT = 72; // puntos por pulgada
const LINE = PT / 6; // 12 pt
const SIZE = 12;
const BASELINE = 9.2; // desde el tope de la línea hasta la línea base

let fontCache: Promise<ArrayBuffer> | null = null;
export function loadFont(): Promise<ArrayBuffer> {
  fontCache ??= fetch(`${import.meta.env.BASE_URL}fonts/CourierPrime-Regular.ttf`).then((r) => {
    if (!r.ok) throw new Error('No se pudo cargar Courier Prime');
    return r.arrayBuffer();
  });
  return fontCache;
}

export interface PdfOptions {
  titlePage: boolean;
  /** Bytes de la fuente (para tests); si no, se descarga de /fonts. */
  fontBytes?: ArrayBuffer | Uint8Array;
  /** Solo las páginas con cambios de la revisión actual. */
  onlyRevised?: boolean;
  /** Encabezado de las páginas revisadas, p. ej. "Azul (13/10/2026)". */
  revisionLabel?: string;
}

/** ¿El elemento fue modificado en la revisión actual? */
export function isRevised(project: Project, index: number): boolean {
  const el = project.elements[index];
  return !!el?.revision && el.revision === project.settings.revisionColor;
}

/** Números de las páginas que tienen cambios de la revisión actual. */
export function revisedPages(project: Project): number[] {
  return paginate(project.elements, project.settings)
    .pages.filter((pg) => pg.blocks.some((b) => b.elementIndex >= 0 && isRevised(project, b.elementIndex)))
    .map((pg) => pg.number);
}

export async function renderPDF(project: Project, opts: PdfOptions): Promise<Uint8Array> {
  const settings = project.settings;
  const geo = pageGeometry(settings.pageSize);
  const W = geo.width * PT;
  const H = geo.height * PT;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(project.titlePage.title || project.title);
  if (project.titlePage.author) pdf.setAuthor(project.titlePage.author);
  pdf.setCreator('AMPUX');
  const font = await pdf.embedFont(opts.fontBytes ?? (await loadFont()), { subset: true });
  const ink = rgb(0, 0, 0);

  const text = (page: PDFPage, s: string, x: number, lineTop: number) => {
    page.drawText(s, { x, y: H - lineTop - BASELINE, size: SIZE, font, color: ink });
  };
  const width = (s: string) => font.widthOfTextAtSize(s, SIZE);

  if (opts.titlePage && !opts.onlyRevised) drawTitlePage(pdf.addPage([W, H]), project.titlePage, font, W, H);

  const { pages } = paginate(project.elements, settings);
  for (const pg of pages) {
    const changed = pg.blocks.some((b) => b.elementIndex >= 0 && isRevised(project, b.elementIndex));
    if (opts.onlyRevised && !changed) continue;
    const page = pdf.addPage([W, H]);
    const num = pg.number > 1 ? `${pg.number}.` : '';
    if (num) text(page, num, geo.rightEdge * PT - width(num), 0.5 * PT);
    if (changed && opts.revisionLabel) {
      const label = opts.revisionLabel;
      const right = geo.rightEdge * PT - (num ? width(num) + 0.3 * PT : 0);
      text(page, label, right - width(label), 0.5 * PT);
    }
    for (const block of pg.blocks) {
      const m = block.synthetic ? METRICS.character : block.dual ? dualMetrics(block.dual, block.type) : METRICS[block.type];
      block.lines.forEach((s, i) => {
        const top = geo.top * PT + (block.line + i) * LINE;
        let x = m.left * PT;
        if (!block.synthetic && m.align === 'right') x = geo.rightEdge * PT - width(s);
        if (!block.synthetic && m.align === 'center') x = (m.left + m.width / 2) * PT - width(s) / 2;
        text(page, s, x, top);
        if (block.type === 'act' && !block.synthetic) {
          const y = H - top - BASELINE - 1.5;
          page.drawLine({ start: { x, y }, end: { x: x + width(s), y }, thickness: 0.6, color: ink });
        }
        if (block.elementIndex >= 0 && isRevised(project, block.elementIndex)) text(page, '*', 7.9 * PT, top);
        if (i === 0 && block.sceneNumber && block.startOffset === 0 && settings.sceneNumbers !== 'none') {
          text(page, block.sceneNumber, 1.2 * PT - width(block.sceneNumber), top);
          if (settings.sceneNumbers === 'both') text(page, block.sceneNumber, (geo.rightEdge + 0.1) * PT, top);
        }
      });
    }
  }
  return pdf.save();
}

function drawTitlePage(page: PDFPage, tp: TitlePage, font: PDFFont, W: number, H: number) {
  const ink = rgb(0, 0, 0);
  const width = (s: string) => font.widthOfTextAtSize(s, SIZE);
  const centered = (s: string, line: number, underline = false) => {
    const x = W / 2 - width(s) / 2;
    const y = H - PT - line * LINE - BASELINE;
    page.drawText(s, { x, y, size: SIZE, font, color: ink });
    if (underline) page.drawLine({ start: { x, y: y - 1.5 }, end: { x: x + width(s), y: y - 1.5 }, thickness: 0.6, color: ink });
  };
  let line = 20;
  for (const l of (tp.title || '').toLocaleUpperCase().split('\n')) centered(l, line++, true);
  line += 3;
  if (tp.credit) centered(tp.credit, line++);
  line += 1;
  for (const l of (tp.author || '').split('\n')) if (l) centered(l, line++);
  if (tp.source) {
    line += 3;
    for (const l of tp.source.split('\n')) centered(l, line++);
  }
  // Abajo: contacto a la izquierda, fecha a la derecha.
  const bottom = Math.round((H / PT - 2) * 6);
  const contact = (tp.contact || '').split('\n').filter(Boolean);
  contact.forEach((l, i) => {
    page.drawText(l, { x: 1.5 * PT, y: H - PT - (bottom - contact.length + i) * LINE - BASELINE, size: SIZE, font, color: ink });
  });
  if (tp.draftDate) {
    page.drawText(tp.draftDate, { x: 7.5 * PT - width(tp.draftDate), y: H - PT - (bottom - 1) * LINE - BASELINE, size: SIZE, font, color: ink });
  }
}

export function download(data: BlobPart, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
