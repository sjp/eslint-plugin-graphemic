import { describe, expect, it } from 'vitest';

import { FUNCTIONS, hasFunction, inRoot, ROOT, SUBPATHS } from './graphemic.js';

describe('FUNCTIONS', () => {
  // Copied from graphemic's src/*.ts. A change here is a change to what every
  // rule can suggest, so it has to be made on purpose, in both places.
  it('matches the functions graphemic exports', () => {
    expect(FUNCTIONS).toStrictEqual({
      graphemes: [
        'length',
        'iterate',
        'toArray',
        'at',
        'slice',
        'truncate',
        'split',
        'chunk',
        'reverse',
        'padStart',
        'padEnd',
        'indexOf',
        'includes',
      ],
      codePoints: ['length', 'iterate', 'toArray', 'at', 'slice', 'truncate'],
      codeUnits: ['length', 'slice', 'truncate'],
      utf8: ['length', 'slice', 'truncate'],
      columns: ['length', 'slice', 'truncate', 'padStart', 'padEnd'],
    });
  });
});

describe('SUBPATHS', () => {
  it("matches graphemic's exports map", () => {
    expect(ROOT).toBe('@sjpnz/graphemic');
    expect(SUBPATHS).toStrictEqual({
      graphemes: '@sjpnz/graphemic/graphemes',
      codePoints: '@sjpnz/graphemic/code-points',
      codeUnits: '@sjpnz/graphemic/code-units',
      utf8: '@sjpnz/graphemic/utf8',
      columns: '@sjpnz/graphemic/columns',
    });
  });
});

describe('inRoot', () => {
  it('is every unit but columns', () => {
    expect(Object.keys(SUBPATHS).filter((unit) => inRoot(unit as keyof typeof SUBPATHS))).toEqual([
      'graphemes',
      'codePoints',
      'codeUnits',
      'utf8',
    ]);
  });
});

describe('hasFunction', () => {
  it('answers from the table', () => {
    expect(hasFunction('graphemes', 'reverse')).toBe(true);
    expect(hasFunction('columns', 'padEnd')).toBe(true);
    expect(hasFunction('utf8', 'reverse')).toBe(false);
    expect(hasFunction('codeUnits', 'at')).toBe(false);
  });
});
