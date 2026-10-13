// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseFDX, serializeFDX } from '../src/formats/fdx/fdx';
import type { ScriptElement } from '../src/types';

const sample = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
    <Paragraph Type="Scene Heading" Number="12A">
      <SceneProperties Length="1" Page="1" Title="" Color="#9C9CC3C3E5E5">
        <Summary><Paragraph><Text>Se conocen.</Text></Paragraph></Summary>
      </SceneProperties>
      <Text>INT. BAR - NOCHE</Text>
    </Paragraph>
    <Paragraph Type="Action"><Text Style="Bold">Ana </Text><Text>entra.</Text></Paragraph>
    <Paragraph>
      <DualDialogue>
        <Paragraph Type="Character"><Text>ANA</Text></Paragraph>
        <Paragraph Type="Dialogue"><Text>Hola.</Text></Paragraph>
        <Paragraph Type="Character"><Text>JUAN</Text></Paragraph>
        <Paragraph Type="Dialogue"><Text>Hola.</Text></Paragraph>
      </DualDialogue>
    </Paragraph>
    <Paragraph Type="Transition"><Text>CORTE A:</Text></Paragraph>
    <Paragraph Type="New Act"><Text>ACTO DOS</Text></Paragraph>
    <Paragraph Type="Something Custom"><Text>raro</Text></Paragraph>
  </Content>
  <TitlePage><Content>
    <Paragraph Alignment="Center"><Text>EL BAR</Text></Paragraph>
    <Paragraph Alignment="Center"><Text></Text></Paragraph>
    <Paragraph Alignment="Center"><Text>Escrito por</Text></Paragraph>
    <Paragraph Alignment="Center"><Text>Lau</Text></Paragraph>
    <Paragraph Alignment="Right"><Text>Octubre 2026</Text></Paragraph>
    <Paragraph Alignment="Left"><Text>mail@ejemplo.com</Text></Paragraph>
  </Content></TitlePage>
</FinalDraft>`;

describe('Final Draft (.fdx)', () => {
  it('importa tipos, texto con varios estilos, número, sinopsis y color', () => {
    const doc = parseFDX(sample);
    expect(doc.elements.map((e) => [e.type, e.text])).toEqual([
      ['scene', 'INT. BAR - NOCHE'],
      ['action', 'Ana entra.'],
      ['character', 'ANA'],
      ['dialogue', 'Hola.'],
      ['character', 'JUAN'],
      ['dialogue', 'Hola.'],
      ['transition', 'CORTE A:'],
      ['act', 'ACTO DOS'],
      ['action', 'raro'],
    ]);
    expect(doc.elements[0]).toMatchObject({ sceneNumber: '12A', synopsis: 'Se conocen.', color: 'blue' });
    expect(doc.elements[4].dual).toBe(true);
    expect(doc.elements[2].dual).toBeUndefined();
  });
  it('importa la portada', () => {
    expect(parseFDX(sample).titlePage).toEqual({ title: 'EL BAR', credit: 'Escrito por', author: 'Lau', draftDate: 'Octubre 2026', contact: 'mail@ejemplo.com' });
  });
  it('rechaza archivos que no son Final Draft', () => {
    expect(() => parseFDX('<html></html>')).toThrow();
  });
  it('ida y vuelta conserva todo', () => {
    const doc = parseFDX(sample);
    const again = parseFDX(serializeFDX(doc.elements, doc.titlePage));
    const strip = (els: ScriptElement[]) => els.map(({ id: _id, ...rest }) => rest);
    expect(strip(again.elements)).toEqual(strip(doc.elements));
    expect(again.titlePage).toEqual(doc.titlePage);
  });
  it('escapa caracteres XML', () => {
    const xml = serializeFDX([{ id: '1', type: 'action', text: 'A & B <c> "d"' }]);
    expect(parseFDX(xml).elements[0].text).toBe('A & B <c> "d"');
  });
});
