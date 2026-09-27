import type { Context, ESTree, Variable } from '@oxlint/plugins';

import { createRule } from '../utils/createRule.js';
import { callSuggestions } from '../utils/replace.js';
import { resolve } from '../utils/scope.js';
import { isStringLike } from '../utils/strings.js';

type Method = 'padStart' | 'padEnd';

const METHODS: ReadonlySet<string> = new Set<Method>(['padStart', 'padEnd']);

/**
 * Methods that turn a number into a string of ASCII digits, signs and letters,
 * whatever arguments they are given: `n.toString(16)` is as safe to pad as
 * `n.toString()`.
 */
const NUMBER_FORMATTERS: ReadonlySet<string> = new Set(['toFixed', 'toPrecision', 'toString']);

export default createRule('no-unsafe-pad', {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow `padStart` and `padEnd`, which measure and cut in UTF-16 code units.',
      recommended: true,
    },
    hasSuggestions: true,
    messages: {
      padStart:
        "`.padStart()` counts UTF-16 code units, not characters: `'👋🏽'.padStart(3, '.')` adds nothing, since the emoji is already 4 long.",
      padEnd:
        "`.padEnd()` counts UTF-16 code units and cuts its fill at one: `'ab'.padEnd(5, '👋🏽')` ends in half an emoji.",
      graphemes: 'Pad to a length in user-visible characters (graphemes).',
      columns: 'Pad to a terminal column width, for terminal alignment.',
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(call: ESTree.CallExpression) {
        const { callee } = call;
        if (callee.type !== 'MemberExpression' || callee.computed) return;
        if (callee.property.type !== 'Identifier' || callee.object.type === 'Super') return;
        // Only strings have these methods, so the receiver is not checked.
        if (!METHODS.has(callee.property.name)) return;
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- checked just above
        const method = callee.property.name as Method;
        const args = call.arguments;
        // With no target length there is nothing to pad.
        if (args.length === 0) return;
        const receiver = callee.object;
        if (isZeroPadding(context, receiver, args)) return;

        // `s?.padStart(2)` is reported as the whole chain, which is what gets replaced.
        const node = call.parent.type === 'ChainExpression' ? call.parent : call;
        context.report({
          node,
          messageId: method,
          // A third argument would land on `columns`' options; a spread could be anything.
          suggest:
            args.length > 2 || args.some((arg) => arg.type === 'SpreadElement')
              ? []
              : callSuggestions(context, node, [
                  {
                    messageId: 'graphemes',
                    unit: 'graphemes',
                    fn: method,
                    args: [receiver, ...args],
                  },
                  { messageId: 'columns', unit: 'columns', fn: method, args: [receiver, ...args] },
                ]),
        });
      },
    };
  },
});

/**
 * Whether a pad of `receiver` with `args` is zero-padding a number: the
 * receiver is a number turned into a string, and the fill is absent or
 * printable ASCII. Code units, graphemes and columns all agree there.
 */
function isZeroPadding(
  context: Context,
  receiver: ESTree.Expression,
  args: readonly ESTree.Argument[],
): boolean {
  const fill = args[1];
  if (args.length > 2 || (fill !== undefined && !isAsciiLiteral(fill))) return false;
  return isFormattedNumber(context, receiver, new Set());
}

/** Whether `node` is a string literal, or a template with no expressions, in printable ASCII. */
function isAsciiLiteral(node: ESTree.Argument): boolean {
  let text: unknown;
  if (node.type === 'Literal') text = node.value;
  else if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    text = node.quasis[0]?.value.cooked;
  }
  return typeof text === 'string' && /^[\x20-\x7E]*$/.test(text);
}

/**
 * Whether `node` has the shape of a number turned into a string — `String(n)`,
 * `n.toString()`, `n.toFixed(d)`, `n.toPrecision(d)` or `` `${n}` `` — directly
 * or through `const` bindings. With no type information the shape is taken on
 * trust, whatever `n` is, unless `n` is known to be a string: then it is text
 * like any other.
 */
function isFormattedNumber(
  context: Context,
  node: ESTree.Expression,
  resolving: Set<Variable>,
): boolean {
  const target = node.type === 'ChainExpression' ? node.expression : node;
  switch (target.type) {
    case 'TemplateLiteral': {
      const [expression, ...rest] = target.expressions;
      return (
        expression !== undefined &&
        rest.length === 0 &&
        target.quasis.every((quasi) => quasi.value.raw === '') &&
        !isStringLike(context, expression)
      );
    }
    case 'CallExpression':
      return isNumberFormatCall(context, target);
    case 'Identifier':
      return isFormattedBinding(context, target, resolving);
    default:
      return false;
  }
}

/** `String(n)`, while `String` is the global, or `n.toString(…)`, `n.toFixed(…)`, `n.toPrecision(…)`. */
function isNumberFormatCall(context: Context, call: ESTree.CallExpression): boolean {
  const { callee } = call;
  if (callee.type === 'Identifier') {
    if (callee.name !== 'String') return false;
    const variable = resolve(context, callee, 'String');
    if (variable !== undefined && variable.defs.length > 0) return false;
    const [value] = call.arguments;
    return value === undefined || value.type === 'SpreadElement' || !isStringLike(context, value);
  }
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    NUMBER_FORMATTERS.has(callee.property.name) &&
    callee.object.type !== 'Super' &&
    !isStringLike(context, callee.object)
  );
}

/** An unannotated `const`, declared once, whose initialiser is a formatted number. */
function isFormattedBinding(
  context: Context,
  identifier: ESTree.IdentifierReference,
  resolving: Set<Variable>,
): boolean {
  const variable = resolve(context, identifier, identifier.name);
  const [definition] = variable?.defs ?? [];
  if (variable === undefined || definition === undefined || variable.defs.length > 1) return false;
  const declarator = definition.name.parent;
  if (
    declarator.type !== 'VariableDeclarator' ||
    declarator.id !== definition.name ||
    definition.name.typeAnnotation ||
    declarator.init === null ||
    declarator.parent.type !== 'VariableDeclaration' ||
    declarator.parent.kind !== 'const' ||
    resolving.has(variable)
  ) {
    return false;
  }
  resolving.add(variable);
  return isFormattedNumber(context, declarator.init, resolving);
}
