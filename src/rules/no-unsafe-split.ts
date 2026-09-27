import type { Context, ESTree, Suggestion } from '@oxlint/plugins';

import { createRule } from '../utils/createRule.js';
import { callSuggestions } from '../utils/replace.js';
import { resolve } from '../utils/scope.js';
import { isStringLike } from '../utils/strings.js';

interface Options {
  separators?: 'empty' | 'all';
}

/**
 * What an empty separator splits into: code units, or code points for an
 * empty pattern with the `u` or `v` flag, which never splits a surrogate pair.
 */
type EmptySplit = 'codeUnits' | 'codePoints';

export default createRule('no-unsafe-split', {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow `split` into UTF-16 code units, and optionally on any separator, which can cut characters apart.',
      recommended: true,
    },
    hasSuggestions: true,
    messages: {
      empty:
        "`.split('')` splits into UTF-16 code units, not characters: `'👋🏽'.split('')` is four lone surrogates.",
      emptyCodePoints:
        "`.split()` on an empty pattern with the `u` or `v` flag splits into code points, not characters: `'👋🏽'.split(/(?:)/u)` parts the wave from its skin tone.",
      separator:
        "`.split()` matches its separator at any UTF-16 code unit, so it can cut a character apart: `'e\\u0301'.split('e')` leaves a lone accent.",
      graphemes: 'Split into user-visible characters (graphemes).',
      codePoints:
        'Split into code points, for code that works in code points, e.g. a limit defined in code points.',
      graphemesSplit:
        'Split only at separators that fall between user-visible characters (graphemes).',
    },
    schema: [
      {
        type: 'object',
        properties: {
          separators: {
            enum: ['empty', 'all'],
            default: 'empty',
            description:
              "`'empty'` reports only splits into single code units; `'all'` also reports every other separator, since any can match inside a character.",
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the schema has checked them
    const { separators = 'empty' } = (context.options[0] ?? {}) as Options;

    return {
      CallExpression(call: ESTree.CallExpression) {
        const { callee } = call;
        if (callee.type !== 'MemberExpression' || callee.computed) return;
        if (callee.property.type !== 'Identifier' || callee.object.type === 'Super') return;
        // Only strings have `split`, so the receiver is not checked.
        if (callee.property.name !== 'split') return;
        const [separator] = call.arguments;
        // With no separator, `split` returns `[s]`; a spread could be anything.
        if (separator === undefined || separator.type === 'SpreadElement') return;
        if (separator.type === 'Identifier' && separator.name === 'undefined') return;
        const empty = emptySplit(context, separator);
        if (empty === undefined && separators === 'empty') return;

        // `s?.split('')` is reported as the whole chain, which is what gets replaced.
        const node = call.parent.type === 'ChainExpression' ? call.parent : call;
        context.report({
          node,
          messageId:
            empty === undefined ? 'separator' : empty === 'codeUnits' ? 'empty' : 'emptyCodePoints',
          suggest: suggestions(context, node, callee.object, separator, call.arguments, empty),
        });
      },
    };
  },
});

/**
 * The suggestions for a reported `split`: `toArray` in graphemes and code
 * points for an empty separator with no limit, and graphemic's `split`
 * otherwise, which takes a string separator only.
 */
function suggestions(
  context: Context,
  node: ESTree.Expression,
  receiver: ESTree.Expression,
  separator: ESTree.Expression,
  args: readonly ESTree.Argument[],
  empty: EmptySplit | undefined,
): Suggestion[] {
  const limit = args[1];
  // A third argument would land past graphemic's `limit`.
  if (args.length > 2 || limit?.type === 'SpreadElement') return [];
  if (empty !== undefined && limit === undefined) {
    return callSuggestions(context, node, [
      { messageId: 'graphemes', unit: 'graphemes', fn: 'toArray', args: [receiver] },
      { messageId: 'codePoints', unit: 'codePoints', fn: 'toArray', args: [receiver] },
    ]);
  }
  let text: ESTree.Node | string = separator;
  if (empty !== undefined) {
    // An empty pattern becomes the empty string it splits on.
    if (!isEmptyString(separator)) text = "''";
  } else if (!isStringLike(context, separator)) {
    return [];
  }
  return callSuggestions(context, node, [
    {
      messageId: 'graphemesSplit',
      unit: 'graphemes',
      fn: 'split',
      args: limit === undefined ? [receiver, text] : [receiver, text, limit],
    },
  ]);
}

/**
 * What `separator` splits into when it is empty — `''`, an empty template,
 * `/(?:)/`, or the `RegExp` that spells it — and `undefined` otherwise.
 */
function emptySplit(context: Context, separator: ESTree.Expression): EmptySplit | undefined {
  if (isEmptyString(separator)) return 'codeUnits';
  if (separator.type === 'Literal' && 'regex' in separator) {
    return separator.regex.pattern === '(?:)' ? unitForFlags(separator.regex.flags) : undefined;
  }
  if (separator.type !== 'NewExpression' && separator.type !== 'CallExpression') return undefined;
  const { callee } = separator;
  if (callee.type !== 'Identifier' || callee.name !== 'RegExp') return undefined;
  const variable = resolve(context, callee, 'RegExp');
  if (variable !== undefined && variable.defs.length > 0) return undefined;
  const [pattern, flags] = separator.arguments;
  if (pattern !== undefined && (pattern.type === 'SpreadElement' || !isEmptyString(pattern))) {
    return undefined;
  }
  return flags?.type === 'Literal' && typeof flags.value === 'string'
    ? unitForFlags(flags.value)
    : 'codeUnits';
}

/** What an empty pattern with `flags` splits into. */
function unitForFlags(flags: string): EmptySplit {
  return flags.includes('u') || flags.includes('v') ? 'codePoints' : 'codeUnits';
}

/** Whether `node` is `''`, `""` or an empty template. */
function isEmptyString(node: ESTree.Node): boolean {
  if (node.type === 'Literal') return node.value === '';
  return (
    node.type === 'TemplateLiteral' &&
    node.expressions.length === 0 &&
    node.quasis[0]?.value.cooked === ''
  );
}
