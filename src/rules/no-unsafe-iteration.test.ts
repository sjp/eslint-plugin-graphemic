import { ruleTester, tsRuleTester } from '../test/ruleTester.js';
import rule from './no-unsafe-iteration.js';

const GRAPHEMES = "import { graphemes } from '@sjpnz/graphemic';\n";
const CODE_POINTS = "import { codePoints } from '@sjpnz/graphemic';\n";
const WAVE = "'\\u{1F44B}\\u{1F3FD}'";

/**
 * The one report on `code`, with `messageId`, whose suggestions replace
 * `replaced` in it with `fn` on `args` followed by `suffix`, in graphemes then
 * code points.
 */
function suggests(
  code: string,
  messageId: string,
  replaced: string,
  fn: 'iterate' | 'toArray',
  args: string,
  suffix = '',
) {
  const array = fn === 'toArray' ? 'Array' : '';
  return {
    code,
    errors: [
      {
        messageId,
        suggestions: [
          {
            messageId: `graphemes${array}`,
            output: GRAPHEMES + code.replace(replaced, `graphemes.${fn}(${args})${suffix}`),
          },
          {
            messageId: `codePoints${array}`,
            output: CODE_POINTS + code.replace(replaced, `codePoints.${fn}(${args})${suffix}`),
          },
        ],
      },
    ],
  };
}

/** The one report on `code`, with `messageId`, which has no suggestions. */
function unsuggested(code: string, messageId: string) {
  return { code, errors: [{ messageId, suggestions: [] }] };
}

ruleTester.run('no-unsafe-iteration', rule, {
  valid: [
    // Arrays, in every form.
    'for (const x of [1, 2]) {}',
    'const a = [...[1, 2]];',
    'const a = [0, ...[1, 2]];',
    'const a = Array.from([1, 2]);',
    'const a = Array.from([1, 2], (x) => x * 2);',
    // Receivers that could be anything.
    'function f(s) { for (const c of s) {} }',
    'function f(s) { return [...s]; }',
    'function f(s) { return Array.from(s); }',
    'const a = Array.from({ length: 3 });',
    // `for await` wants an async iterable.
    "async function f() { for await (const c of 'ab') {} }",
    // Spreads outside an array literal are not reported.
    "f(...'ab');",
    "const o = { ...'ab' };",
    // `Array.from` looked up some other way, or not the built-in one.
    "Array['from']('ab');",
    "Array.of('ab');",
    "Foo.from('ab');",
    "class Array {} Array.from('ab');",
    "function f(Array) { return Array.from('ab'); }",
    'Array.from();',
    'Array.from(...args);',
  ],
  invalid: [
    // `for…of`: only the iterated string is replaced.
    suggests(`for (const c of ${WAVE}) {}`, 'forOf', WAVE, 'iterate', WAVE),
    suggests("for (c of 'a' + b) {}", 'forOf', "'a' + b", 'iterate', "'a' + b"),
    // Spread: the whole array when it is the only element…
    suggests(`const a = [...${WAVE}];`, 'spread', `[...${WAVE}]`, 'toArray', WAVE),
    suggests("const a = [...'ab',];", 'spread', "[...'ab',]", 'toArray', "'ab'"),
    // …and otherwise just the spread string.
    suggests("const a = [...'ab', x];", 'spread', "'ab'", 'iterate', "'ab'"),
    suggests("const a = [x, ...'ab'];", 'spread', "'ab'", 'iterate', "'ab'"),
    suggests("const a = [, ...'ab'];", 'spread', "'ab'", 'iterate', "'ab'"),
    // Each string spread is its own report.
    {
      code: "const a = [...'ab', ...'cd'];",
      errors: [
        { messageId: 'spread', line: 1, column: 11 },
        { messageId: 'spread', line: 1, column: 20 },
      ],
    },
    // `Array.from`, with no map function.
    suggests("Array.from('ab');", 'arrayFrom', "Array.from('ab')", 'toArray', "'ab'"),
    // A map function that behaves the same under `map` is carried over.
    suggests(
      "Array.from('ab', (c) => c + c);",
      'arrayFrom',
      "Array.from('ab', (c) => c + c)",
      'toArray',
      "'ab'",
      '.map((c) => c + c)',
    ),
    suggests(
      "Array.from('ab', (c, i) => c + i).length;",
      'arrayFrom',
      "Array.from('ab', (c, i) => c + i)",
      'toArray',
      "'ab'",
      '.map((c, i) => c + i)',
    ),
    suggests(
      "Array.from('ab', function (c) { return c; });",
      'arrayFrom',
      "Array.from('ab', function (c) { return c; })",
      'toArray',
      "'ab'",
      '.map(function (c) { return c; })',
    ),
    suggests(
      "Array.from('ab', () => arguments.length);",
      'arrayFrom',
      "Array.from('ab', () => arguments.length)",
      'toArray',
      "'ab'",
      '.map(() => arguments.length)',
    ),
    // Any other map function keeps `Array.from`, over an iterator.
    suggests("Array.from('ab', f);", 'arrayFrom', "'ab'", 'iterate', "'ab'"),
    suggests("Array.from('ab', (c, i, x) => c);", 'arrayFrom', "'ab'", 'iterate', "'ab'"),
    suggests("Array.from('ab', (...xs) => xs);", 'arrayFrom', "'ab'", 'iterate', "'ab'"),
    suggests(
      "Array.from('ab', function () { return arguments.length; });",
      'arrayFrom',
      "'ab'",
      'iterate',
      "'ab'",
    ),
    suggests("Array.from('ab', (c) => c, self);", 'arrayFrom', "'ab'", 'iterate', "'ab'"),
    suggests("Array.from('ab', ...rest);", 'arrayFrom', "'ab'", 'iterate', "'ab'"),
    suggests("Array.from('ab', (c) => /* twice */ c + c);", 'arrayFrom', "'ab'", 'iterate', "'ab'"),
    // Optional calls would need a conditional.
    unsuggested("Array?.from('ab');", 'arrayFrom'),
    unsuggested("Array.from?.('ab', f);", 'arrayFrom'),
    unsuggested("Array?.from('ab').length;", 'arrayFrom'),
  ],
});

tsRuleTester.run('no-unsafe-iteration (TypeScript)', rule, {
  valid: ['function f(a: string[]) { for (const x of a) {} return [...a]; }'],
  invalid: [
    suggests(
      'function f(word: string) { for (const c of word) {} }',
      'forOf',
      'word)',
      'iterate',
      'word',
      ')',
    ),
    suggests('function f(s: string) { return [...s]; }', 'spread', '[...s]', 'toArray', 's'),
    suggests(
      'function f(s: string) { return Array.from(s); }',
      'arrayFrom',
      'Array.from(s)',
      'toArray',
      's',
    ),
  ],
});
