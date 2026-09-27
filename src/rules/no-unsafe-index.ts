import type { Context, ESTree, Suggestion } from '@oxlint/plugins';

import { createRule } from '../utils/createRule.js';
import type { Unit } from '../utils/graphemic.js';
import { isWritten } from '../utils/isWritten.js';
import { callSuggestions } from '../utils/replace.js';
import { resolve } from '../utils/scope.js';
import { isStringLike } from '../utils/strings.js';

/** Every unit graphemic can index in, in the order the suggestions are offered. */
const UNITS: readonly Unit[] = ['graphemes', 'codePoints'];

type Method = 'at' | 'charAt';

/**
 * The methods reported, and whether each exists only on strings. `at` is
 * shared with arrays and typed arrays, so it needs a receiver known to be a
 * string; `charAt` can be reported on anything.
 */
const METHODS: ReadonlyMap<string, { method: Method; stringOnly: boolean }> = new Map([
  ['at', { method: 'at', stringOnly: false }],
  ['charAt', { method: 'charAt', stringOnly: true }],
]);

const READS = 'reads one UTF-16 code unit, not a character:';

export default createRule('no-unsafe-index', {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow `s[i]`, `at` and `charAt` on strings, which read one UTF-16 code unit.',
      recommended: true,
    },
    hasSuggestions: true,
    messages: {
      index: `Indexing a string ${READS} \`'👋🏽'[0]\` is half of \`'👋'\`.`,
      negativeIndex:
        'Indexing a string reads one UTF-16 code unit, and `[]` does not count back from the end: `s[-1]` is always `undefined`.',
      at: `\`.at()\` ${READS} \`'👋🏽'.at(0)\` is half of \`'👋'\`.`,
      charAt: `\`.charAt()\` ${READS} \`'👋🏽'.charAt(0)\` is half of \`'👋'\`.`,
      graphemes: 'Read the user-visible character (grapheme) at this index.',
      codePoints: 'Read the code point at this index, for an index counted in code points.',
    },
    schema: [],
  },
  create(context) {
    return {
      MemberExpression(member: ESTree.MemberExpression) {
        if (!member.computed || member.object.type === 'Super') return;
        const index = member.property;
        if (!isIndex(context, index) || !isStringLike(context, member.object)) return;
        // `s?.[0]` is reported as the whole chain, which is what gets replaced.
        const node = member.parent.type === 'ChainExpression' ? member.parent : member;
        if (isWritten(node)) return;

        const value = numberValue(index);
        if (value !== undefined && value < 0) {
          context.report({ node, messageId: 'negativeIndex' });
          return;
        }
        // `s[1.5]` and `s[0n]` are an own-property lookup that `at` would not
        // make: it truncates the first and throws on the second, the only
        // non-numeric literal index.
        const carriesOver =
          value === undefined ? index.type !== 'Literal' : Number.isInteger(value);
        context.report({
          node,
          messageId: 'index',
          suggest: carriesOver ? suggestions(context, node, member.object, index) : [],
        });
      },
      CallExpression(call: ESTree.CallExpression) {
        const { callee } = call;
        if (callee.type !== 'MemberExpression' || callee.computed) return;
        if (callee.property.type !== 'Identifier' || callee.object.type === 'Super') return;
        const found = METHODS.get(callee.property.name);
        if (found === undefined) return;
        const receiver = callee.object;
        if (!found.stringOnly && !isStringLike(context, receiver)) return;

        // `s?.at(0)` is reported as the whole chain, which is what gets replaced.
        const node = call.parent.type === 'ChainExpression' ? call.parent : call;
        const { method } = found;
        const index = methodIndex(method, call.arguments);
        context.report({
          node,
          messageId: method,
          suggest:
            index === undefined
              ? []
              : suggestions(
                  context,
                  node,
                  receiver,
                  index,
                  method === 'charAt' ? " ?? ''" : undefined,
                ),
        });
      },
    };
  },
});

/**
 * The `at` suggestions for reading `index` from `receiver`, followed by
 * `suffix` when there is one: `charAt` gives `''` out of range, where `at`
 * gives `undefined`.
 */
function suggestions(
  context: Context,
  node: ESTree.Expression,
  receiver: ESTree.Expression,
  index: ESTree.Node | string,
  suffix?: string,
): Suggestion[] {
  const args = [receiver, index];
  return callSuggestions(
    context,
    node,
    UNITS.map((unit) =>
      suffix === undefined
        ? { messageId: unit, unit, fn: 'at', args }
        : { messageId: unit, unit, fn: 'at', args, suffix },
    ),
  );
}

/**
 * The index a method call passes on to graphemic's `at`, or `undefined` when
 * it does not carry over: a spread, an extra argument, or, for `charAt`, a
 * literal that counts back from the end, where `charAt` gives `''` and `at`
 * the last character. A missing index is 0 to both methods.
 */
function methodIndex(
  method: Method,
  args: readonly ESTree.Argument[],
): ESTree.Node | string | undefined {
  if (args.length > 1) return undefined;
  const [index] = args;
  if (index === undefined) return '0';
  if (index.type === 'SpreadElement') return undefined;
  if (method === 'charAt') {
    const value = numberValue(index);
    // Both methods truncate toward zero, so `-0.5` is index 0 to each.
    if (value !== undefined && Math.trunc(value) < 0) return undefined;
  }
  return index;
}

/**
 * Whether `key`, in `s[key]`, is an index rather than a property name.
 * Anything known to be a string names a property (`s['length']`, `` s[`x`] ``),
 * as do other non-numeric literals (`s[null]`) and well-known symbols
 * (`s[Symbol.iterator]`). Everything else might be a number.
 */
function isIndex(context: Context, key: ESTree.Expression): boolean {
  if (key.type === 'Literal') return typeof key.value === 'number' || typeof key.value === 'bigint';
  if (
    key.type === 'MemberExpression' &&
    key.object.type === 'Identifier' &&
    key.object.name === 'Symbol'
  ) {
    const variable = resolve(context, key.object, 'Symbol');
    if (variable === undefined || variable.defs.length === 0) return false;
  }
  return !isStringLike(context, key);
}

/** The number `node` spells, as in `1`, `1.5` or `-1`, if it is a numeric literal. */
function numberValue(node: ESTree.Node): number | undefined {
  if (node.type === 'Literal') return typeof node.value === 'number' ? node.value : undefined;
  if (node.type !== 'UnaryExpression' || node.operator !== '-') return undefined;
  const value = numberValue(node.argument);
  return value === undefined ? undefined : -value;
}
