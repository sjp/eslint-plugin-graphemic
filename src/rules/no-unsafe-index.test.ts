import { ruleTester, tsRuleTester } from '../test/ruleTester.js';
import rule from './no-unsafe-index.js';

const IMPORTS: Record<string, string> = {
  graphemes: "import { graphemes } from '@sjpnz/graphemic';\n",
  codePoints: "import { codePoints } from '@sjpnz/graphemic';\n",
};

/**
 * The one report on `code`, with `messageId`, whose suggestions replace
 * `replaced` in it with `replacement(unit)` in each unit, in order, importing
 * that unit.
 */
function reported(
  code: string,
  messageId: string,
  replaced: string,
  replacement: (unit: string) => string,
) {
  return {
    code,
    errors: [
      {
        messageId,
        suggestions: Object.entries(IMPORTS).map(([unit, declaration]) => ({
          messageId: unit,
          output: declaration + code.replace(replaced, replacement(unit)),
        })),
      },
    ],
  };
}

/** A report on `s[i]` or `s.at(i)`, suggesting `at(receiver, index)`. */
function at(code: string, messageId: string, replaced: string, receiver: string, index: string) {
  return reported(code, messageId, replaced, (unit) => `${unit}.at(${receiver}, ${index})`);
}

/** A report on `s.charAt(i)`, suggesting `at(receiver, index) ?? ''`. */
function charAt(code: string, replaced: string, receiver: string, index: string, wrap = false) {
  return reported(code, 'charAt', replaced, (unit) => {
    const call = `${unit}.at(${receiver}, ${index}) ?? ''`;
    return wrap ? `(${call})` : call;
  });
}

/** The one report on `code`, which has no suggestions. */
function unsuggested(code: string, messageId: string) {
  return { code, errors: [{ messageId, suggestions: [] }] };
}

ruleTester.run('no-unsafe-index', rule, {
  valid: [
    // Property names, not indexes.
    "const s = 'ab'; s['length'];",
    "const s = 'ab'; s[`length`];",
    "const s = 'ab'; s[`${k}th`];",
    "const s = 'ab'; s['to' + k];",
    "const s = 'ab'; s[null];",
    "const s = 'ab'; s[true];",
    "const s = 'ab'; s[Symbol.iterator];",
    "const s = 'ab'; s.length;",
    "obj['key'];",
    // Not known to be strings.
    'function f(s) { return s[0]; }',
    'function f(s) { return s.at(-1); }',
    'const arr = [1, 2]; arr[0];',
    'const arr = [1, 2]; arr.at(-1);',
    'arr[i];',
    // Written, so not a string.
    "const s = 'ab'; s[0] = 'x';",
    "const s = 'ab'; s[0]++;",
    "const s = 'ab'; delete s[0];",
    "const s = 'ab'; [s[0]] = xs;",
    "const s = 'ab'; for (s[0] of xs) {}",
    // Other methods, and calls that are not methods.
    "const s = 'ab'; s.charCodeAt(0);",
    "const s = 'ab'; s['at'](0);",
    'at(0);',
    'class A extends B { f() { return super.charAt(0) + super[0]; } }',
  ],
  invalid: [
    at("const s = 'ab'; s[0];", 'index', 's[0]', 's', '0'),
    at("const s = 'ab'; s[i];", 'index', 's[i]', 's', 'i'),
    at("const s = 'ab'; s[i + 1];", 'index', 's[i + 1]', 's', 'i + 1'),
    at("const s = 'ab'; s[-0];", 'index', 's[-0]', 's', '-0'),
    at("const s = 'ab'; s[-i];", 'index', 's[-i]', 's', '-i'),
    at("'ab'[0];", 'index', "'ab'[0]", "'ab'", '0'),
    at("const s = 'ab'; s[Symbol];", 'index', 's[Symbol]', 's', 'Symbol'),
    at(
      "const Symbol = { x: 1 }; const s = 'ab'; s[Symbol.x];",
      'index',
      's[Symbol.x]',
      's',
      'Symbol.x',
    ),
    at("const s = 'ab'; const c = s[0] === '#';", 'index', 's[0]', 's', '0'),
    unsuggested("const s = 'ab'; s[-1];", 'negativeIndex'),
    unsuggested("const s = 'ab'; s[1.5];", 'index'),
    unsuggested("const s = 'ab'; s[0n];", 'index'),
    unsuggested("const s = 'ab'; s?.[0];", 'index'),
    unsuggested("const s = 'ab'; s?.[0].toUpperCase();", 'index'),

    at("const s = 'ab'; s.at(-1);", 'at', 's.at(-1)', 's', '-1'),
    at("const s = 'ab'; s.at(i);", 'at', 's.at(i)', 's', 'i'),
    at("const s = 'ab'; s.at();", 'at', 's.at()', 's', '0'),
    unsuggested("const s = 'ab'; s.at(...xs);", 'at'),
    unsuggested("const s = 'ab'; s.at(0, 1);", 'at'),
    unsuggested("const s = 'ab'; s?.at(0);", 'at'),

    charAt('s.charAt(0);', 's.charAt(0)', 's', '0'),
    charAt('s.charAt();', 's.charAt()', 's', '0'),
    charAt('s.charAt(i);', 's.charAt(i)', 's', 'i'),
    charAt('s.charAt(-0.5);', 's.charAt(-0.5)', 's', '-0.5'),
    charAt('s.charAt(1.5);', 's.charAt(1.5)', 's', '1.5'),
    charAt('const x = s.charAt(0);', 's.charAt(0)', 's', '0'),
    charAt("const x = '>' + s.charAt(0);", 's.charAt(0)', 's', '0', true),
    charAt('const x = (s.charAt(0));', 's.charAt(0)', 's', '0'),
    unsuggested('s.charAt(-1);', 'charAt'),
    unsuggested('s.charAt(i, 1);', 'charAt'),
    unsuggested('s.charAt(...xs);', 'charAt'),
  ],
});

tsRuleTester.run('no-unsafe-index (TypeScript)', rule, {
  valid: [
    'function f(s) { return s[0]; }',
    'function f(xs: string[]) { return xs[0] + xs.at(-1); }',
    "function f(s: string) { s['length']; }",
  ],
  invalid: [
    at('function f(s: string) { return s[0]; }', 'index', 's[0]', 's', '0'),
    at('function f(s: string) { return s.at(-1); }', 'at', 's.at(-1)', 's', '-1'),
    at('function f(s: string) { return s[i]!; }', 'index', 's[i]', 's', 'i'),
    charAt('function f(s: string) { return s.charAt(0); }', 's.charAt(0)', 's', '0'),
    unsuggested('function f(s?: string) { return s?.[0]; }', 'index'),
  ],
});
