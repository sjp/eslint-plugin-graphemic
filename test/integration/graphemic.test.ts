import { describe, expect, it } from 'vitest';

import { Fixture, GRAPHEMIC_DIR, oxlintrc } from './harness.js';

// Strings that each break a different code-unit assumption: a skin-tone
// modifier, a flag of two regional indicators, a combining accent, a
// zero-width-joined family, and wide CJK characters.
const STRINGS = [
  'hi \u{1F44B}\u{1F3FD}',
  '\u{1F1E6}\u{1F1FA}',
  'é',
  '\u{1F468}‍\u{1F469}‍\u{1F467}',
  '東京',
];

interface Case {
  rule: string;
  /** A module exporting `f`, written the way the rule reports. */
  source: string;
  /** How to call `f` with a corpus string `s`. */
  call: string;
  /** The same operation through graphemic, with `s` and `graphemes` in scope. */
  expected: string;
}

// `String(x)` is always a string, so the rules report it in plain JavaScript.
const CASES: Case[] = [
  {
    rule: 'no-unsafe-index',
    source: 'export const f = (x) => String(x)[1];',
    call: 'f(s)',
    expected: 'graphemes.at(s, 1)',
  },
  {
    rule: 'no-unsafe-iteration',
    source: 'export const f = (x) => [...String(x)];',
    call: 'f(s)',
    expected: 'graphemes.toArray(s)',
  },
  {
    rule: 'no-unsafe-length',
    source: 'export const f = (x) => String(x).length;',
    call: 'f(s)',
    expected: 'graphemes.length(s)',
  },
  {
    rule: 'no-unsafe-pad',
    // `padStart` exists only on strings, so any receiver is reported; `String(x)`
    // would be taken for zero-padding a number, which the rule leaves alone.
    source: "export const f = (x) => x.padStart(6, '*');",
    call: 'f(s)',
    expected: "graphemes.padStart(s, 6, '*')",
  },
  {
    rule: 'no-unsafe-reverse',
    source: "export const f = (x) => String(x).split('').reverse().join('');",
    call: 'f(s)',
    expected: 'graphemes.reverse(s)',
  },
  {
    rule: 'no-unsafe-search',
    source: 'export const f = (x, needle) => String(x).indexOf(needle);',
    // After the corpus string, so its index is how long the string is.
    call: "f(s + '!', '!')",
    expected: "graphemes.indexOf(s + '!', '!')",
  },
  {
    rule: 'no-unsafe-slice',
    source: 'export const f = (x) => String(x).slice(0, 2);',
    call: 'f(s)',
    expected: 'graphemes.slice(s, 0, 2)',
  },
  {
    rule: 'no-unsafe-split',
    source: "export const f = (x) => String(x).split('');",
    call: 'f(s)',
    expected: 'graphemes.toArray(s)',
  },
  {
    rule: 'prefer-truncate',
    source: `export function f(x) {
  const t = String(x);
  return t.length > 3 ? t.slice(0, 3) + '…' : t;
}`,
    call: 'f(s)',
    expected: "graphemes.truncate(s, 3, { ellipsis: '…' })",
  },
];

/** What `call` returns for each corpus string, running `module` in `fixture`. */
function results(fixture: Fixture, module: string, call: string): unknown {
  return fixture.run(`
import { f } from './${module}';
const strings = ${JSON.stringify(STRINGS)};
console.log(JSON.stringify(strings.map((s) => ${call})));
`);
}

// Runs each rule's first suggestion and checks it does what graphemic does,
// which needs graphemic itself. It is not a dependency of this repository — the
// plugin only writes imports of it — so this suite runs wherever it has been
// installed, and is skipped elsewhere.
describe.skipIf(GRAPHEMIC_DIR === undefined)('suggestions agree with graphemic', () => {
  it.each(CASES)('$rule', ({ rule, source, call, expected }) => {
    const fixture = new Fixture({
      '.oxlintrc.json': oxlintrc([rule]),
      'native.mjs': `${source}\n`,
      'fixed.mjs': `${source}\n`,
    });
    expect(fixture.lint('fixed.mjs')).not.toEqual([]);

    fixture.fixSuggestions('fixed.mjs');

    expect(fixture.lint('fixed.mjs')).toEqual([]);
    const want = fixture.run(`
import { graphemes } from '@sjpnz/graphemic';
const strings = ${JSON.stringify(STRINGS)};
console.log(JSON.stringify(strings.map((s) => ${expected})));
`);
    expect(results(fixture, 'fixed.mjs', call)).toEqual(want);
    // The native operation gets at least one of them wrong, or this case would
    // prove nothing about the suggestion.
    expect(results(fixture, 'native.mjs', call)).not.toEqual(want);
  });
});
