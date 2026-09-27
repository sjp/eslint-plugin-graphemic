import { ruleTester, tsRuleTester } from '../test/ruleTester.js';
import rule from './no-unsafe-reverse.js';

const GRAPHEMES = "import { graphemes } from '@sjpnz/graphemic';\n";

/** The one report on `code`, whose suggestion replaces `replaced` with `graphemes.reverse(s)`. */
function reversed(code: string, replaced: string, s: string) {
  return {
    code,
    errors: [
      {
        messageId: 'reverse',
        suggestions: [
          {
            messageId: 'graphemes',
            output: GRAPHEMES + code.replace(replaced, `graphemes.reverse(${s})`),
          },
        ],
      },
    ],
  };
}

/** The one report on `code`, which has no suggestions. */
function unsuggested(code: string) {
  return { code, errors: [{ messageId: 'reverse', suggestions: [] }] };
}

const EXPLODES = ["s.split('')", '[...s]', 'Array.from(s)'];
const REVERSES = ['reverse()', 'toReversed()'];
const JOINS = ["join('')", 'join("")', 'join(``)'];

/** Every spelling of the idiom on `s`. */
const IDIOMS = EXPLODES.flatMap((explode) =>
  REVERSES.flatMap((reverse) => JOINS.map((join) => `${explode}.${reverse}.${join}`)),
);

ruleTester.run('no-unsafe-reverse', rule, {
  valid: [
    // Joined with a separator, or with the default comma.
    "s.split('').reverse().join(',');",
    's.split(``).reverse().join(`-`);',
    's.split("").reverse().join();',
    "s.split('').reverse().join(sep);",
    "s.split('').reverse().join('', x);",
    "s.split('').reverse().join(...args);",
    // Reversing an array that is not a string broken apart.
    "items.reverse().join('');",
    "s.split(',').reverse().join('');",
    "s.split('', 2).reverse().join('');",
    "s.split(/(?:)/).reverse().join('');",
    "s.split(...args).reverse().join('');",
    "[...a, ...b].reverse().join('');",
    "[a].reverse().join('');",
    "[].reverse().join('');",
    "Array.from(s, fn).reverse().join('');",
    "Array.from(...args).reverse().join('');",
    "Array.of(s).reverse().join('');",
    "items.from(s).reverse().join('');",
    "Array['from'](s).reverse().join('');",
    "f(s).reverse().join('');",
    // Known arrays, copied before reversing.
    "const parts = ['a', 'b']; [...parts].reverse().join('');",
    "Array.from(['a', 'b']).reverse().join('');",
    // A local `Array` is not the built-in.
    "const Array = { from: (s) => s }; Array.from(s).reverse().join('');",
    // No reversal, or not the reversal methods.
    "s.split('').join('');",
    "s.split('').sort().join('');",
    "s.split('').reverse(x).join('');",
    "s.split('')['reverse']().join('');",
    "s.split('').reverse()['join']('');",
    "join('');",
    "class A extends B { f() { return super.split('').reverse().join(''); } }",
    "class A extends B { f() { return super.reverse().join(''); } }",
  ],
  invalid: [
    ...IDIOMS.map((idiom) => reversed(`const r = ${idiom};`, idiom, 's')),
    // The string keeps its source text.
    reversed(
      "const r = (a + b).split('').reverse().join('');",
      "(a + b).split('').reverse().join('')",
      'a + b',
    ),
    reversed(
      "const r = [...user.name].reverse().join('');",
      "[...user.name].reverse().join('')",
      'user.name',
    ),
    reversed(
      "const r = [...'ab'].toReversed().join('');",
      "[...'ab'].toReversed().join('')",
      "'ab'",
    ),
    // The split receiver is not checked, and may be anything.
    reversed(
      "const r = [1].split('').reverse().join('');",
      "[1].split('').reverse().join('')",
      '[1]',
    ),
    // A comment in the string survives; one elsewhere in the chain would not.
    reversed(
      "const r = Array.from(a /* name */ + b).reverse().join('');",
      "Array.from(a /* name */ + b).reverse().join('')",
      'a /* name */ + b',
    ),
    unsuggested("const r = s.split('') /* chars */.reverse().join('');"),
    // Optional chains, anywhere, are reported without a suggestion.
    unsuggested("const r = s?.split('').reverse().join('');"),
    unsuggested("const r = (s?.split('')).reverse().join('');"),
    unsuggested("const r = (s.split('')?.reverse()).join('');"),
    unsuggested("const r = Array.from?.(s).reverse().join('');"),
  ],
});

tsRuleTester.run('no-unsafe-reverse (TypeScript)', rule, {
  valid: ["function f(parts: string[]) { return [...parts].reverse().join(''); }"],
  invalid: [
    reversed(
      "function f(s: string) { return [...s].reverse().join(''); }",
      "[...s].reverse().join('')",
      's',
    ),
  ],
});
