// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EditorState, TextSelection } from 'prosemirror-state';
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { docToElements, elementsToDoc } from '../src/editor/schema';
import { activeStyles, toggleStyle } from '../src/editor/textStyles';
import { parseEmphasis, serializeEmphasis } from '../src/formats/fountain/emphasis';
import { parseFountain, stripEmphasis } from '../src/formats/fountain/parse';
import { serializeFountain } from '../src/formats/fountain/serialize';
import { parseFDX, serializeFDX } from '../src/formats/fdx/fdx';
import { renderPDF } from '../src/formats/pdf/render';
import { paginate } from '../src/pagination/paginate';
import { displayCase } from '../src/pagination/metrics';
import { DEFAULT_SETTINGS, newProject, type ElementType, type ScriptElement, type StyleRange, type TextStyle } from '../src/types';

let n = 0;
const el = (type: ElementType, text: string, extra: Partial<ScriptElement> = {}): ScriptElement => ({ id: `s${n++}`, type, text, ...extra });
const sortStyles = (s: StyleRange[] = []) => [...s].sort((a, b) => a.from - b.from || a.style.localeCompare(b.style));
/** Lo que interesa comparar de un elemento después de ida y vuelta por un formato. */
const shape = (e: ScriptElement) => ({ type: e.type, text: e.text, styles: sortStyles(e.styles) });
const font = (f: string) => new Uint8Array(readFileSync(`public/fonts/${f}`));

describe('Negrita, cursiva y subrayado en el editor', () => {
  it('ida y vuelta por el documento, superpuestos con resaltado, etiquetas y saltos de línea', () => {
    const els = [
      el('action', 'Ana toma el revólver.\nSuena un disparo.', {
        styles: [
          { style: 'bold', from: 0, to: 3 },
          { style: 'italic', from: 4, to: 30 },
          { style: 'underline', from: 12, to: 20 },
        ],
        tags: [{ category: 'props', from: 13, to: 20 }],
        highlights: [{ from: 0, to: 8 }],
      }),
    ];
    const back = docToElements(elementsToDoc(els))[0];
    expect(back.text).toBe(els[0].text);
    expect(sortStyles(back.styles)).toEqual(sortStyles(els[0].styles));
    expect(back.tags).toEqual(els[0].tags);
    expect(back.highlights).toEqual(els[0].highlights);
  });

  it('⌘B aplica si falta en parte de la selección y quita si está en toda', () => {
    let s = EditorState.create({ doc: elementsToDoc([el('action', 'Una casa vieja.', { styles: [{ style: 'bold', from: 4, to: 8 }] })]) });
    s = s.apply(s.tr.setSelection(TextSelection.create(s.doc, 1, 15)));
    expect(activeStyles(s).bold).toBe(false);
    toggleStyle('bold')(s, (tr) => (s = s.apply(tr)));
    expect(docToElements(s.doc)[0].styles).toEqual([{ style: 'bold', from: 0, to: 14 }]);
    expect(activeStyles(s).bold).toBe(true);
    toggleStyle('bold')(s, (tr) => (s = s.apply(tr)));
    expect(docToElements(s.doc)[0].styles).toBeUndefined();
  });

  it('sin selección vale para lo que se escriba', () => {
    let s = EditorState.create({ doc: elementsToDoc([el('action', 'Hola ')]) });
    s = s.apply(s.tr.setSelection(TextSelection.create(s.doc, 6)));
    toggleStyle('italic')(s, (tr) => (s = s.apply(tr)));
    expect(activeStyles(s).italic).toBe(true);
    s = s.apply(s.tr.insertText('mundo'));
    expect(docToElements(s.doc)[0].styles).toEqual([{ style: 'italic', from: 5, to: 10 }]);
  });
});

describe('Fountain', () => {
  it('lee *cursiva*, **negrita**, ***ambas***, _subrayado_ y escapes', () => {
    const r = parseEmphasis('Ana **grita**, *susurra* y ***corre***: _ya_. \\*literal\\* y \\_esto\\_');
    expect(r.text).toBe('Ana grita, susurra y corre: ya. *literal* y _esto_');
    const at = (w: string) => r.text.indexOf(w);
    expect(sortStyles(r.styles)).toEqual(
      sortStyles([
        { style: 'bold', from: at('grita'), to: at('grita') + 5 },
        { style: 'italic', from: at('susurra'), to: at('susurra') + 7 },
        { style: 'bold', from: at('corre'), to: at('corre') + 5 },
        { style: 'italic', from: at('corre'), to: at('corre') + 5 },
        { style: 'underline', from: at('ya'), to: at('ya') + 2 },
      ]),
    );
  });

  it('combina subrayado con negrita en cualquier orden', () => {
    for (const src of ['_**así**_', '**_así_**']) {
      const r = parseEmphasis(src);
      expect(r.text).toBe('así');
      expect(sortStyles(r.styles).map((x) => x.style)).toEqual(['bold', 'underline']);
    }
  });

  it('el texto que queda es el mismo que antes (solo se suman los estilos)', () => {
    for (const s of ['*a* **b** ***c*** _d_ \\*e\\*', 'sin marcas', '2 * 3 = 6', 'mi_archivo_final', '**a*', 'x *y']) {
      expect(parseEmphasis(s).text).toBe(stripEmphasis(s));
    }
  });

  it('los estilos de acciones de varias líneas quedan en su lugar', () => {
    const { elements } = parseFountain('INT. CASA - DÍA\n\nAna entra.\nDeja **todo** sobre la mesa.\n');
    const action = elements[1];
    expect(action.text).toBe('Ana entra.\nDeja todo sobre la mesa.');
    expect(action.styles).toEqual([{ style: 'bold', from: action.text.indexOf('todo'), to: action.text.indexOf('todo') + 4 }]);
  });

  it('los espacios de los bordes quedan fuera de las marcas', () => {
    expect(serializeEmphasis('a dos b', [{ style: 'bold', from: 1, to: 6 }])).toBe('a **dos** b');
    // Fountain no puede marcar un espacio en el borde de un cambio de estilo: ese espacio pierde el estilo.
    expect(serializeEmphasis('puede ser', [{ style: 'bold', from: 0, to: 5 }, { style: 'italic', from: 0, to: 9 }])).toBe('***puede*** *ser*');
  });

  it('ida y vuelta con todos los tipos de elemento', () => {
    const els = [
      el('scene', 'INT. CASA - DÍA', { styles: [{ style: 'bold', from: 0, to: 15 }] }),
      el('action', 'Ana entra. Deja *algo* sobre la mesa.\nSuena el teléfono.', { styles: [{ style: 'underline', from: 0, to: 3 }, { style: 'italic', from: 38, to: 56 }] }),
      el('character', 'ANA', { styles: [{ style: 'bold', from: 0, to: 3 }] }),
      el('parenthetical', '(en voz baja)', { styles: [{ style: 'italic', from: 0, to: 13 }] }),
      el('dialogue', 'No puede ser.\nNo ahora.', { styles: [{ style: 'bold', from: 3, to: 8 }, { style: 'italic', from: 3, to: 8 }, { style: 'underline', from: 17, to: 22 }] }),
      el('transition', 'CORTE A:', { styles: [{ style: 'italic', from: 0, to: 8 }] }),
      el('scene', 'EXT. CALLE - NOCHE'),
      el('action', 'Llueve 2 * 3 veces_más.'),
    ];
    const back = parseFountain(serializeFountain(els)).elements;
    // Los paréntesis de la acotación quedan sin estilo, a propósito.
    const expected = els.map(shape);
    expected[3].styles = [{ style: 'italic', from: 1, to: 12 }];
    // En la fuente el "*algo*" literal se escapa y vuelve igual.
    expect(back.map(shape)).toEqual(expected);
  });
});

describe('Final Draft (.fdx)', () => {
  it('ida y vuelta con estilos', () => {
    const els = [
      el('scene', 'INT. CASA - DÍA'),
      el('action', 'Ana toma el revólver.', { styles: [{ style: 'bold', from: 0, to: 3 }, { style: 'italic', from: 0, to: 8 }, { style: 'underline', from: 12, to: 20 }] }),
    ];
    const xml = serializeFDX(els);
    expect(xml).toContain('<Text Style="Bold+Italic">Ana</Text>');
    expect(parseFDX(xml).elements.map(shape)).toEqual(els.map(shape));
  });

  it('lee el Style de Final Draft', () => {
    const xml = `<?xml version="1.0"?><FinalDraft DocumentType="Script" Version="5"><Content>
      <Paragraph Type="Action"><Text>Ana </Text><Text Style="Bold+Underline+AllCaps">grita</Text><Text>.</Text></Paragraph>
    </Content></FinalDraft>`;
    const [a] = parseFDX(xml).elements;
    expect(a.text).toBe('Ana grita.');
    expect(sortStyles(a.styles)).toEqual([{ style: 'bold', from: 4, to: 9 }, { style: 'underline', from: 4, to: 9 }]);
  });
});

describe('PDF', () => {
  it('las cuatro variantes de Courier Prime tienen el mismo ancho (la paginación no cambia)', async () => {
    const widths = await Promise.all(
      ['Regular', 'Bold', 'Italic', 'BoldItalic'].map(async (v) => {
        const doc = await PDFDocument.create();
        doc.registerFontkit(fontkit);
        const f = await doc.embedFont(font(`CourierPrime-${v}.ttf`));
        return f.widthOfTextAtSize('Mmi.,WÁñ ', 12);
      }),
    );
    expect(new Set(widths).size).toBe(1);
  });

  it('los bloques saben dónde empieza cada línea', () => {
    const els = [el('scene', 'INT. CASA'), el('action', 'palabra '.repeat(40).trim())];
    const { pages } = paginate(els, DEFAULT_SETTINGS);
    for (const b of pages[0].blocks) {
      const text = displayCase(b.type, els[b.elementIndex].text);
      b.lines.forEach((l, i) => expect(text.slice(b.lineStarts![i], b.lineStarts![i] + l.length)).toBe(l));
    }
  });

  const fontNames = async (bytes: Uint8Array) => {
    const doc = await PDFDocument.load(bytes);
    const names: string[] = [];
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
      if (obj instanceof PDFDict && obj.get(PDFName.of('Type')) === PDFName.of('Font') && obj.get(PDFName.of('Subtype')) === PDFName.of('Type0')) {
        // "/ABCDEF+CourierPrime-Bold-2000" → "Bold"
        names.push(/CourierPrime-([A-Za-z]+)/.exec(String(obj.get(PDFName.of('BaseFont'))))![1]);
      }
    }
    return names.sort();
  };
  const project = (styles: TextStyle[]) => {
    const p = newProject('Prueba');
    p.elements = [el('scene', 'INT. CASA'), el('action', 'Ana grita.', { styles: styles.map((style) => ({ style, from: 4, to: 9 })) })];
    return p;
  };
  const opts = {
    titlePage: false,
    fontBytes: font('CourierPrime-Regular.ttf'),
    styleFontBytes: { bold: font('CourierPrime-Bold.ttf'), italic: font('CourierPrime-Italic.ttf'), boldItalic: font('CourierPrime-BoldItalic.ttf') },
  };

  it('incrusta solo las variantes que se usan', async () => {
    expect(await fontNames(await renderPDF(project([]), opts))).toEqual(['Regular']);
    expect(await fontNames(await renderPDF(project(['bold', 'italic']), opts))).toEqual(['BoldItalic', 'Regular']);
    expect(await fontNames(await renderPDF(project(['italic', 'underline']), opts))).toEqual(['Italic', 'Regular']);
  });
});
