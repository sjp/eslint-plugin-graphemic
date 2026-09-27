import type { Context, ESTree, Suggestion } from '@oxlint/plugins';

import { createRule } from '../utils/createRule.js';
import type { Unit } from '../utils/graphemic.js';
import { graphemicCallee } from '../utils/imports.js';
import { callSuggestions } from '../utils/replace.js';
import { isStringLike } from '../utils/strings.js';

/** The methods that cut a string from its start, as `s.slice(0, k)` does. */
const CUTS: ReadonlySet<string> = new Set(['slice', 'substring', 'substr']);

/** The units suggested, in the order they are offered. */
const UNITS: readonly Unit[] = ['graphemes', 'codePoints', 'utf8', 'columns', 'codeUnits'];

export default createRule('prefer-truncate', {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer `truncate` to shortening a string by hand with `length` and `slice`, which can cut a character in half.',
      recommended: true,
    },
    hasSuggestions: true,
    messages: {
      truncate:
        "Truncating by `.length` and `.slice` counts UTF-16 code units and can cut a character in half: `'hi 👋🏽'` cut to 4 ends in a lone surrogate.",
      graphemes: 'Truncate to at most {{max}} user-visible characters (graphemes){{including}}.',
      codePoints:
        'Truncate to at most {{max}} code points{{including}}, for a limit defined in code points, e.g. some social networks.',
      utf8: 'Truncate to at most {{max}} UTF-8 bytes{{including}}, for a byte limit, e.g. a database column.',
      columns: 'Truncate to at most {{max}} terminal columns{{including}}, for terminal alignment.',
      codeUnits:
        'Truncate to at most {{max}} UTF-16 code units{{including}} without cutting a character: keep counting code units, and say so.',
    },
    schema: [],
  },
  create(context) {
    return {
      // `s.length > n ? s.slice(0, n) + '…' : s`
      ConditionalExpression(node: ESTree.ConditionalExpression) {
        const guard = lengthGuard(node.test);
        if (guard === undefined) return;
        const [cut, kept] = guard.longWhenTrue
          ? [node.consequent, node.alternate]
          : [node.alternate, node.consequent];
        if (!sameText(context, kept, guard.s)) return;
        const truncation = matchTruncation(context, guard, cut);
        if (truncation === undefined) return;
        context.report({
          node,
          messageId: 'truncate',
          suggest: callSuggestions(
            context,
            node,
            UNITS.map((unit) => ({
              messageId: unit,
              data: messageData(truncation),
              unit,
              fn: 'truncate',
              args: [guard.s, ...truncation.args],
            })),
          ),
        });
      },
      // `if (s.length > n) s = s.slice(0, n) + '…';`
      IfStatement(node: ESTree.IfStatement) {
        if (node.alternate !== null) return;
        const assignment = onlyAssignment(node.consequent);
        if (assignment === undefined) return;
        const guard = lengthGuard(node.test);
        if (guard === undefined || !guard.longWhenTrue) return;
        if (!sameText(context, assignment.left, guard.s)) return;
        const truncation = matchTruncation(context, guard, assignment.right);
        if (truncation === undefined) return;
        context.report({
          node,
          messageId: 'truncate',
          suggest: statementSuggestions(context, node, guard.s, truncation),
        });
      },
    };
  },
});

/** A comparison of a string's length with a limit, as `lengthGuard` reads it. */
interface Guard {
  /** The string whose length is compared. */
  s: ESTree.Expression;
  /** The other side of the comparison. */
  n: ESTree.Expression;
  /**
   * What to subtract from `n` for the largest length left alone: 0 for
   * `length > n` and `length <= n`, 1 for `length >= n` and `length < n`.
   */
  offset: 0 | 1;
  /** Whether the comparison is true for a string that is too long. */
  longWhenTrue: boolean;
}

/**
 * `test` as a comparison of `s.length` with some `n`, in either orientation,
 * and `undefined` for anything else — including a literal `n` that is not a
 * non-negative integer, or whose largest length left alone would be negative:
 * graphemic's `truncate` throws on a negative or fractional `max`.
 */
function lengthGuard(test: ESTree.Expression): Guard | undefined {
  if (test.type !== 'BinaryExpression' || test.left.type === 'PrivateIdentifier') return undefined;
  let operator: string = test.operator;
  let s = lengthOf(test.left);
  let n = test.right;
  if (s === undefined) {
    s = lengthOf(test.right);
    n = test.left;
    operator = FLIPPED[operator] ?? '';
  }
  if (s === undefined) return undefined;
  let guard: Guard;
  switch (operator) {
    case '>':
      guard = { s, n, offset: 0, longWhenTrue: true };
      break;
    case '>=':
      guard = { s, n, offset: 1, longWhenTrue: true };
      break;
    case '<':
      guard = { s, n, offset: 1, longWhenTrue: false };
      break;
    case '<=':
      guard = { s, n, offset: 0, longWhenTrue: false };
      break;
    default:
      return undefined;
  }
  if (n.type === 'Literal' && !(isIndex(n) && n.value >= guard.offset)) return undefined;
  if (n.type === 'UnaryExpression' && n.operator === '-' && n.argument.type === 'Literal') {
    return undefined;
  }
  return guard;
}

/** Each comparison with its operands swapped: `n < s.length` is `s.length > n`. */
const FLIPPED: Readonly<Record<string, string>> = { '<': '>', '<=': '>=', '>': '<', '>=': '<=' };

/** `s` in `s.length`, when `s` is a plain reference that `isPlain` accepts. */
function lengthOf(node: ESTree.Expression): ESTree.Expression | undefined {
  if (node.type !== 'MemberExpression' || node.computed || node.optional) return undefined;
  if (node.property.type !== 'Identifier' || node.property.name !== 'length') return undefined;
  return isPlain(node.object) ? node.object : undefined;
}

/**
 * Whether `node` is a reference that reads the same value each time it is
 * evaluated in the idiom, and has no effects: an identifier, `this`, or a
 * chain of property accesses on one, by name or by literal key. No calls, and
 * no optional links, which a rewrite would need a conditional for.
 */
function isPlain(node: ESTree.Node): boolean {
  switch (node.type) {
    case 'Identifier':
    case 'ThisExpression':
      return true;
    case 'MemberExpression':
      return (
        !node.optional &&
        (!node.computed || node.property.type === 'Literal') &&
        isPlain(node.object)
      );
    default:
      return false;
  }
}

/** A matched truncation, ready to rewrite. */
interface Truncation {
  /** `max`, as source text. */
  max: string;
  /** The ellipsis, as source text of a string literal, if there is one. */
  ellipsis?: string;
  /** The arguments after `s`: `max`, and the options when there is an ellipsis. */
  args: string[];
}

/**
 * `node` as the branch of the idiom that shortens `guard.s`: a cut from its
 * start, `s.slice(0, k)`, `s.substring(0, k)` or `s.substr(0, k)`, alone or
 * followed by a literal ellipsis, as `… + '…'` or `` `${…}…` ``.
 *
 * `k` has to follow from the guard's `n`: with an ellipsis it can be `n`, or
 * `n` less a literal to leave room for it; without one it has to be exactly
 * the largest length the guard leaves alone, so that `truncate` keeps what
 * the code kept. Without an ellipsis there is also no sign that `s` is not an
 * array, so a `slice` needs `s` known to be a string.
 */
function matchTruncation(
  context: Context,
  guard: Guard,
  node: ESTree.Expression,
): Truncation | undefined {
  let slice = node;
  let ellipsis: Ellipsis | undefined;
  let concatenated = false;
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    ellipsis = literalEllipsis(context, node.right);
    if (ellipsis === undefined) return undefined;
    slice = node.left;
    concatenated = true;
  } else if (node.type === 'TemplateLiteral') {
    const [expression] = node.expressions;
    const [head, ...tail] = node.quasis;
    if (expression === undefined || node.expressions.length > 1 || head?.value.raw !== '') {
      return undefined;
    }
    ellipsis = templateEllipsis(tail);
    slice = expression;
    concatenated = true;
  }

  const cut = cutFromStart(context, slice, guard.s);
  if (cut === undefined) return undefined;
  if (!concatenated && cut.method === 'slice' && !isStringLike(context, guard.s)) return undefined;

  // `+ ''` adds nothing, and is no ellipsis.
  if (ellipsis?.value === '') ellipsis = undefined;
  const shortfall = difference(context, guard.n, cut.end);
  if (shortfall === undefined) return undefined;
  if (ellipsis === undefined ? shortfall !== guard.offset : shortfall < 0) return undefined;

  const max = maxText(context, guard);
  if (ellipsis === undefined) return { max, args: [max] };
  return { max, ellipsis: ellipsis.text, args: [max, `{ ellipsis: ${ellipsis.text} }`] };
}

/** An ellipsis: its value, and source text that writes it as a string literal. */
interface Ellipsis {
  value: string;
  text: string;
}

/** `node` as a string literal or a template with no expressions. */
function literalEllipsis(context: Context, node: ESTree.Expression): Ellipsis | undefined {
  if (node.type === 'Literal') {
    return typeof node.value === 'string'
      ? { value: node.value, text: context.sourceCode.getText(node) }
      : undefined;
  }
  if (node.type !== 'TemplateLiteral' || node.expressions.length > 0) return undefined;
  return { value: cooked(node.quasis), text: context.sourceCode.getText(node) };
}

/**
 * The text after a template's one expression as an ellipsis, rewritten as a
 * single-quoted string where that needs no escaping, and as a template with
 * no expressions otherwise.
 */
function templateEllipsis(tail: readonly ESTree.TemplateElement[]): Ellipsis {
  const raw = tail.map((quasi) => quasi.value.raw).join('');
  return { value: cooked(tail), text: /['\\\n\r]/.test(raw) ? `\`${raw}\`` : `'${raw}'` };
}

/**
 * The value of a template's text parts. Only a tagged template can have a part
 * with no value (an invalid escape), and the idiom is never tagged.
 */
function cooked(quasis: readonly ESTree.TemplateElement[]): string {
  return quasis.map((quasi) => quasi.value.cooked).join('');
}

/** `k` in `s.slice(0, k)`, `s.substring(0, k)` or `s.substr(0, k)`, on the same `s`. */
function cutFromStart(
  context: Context,
  node: ESTree.Expression,
  s: ESTree.Expression,
): { method: string; end: ESTree.Expression } | undefined {
  if (node.type !== 'CallExpression' || node.optional) return undefined;
  const { callee } = node;
  if (callee.type !== 'MemberExpression' || callee.computed || callee.optional) return undefined;
  if (callee.property.type !== 'Identifier' || !CUTS.has(callee.property.name)) return undefined;
  if (!sameText(context, callee.object, s)) return undefined;
  const [start, end] = node.arguments;
  if (node.arguments.length !== 2 || start?.type !== 'Literal' || start.value !== 0) {
    return undefined;
  }
  return end === undefined || end.type === 'SpreadElement'
    ? undefined
    : { method: callee.property.name, end };
}

/**
 * How far `k` falls short of `n`, where the syntax says: 0 for the same text,
 * `d` for `n - d`, and the difference of two literals. `undefined` otherwise.
 */
function difference(
  context: Context,
  n: ESTree.Expression,
  k: ESTree.Expression,
): number | undefined {
  if (sameText(context, n, k)) return 0;
  if (
    k.type === 'BinaryExpression' &&
    k.operator === '-' &&
    sameText(context, k.left, n) &&
    isIndex(k.right)
  ) {
    return k.right.value;
  }
  return isIndex(n) && isIndex(k) ? n.value - k.value : undefined;
}

/** The largest length the guard leaves alone, as source text: `n`, or `n - 1` folded where it can be. */
function maxText(context: Context, guard: Guard): string {
  const { n, offset } = guard;
  if (isIndex(n)) return String(n.value - offset);
  const text = context.sourceCode.getText(n);
  if (offset === 0) return n.type === 'SequenceExpression' ? `(${text})` : text;
  return bindsTighterThanMinus(n) ? `${text} - 1` : `(${text}) - 1`;
}

/** Whether `node` can be the left operand of `- 1` without parentheses. */
function bindsTighterThanMinus(node: ESTree.Expression): boolean {
  switch (node.type) {
    case 'Identifier':
    case 'ThisExpression':
    case 'MemberExpression':
    case 'CallExpression':
    case 'UnaryExpression':
      return true;
    case 'BinaryExpression':
      return ['+', '-', '*', '/', '%', '**'].includes(node.operator);
    default:
      return false;
  }
}

/** Whether `node` is a non-negative integer literal. */
function isIndex(node: ESTree.Node): node is ESTree.NumericLiteral {
  return (
    node.type === 'Literal' &&
    typeof node.value === 'number' &&
    Number.isInteger(node.value) &&
    node.value >= 0
  );
}

/** Whether two nodes are written the same. */
function sameText(context: Context, a: ESTree.Node, b: ESTree.Node): boolean {
  return context.sourceCode.getText(a) === context.sourceCode.getText(b);
}

/** The `max` and ellipsis note each suggestion's message quotes. */
function messageData(truncation: Truncation): Record<string, string> {
  return {
    max: truncation.max,
    including: truncation.ellipsis === undefined ? '' : ', including the ellipsis',
  };
}

/** The one statement of an `if`'s body, braced or not, when it is a plain `=` assignment. */
function onlyAssignment(node: ESTree.Statement): ESTree.AssignmentExpression | undefined {
  const [only] = node.type === 'BlockStatement' ? node.body : [node];
  if (node.type === 'BlockStatement' && node.body.length !== 1) return undefined;
  if (only?.type !== 'ExpressionStatement') return undefined;
  const { expression } = only;
  return expression.type === 'AssignmentExpression' && expression.operator === '='
    ? expression
    : undefined;
}

/**
 * The suggestions for the statement form, each replacing the whole `if` with
 * `s = unit.truncate(…);`. None when the `if` holds a comment, which the
 * rewrite would delete.
 */
function statementSuggestions(
  context: Context,
  node: ESTree.IfStatement,
  s: ESTree.Expression,
  truncation: Truncation,
): Suggestion[] {
  const { sourceCode } = context;
  if (sourceCode.getCommentsInside(node).length > 0) return [];
  const target = sourceCode.getText(s);
  const args = [target, ...truncation.args].join(', ');
  const suggestions: Suggestion[] = [];
  for (const unit of UNITS) {
    const callee = graphemicCallee(context, node, unit, 'truncate');
    if (callee === null) continue;
    suggestions.push({
      messageId: unit,
      data: messageData(truncation),
      fix: (fixer) => [
        ...callee.fix(fixer),
        fixer.replaceText(node, `${target} = ${callee.text}(${args});`),
      ],
    });
  }
  return suggestions;
}
