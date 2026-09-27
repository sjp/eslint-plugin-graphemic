import { ruleTester, tsRuleTester } from '../test/ruleTester.js';
import rule from './no-unsafe-length.js';

const IMPORTS: Record<string, string> = {
  graphemes: "import { graphemes } from '@sjpnz/graphemic';\n",
  codePoints: "import { codePoints } from '@sjpnz/graphemic';\n",
  utf8: "import { utf8 } from '@sjpnz/graphemic';\n",
  columns: "import * as columns from '@sjpnz/graphemic/columns';\n",
  codeUnits: "import { codeUnits } from '@sjpnz/graphemic';\n",
};

/**
 * The one report on `code`, whose suggestions replace `replaced` in it with a
 * `length` call on `receiver` in each unit, in order, importing that unit.
 */
function reported(code: string, replaced: string, receiver: string) {
  return {
    code,
    errors: [
      {
        messageId: 'length',
        suggestions: Object.entries(IMPORTS).map(([unit, declaration]) => ({
          messageId: unit,
          output: declaration + code.replace(replaced, `${unit}.length(${receiver})`),
        })),
      },
    ],
  };
}

/** The one report on `code`, which has no suggestions. */
function unsuggested(code: string) {
  return { code, errors: [{ messageId: 'length', suggestions: [] }] };
}

/** The one report on `code` of a destructured `length`, reported when asked for. */
function destructured(code: string) {
  return {
    code,
    options: [{ ignoreDestructuring: false }],
    errors: [{ messageId: 'destructure', suggestions: [] }],
  };
}

// Every form of a test for emptiness, each exact in any unit.
const EMPTINESS = [
  's.length === 0',
  's.length !== 0',
  's.length == 0',
  's.length != 0',
  's.length > 0',
  's.length >= 1',
  's.length < 1',
  's.length <= 0',
  '0 === s.length',
  '0 !== s.length',
  '0 == s.length',
  '0 != s.length',
  '0 < s.length',
  '1 <= s.length',
  '1 > s.length',
  '0 >= s.length',
  '!s.length',
  '!!s.length',
  'Boolean(s.length)',
];

ruleTester.run('no-unsafe-length', rule, {
  valid: [
    ...EMPTINESS.map((test) => `const s = 'ab'; const empty = ${test};`),
    "const s = 'ab'; const empty = s?.length === 0;",
    // Tested for truthiness.
    "const s = 'ab'; if (s.length) {}",
    "const s = 'ab'; while (s.length) {}",
    "const s = 'ab'; do {} while (s.length);",
    "const s = 'ab'; for (; s.length; ) {}",
    "const s = 'ab'; const x = s.length ? 1 : 2;",
    "const s = 'ab'; if (s.length && ok) {}",
    "const s = 'ab'; if (ok || s.length) {}",
    "const s = 'ab'; if (ok ?? s.length) {}",
    "const s = 'ab'; const x = !(ok || s.length);",
    // The left of `&&` passes its value on only when it is 0.
    "const s = 'ab'; const x = s.length && f();",
    // Not strings, or not known to be.
    '[].length;',
    'const a = [1, 2]; a.length;',
    'function f(s) { return s.length; }',
    'user.name.length;',
    // Writes, which only make sense on an array.
    "const s = 'ab'; s.length = 0;",
    "const s = 'ab'; s.length += 1;",
    "const s = 'ab'; s.length++;",
    "const s = 'ab'; delete s.length;",
    "const s = 'ab'; for (s.length of xs) {}",
    "const s = 'ab'; for (s.length in xs) {}",
    "const s = 'ab'; [s.length] = xs;",
    "const s = 'ab'; [...s.length] = xs;",
    "const s = 'ab'; [s.length = 1] = xs;",
    "const s = 'ab'; ({ n: s.length } = xs);",
    // Other properties.
    "'ab'.size;",
    "'ab'[length];",
    "'ab'[`len${x}`];",
    "'ab'[0];",
    "'ab'[key()];",
    'class A extends B { m() { return super.length; } }',
    // Destructuring is ignored by default.
    "const { length } = 'ab';",
    "let n; ({ length: n } = 'ab');",
    { code: 'const { length } = [];', options: [{ ignoreDestructuring: false }] },
    { code: "const { size } = 'ab';", options: [{ ignoreDestructuring: false }] },
    { code: "const [length] = 'ab';", options: [{ ignoreDestructuring: false }] },
    { code: "const { ...rest } = 'ab';", options: [{ ignoreDestructuring: false }] },
    { code: 'let length;', options: [{ ignoreDestructuring: false }] },
    { code: 'let n; n = 1;', options: [{ ignoreDestructuring: false }] },
  ],
  invalid: [
    reported("'ab'.length;", "'ab'.length", "'ab'"),
    reported("'ab'['length'];", "'ab'['length']", "'ab'"),
    reported("'ab'[`length`];", "'ab'[`length`]", "'ab'"),
    reported("const s = 'ab'; if (s.length > 20) {}", 's.length', 's'),
    reported("const s = 'ab'; const big = s.length > 1;", 's.length', 's'),
    reported("const s = 'ab'; const one = s.length === 1;", 's.length', 's'),
    reported("const s = 'ab'; const x = 0 < s.length + 1;", 's.length', 's'),
    reported("const s = 'ab'; const x = 0 + s.length;", 's.length', 's'),
    reported("const s = 'ab'; const x = s.length === zero;", 's.length', 's'),
    reported("const s = 'ab'; const x = s.length === '0';", 's.length', 's'),
    reported("const s = 'ab'; const x = s.length in o;", 's.length', 's'),
    reported("const s = 'ab'; const x = s.length || 5;", 's.length', 's'),
    reported("const s = 'ab'; const x = s.length ?? 5;", 's.length', 's'),
    reported("const s = 'ab'; const x = ok && s.length;", 's.length', 's'),
    reported("const s = 'ab'; const x = -s.length;", 's.length', 's'),
    reported("const s = 'ab'; const x = f(s.length);", 's.length', 's'),
    reported("const s = 'ab'; const x = Boolean(ok, s.length);", 's.length', 's'),
    reported("const s = 'ab'; const x = ok ? s.length : 0;", 's.length', 's'),
    reported('const remaining = 280 - `${a}${b}`.length;', '`${a}${b}`.length', '`${a}${b}`'),
    reported("(a + 'x').length;", "(a + 'x').length", "a + 'x'"),
    reported("const s = 'ab'; const t = `${s.length} characters`;", 's.length', 's'),
    reported("const s = 'ab'; s.length.toFixed();", 's.length', 's'),
    // `Boolean` is not the global here.
    reported("const Boolean = (n) => n; const s = 'ab'; Boolean(s.length);", 's.length)', 's)'),
    // An optional chain is reported but has no one-call rewrite.
    unsuggested("const s = 'ab'; const n = s?.length;"),
    unsuggested("const s = 'ab'; s?.length.toFixed();"),
    // Destructuring, when asked for.
    destructured("const { length } = 'ab';"),
    destructured("const { length: n } = 'ab';"),
    destructured("const { 'length': n } = 'ab';"),
    destructured("const { ['length']: n } = 'ab';"),
    destructured("let n; ({ length: n } = 'ab');"),
  ],
});

tsRuleTester.run('no-unsafe-length (TypeScript)', rule, {
  valid: [
    'function f(s: string) { return s.length === 0; }',
    'function f(s: string[]) { return s.length; }',
    'type Name = string; function f(s: Name) { return s.length; }',
  ],
  invalid: [
    reported('function f(s: string) { return s.length; }', 's.length', 's'),
    reported('function f(name: string) { if (name.length > 20) {} }', 'name.length', 'name'),
    reported('function f(s?: string) { return s!.length; }', 's!.length', 's!'),
    unsuggested('function f(s?: string) { return s?.length; }'),
  ],
});
