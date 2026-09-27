import { describe, expect, it } from 'vitest';

import { Fixture, oxlintConfig, oxlintrc } from './harness.js';

// The same code twice, once as JavaScript and once with the annotations
// TypeScript would have. Without type information the rules only know a
// string when the syntax says so, and annotations are syntax.
const JS = `const greeting = 'hi \u{1F44B}\u{1F3FD}';
export const size = greeting.length;
export const first = greeting[0];
export const chars = greeting.split('');
export function measure(s) {
  return s.length;
}
export function initial(s) {
  return s.charAt(0);
}
`;

const TS = `const greeting = 'hi \u{1F44B}\u{1F3FD}';
export const size = greeting.length;
export const first = greeting[0];
export const chars = greeting.split('');
export function measure(s: string) {
  return s.length;
}
export function initial(s: string) {
  return s.charAt(0);
}
`;

const RULES = ['no-unsafe-index', 'no-unsafe-length', 'no-unsafe-split'];

/** The reports as `rule:line`, which is all these tests care about. */
function summary(reports: { rule: string; line: number }[]): string[] {
  return reports.map(({ rule, line }) => `${rule}:${line}`);
}

describe('.oxlintrc.json', () => {
  it('loads the plugin by package name and runs the rules it names', () => {
    const fixture = new Fixture({ '.oxlintrc.json': oxlintrc(RULES), 'a.js': JS });

    expect(summary(fixture.lint('a.js'))).toEqual([
      'graphemic/no-unsafe-length:2',
      'graphemic/no-unsafe-index:3',
      'graphemic/no-unsafe-split:4',
      // `s` could be anything, so `s.length` is not reported, but `charAt`
      // exists only on strings.
      'graphemic/no-unsafe-index:9',
    ]);
  });

  it('reports more in TypeScript, where annotations say what is a string', () => {
    const fixture = new Fixture({ '.oxlintrc.json': oxlintrc(RULES), 'a.ts': TS });

    expect(summary(fixture.lint('a.ts'))).toEqual([
      'graphemic/no-unsafe-length:2',
      'graphemic/no-unsafe-index:3',
      'graphemic/no-unsafe-split:4',
      'graphemic/no-unsafe-length:6',
      'graphemic/no-unsafe-index:9',
    ]);
  });

  it('runs only the rules it names', () => {
    const fixture = new Fixture({
      '.oxlintrc.json': oxlintrc(['no-unsafe-split']),
      'a.js': JS,
    });

    expect(summary(fixture.lint('a.js'))).toEqual(['graphemic/no-unsafe-split:4']);
  });

  it('passes settings.graphemic to the rules', () => {
    const source = "export const size = 'abc'.length;\n";
    const namespace = new Fixture({
      '.oxlintrc.json': oxlintrc(['no-unsafe-length']),
      'a.js': source,
    });
    const subpath = new Fixture({
      '.oxlintrc.json': oxlintrc(['no-unsafe-length'], { graphemic: { importStyle: 'subpath' } }),
      'a.js': source,
    });

    namespace.fixSuggestions('a.js');
    subpath.fixSuggestions('a.js');

    expect(namespace.read('a.js')).toBe(
      "import { graphemes } from '@sjpnz/graphemic';\nexport const size = graphemes.length('abc');\n",
    );
    expect(subpath.read('a.js')).toBe(
      "import { length } from '@sjpnz/graphemic/graphemes';\nexport const size = length('abc');\n",
    );
  });
});

describe('oxlint.config.ts', () => {
  // `indexOf` is `no-unsafe-search`, which is not in the recommended config.
  const source = `const greeting = 'hi \u{1F44B}\u{1F3FD}';
export const size = greeting.length;
export const wave = greeting.indexOf('\u{1F44B}');
`;

  it('extends configs.recommended', () => {
    const fixture = new Fixture({
      'oxlint.config.ts': oxlintConfig('recommended'),
      'a.js': source,
    });

    expect(summary(fixture.lint('a.js'))).toEqual(['graphemic/no-unsafe-length:2']);
  });

  it('extends configs.all', () => {
    const fixture = new Fixture({ 'oxlint.config.ts': oxlintConfig('all'), 'a.js': source });

    expect(summary(fixture.lint('a.js'))).toEqual([
      'graphemic/no-unsafe-length:2',
      'graphemic/no-unsafe-search:3',
    ]);
  });

  it('passes settings.graphemic to the rules', () => {
    const fixture = new Fixture({
      'oxlint.config.ts': oxlintConfig('recommended', { graphemic: { importStyle: 'subpath' } }),
      'a.js': "export const size = 'abc'.length;\n",
    });

    fixture.fixSuggestions('a.js');

    expect(fixture.read('a.js')).toBe(
      "import { length } from '@sjpnz/graphemic/graphemes';\nexport const size = length('abc');\n",
    );
  });
});
