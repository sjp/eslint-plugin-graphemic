import type { RuleTester } from 'oxlint/plugins-dev';

import { type CallOption, callRule } from '../test/callRule.js';
import { ruleTester, tsRuleTester } from '../test/ruleTester.js';

const IMPORT = "import { graphemes } from '@sjpnz/graphemic';\n";
const LENGTH: CallOption[] = [{ unit: 'graphemes', fn: 'length' }];
/** `graphemes.at(s, 0) ?? ''`: a call with a suffix that binds more loosely than it. */
const FIRST: CallOption[] = [{ unit: 'graphemes', fn: 'at', extra: ['0'], suffix: " ?? ''" }];
/** `graphemes.toArray(s).map(f)`: a call with a suffix that chains onto it. */
const MAPPED: CallOption[] = [
  { unit: 'graphemes', fn: 'toArray', suffix: '.map(f)', chained: true },
];

/**
 * An invalid case whose one report suggests `IMPORT` followed by `output`, or
 * nothing when `output` is `null`.
 */
function suggests(
  code: string,
  output: string | null,
  options: CallOption[] = LENGTH,
): RuleTester.InvalidTestCase {
  return {
    code,
    options,
    errors: [
      {
        messageId: 'report',
        suggestions: output === null ? [] : [{ messageId: 'suggest', output: IMPORT + output }],
      },
    ],
  };
}

ruleTester.run('callSuggestion', callRule, {
  valid: [],
  invalid: [
    // Arguments keep their source text; the receiver loses parentheses it no longer needs.
    suggests('(a + b).$;', 'graphemes.length(a + b);'),
    suggests('(a, b).$;', 'graphemes.length((a, b));'),
    suggests("'ab'.$(1, x => x);", "graphemes.slice('ab', 1, x => x);", [
      { unit: 'graphemes', fn: 'slice' },
    ]),
    suggests("'ab'.$(1);", "graphemes.slice('ab', 1, 2);", [
      { unit: 'graphemes', fn: 'slice', extra: ['2'] },
    ]),
    // The data reaches the message.
    {
      code: "'ab'.$;",
      options: LENGTH,
      errors: [
        {
          messageId: 'report',
          suggestions: [{ desc: 'Use graphemes.', output: `${IMPORT}graphemes.length('ab');` }],
        },
      ],
    },

    // Comments: kept inside a node argument, otherwise no suggestion.
    suggests("('a' /* why */ + b).$;", "graphemes.length('a' /* why */ + b);"),
    suggests("'ab'./* why */$;", null),
    suggests("'ab'.$(/* start */ 1);", null, [{ unit: 'graphemes', fn: 'slice' }]),
    suggests("'ab'.$(1 /* start */);", null, [{ unit: 'graphemes', fn: 'slice' }]),
    suggests("'ab'.$(1 + /* start */ 2);", "graphemes.slice('ab', 1 + /* start */ 2);", [
      { unit: 'graphemes', fn: 'slice' },
    ]),
    // A comment outside the replaced range is untouched.
    suggests("'ab'.$; // why", "graphemes.length('ab'); // why"),

    // Optional chains are left alone: `graphemes.length(s)` throws where `s?.length` does not.
    suggests('s?.$;', null),
    suggests('a?.b.$;', null),
    suggests('a?.$.b;', null),
    suggests('f?.().$.b;', null),
    suggests('s.$(x)?.y;', 'graphemes.length(s, x)?.y;'),
    suggests('f().$;', 'graphemes.length(f());'),

    // A bare call goes anywhere, except as the callee of `new`.
    suggests('x + s.$;', 'x + graphemes.length(s);'),
    suggests('s.$.toFixed();', 'graphemes.length(s).toFixed();'),
    suggests('new s.$();', 'new (graphemes.length(s))();'),

    // A call with a suffix is parenthesised where it would otherwise bind wrongly.
    suggests("'ab'.$;", "graphemes.at('ab', 0) ?? '';", FIRST),
    suggests("x + 'ab'.$;", "x + (graphemes.at('ab', 0) ?? '');", FIRST),
    suggests("x || 'ab'.$;", "x || (graphemes.at('ab', 0) ?? '');", FIRST),
    suggests("y = 'ab'.$.x;", "y = (graphemes.at('ab', 0) ?? '').x;", FIRST),
    suggests("'ab'.$(1)(2);", "(graphemes.at('ab', 1, 0) ?? '')(2);", FIRST),
    suggests("f = (a = 'ab'.$) => a;", "f = (a = (graphemes.at('ab', 0) ?? '')) => a;", FIRST),
    // …and not where it already is, or where any expression is allowed.
    suggests("y = ('ab'.$).x;", "y = (graphemes.at('ab', 0) ?? '').x;", FIRST),
    suggests("if ('ab'.$) {}", "if (graphemes.at('ab', 0) ?? '') {}", FIRST),
    suggests("f(1, 'ab'.$);", "f(1, graphemes.at('ab', 0) ?? '');", FIRST),
    suggests("new C(1, 'ab'.$);", "new C(1, graphemes.at('ab', 0) ?? '');", FIRST),
    suggests("const y = 'ab'.$;", "const y = graphemes.at('ab', 0) ?? '';", FIRST),
    suggests("y = 'ab'.$;", "y = graphemes.at('ab', 0) ?? '';", FIRST),
    suggests("f = () => 'ab'.$;", "f = () => graphemes.at('ab', 0) ?? '';", FIRST),
    suggests("[1, 'ab'.$];", "[1, graphemes.at('ab', 0) ?? ''];", FIRST),
    suggests("`${'ab'.$}`;", "`${graphemes.at('ab', 0) ?? ''}`;", FIRST),
    suggests("y = c ? 'ab'.$ : 1;", "y = c ? graphemes.at('ab', 0) ?? '' : 1;", FIRST),
    suggests("y = { k: 'ab'.$ };", "y = { k: graphemes.at('ab', 0) ?? '' };", FIRST),
    suggests(
      "function f() { return 'ab'.$; }",
      "function f() { return graphemes.at('ab', 0) ?? ''; }",
      FIRST,
    ),
    // A chained suffix binds as tightly as the call, so it needs no more parentheses than one.
    suggests("x + 'ab'.$;", "x + graphemes.toArray('ab').map(f);", MAPPED),
    suggests("y = 'ab'.$.x;", "y = graphemes.toArray('ab').map(f).x;", MAPPED),
    suggests("new 'ab'.$();", "new (graphemes.toArray('ab').map(f))();", MAPPED),

    // A parenthesised replacement starting a statement is guarded against
    // joining the one before, when that has no semicolon.
    suggests("f()\n'ab'.$.x", "f()\n;(graphemes.at('ab', 0) ?? '').x", FIRST),
    suggests("f();\n'ab'.$.x", "f();\n(graphemes.at('ab', 0) ?? '').x", FIRST),
    suggests("{ 'ab'.$.x }", "{ (graphemes.at('ab', 0) ?? '').x }", FIRST),
    suggests("'ab'.$.x", "(graphemes.at('ab', 0) ?? '').x", FIRST),
    suggests("f()\ny = 'ab'.$.x", "f()\ny = (graphemes.at('ab', 0) ?? '').x", FIRST),
    suggests("f()\nconst y = 'ab'.$.x", "f()\nconst y = (graphemes.at('ab', 0) ?? '').x", FIRST),

    // Suggestions that cannot be built are dropped; the rest keep their order.
    {
      code: "const columns = 1;\n'ab'.$;",
      options: [
        { unit: 'columns', fn: 'length' },
        { unit: 'graphemes', fn: 'length' },
      ],
      errors: [
        {
          messageId: 'report',
          suggestions: [
            {
              messageId: 'suggest',
              data: { unit: 'graphemes' },
              output: `${IMPORT}const columns = 1;\ngraphemes.length('ab');`,
            },
          ],
        },
      ],
    },
  ],
});

tsRuleTester.run('callSuggestion (TypeScript)', callRule, {
  valid: [],
  invalid: [
    suggests('s!.$;', 'graphemes.length(s!);'),
    suggests('(s as string).$;', 'graphemes.length(s as string);'),
    suggests('s?.x!.$;', null),
    suggests("'ab'.$ as string;", "(graphemes.at('ab', 0) ?? '') as string;", FIRST),
  ],
});
