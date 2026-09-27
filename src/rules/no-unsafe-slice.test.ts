import { ruleTester, tsRuleTester } from '../test/ruleTester.js';
import rule from './no-unsafe-slice.js';

const IMPORTS: Record<string, string> = {
  graphemes: "import { graphemes } from '@sjpnz/graphemic';\n",
  codePoints: "import { codePoints } from '@sjpnz/graphemic';\n",
  utf8: "import { utf8 } from '@sjpnz/graphemic';\n",
  columns: "import * as columns from '@sjpnz/graphemic/columns';\n",
  codeUnits: "import { codeUnits } from '@sjpnz/graphemic';\n",
};

/**
 * The one report on `code`, with `messageId`, whose suggestions replace
 * `replaced` in it with a `slice` call on `args` in each unit, in order,
 * importing that unit.
 */
function reported(code: string, messageId: string, replaced: string, args: string) {
  return {
    code,
    errors: [
      {
        messageId,
        suggestions: Object.entries(IMPORTS).map(([unit, declaration]) => ({
          messageId: unit,
          output: declaration + code.replace(replaced, `${unit}.slice(${args})`),
        })),
      },
    ],
  };
}

/** The one report on `code`, with `messageId`, which has no suggestions. */
function unsuggested(code: string, messageId: string) {
  return { code, errors: [{ messageId, suggestions: [] }] };
}

/** Slices whose every bound is a position the code already found in the same string. */
const INDEX_DERIVED = [
  "s.slice(0, s.indexOf(','))",
  "s.slice(s.indexOf(':') + 1)",
  "s.slice(s.lastIndexOf('/') + 1)",
  's.substring(0, s.search(/\\s/))',
  "s.substr(s.indexOf(':'))",
  's.slice(0, -suffix.length)',
  's.slice(0, s.length - suffix.length)',
];

ruleTester.run('no-unsafe-slice', rule, {
  valid: [
    ...INDEX_DERIVED.map((call) => `const s = 'a:b/c'; const x = ${call};`),
    // A prefix or suffix of known length, checked first.
    "const s = 'a'; if (s.startsWith('#')) s.slice(1);",
    "const s = 'a'; const t = s.endsWith('.js') ? s.slice(0, -3) : s;",
    // Nothing is cut.
    "const s = 'a'; s.slice();",
    's.substring();',
    // `slice` on anything not known to be a string.
    'arr.slice(1);',
    '[1, 2].slice(1);',
    'function f(s) { return s.slice(1); }',
    // Other methods.
    "'ab'.at(0);",
    "'ab'[`slice`](1);",
    's.substring;',
    'class A extends B { f() { return super.substring(1); } }',
  ],
  invalid: [
    reported(
      "'\u{1F44B}\u{1F3FD}'.slice(0, 2);",
      'slice',
      "'\u{1F44B}\u{1F3FD}'.slice(0, 2)",
      "'\u{1F44B}\u{1F3FD}', 0, 2",
    ),
    reported("const s = 'ab'; s.slice(1);", 'slice', 's.slice(1)', 's, 1'),
    reported("(a + 'x').slice(-3);", 'slice', "(a + 'x').slice(-3)", "a + 'x', -3"),
    reported("const s = 'ab'; s.slice(...bounds);", 'slice', 's.slice(...bounds)', 's, ...bounds'),
    // The same shapes, on a different receiver.
    reported(
      "const a = 'a,b'; a.slice(0, b.indexOf(','));",
      'slice',
      "a.slice(0, b.indexOf(','))",
      "a, 0, b.indexOf(',')",
    ),
    reported(
      "const a = 'a,b'; a.slice(b.lastIndexOf('/') + 1);",
      'slice',
      "a.slice(b.lastIndexOf('/') + 1)",
      "a, b.lastIndexOf('/') + 1",
    ),
    reported(
      'a.substring(0, b.search(/\\s/));',
      'substringUnchecked',
      'a.substring(0, b.search(/\\s/))',
      'a, 0, b.search(/\\s/)',
    ),
    // A guard on the wrong string, or of the wrong length.
    reported("const s = 'a'; if (t.startsWith('#')) s.slice(1);", 'slice', 's.slice(1)', 's, 1'),
    reported("const s = 'a'; if (s.startsWith('##')) s.slice(1);", 'slice', 's.slice(1)', 's, 1'),
    // `substring` on any receiver; ordered bounds cut exactly where `slice` would.
    reported('s.substring(1);', 'substring', 's.substring(1)', 's, 1'),
    reported('s.substring(1, 3);', 'substring', 's.substring(1, 3)', 's, 1, 3'),
    reported('s.substring(2, 2);', 'substring', 's.substring(2, 2)', 's, 2, 2'),
    reported(
      's.substring(0, t.length);',
      'substring',
      's.substring(0, t.length)',
      's, 0, t.length',
    ),
    // Bounds `substring` would clamp or swap.
    reported('s.substring(3, 1);', 'substringUnchecked', 's.substring(3, 1)', 's, 3, 1'),
    reported('s.substring(-1);', 'substringUnchecked', 's.substring(-1)', 's, -1'),
    reported('s.substring(i);', 'substringUnchecked', 's.substring(i)', 's, i'),
    reported('s.substring(0, n);', 'substringUnchecked', 's.substring(0, n)', 's, 0, n'),
    reported(
      's.substring(1, t.length);',
      'substringUnchecked',
      's.substring(1, t.length)',
      's, 1, t.length',
    ),
    reported(
      's.substring(0, t[`length`]);',
      'substringUnchecked',
      's.substring(0, t[`length`])',
      's, 0, t[`length`]',
    ),
    reported(
      's.substring(0, t.size);',
      'substringUnchecked',
      's.substring(0, t.size)',
      's, 0, t.size',
    ),
    reported('s.substring(...xs);', 'substringUnchecked', 's.substring(...xs)', 's, ...xs'),
    reported(
      's.substring(0, ...xs);',
      'substringUnchecked',
      's.substring(0, ...xs)',
      's, 0, ...xs',
    ),
    // `substr` on any receiver, as the equivalent `slice`.
    reported('s.substr(2);', 'substr', 's.substr(2)', 's, 2'),
    reported('s.substr(i);', 'substr', 's.substr(i)', 's, i'),
    reported('s.substr(2, 3);', 'substr', 's.substr(2, 3)', 's, 2, 5'),
    reported('s.substr(i, 3);', 'substr', 's.substr(i, 3)', 's, i, i + 3'),
    reported('s.substr(2, n);', 'substr', 's.substr(2, n)', 's, 2, 2 + n'),
    reported('s.substr(i, t.length);', 'substr', 's.substr(i, t.length)', 's, i, i + t.length'),
    reported('s.substr(i, f());', 'substr', 's.substr(i, f())', 's, i, i + f()'),
    reported('s.substr(i, this);', 'substr', 's.substr(i, this)', 's, i, i + this'),
    reported('s.substr(i, a - b);', 'substr', 's.substr(i, a - b)', 's, i, i + (a - b)'),
    reported('s.substr(i, -n);', 'substr', 's.substr(i, -n)', 's, i, i + (-n)'),
    // `substr` whose start cannot be written twice, or whose length is negative.
    unsuggested("s.substr(s.indexOf(':'), 2);", 'substr'),
    unsuggested('s.substr(-2, 1);', 'substr'),
    unsuggested('s.substr(f(), 1);', 'substr'),
    unsuggested('s.substr(i, -1);', 'substr'),
    unsuggested('s.substr(...xs);', 'substr'),
    unsuggested('s.substr(i, ...xs);', 'substr'),
    // Arguments that would not carry over.
    unsuggested("const s = 'ab'; s.slice(0, 1, extra);", 'slice'),
    unsuggested('s.substr(0, 1, extra);', 'substr'),
    unsuggested("const s = 'ab'; s?.slice(1);", 'slice'),
    // Guards, like index-derived bounds, are reported when asked.
    ...INDEX_DERIVED.map((call) => ({
      code: `const s = 'a:b/c'; const suffix = '/c'; const x = ${call};`,
      options: [{ allowIndexDerivedBounds: false }],
      errors: 1,
    })),
    {
      code: "const s = 'a'; if (s.startsWith('#')) s.slice(1);",
      options: [{ allowIndexDerivedBounds: false }],
      errors: 1,
    },
  ],
});

tsRuleTester.run('no-unsafe-slice (TypeScript)', rule, {
  valid: [
    'function f(s: string) { return s.slice(0, s.indexOf(",")); }',
    'function f(s: string[]) { return s.slice(1); }',
    'function f(s: Uint8Array) { return s.slice(1); }',
  ],
  invalid: [
    reported('function f(s: string) { return s.slice(1); }', 'slice', 's.slice(1)', 's, 1'),
    reported(
      'class A { name: string = ""; f() { return this.name.slice(1); } }',
      'slice',
      'this.name.slice(1)',
      'this.name, 1',
    ),
  ],
});
