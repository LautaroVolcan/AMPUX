import { describe, expect, it } from 'vitest';
import { parseFountain, stripEmphasis } from '../src/formats/fountain/parse';
import { serializeFountain } from '../src/formats/fountain/serialize';

const types = (src: string) => parseFountain(src).elements.map((e) => e.type);

describe('Fountain: title page', () => {
  it('lee claves y valores multilínea', () => {
    const doc = parseFountain('Title: Big Fish\nCredit: written by\nAuthor: John August\nContact:\n    Calle 1\n    Ciudad\n\nINT. CASA - DÍA\n\nAcción.');
    expect(doc.titlePage.title).toBe('Big Fish');
    expect(doc.titlePage.credit).toBe('written by');
    expect(doc.titlePage.author).toBe('John August');
    expect(doc.titlePage.contact).toBe('Calle 1\nCiudad');
    expect(doc.elements[0].type).toBe('scene');
  });
  it('sin title page no consume nada', () => {
    expect(types('INT. CASA - DÍA\n\nAcción.')).toEqual(['scene', 'action']);
  });
});

describe('Fountain: encabezados de escena', () => {
  it.each(['INT. CASA - DÍA', 'EXT. CAMPO - NOCHE', 'INT./EXT. AUTO - DÍA', 'I/E AUTO', 'EST. CIUDAD', 'int. casa'])('%s', (h) => {
    expect(types(`${h}\n\nAcción.`)[0]).toBe('scene');
  });
  it('forzado con punto', () => {
    const el = parseFountain('.FLASHBACK\n\nAcción.').elements[0];
    expect(el).toMatchObject({ type: 'scene', text: 'FLASHBACK' });
  });
  it('dos puntos no fuerzan escena', () => {
    expect(types('...y entonces\n\nAcción.')[0]).toBe('action');
  });
  it('número de escena', () => {
    const el = parseFountain('INT. CASA - DÍA #12A#\n\nAcción.').elements[0];
    expect(el).toMatchObject({ type: 'scene', text: 'INT. CASA - DÍA', sceneNumber: '12A' });
  });
  it('requiere línea en blanco antes', () => {
    expect(types('Algo\nINT. CASA')).toEqual(['action']);
  });
});

describe('Fountain: personajes y diálogo', () => {
  it('personaje, acotación y diálogo', () => {
    const doc = parseFountain('\nJUAN\n(susurrando)\nHola.\nChau.\n');
    expect(doc.elements.map((e) => [e.type, e.text])).toEqual([
      ['character', 'JUAN'],
      ['parenthetical', '(susurrando)'],
      ['dialogue', 'Hola.\nChau.'],
    ]);
  });
  it('extensión en minúscula sigue siendo personaje', () => {
    expect(types("\nJUAN (cont'd)\nHola.")[0]).toBe('character');
  });
  it('forzado con @', () => {
    expect(parseFountain('\n@McCLANE\nYippee.').elements[0]).toMatchObject({ type: 'character', text: 'McCLANE' });
  });
  it('mayúsculas sin línea siguiente no es personaje', () => {
    expect(types('\nBOOM\n\nAlgo.')).toEqual(['action', 'action']);
  });
  it('diálogo dual con ^', () => {
    expect(parseFountain('\nANA ^\nSí.').elements[0]).toMatchObject({ type: 'character', text: 'ANA', dual: true });
  });
  it('dos espacios mantienen el diálogo', () => {
    const doc = parseFountain('\nJUAN\nUno.\n  \nDos.');
    expect(doc.elements[1].text).toBe('Uno.\n\nDos.');
  });
});

describe('Fountain: transiciones, acción y otros', () => {
  it('transición terminada en TO:', () => {
    expect(types('Algo.\n\nCUT TO:\n\nINT. CASA')).toEqual(['action', 'transition', 'scene']);
  });
  it('transición forzada con >', () => {
    expect(parseFountain('\n> FUNDIDO A NEGRO.\n').elements[0]).toMatchObject({ type: 'transition', text: 'FUNDIDO A NEGRO.' });
  });
  it('centrado > <', () => {
    expect(parseFountain('> THE END <').elements[0]).toMatchObject({ type: 'general', text: 'THE END' });
  });
  it('acción forzada con !', () => {
    expect(parseFountain('\n!SCANNING THE AISLES\nalgo').elements[0].type).toBe('action');
  });
  it('acción multilínea se une', () => {
    expect(parseFountain('Línea uno.\nLínea dos.').elements[0].text).toBe('Línea uno.\nLínea dos.');
  });
  it('notas [[ ]] se eliminan', () => {
    expect(parseFountain('Hola [[nota]] mundo.').elements[0].text).toBe('Hola  mundo.');
  });
  it('boneyard /* */ se elimina', () => {
    expect(types('Uno.\n\n/* INT. CASA\n\nnada */\n\nDos.')).toEqual(['action', 'action']);
  });
  it('sección de nivel 1 es acto, sinopsis y otras secciones se ignoran', () => {
    expect(types('# ACTO UNO\n\n## sub\n\n= sinopsis\n\nINT. CASA\n\nX.')).toEqual(['act', 'scene', 'action']);
  });
  it('salto de página === se ignora', () => {
    expect(types('Uno.\n\n===\n\nDos.')).toEqual(['action', 'action']);
  });
  it('letras ~ son general', () => {
    expect(types('~Cantando bajo la lluvia')).toEqual(['general']);
  });
  it('énfasis', () => {
    expect(stripEmphasis('*a* **b** ***c*** _d_ \\*e\\*')).toBe('a b c d *e*');
  });
});

describe('Fountain: ida y vuelta', () => {
  it('serializar y volver a parsear conserva tipos y textos', () => {
    const src = 'Title: Prueba\nAuthor: Yo\n\nINT. CASA - DÍA #1#\n\nJuan entra.\n\nJUAN\n(bajo)\nHola.\n\nCUT TO:\n\n> FUNDIDO A NEGRO.\n\n# ACTO DOS\n\nEXT. CAMPO - NOCHE\n\nFIN.\n';
    const a = parseFountain(src);
    const b = parseFountain(serializeFountain(a.elements, a.titlePage));
    expect(b.elements.map((e) => [e.type, e.text, e.sceneNumber])).toEqual(a.elements.map((e) => [e.type, e.text, e.sceneNumber]));
    expect(b.titlePage).toEqual(a.titlePage);
  });
  it('acción en mayúsculas que parece escena se fuerza', () => {
    const out = serializeFountain([{ id: '1', type: 'action', text: 'INT. no es escena' }]);
    expect(out.startsWith('!')).toBe(true);
  });
});
