import { ruleTester, tsRuleTester } from '../test/ruleTester.js';
import rule from './no-unsafe-search.js';

const IMPORT = "import { graphemes } from '@sjpnz/graphemic';\n";
const CHECK_INCLUDES = [{ checkIncludes: true }];

/**
 * The one report on `code`, with `messageId`, whose one suggestion, with
 * `suggestion`, replaces `replaced` in it with `replacement`, importing
 * `graphemes`.
 */
function reported(
  code: string,
  messageId: string,
  replaced: string,
  replacement: string,
  suggestion = 'graphemes',
) {
  return {
    code,
    errors: [
      {
        messageId,
        suggestions: [
          { messageId: suggestion, output: IMPORT + code.replace(replaced, replacement) },
        ],
      },
    ],
  };
}

/** `reported`, with `checkIncludes` on and the check's `method` in the message. */
function checked(
  code: string,
  messageId: string,
  replaced: string,
  replacement: string,
  suggestion = 'includesGraphemes',
) {
  return {
    ...reported(code, messageId, replaced, replacement, suggestion),
    options: CHECK_INCLUDES,
  };
}

/** The one report on `code`, with `messageId`, which has no suggestions. */
function unsuggested(code: string, messageId: string) {
  return { code, errors: [{ messageId, suggestions: [] }] };
}

/** Comparisons that ask whether `s.indexOf(x)` found a match, or found none. */
const EXISTENCE = [
  's.indexOf(x) === -1',
  's.indexOf(x) == -1',
  's.indexOf(x) !== -1',
  's.indexOf(x) != -1',
  's.indexOf(x) > -1',
  's.indexOf(x) >= 0',
  's.indexOf(x) < 0',
  's.indexOf(x) <= -1',
  '-1 !== s.indexOf(x)',
  '0 > s.indexOf(x)',
  '0 <= s.indexOf(x)',
  '~s.indexOf(x)',
  's.lastIndexOf(x) !== -1',
];

/** Comparisons with 0, which is the start of the string in every unit. */
const AT_START = [
  's.indexOf(x) === 0',
  's.indexOf(x) !== 0',
  's.indexOf(x) == 0',
  '0 != s.lastIndexOf(x)',
];

/** Positions that go straight back into the same string as code-unit offsets. */
const SAME_STRING = [
  "s.slice(0, s.indexOf(','))",
  "s.slice(s.indexOf(':') + 1)",
  "s.slice(s.lastIndexOf('/') + 1)",
  "s.substring(s.indexOf(', ') + 2)",
  "s.substr(s.indexOf(':'))",
  // Per bound: the other bound makes the slice reportable, not the search.
  "s.slice(s.indexOf(','), 5)",
  "s.indexOf(',', s.indexOf(',') + 1) !== -1",
  "s.lastIndexOf(',', s.lastIndexOf(',') - 1) !== -1",
  "s.includes(',', s.indexOf(':'))",
];

ruleTester.run('no-unsafe-search', rule, {
  valid: [
    ...EXISTENCE.map((check) => `const s = 'ab'; if (${check}) f();`),
    ...AT_START.map((check) => `const s = 'ab'; if (${check}) f();`),
    ...AT_START.map((check) => ({
      code: `const s = 'ab'; if (${check}) f();`,
      options: CHECK_INCLUDES,
    })),
    ...SAME_STRING.map((call) => `const s = 'a:b,c'; const y = ${call};`),
    // `includes` only with the option.
    "const s = 'ab'; s.includes('a');",
    // Nothing searched for.
    "const s = 'ab'; s.indexOf();",
    "const s = 'ab'; s.includes();",
    // Arrays and anything not known to be a string.
    'arr.indexOf(x);',
    '[1, 2].indexOf(1);',
    '[1, 2].includes(1);',
    'function f(s) { return s.indexOf(x); }',
    // Other methods, and methods not called.
    "const s = 'ab'; s.search(/b/);",
    "const s = 'ab'; s[`indexOf`](x);",
    "'ab'.indexOf;",
    'class A extends B { f() { return super.indexOf(x); } }',
  ],
  invalid: [
    reported(
      "const s = 'hi \u{1F44B}\u{1F3FD}!'; render(s.indexOf('!'));",
      'indexOf',
      "s.indexOf('!')",
      "graphemes.indexOf(s, '!')",
    ),
    reported(
      "const s = 'ab'; const i = s.indexOf(x); render(i);",
      'indexOf',
      's.indexOf(x)',
      'graphemes.indexOf(s, x)',
    ),
    // The position is not followed through a variable.
    reported(
      "const s = 'a,b'; const i = s.indexOf(','); s.slice(0, i);",
      'indexOf',
      "s.indexOf(',')",
      "graphemes.indexOf(s, ',')",
    ),
    reported(
      "const s = 'ab'; f(s.indexOf(x, 2));",
      'indexOf',
      's.indexOf(x, 2)',
      'graphemes.indexOf(s, x, 2)',
      'graphemesFrom',
    ),
    // Truthiness is not an existence check: it is falsy at 0.
    reported(
      "const s = 'ab'; if (s.indexOf(x)) f();",
      'indexOf',
      's.indexOf(x)',
      'graphemes.indexOf(s, x)',
    ),
    // Comparisons that use the number.
    reported(
      "const s = 'ab'; if (s.indexOf(x) > 2) f();",
      'indexOf',
      's.indexOf(x)',
      'graphemes.indexOf(s, x)',
    ),
    reported(
      "const s = 'ab'; if (s.indexOf(x) === n) f();",
      'indexOf',
      's.indexOf(x)',
      'graphemes.indexOf(s, x)',
    ),
    reported(
      "const s = 'ab'; if (s.indexOf(x) === -2) f();",
      'indexOf',
      's.indexOf(x)',
      'graphemes.indexOf(s, x)',
    ),
    reported(
      "const s = 'ab'; if (s.indexOf(x) === -n) f();",
      'indexOf',
      's.indexOf(x)',
      'graphemes.indexOf(s, x)',
    ),
    reported(
      "const s = 'ab'; if (s.indexOf(x) + 1) f();",
      'indexOf',
      's.indexOf(x)',
      'graphemes.indexOf(s, x)',
    ),
    reported(
      "const s = 'ab'; if (s.indexOf(x) instanceof y) f();",
      'indexOf',
      's.indexOf(x)',
      'graphemes.indexOf(s, x)',
    ),
    reported(
      "const s = 'ab'; y = -s.indexOf(x);",
      'indexOf',
      's.indexOf(x)',
      'graphemes.indexOf(s, x)',
    ),
    // Slicing a different string, or with a bound the matcher does not accept.
    reported(
      "const a = 'a,b', b = 'c,d'; a.slice(0, b.indexOf(','));",
      'indexOf',
      "b.indexOf(',')",
      "graphemes.indexOf(b, ',')",
    ),
    reported(
      "const s = 'a,b'; t.slice(0, s.indexOf(','));",
      'indexOf',
      "s.indexOf(',')",
      "graphemes.indexOf(s, ',')",
    ),
    reported(
      "const s = 'a,b'; s.slice(0, s.indexOf(',') * 2);",
      'indexOf',
      "s.indexOf(',')",
      "graphemes.indexOf(s, ',')",
    ),
    reported(
      "const s = 'a,b'; s.substr(0, s.indexOf(','));",
      'indexOf',
      "s.indexOf(',')",
      "graphemes.indexOf(s, ',')",
    ),
    reported(
      "const s = 'a,b'; if (s.indexOf(s.indexOf(',')) !== -1) f();",
      'indexOf',
      "s.indexOf(',')",
      "graphemes.indexOf(s, ',')",
    ),
    reported(
      "const s = 'a,b'; s.charAt(s.indexOf(','));",
      'indexOf',
      "s.indexOf(',')",
      "graphemes.indexOf(s, ',')",
    ),
    reported(
      "const s = 'a,b'; f(1, s.indexOf(','));",
      'indexOf',
      "s.indexOf(',')",
      "graphemes.indexOf(s, ',')",
    ),
    reported(
      "const s = 'a,b'; s[k](0, s.indexOf(','));",
      'indexOf',
      "s.indexOf(',')",
      "graphemes.indexOf(s, ',')",
    ),
    reported(
      "const s = 'a,b'; class A { #m() {} f() { this.#m(0, s.indexOf(',')); } }",
      'indexOf',
      "s.indexOf(',')",
      "graphemes.indexOf(s, ',')",
    ),
    reported(
      "const s = 'a,b'; s.slice.call(s, s.indexOf(','));",
      'indexOf',
      "s.indexOf(',')",
      "graphemes.indexOf(s, ',')",
    ),
    unsuggested("const s = 'ab'; f(s.lastIndexOf(x));", 'lastIndexOf'),
    // Arguments graphemic would not take the same way.
    unsuggested("const s = 'ab'; f(s.indexOf(...args));", 'indexOf'),
    unsuggested("const s = 'ab'; f(s.indexOf(x, 1, 2));", 'indexOf'),
    unsuggested("const s = 'ab'; f(s.indexOf(/b/));", 'indexOf'),
    // An optional chain is reported whole, with no rewrite.
    unsuggested("const s = 'ab'; f(s?.indexOf(x));", 'indexOf'),

    // With `checkIncludes`: `includes`…
    checked(
      "const s = 'résumé'; s.includes('e');",
      'includes',
      "s.includes('e')",
      "graphemes.includes(s, 'e')",
    ),
    checked(
      "const s = 'ab'; s.includes(x, 1);",
      'includes',
      's.includes(x, 1)',
      'graphemes.includes(s, x, 1)',
      'includesGraphemesFrom',
    ),
    { ...unsuggested("const s = 'ab'; s.includes(...args);", 'includes'), options: CHECK_INCLUDES },
    // …and existence checks, replaced whole.
    checked(
      "const s = 'ab'; if (s.indexOf(x) !== -1) f();",
      'check',
      's.indexOf(x) !== -1',
      'graphemes.includes(s, x)',
    ),
    checked(
      "const s = 'ab'; if (s.indexOf(x) > -1) f();",
      'check',
      's.indexOf(x) > -1',
      'graphemes.includes(s, x)',
    ),
    checked(
      "const s = 'ab'; if (0 <= s.indexOf(x)) f();",
      'check',
      '0 <= s.indexOf(x)',
      'graphemes.includes(s, x)',
    ),
    checked(
      "const s = 'ab'; if (s.indexOf(x) === -1) f();",
      'check',
      's.indexOf(x) === -1',
      '!graphemes.includes(s, x)',
    ),
    checked(
      "const s = 'ab'; if (a && s.indexOf(x) < 0) f();",
      'check',
      's.indexOf(x) < 0',
      '!graphemes.includes(s, x)',
    ),
    checked(
      "const s = 'ab'; if (s.indexOf(x) <= -1) f();",
      'check',
      's.indexOf(x) <= -1',
      '!graphemes.includes(s, x)',
    ),
    checked(
      "const s = 'ab'; if (!~s.indexOf(x)) f();",
      'check',
      '~s.indexOf(x)',
      'graphemes.includes(s, x)',
    ),
    checked(
      "const s = 'ab'; if (s.indexOf(x, 1) != -1) f();",
      'check',
      's.indexOf(x, 1) != -1',
      'graphemes.includes(s, x, 1)',
      'includesGraphemesFrom',
    ),
    checked(
      "const s = 'ab'; if (s.lastIndexOf(x) !== -1) f();",
      'check',
      's.lastIndexOf(x) !== -1',
      'graphemes.includes(s, x)',
    ),
    {
      ...unsuggested("const s = 'ab'; if (s.lastIndexOf(x, 1) !== -1) f();", 'check'),
      options: CHECK_INCLUDES,
    },
    {
      ...unsuggested("const s = 'ab'; if (s.indexOf(/b/) !== -1) f();", 'check'),
      options: CHECK_INCLUDES,
    },
    // The option does not change how a used position is reported.
    {
      ...reported(
        "const s = 'ab'; render(s.indexOf(x));",
        'indexOf',
        's.indexOf(x)',
        'graphemes.indexOf(s, x)',
      ),
      options: CHECK_INCLUDES,
    },
  ],
});

tsRuleTester.run('no-unsafe-search (TypeScript)', rule, {
  valid: [
    'function f(s: string) { return s.slice(0, s.indexOf(",")!); }',
    'function f(s: string) { return s.indexOf(x) as number !== -1; }',
    'function f(s: string) { return s.slice((s.indexOf(",") as number) + 1); }',
    'function f(s: string[]) { return s.indexOf(x); }',
  ],
  invalid: [
    reported(
      'function f(s: string) { return s.indexOf(x); }',
      'indexOf',
      's.indexOf(x)',
      'graphemes.indexOf(s, x)',
    ),
    checked(
      'function f(s: string) { return s.indexOf(x)! === -1; }',
      'check',
      's.indexOf(x)! === -1',
      '!graphemes.includes(s, x)',
    ),
  ],
});
