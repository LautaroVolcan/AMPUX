import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Table } from './reports';

/** Reporte en PDF: tabla monoespaciada, apaisada, con encabezado repetido en cada página. */
export async function tableToPDF(table: Table, subtitle: string, fontBytes: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const W = 792;
  const H = 612;
  const margin = 40;
  const size = 9;
  const line = 12;
  const charW = font.widthOfTextAtSize('M', size);
  const maxChars = Math.floor((W - margin * 2) / charW);

  // Ancho de cada columna proporcional al contenido, con tope.
  const natural = table.columns.map((c, i) => Math.max(c.length, ...table.rows.map((r) => (r[i] ?? '').length), 3));
  const capped = natural.map((n) => Math.min(n, 48));
  const gap = 2;
  const total = capped.reduce((a, b) => a + b, 0) + gap * (capped.length - 1);
  const widths = capped.map((n) => Math.max(3, Math.floor((n * Math.min(maxChars, total)) / total)));

  const wrap = (text: string, width: number): string[] => {
    const out: string[] = [];
    for (const para of (text || '').split('\n')) {
      let rest = para;
      while (rest.length > width) {
        let cut = rest.lastIndexOf(' ', width);
        if (cut <= 0) cut = width;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut).trimStart();
      }
      out.push(rest);
    }
    return out;
  };

  let page = pdf.addPage([W, H]);
  let y = H - margin;
  let pageNo = 1;
  const draw = (text: string, x: number, color = rgb(0, 0, 0)) => page.drawText(text, { x, y, size, font, color });
  const header = () => {
    page.drawText(table.title, { x: margin, y, size: 12, font });
    page.drawText(`${subtitle}   ${pageNo}`, { x: W - margin - font.widthOfTextAtSize(`${subtitle}   ${pageNo}`, size), y, size, font, color: rgb(0.4, 0.4, 0.4) });
    y -= line * 2;
    let x = margin;
    table.columns.forEach((c, i) => {
      draw(c.toLocaleUpperCase().slice(0, widths[i]), x, rgb(0.35, 0.35, 0.35));
      x += (widths[i] + gap) * charW;
    });
    y -= 4;
    page.drawLine({ start: { x: margin, y }, end: { x: W - margin, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
    y -= line;
  };
  header();

  for (const row of table.rows) {
    const cells = row.map((v, i) => wrap(v ?? '', widths[i]));
    const height = Math.max(...cells.map((c) => c.length));
    if (y - height * line < margin) {
      page = pdf.addPage([W, H]);
      pageNo++;
      y = H - margin;
      header();
    }
    for (let l = 0; l < height; l++) {
      let x = margin;
      cells.forEach((c, i) => {
        if (c[l]) draw(c[l], x);
        x += (widths[i] + gap) * charW;
      });
      y -= line;
    }
    y -= 3;
  }
  return pdf.save();
}
