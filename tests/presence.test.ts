import { describe, expect, it } from 'vitest';
import { assignColors, CURSOR_COLORS, initials, userColor } from '../src/collab/presence';

describe('Presencia', () => {
  it('dos personas con el mismo color preferido terminan con colores distintos', () => {
    expect(userColor('Lautaro')).toBe(userColor('Amparo'));
    const colors = assignColors([
      { clientId: 10, name: 'Lautaro' },
      { clientId: 20, name: 'Amparo' },
    ]);
    expect(colors.get('Lautaro')).toBe(userColor('Lautaro'));
    expect(colors.get('Amparo')).not.toBe(colors.get('Lautaro'));
  });

  it('todos calculan lo mismo, sin importar el orden en que ven a los demás', () => {
    const users = [
      { clientId: 30, name: 'Lautaro' },
      { clientId: 5, name: 'Amparo' },
      { clientId: 12, name: 'Ana' },
    ];
    const a = assignColors(users);
    const b = assignColors([...users].reverse());
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
    expect(new Set(a.values()).size).toBe(3);
  });

  it('la misma persona con varias pestañas cuenta una vez y no le cambia el color a nadie', () => {
    const colors = assignColors([
      { clientId: 1, name: 'lautaroferrandi' },
      { clientId: 2, name: 'lautaroferrandi' },
      { clientId: 3, name: 'amparoandreoli' },
    ]);
    expect(colors.size).toBe(2);
    expect(colors.get('lautaroferrandi')).toBe(userColor('lautaroferrandi'));
    expect(colors.get('amparoandreoli')).toBe(userColor('amparoandreoli'));
  });

  it('hasta 8 personas, ningún color se repite', () => {
    const users = Array.from({ length: 8 }, (_, i) => ({ clientId: i, name: `persona${i}` }));
    expect(new Set(assignColors(users).values()).size).toBe(CURSOR_COLORS.length);
  });

  it('iniciales', () => {
    expect(initials('amparoandreoli')).toBe('AM');
    expect(initials('Ana López')).toBe('AL');
    expect(initials('lautaro.ferrandi')).toBe('LF');
  });
});
