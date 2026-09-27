import type { Context, ESTree, Suggestion } from '@oxlint/plugins';

import { createRule } from '../utils/createRule.js';
import type { Unit } from '../utils/graphemic.js';
import { hasIndexDerivedBounds } from '../utils/indexDerivedBounds.js';
import { callSuggestions } from '../utils/replace.js';
import { isStringLike } from '../utils/strings.js';

interface Options {
  allowIndexDerivedBounds?: boolean;
}

/** Every unit graphemic can slice in, in the order the suggestions are offered. */
const UNITS: readonly Unit[] = ['graphemes', 'codePoints', 'utf8', 'columns', 'codeUnits'];

type Method = 'slice' | 'substring' | 'substr';

/**
 * The methods reported, and whether each exists only on strings. `slice` is
 * shared with arrays and typed arrays, so it needs a receiver known to be a
 * string; the others can be reported on anything.
 */
const METHODS: ReadonlyMap<string, { method: Method; stringOnly: boolean }> = new Map([
  ['slice', { method: 'slice', stringOnly: false }],
  ['substring', { method: 'substring', stringOnly: true }],
  ['substr', { method: 'substr', stringOnly: true }],
]);

const CUTS =
  "takes UTF-16 code-unit offsets, so it can cut a character apart: `'👋🏽'.slice(0, 2)` is `'👋'`.";

export default createRule('no-unsafe-slice', {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow `slice`, `substring` and `substr` on strings, which cut at UTF-16 code-unit offsets.',
      recommended: true,
    },
    hasSuggestions: true,
    messages: {
      slice: `\`.slice()\` ${CUTS}`,
      substring: `\`.substring()\` ${CUTS}`,
      substringUnchecked: `\`.substring()\` ${CUTS} Unlike \`slice\`, \`substring\` clamps negative bounds and swaps reversed ones: check the arguments before accepting a suggestion.`,
      substr: `\`.substr()\` ${CUTS} \`substr\` is also deprecated.`,
      graphemes: 'Slice by user-visible characters (graphemes).',
      codePoints:
        'Slice by code points, for a limit defined in code points, e.g. some social networks.',
      utf8: 'Slice by UTF-8 bytes, for a byte limit, e.g. a database column.',
      columns: 'Slice by terminal columns, for terminal alignment.',
      codeUnits: 'Keep UTF-16 code-unit offsets, but never cut through a character.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowIndexDerivedBounds: {
            type: 'boolean',
            default: true,
            description:
              'Leave slices whose bounds come from `indexOf`, `lastIndexOf`, `search` or a checked prefix or suffix on the same string unreported.',
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the schema has checked them
    const { allowIndexDerivedBounds = true } = (context.options[0] ?? {}) as Options;

    return {
      CallExpression(call: ESTree.CallExpression) {
        const { callee } = call;
        if (callee.type !== 'MemberExpression' || callee.computed) return;
        if (callee.property.type !== 'Identifier' || callee.object.type === 'Super') return;
        const found = METHODS.get(callee.property.name);
        if (found === undefined) return;
        const receiver = callee.object;
        if (!found.stringOnly && !isStringLike(context, receiver)) return;
        // With no bounds nothing is cut: `s.slice()` is a copy.
        if (call.arguments.length === 0) return;
        if (allowIndexDerivedBounds && hasIndexDerivedBounds(context, call)) return;

        // `s?.slice(1)` is reported as the whole chain, which is what gets replaced.
        const node = call.parent.type === 'ChainExpression' ? call.parent : call;
        const { method } = found;
        context.report({
          node,
          messageId:
            method === 'substring' && !isOrdered(call.arguments) ? 'substringUnchecked' : method,
          suggest: suggestions(context, node, method, receiver, call.arguments),
        });
      },
    };
  },
});

/** The `slice` suggestions for a call, or none when its arguments do not carry over. */
function suggestions(
  context: Context,
  node: ESTree.Expression,
  method: Method,
  receiver: ESTree.Expression,
  args: readonly ESTree.Argument[],
): Suggestion[] {
  // A third argument would land on graphemic's options parameter.
  if (args.length > 2) return [];
  const bounds = method === 'substr' ? substrBounds(context, args) : args;
  if (bounds === undefined) return [];
  return callSuggestions(
    context,
    node,
    UNITS.map((unit) => ({ messageId: unit, unit, fn: 'slice', args: [receiver, ...bounds] })),
  );
}

/**
 * `substr(start, length)` as `slice` bounds: `start` and `start + length`,
 * folded into one number when both are. Only a `start` that is a
 * non-negative number or an identifier carries over, so writing it twice
 * neither repeats a side effect nor changes where a negative start counts
 * from; and a negative literal `length`, which gives `''`, does not.
 */
function substrBounds(
  context: Context,
  args: readonly ESTree.Argument[],
): ReadonlyArray<ESTree.Node | string> | undefined {
  const [start, length] = args;
  if (start === undefined || start.type === 'SpreadElement') return undefined;
  if (length === undefined) return [start];
  if (length.type === 'SpreadElement') return undefined;
  const from = nonNegative(start);
  if (from === undefined && start.type !== 'Identifier') return undefined;
  if (length.type === 'UnaryExpression' && length.operator === '-') {
    if (length.argument.type === 'Literal' && typeof length.argument.value === 'number') {
      return undefined;
    }
  }
  const count = nonNegative(length);
  if (from !== undefined && count !== undefined) return [start, String(from + count)];
  const { sourceCode } = context;
  const text = sourceCode.getText(length);
  const operand = isOperand(length) ? text : `(${text})`;
  return [start, `${sourceCode.getText(start)} + ${operand}`];
}

/** Whether `node` can follow `+` without parentheses and still be one operand. */
function isOperand(node: ESTree.Expression): boolean {
  switch (node.type) {
    case 'Identifier':
    case 'Literal':
    case 'MemberExpression':
    case 'CallExpression':
    case 'ThisExpression':
      return true;
    default:
      return false;
  }
}

/**
 * Whether `substring`'s arguments are sure to be neither negative nor
 * reversed, so it cuts exactly where `slice` would: one non-negative number,
 * two in order, or `0` and a `.length`.
 */
function isOrdered(args: readonly ESTree.Argument[]): boolean {
  const [start, end] = args;
  if (start === undefined || start.type === 'SpreadElement') return false;
  const from = nonNegative(start);
  if (from === undefined) return false;
  if (end === undefined) return true;
  if (end.type === 'SpreadElement') return false;
  const to = nonNegative(end);
  if (to !== undefined) return from <= to;
  return (
    from === 0 &&
    end.type === 'MemberExpression' &&
    !end.computed &&
    end.property.type === 'Identifier' &&
    end.property.name === 'length'
  );
}

/** The value of `node` when it is a non-negative number literal. */
function nonNegative(node: ESTree.Expression): number | undefined {
  return node.type === 'Literal' && typeof node.value === 'number' && node.value >= 0
    ? node.value
    : undefined;
}
