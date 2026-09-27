import type { Context, ESTree } from '@oxlint/plugins';

import { createRule } from '../utils/createRule.js';
import { callSuggestions } from '../utils/replace.js';
import { resolve } from '../utils/scope.js';
import { stringEvidence } from '../utils/strings.js';

export default createRule('no-unsafe-reverse', {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow reversing a string by splitting, reversing and joining it, which scrambles characters made of several code points.',
      recommended: true,
    },
    hasSuggestions: true,
    messages: {
      reverse:
        "Reversing a string by splitting it reverses code units or code points, not characters: `'👋🏽'` comes back with its skin tone before the wave.",
      graphemes: 'Reverse the user-visible characters (graphemes), keeping each one intact.',
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(join: ESTree.CallExpression) {
        const joined = method(join, 'join', 1);
        if (joined === undefined || !isEmptyString(joined.args[0])) return;
        const reversed = unchain(joined.receiver);
        const reverse = method(reversed, 'reverse', 0) ?? method(reversed, 'toReversed', 0);
        if (reverse === undefined) return;
        const s = explodedString(context, unchain(reverse.receiver));
        if (s === undefined) return;

        // `s?.split('').reverse().join('')` is reported as the whole chain,
        // which is what gets replaced; the suggestion is left out, since a
        // correct rewrite needs a conditional.
        const node = join.parent.type === 'ChainExpression' ? join.parent : join;
        context.report({
          node,
          messageId: 'reverse',
          suggest: callSuggestions(context, node, [
            { messageId: 'graphemes', unit: 'graphemes', fn: 'reverse', args: [s] },
          ]),
        });
      },
    };
  },
});

/** A call to a method, as `method` matches it. */
interface MethodCall {
  receiver: ESTree.Expression;
  args: ESTree.Expression[];
}

/**
 * `node` as a call to the method `name` with exactly `arity` arguments, none
 * of them spread, and `undefined` otherwise.
 */
function method(node: ESTree.Node, name: string, arity: number): MethodCall | undefined {
  if (node.type !== 'CallExpression') return undefined;
  const { callee } = node;
  if (callee.type !== 'MemberExpression' || callee.computed) return undefined;
  if (callee.property.type !== 'Identifier' || callee.property.name !== name) return undefined;
  if (callee.object.type === 'Super' || node.arguments.length !== arity) return undefined;
  const args: ESTree.Expression[] = [];
  for (const arg of node.arguments) {
    if (arg.type === 'SpreadElement') return undefined;
    args.push(arg);
  }
  return { receiver: callee.object, args };
}

/**
 * The string that `node` breaks into an array of code units or code points —
 * `s` in `s.split('')`, `[...s]` or `Array.from(s)` — and `undefined` for
 * anything else. Only strings have `split`, so its receiver is not checked;
 * the other two are taken on the idiom's word unless `s` is plainly an array,
 * as in `[...parts].reverse().join('')`, which copies before reversing.
 */
function explodedString(context: Context, node: ESTree.Node): ESTree.Expression | undefined {
  const split = method(node, 'split', 1);
  if (split !== undefined) return isEmptyString(split.args[0]) ? split.receiver : undefined;
  const s = node.type === 'ArrayExpression' ? spreadOnly(node) : arrayFrom(context, node);
  return s === undefined || stringEvidence(context, s) === 'not-string' ? undefined : s;
}

/** `s` in `[...s]`. */
function spreadOnly(array: ESTree.ArrayExpression): ESTree.Expression | undefined {
  const [only] = array.elements;
  return array.elements.length === 1 && only?.type === 'SpreadElement' ? only.argument : undefined;
}

/** `s` in `Array.from(s)`, while `Array` is the built-in one. */
function arrayFrom(context: Context, node: ESTree.Node): ESTree.Expression | undefined {
  const from = method(node, 'from', 1);
  if (from?.receiver.type !== 'Identifier' || from.receiver.name !== 'Array') return undefined;
  const variable = resolve(context, from.receiver, 'Array');
  return variable !== undefined && variable.defs.length > 0 ? undefined : from.args[0];
}

/** `node`'s expression when it is an optional chain, so `(s?.split('')).reverse()` still matches. */
function unchain(node: ESTree.Expression): ESTree.Expression {
  return node.type === 'ChainExpression' ? node.expression : node;
}

/** Whether `node` is `''`, `""` or an empty template. */
function isEmptyString(node: ESTree.Node | undefined): boolean {
  if (node?.type === 'Literal') return node.value === '';
  return (
    node?.type === 'TemplateLiteral' &&
    node.expressions.length === 0 &&
    node.quasis[0]?.value.cooked === ''
  );
}
