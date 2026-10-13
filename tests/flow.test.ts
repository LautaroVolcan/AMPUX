import { describe, expect, it } from 'vitest';
import { ENTER_FLOW, TAB_FLOW, shiftTabTarget } from '../src/editor/flow';

describe('Tablas de flujo', () => {
  it('Enter', () => {
    expect(ENTER_FLOW).toMatchObject({
      scene: 'action', action: 'action', character: 'dialogue', parenthetical: 'dialogue',
      dialogue: 'action', transition: 'scene', shot: 'action', act: 'scene',
    });
  });
  it('Tab en vacío', () => {
    expect(TAB_FLOW).toEqual({
      action: 'character', character: 'transition', transition: 'scene', scene: 'action',
      dialogue: 'parenthetical', parenthetical: 'dialogue',
    });
  });
  it('Shift+Tab recorre al revés', () => {
    expect(shiftTabTarget('character')).toBe('action');
    expect(shiftTabTarget('action')).toBe('scene');
    expect(shiftTabTarget('scene')).toBe('transition');
    expect(shiftTabTarget('transition')).toBe('character');
    expect(shiftTabTarget('parenthetical')).toBe('dialogue');
  });
});
