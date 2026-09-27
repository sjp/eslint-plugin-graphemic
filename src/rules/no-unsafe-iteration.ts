import type { Context, ESTree, Suggestion } from '@oxlint/plugins';

import { createRule } from '../utils/createRule.js';
import type { Unit } from '../utils/graphemic.js';
import { type CallSuggestion, callSuggestions } from '../utils/replace.js';
import { resolve } from '../utils/scope.js';
import { isStringLike } from '../utils/strings.js';

/** Every unit graphemic can iterate in, in the order the suggestions are offered. */
const UNITS: readonly Unit[] = ['graphemes', 'codePoints'];

export default createRule('no-unsafe-iteration', {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow iterating strings with `for…of`, spread or `Array.from`, which yields code points and splits characters apart.',
      recommended: true,
    },
    hasSuggestions: true,
    messages: {
      forOf:
        "`for…of` over a string steps through code points, not characters: it visits `'👋🏽'` as a wave, then a separate skin tone.",
      spread:
        "Spreading a string splits it into code points, not characters: `[...'👋🏽']` is two elements.",
      arrayFrom:
        "`Array.from()` on a string splits it into code points, not characters: `Array.from('👋🏽')` is two elements.",
      graphemes: 'Iterate over user-visible characters (graphemes).',
      graphemesArray: 'Split into user-visible characters (graphemes).',
      codePoints: 'Keep iterating over code points, and say so.',
      codePointsArray: 'Keep splitting into code points, and say so.',
    },
    schema: [],
  },
  create(context) {
    return {
      ForOfStatement(loop: ESTree.ForOfStatement) {
        // `for await` wants an async iterable, which graphemic does not return.
        if (loop.await || !isStringLike(context, loop.right)) return;
        context.report({
          node: loop.right,
          messageId: 'forOf',
          suggest: iterate(context, loop.right),
        });
      },
      SpreadElement(spread: ESTree.SpreadElement) {
        const array = spread.parent;
        // Spreading into a call or an object is left for later.
        if (array.type !== 'ArrayExpression') return;
        const s = spread.argument;
        if (!isStringLike(context, s)) return;
        context.report({
          node: spread,
          messageId: 'spread',
          // `[...s]` is the array itself; anywhere else only `s` is replaced.
          suggest: array.elements.length === 1 ? toArray(context, array, s) : iterate(context, s),
        });
      },
      CallExpression(call: ESTree.CallExpression) {
        const { callee } = call;
        if (callee.type !== 'MemberExpression' || callee.computed) return;
        if (callee.object.type !== 'Identifier' || callee.object.name !== 'Array') return;
        if (callee.property.type !== 'Identifier' || callee.property.name !== 'from') return;
        const variable = resolve(context, callee.object, 'Array');
        if (variable !== undefined && variable.defs.length > 0) return;
        const [s] = call.arguments;
        if (s === undefined || s.type === 'SpreadElement' || !isStringLike(context, s)) return;

        // `Array.from?.(s)` is reported as the whole chain, which is what gets replaced.
        const node = call.parent.type === 'ChainExpression' ? call.parent : call;
        // Replacing any part of an optional call would need a conditional.
        const optional = callee.optional || call.optional;
        context.report({
          node,
          messageId: 'arrayFrom',
          suggest: optional ? [] : arrayFrom(context, call, s),
        });
      },
    };
  },
});

/** The suggestions replacing `s` with an iterator over it, in each unit. */
function iterate(context: Context, s: ESTree.Expression): Suggestion[] {
  return callSuggestions(
    context,
    s,
    UNITS.map((unit) => ({ messageId: unit, unit, fn: 'iterate', args: [s] })),
  );
}

/**
 * The suggestions replacing `node` with the array of `s`'s parts in each unit,
 * mapped through `fn` when it is given.
 */
function toArray(
  context: Context,
  node: ESTree.Expression,
  s: ESTree.Expression,
  fn?: ESTree.Expression,
): Suggestion[] {
  const suffix = fn === undefined ? undefined : `.map(${context.sourceCode.getText(fn)})`;
  return callSuggestions(
    context,
    node,
    UNITS.map((unit): CallSuggestion => {
      const suggestion: CallSuggestion = {
        messageId: `${unit}Array`,
        unit,
        fn: 'toArray',
        args: [s],
      };
      if (suffix !== undefined) Object.assign(suggestion, { suffix, chained: true });
      return suggestion;
    }),
  );
}

/**
 * The suggestions for `Array.from(s, …)`: `toArray`, followed by `.map(fn)`
 * when that behaves the same, and otherwise `s` alone replaced by an iterator,
 * which keeps every other argument's meaning.
 */
function arrayFrom(
  context: Context,
  call: ESTree.CallExpression,
  s: ESTree.Expression,
): Suggestion[] {
  const [, fn, ...rest] = call.arguments;
  if (fn === undefined) return toArray(context, call, s);
  if (rest.length === 0 && fn.type !== 'SpreadElement' && mapsAlike(context, fn)) {
    const mapped = toArray(context, call, s, fn);
    // A comment inside `fn` would not survive as suffix text; the iterator form keeps it.
    if (mapped.length > 0) return mapped;
  }
  return iterate(context, s);
}

/**
 * Whether `fn` behaves the same passed to `map` as to `Array.from`. `map`
 * passes the array as a third argument, which `from` does not, so `fn` must be
 * written inline where that can be seen: no more than two parameters, no rest
 * parameter, and no use of `arguments`.
 */
function mapsAlike(context: Context, fn: ESTree.Expression): boolean {
  if (fn.type !== 'ArrowFunctionExpression' && fn.type !== 'FunctionExpression') return false;
  if (fn.params.length > 2 || fn.params.some((param) => param.type === 'RestElement')) {
    return false;
  }
  if (fn.type === 'ArrowFunctionExpression') return true;
  const args = context.sourceCode.getScope(fn).set.get('arguments');
  return args === undefined || args.references.length === 0;
}
