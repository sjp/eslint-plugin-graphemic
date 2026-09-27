import { ruleTester, tsRuleTester } from '../test/ruleTester.js';
import rule from './no-unsafe-split.js';

const GRAPHEMES = "import { graphemes } from '@sjpnz/graphemic';\n";
const CODE_POINTS = "import { codePoints } from '@sjpnz/graphemic';\n";
const ALL = [{ separators: 'all' }];

/**
 * The one report on `code`, with `messageId`, whose suggestions replace
 * `replaced` in it with `toArray` on `receiver`, in graphemes then code points.
 */
function toArray(code: string, messageId: string, replaced: string, receiver: string) {
  return {
    code,
    errors: [
      {
        messageId,
        suggestions: [
          {
            messageId: 'graphemes',
            output: GRAPHEMES + code.replace(replaced, `graphemes.toArray(${receiver})`),
          },
          {
            messageId: 'codePoints',
            output: CODE_POINTS + code.replace(replaced, `codePoints.toArray(${receiver})`),
          },
        ],
      },
    ],
  };
}

/**
 * The one report on `code`, with `messageId`, whose one suggestion replaces
 * `replaced` in it with `graphemes.split` on `args`.
 */
function split(
  code: string,
  messageId: string,
  replaced: string,
  args: string,
  options?: unknown[],
) {
  return {
    code,
    ...(options === undefined ? {} : { options }),
    errors: [
      {
        messageId,
        suggestions: [
          {
            messageId: 'graphemesSplit',
            output: GRAPHEMES + code.replace(replaced, `graphemes.split(${args})`),
          },
        ],
      },
    ],
  };
}

/** The one report on `code`, with `messageId`, which has no suggestions. */
function unsuggested(code: string, messageId: string, options?: unknown[]) {
  return {
    code,
    ...(options === undefined ? {} : { options }),
    errors: [{ messageId, suggestions: [] }],
  };
}

ruleTester.run('no-unsafe-split', rule, {
  valid: [
    // Nothing to split on: `split` returns `[s]`.
    's.split();',
    's.split(undefined);',
    's.split(...args);',
    // Non-empty separators, by default.
    "s.split(',');",
    's.split(/,\\s*/);',
    's.split(sep);',
    "s.split(' ', 2);",
    's.split(`${a}`);',
    // Patterns that match the empty string, but are not spelled empty.
    's.split(/(?=)/);',
    "s.split(new RegExp('a'));",
    's.split(new RegExp(...args));',
    "s.split(new Foo(''));",
    "s.split(re.RegExp(''));",
    "class RegExp {} s.split(new RegExp(''));",
    // Other methods, and `split` looked up some other way.
    "s.slice('');",
    "s['split']('');",
    "class A extends B { f() { return super.split(''); } }",
    {
      code: 's.split();',
      options: ALL,
    },
    // graphemic's own `split`, which this rule suggests.
    "import { graphemes } from '@sjpnz/graphemic'; graphemes.split(s, '');",
    {
      code: "import { graphemes } from '@sjpnz/graphemic'; graphemes.split(s, ',');",
      options: ALL,
    },
  ],
  invalid: [
    // Every spelling of the empty separator, on any receiver.
    toArray(
      "'\u{1F44B}\u{1F3FD}'.split('');",
      'empty',
      "'\u{1F44B}\u{1F3FD}'.split('')",
      "'\u{1F44B}\u{1F3FD}'",
    ),
    toArray('s.split("");', 'empty', 's.split("")', 's'),
    toArray('s.split(``);', 'empty', 's.split(``)', 's'),
    toArray('s.split(/(?:)/);', 'empty', 's.split(/(?:)/)', 's'),
    toArray('s.split(/(?:)/g);', 'empty', 's.split(/(?:)/g)', 's'),
    toArray("s.split(new RegExp(''));", 'empty', "s.split(new RegExp(''))", 's'),
    toArray('s.split(new RegExp());', 'empty', 's.split(new RegExp())', 's'),
    toArray("s.split(RegExp(''));", 'empty', "s.split(RegExp(''))", 's'),
    toArray("s.split(new RegExp('', 'g'));", 'empty', "s.split(new RegExp('', 'g'))", 's'),
    toArray("s.split(new RegExp('', flags));", 'empty', "s.split(new RegExp('', flags))", 's'),
    toArray('(a + b).split(``);', 'empty', '(a + b).split(``)', 'a + b'),
    // Nothing but strings has `split`, so the receiver is not checked.
    toArray("function f(x) { return x.split(''); }", 'empty', "x.split('')", 'x'),
    toArray("[1, 2].split('');", 'empty', "[1, 2].split('')", '[1, 2]'),
    // An empty pattern with the `u` or `v` flag splits into code points.
    toArray('s.split(/(?:)/u);', 'emptyCodePoints', 's.split(/(?:)/u)', 's'),
    toArray('s.split(/(?:)/v);', 'emptyCodePoints', 's.split(/(?:)/v)', 's'),
    toArray(
      "s.split(new RegExp('', 'u'));",
      'emptyCodePoints',
      "s.split(new RegExp('', 'u'))",
      's',
    ),
    // A limit: graphemic's `split`, on the empty string.
    split("s.split('', 2);", 'empty', "s.split('', 2)", "s, '', 2"),
    split('s.split("", n);', 'empty', 's.split("", n)', 's, "", n'),
    split('s.split(/(?:)/, 2);', 'empty', 's.split(/(?:)/, 2)', "s, '', 2"),
    split('s.split(/(?:)/u, 2);', 'emptyCodePoints', 's.split(/(?:)/u, 2)', "s, '', 2"),
    // Arguments that would not carry over.
    unsuggested("s.split('', ...rest);", 'empty'),
    unsuggested("s.split('', 2, extra);", 'empty'),
    unsuggested("s?.split('');", 'empty'),
    unsuggested("s.split(/* each */ '');", 'empty'),
    // Every other separator, when asked.
    split("s.split(',');", 'separator', "s.split(',')", "s, ','", ALL),
    split("s.split(',', 3);", 'separator', "s.split(',', 3)", "s, ',', 3", ALL),
    split("s.split('e' + x);", 'separator', "s.split('e' + x)", "s, 'e' + x", ALL),
    // Separators graphemic's `split` does not take, or may not be strings.
    unsuggested('s.split(/,\\s*/);', 'separator', ALL),
    unsuggested("s.split(new RegExp(','));", 'separator', ALL),
    unsuggested('s.split(sep);', 'separator', ALL),
    unsuggested("s.split(',', ...rest);", 'separator', ALL),
    // The empty separator is still reported as such.
    {
      ...toArray("s.split('');", 'empty', "s.split('')", 's'),
      options: ALL,
    },
  ],
});

tsRuleTester.run('no-unsafe-split (TypeScript)', rule, {
  valid: ["function f(s: string) { return s.split(','); }"],
  invalid: [
    toArray("function f(s: string) { return s.split(''); }", 'empty', "s.split('')", 's'),
    split(
      'function f(s: string, sep: string) { return s.split(sep); }',
      'separator',
      's.split(sep)',
      's, sep',
      ALL,
    ),
  ],
});
