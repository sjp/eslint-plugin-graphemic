import type { Context, ESTree, Suggestion } from '@oxlint/plugins';

import { createRule } from '../utils/createRule.js';
import { isIndexDerivedBound } from '../utils/indexDerivedBounds.js';
import { callSuggestions } from '../utils/replace.js';
import { isStringLike } from '../utils/strings.js';

interface Options {
  checkIncludes?: boolean;
}

type Method = 'indexOf' | 'lastIndexOf' | 'includes';

/** The methods reported. All are shared with arrays, so each needs a receiver known to be a string. */
const METHODS: ReadonlySet<string> = new Set<Method>(['indexOf', 'lastIndexOf', 'includes']);

/**
 * The methods whose arguments at these positions are code-unit offsets into
 * the string they are called on. `substr`'s second argument is a length, and a
 * search's first is what it searches for.
 */
const POSITION_ARGUMENTS: ReadonlyMap<string, readonly number[]> = new Map([
  ['slice', [0, 1]],
  ['substring', [0, 1]],
  ['substr', [0]],
  ['indexOf', [1]],
  ['lastIndexOf', [1]],
  ['includes', [1]],
]);

/** Comparison operators with their operands swapped, so the search can be read as the left one. */
const FLIPPED: ReadonlyMap<string, string> = new Map([
  ['==', '=='],
  ['===', '==='],
  ['!=', '!='],
  ['!==', '!=='],
  ['<', '>'],
  ['<=', '>='],
  ['>', '<'],
  ['>=', '<='],
]);

/** How a search's result is used, when it is compared with a constant. */
type Comparison = 'found' | 'missing' | 'atStart' | undefined;

const POSITION =
  "returns a UTF-16 code-unit position, not a character position: in `'hi 👋🏽!'` the `!` is at 7 but is the fifth character.";

const INSIDE =
  "can match inside a character: in a `'résumé'` spelled with a combining accent, `.includes('e')` finds the `e` under the accent.";

const FROM = ' The starting position is now a character index too.';

export default createRule('no-unsafe-search', {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow `indexOf` and `lastIndexOf` on strings where the code-unit position they return is used, and optionally `includes`.',
      recommended: false,
    },
    hasSuggestions: true,
    messages: {
      indexOf: `\`.indexOf()\` ${POSITION}`,
      lastIndexOf: `\`.lastIndexOf()\` ${POSITION} graphemic has no \`lastIndexOf\`: search with \`graphemes.indexOf\`, or index into \`graphemes.toArray\`.`,
      includes: `\`.includes()\` ${INSIDE}`,
      check: `This \`.{{method}}()\` check ${INSIDE}`,
      graphemes:
        'Search by user-visible characters (graphemes); the result is a character index, so any code using it must use character indexes too.',
      graphemesFrom: `Search by user-visible characters (graphemes); the result is a character index, so any code using it must use character indexes too.${FROM}`,
      includesGraphemes: 'Match only on user-visible character (grapheme) boundaries.',
      includesGraphemesFrom: `Match only on user-visible character (grapheme) boundaries.${FROM}`,
    },
    schema: [
      {
        type: 'object',
        properties: {
          checkIncludes: {
            type: 'boolean',
            default: false,
            description:
              'Also report `includes`, and `indexOf` or `lastIndexOf` compared with `-1` or `0` to check for a match, which can match inside a character.',
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the schema has checked them
    const { checkIncludes = false } = (context.options[0] ?? {}) as Options;

    return {
      CallExpression(call: ESTree.CallExpression) {
        const { callee } = call;
        if (callee.type !== 'MemberExpression' || callee.computed) return;
        if (callee.property.type !== 'Identifier' || callee.object.type === 'Super') return;
        if (!METHODS.has(callee.property.name)) return;
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- checked just above
        const method = callee.property.name as Method;
        const receiver = callee.object;
        if (!isStringLike(context, receiver)) return;
        const args = call.arguments;
        // With nothing to search for there is no position to misuse.
        if (args.length === 0) return;

        // `s?.indexOf(x)` is reported as the whole chain, which is what gets replaced.
        const node = call.parent.type === 'ChainExpression' ? call.parent : call;
        const from = args.length > 1;
        if (method === 'includes') {
          if (!checkIncludes) return;
          context.report({
            node,
            messageId: 'includes',
            suggest: includesSuggestions(context, node, receiver, args, false),
          });
          return;
        }

        const outer = wrapped(node);
        const comparison = compared(outer);
        // Position 0 is the start of the string in every unit.
        if (comparison === 'atStart') return;
        if (comparison !== undefined) {
          if (!checkIncludes) return;
          // The comparison, or the `~`, around the search is the check that gets replaced.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- `compared` found one there
          const check = outer.parent as ESTree.BinaryExpression | ESTree.UnaryExpression;
          context.report({
            node: check,
            messageId: 'check',
            data: { method },
            // A backward search's `from` is where it ends, which `includes` cannot express.
            suggest:
              method === 'lastIndexOf' && from
                ? []
                : includesSuggestions(context, check, receiver, args, comparison === 'missing'),
          });
          return;
        }
        if (isPositionOnSameString(context, outer)) return;

        context.report({
          node,
          messageId: method,
          suggest:
            method === 'indexOf' && carriesOver(args)
              ? callSuggestions(context, node, [
                  {
                    messageId: from ? 'graphemesFrom' : 'graphemes',
                    unit: 'graphemes',
                    fn: 'indexOf',
                    args: [receiver, ...args],
                  },
                ])
              : [],
        });
      },
    };
  },
});

/** The `graphemes.includes` suggestion for `node`, negated when it checks for no match. */
function includesSuggestions(
  context: Context,
  node: ESTree.Expression,
  receiver: ESTree.Expression,
  args: readonly ESTree.Argument[],
  negated: boolean,
): Suggestion[] {
  if (!carriesOver(args)) return [];
  return callSuggestions(context, node, [
    {
      messageId: args.length > 1 ? 'includesGraphemesFrom' : 'includesGraphemes',
      unit: 'graphemes',
      fn: 'includes',
      args: [receiver, ...args],
      negated,
    },
  ]);
}

/**
 * Whether `args` mean the same to graphemic: no spread, no third argument,
 * which graphemic has no parameter for, and no regular expression, which it
 * refuses where the native search turns it into its source text.
 */
function carriesOver(args: readonly ESTree.Argument[]): boolean {
  const [search] = args;
  return (
    args.length <= 2 &&
    !args.some((arg) => arg.type === 'SpreadElement') &&
    !(search?.type === 'Literal' && 'regex' in search)
  );
}

/**
 * How the search `node` is compared: whether the comparison asks that it
 * found a match, that it found none, or that the match is at the start, as in
 * `s.indexOf(x) !== -1`, `s.indexOf(x) < 0` and `s.indexOf(x) === 0`. `~`
 * in front of the search is the same as asking that it found a match.
 */
function compared(node: ESTree.Expression): Comparison {
  if (isBitwiseNot(node)) return 'found';
  const { parent } = node;
  if (parent.type !== 'BinaryExpression') return undefined;
  const left = parent.left === node;
  const operator = left ? parent.operator : FLIPPED.get(parent.operator);
  const value = constant(left ? parent.right : parent.left);
  if (operator === undefined || value === undefined) return undefined;
  switch (`${operator} ${value}`) {
    case '== 0':
    case '=== 0':
    case '!= 0':
    case '!== 0':
      return 'atStart';
    case '!= -1':
    case '!== -1':
    case '> -1':
    case '>= 0':
      return 'found';
    case '== -1':
    case '=== -1':
    case '< 0':
    case '<= -1':
      return 'missing';
    default:
      return undefined;
  }
}

/** Whether `node` is the operand of a `~`, the old idiom for "found a match". */
function isBitwiseNot(node: ESTree.Expression): boolean {
  const { parent } = node;
  return parent.type === 'UnaryExpression' && parent.operator === '~';
}

/** The value of `node` when it is an integer literal, or one negated. */
function constant(node: ESTree.Node): number | undefined {
  if (node.type === 'UnaryExpression' && node.operator === '-') {
    const value = constant(node.argument);
    return value === undefined ? undefined : -value;
  }
  return node.type === 'Literal' && typeof node.value === 'number' ? node.value : undefined;
}

/**
 * Whether the position the search `node` returns goes straight back into the
 * same string as a code-unit offset, where it is on a boundary the code
 * chose: a bound of `slice`, `substring` or `substr`, or where another search
 * starts, that `isIndexDerivedBound` accepts, as in `s.slice(0, s.indexOf(','))`
 * and `s.indexOf(',', s.indexOf(',') + 1)`.
 */
function isPositionOnSameString(context: Context, node: ESTree.Expression): boolean {
  // The argument the position is in, through the `+`/`-` of an offset.
  let arg = node;
  while (arg.parent.type === 'BinaryExpression') arg = wrapped(arg.parent);
  const call = arg.parent;
  if (call.type !== 'CallExpression') return false;
  const { callee } = call;
  if (callee.type !== 'MemberExpression' || callee.computed || callee.object.type === 'Super') {
    return false;
  }
  const method = callee.property.type === 'Identifier' ? callee.property.name : '';
  const positions = POSITION_ARGUMENTS.get(method) ?? [];
  const index = call.arguments.indexOf(arg);
  return positions.includes(index) && isIndexDerivedBound(context, callee.object, arg);
}

/** `node` with the TypeScript assertions around it, which do not change its value. */
function wrapped(node: ESTree.Expression): ESTree.Expression {
  let current = node;
  while (
    current.parent.type === 'TSNonNullExpression' ||
    current.parent.type === 'TSAsExpression' ||
    current.parent.type === 'TSSatisfiesExpression' ||
    current.parent.type === 'TSTypeAssertion'
  ) {
    current = current.parent;
  }
  return current;
}
