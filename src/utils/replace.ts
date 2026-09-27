import type { Context, ESTree, SourceCode, Suggestion } from '@oxlint/plugins';

import type { Unit } from './graphemic.js';
import { graphemicCallee } from './imports.js';

/** One suggested rewrite of a reported expression into a graphemic call. */
export interface CallSuggestion {
  messageId: string;
  data?: Record<string, string>;
  unit: Unit;
  fn: string;
  /** Argument nodes or raw source text, in call order. */
  args: ReadonlyArray<ESTree.Node | string>;
  /**
   * Text appended after the call, e.g. ` ?? ''`. It is assumed to bind at
   * least as tightly as `??` and `||`: the call and suffix are parenthesised
   * wherever that would not hold on its own.
   */
  suffix?: string;
}

/**
 * A suggestion replacing `node` with a call to `unit`'s `fn` on `args`,
 * importing it if the file does not already. Node arguments keep their source
 * text, parenthesised only where a comma would split them, so a receiver moves
 * into the call as it was written: `(a + b).length` becomes
 * `graphemes.length(a + b)`.
 *
 * Returns `null` — the rule still reports, with no suggestion — when the
 * rewrite would lose something or change meaning: a comment in `node` outside
 * the arguments kept, an optional link in `node` (`s?.length`, where a correct
 * rewrite needs a conditional), or no safe way to reference the function (see
 * `graphemicCallee`).
 *
 * @example
 * // `'👋🏽'.length` → `graphemes.length('👋🏽')`, plus the import
 * callSuggestion(context, node, {
 *   messageId: 'graphemes',
 *   unit: 'graphemes',
 *   fn: 'length',
 *   args: [node.object],
 * });
 */
export function callSuggestion(
  context: Context,
  node: ESTree.Expression,
  suggestion: CallSuggestion,
): Suggestion | null {
  const { sourceCode } = context;
  if (hasOptionalLink(node) || losesComments(sourceCode, node, suggestion.args)) return null;
  const callee = graphemicCallee(context, node, suggestion.unit, suggestion.fn);
  if (callee === null) return null;

  const args = suggestion.args.map((arg) =>
    typeof arg === 'string' ? arg : argumentText(sourceCode, arg),
  );
  const call = `${callee.text}(${args.join(', ')})${suggestion.suffix ?? ''}`;
  const text = needsParentheses(sourceCode, node, suggestion.suffix !== undefined)
    ? `${asiGuard(sourceCode, node)}(${call})`
    : call;
  return {
    messageId: suggestion.messageId,
    data: suggestion.data,
    fix: (fixer) => [...callee.fix(fixer), fixer.replaceText(node, text)],
  };
}

/**
 * The suggestions for one report, in the order given, leaving out any that
 * `callSuggestion` could not build.
 *
 * @example
 * context.report({
 *   node,
 *   messageId: 'length',
 *   suggest: callSuggestions(context, node, [
 *     { messageId: 'graphemes', unit: 'graphemes', fn: 'length', args: [node.object] },
 *     { messageId: 'codeUnits', unit: 'codeUnits', fn: 'length', args: [node.object] },
 *   ]),
 * });
 */
export function callSuggestions(
  context: Context,
  node: ESTree.Expression,
  suggestions: readonly CallSuggestion[],
): Suggestion[] {
  return suggestions
    .map((suggestion) => callSuggestion(context, node, suggestion))
    .filter((suggestion) => suggestion !== null);
}

/** An argument's source text, safe to put between a call's commas. */
function argumentText(sourceCode: SourceCode, arg: ESTree.Node): string {
  const text = sourceCode.getText(arg);
  return arg.type === 'SequenceExpression' ? `(${text})` : text;
}

/**
 * Whether evaluating `node` can short-circuit on an optional link, as
 * `s?.length` and `a?.b.slice(1)` do. Rewriting those needs a conditional,
 * not a call: `graphemes.length(s)` would throw where `s?.length` gave
 * `undefined`.
 */
function hasOptionalLink(node: ESTree.Node): boolean {
  let current = node;
  for (;;) {
    switch (current.type) {
      case 'ChainExpression':
        return true;
      case 'MemberExpression':
      case 'CallExpression':
        if (current.optional) return true;
        current = current.type === 'MemberExpression' ? current.object : current.callee;
        break;
      case 'TSNonNullExpression':
        current = current.expression;
        break;
      default:
        return false;
    }
  }
}

/** Whether replacing `node` would delete a comment, i.e. one not inside a node argument. */
function losesComments(
  sourceCode: SourceCode,
  node: ESTree.Node,
  args: ReadonlyArray<ESTree.Node | string>,
): boolean {
  const kept = args.filter((arg) => typeof arg !== 'string');
  return sourceCode
    .getCommentsInside(node)
    .some((comment) => !kept.some((arg) => arg.start <= comment.start && comment.end <= arg.end));
}

/**
 * Whether the replacement has to be parenthesised to parse as one operand in
 * `node`'s place. A bare call binds as tightly as anything except as the
 * callee of `new`, where `new f.x()` and `new (f.x())` differ. A suffix
 * binds more loosely, so a call with one is parenthesised unless `node`
 * already is, or sits where any expression is allowed.
 */
function needsParentheses(
  sourceCode: SourceCode,
  node: ESTree.Expression,
  hasSuffix: boolean,
): boolean {
  const { parent } = node;
  if (parent.type === 'NewExpression' && parent.callee === node) return true;
  if (!hasSuffix || isParenthesized(sourceCode, node)) return false;
  return !acceptsAnyExpression(parent, node);
}

/**
 * Whether `node` is directly inside a pair of parentheses. Whatever they
 * belong to — grouping, a call's only argument, an `if` test — the text
 * between them is parsed as a whole expression.
 */
function isParenthesized(sourceCode: SourceCode, node: ESTree.Node): boolean {
  return (
    sourceCode.getTokenBefore(node)?.value === '(' && sourceCode.getTokenAfter(node)?.value === ')'
  );
}

/** Whether `node`'s position in `parent` takes any expression without parentheses. */
function acceptsAnyExpression(parent: ESTree.Node, node: ESTree.Node): boolean {
  switch (parent.type) {
    case 'ArrayExpression':
    case 'ConditionalExpression':
    case 'ExpressionStatement':
    case 'JSXExpressionContainer':
    case 'Property':
    case 'ReturnStatement':
    case 'SequenceExpression':
    case 'SpreadElement':
    case 'TemplateLiteral':
    case 'ThrowStatement':
    case 'VariableDeclarator':
      return true;
    case 'ArrowFunctionExpression':
      return parent.body === node;
    case 'AssignmentExpression':
      return parent.right === node;
    case 'CallExpression':
    case 'NewExpression':
      return parent.callee !== node;
    default:
      return false;
  }
}

/**
 * `;` when a parenthesised replacement would start a statement right after
 * one that has no semicolon, as in code written without them: `f()\n(x)`
 * would call `f()`'s result with `x`.
 */
function asiGuard(sourceCode: SourceCode, node: ESTree.Expression): string {
  // The innermost statement around `node` that is an expression, if any.
  let statement: ESTree.Node | null = node.parent;
  while (statement !== null && statement.type !== 'ExpressionStatement') {
    statement = statement.parent;
  }
  if (statement?.start !== node.start) return '';
  const before = sourceCode.getTokenBefore(node);
  return before === null || before.value === ';' || before.value === '{' ? '' : ';';
}
