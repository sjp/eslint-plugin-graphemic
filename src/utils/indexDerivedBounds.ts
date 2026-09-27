import type { Context, ESTree } from '@oxlint/plugins';

/** The string methods that cut at code-unit offsets, whose arguments are bounds. */
const SLICING_METHODS: ReadonlySet<string> = new Set(['slice', 'substring', 'substr']);

/** The string methods that return a code-unit position in the string they are called on. */
const SEARCH_METHODS: ReadonlySet<string> = new Set(['indexOf', 'lastIndexOf', 'search']);

/**
 * Whether every bound of `call`, a `slice`, `substring` or `substr` call, is
 * one the code already knows to be on a boundary it chose (see
 * `isIndexDerivedBound`), as in `s.slice(0, s.indexOf(','))`. `substr` only
 * counts with a start and no length: its second argument is not a position.
 * A call with no arguments, or with a spread, does not count.
 *
 * @example
 * hasIndexDerivedBounds(context, call); // `s.slice(s.indexOf(':') + 1)` → true, `s.slice(1)` → false
 */
export function hasIndexDerivedBounds(context: Context, call: ESTree.CallExpression): boolean {
  const { callee } = call;
  if (callee.type !== 'MemberExpression' || callee.computed || callee.object.type === 'Super') {
    return false;
  }
  const method = callee.property.type === 'Identifier' ? callee.property.name : '';
  if (!SLICING_METHODS.has(method)) return false;
  const bounds = call.arguments;
  if (bounds.length === 0 || (method === 'substr' && bounds.length > 1)) return false;
  const receiver = callee.object;
  return bounds.every(
    (bound) => bound.type !== 'SpreadElement' && isIndexDerivedBound(context, receiver, bound),
  );
}

/**
 * Whether cutting `receiver` at `bound` keeps whole the text the code has
 * already matched in it, because `bound` is:
 *
 * - `0`;
 * - `R.indexOf(x)`, `R.lastIndexOf(x)` or `R.search(x)`, where `R` is
 *   `receiver`;
 * - one of those plus or minus `x.length`, or a number equal to the length of
 *   a string literal `x`, as in `s.indexOf(', ') + 2`;
 * - `R.length`, or `R.length - x.length` or `-x.length`, which strip `x` from
 *   the end;
 * - a number `k`, `-k` or `R.length - k`, where an enclosing condition or an
 *   earlier early exit has checked that `R` starts (for `k`) or ends (for the
 *   others) with a string literal `k` code units long, as in
 *   `if (s.startsWith('#')) s.slice(1)` or `if (!s.startsWith('#')) return;`.
 *
 * `R` and `x` must be the same text at both places and free of side effects:
 * an identifier, `this`, or a chain of `.name` members of those. `x` may also
 * be a string literal. A search that finds nothing returns -1, which is not a
 * boundary the code chose; that is left to the author, as it is almost always
 * checked first.
 *
 * @example
 * isIndexDerivedBound(context, receiver, bound); // `s.lastIndexOf('/') + 1` on `s` → true, on `t` → false
 */
export function isIndexDerivedBound(
  context: Context,
  receiver: ESTree.Expression,
  bound: ESTree.Expression,
): boolean {
  const match: Matcher = { context, receiver, bound };
  const value = unwrap(bound);
  if (isNumber(value, 0) || isSearch(match, value) !== undefined || isLengthOf(match, value)) {
    return true;
  }
  switch (value.type) {
    case 'Literal':
      return isGuarded(match, 'startsWith', value);
    case 'UnaryExpression':
      return value.operator === '-' && isSuffixLength(match, value.argument);
    case 'BinaryExpression':
      if (value.operator === '+') return isOffsetMatch(match, value.left, value.right);
      if (value.operator !== '-') return false;
      return (
        isOffsetMatch(match, value.left, value.right) ||
        isStrippedSuffix(match, value.left, value.right)
      );
    default:
      return false;
  }
}

/** What one question about a bound is being asked of. */
interface Matcher {
  context: Context;
  receiver: ESTree.Expression;
  bound: ESTree.Expression;
}

/** `R.indexOf(x) ± k`, with `k` the length of the `x` searched for. */
function isOffsetMatch(match: Matcher, left: ESTree.Expression, right: ESTree.Expression): boolean {
  const searched = isSearch(match, unwrap(left));
  if (searched === undefined) return false;
  const k = unwrap(right);
  if (searched.type === 'Literal' && typeof searched.value === 'string') {
    if (isNumber(k, searched.value.length)) return true;
  }
  return isLengthMember(k) && isSame(match.context, k.object, searched);
}

/** `R.length - x.length`, or `R.length - k` under an `endsWith` guard. */
function isStrippedSuffix(
  match: Matcher,
  left: ESTree.Expression,
  right: ESTree.Expression,
): boolean {
  return isLengthOf(match, unwrap(left)) && isSuffixLength(match, right);
}

/** The `k` of a suffix `-k`: `x.length`, or a number under a matching `endsWith` guard. */
function isSuffixLength(match: Matcher, node: ESTree.Expression): boolean {
  const k = unwrap(node);
  if (isLengthMember(k)) return isStable(k.object) || isStringLiteral(k.object);
  return isGuarded(match, 'endsWith', k);
}

/**
 * The argument searched for, when `node` is `R.indexOf(x)`, `R.lastIndexOf(x)`
 * or `R.search(x)` on the receiver.
 */
function isSearch(match: Matcher, node: ESTree.Expression): ESTree.Expression | undefined {
  if (node.type !== 'CallExpression' || node.optional) return undefined;
  const { callee } = node;
  if (callee.type !== 'MemberExpression' || callee.computed || callee.optional) return undefined;
  if (callee.property.type !== 'Identifier' || !SEARCH_METHODS.has(callee.property.name)) {
    return undefined;
  }
  const [searched] = node.arguments;
  if (searched === undefined || searched.type === 'SpreadElement') return undefined;
  return isSameReceiver(match, callee.object) ? searched : undefined;
}

/** Whether `node` is `R.length`, on the receiver. */
function isLengthOf(match: Matcher, node: ESTree.Expression): boolean {
  return isLengthMember(node) && isSameReceiver(match, node.object);
}

/**
 * Whether `literal`, a number, is the length of a string literal that an
 * enclosing condition checks `R` starts or ends with. The call it guards must
 * be in the consequent of an `if` or `?:`, or on the right of `&&`, whose test
 * is the check or includes it through `&&`; or come after an `if` that leaves
 * the block unless the check holds, as in `if (!s.startsWith('#')) return;`.
 */
function isGuarded(
  match: Matcher,
  method: 'startsWith' | 'endsWith',
  literal: ESTree.Expression,
): boolean {
  const k = literal.type === 'Literal' ? literal.value : undefined;
  if (typeof k !== 'number' || !Number.isInteger(k) || k <= 0) return false;
  let child: ESTree.Node = match.bound;
  let parent: ESTree.Node | null = child.parent;
  for (; parent !== null; child = parent, parent = parent.parent) {
    let test: ESTree.Expression | undefined;
    if (parent.type === 'IfStatement' || parent.type === 'ConditionalExpression') {
      if (parent.consequent === child) test = parent.test;
    } else if (parent.type === 'LogicalExpression' && parent.operator === '&&') {
      if (parent.right === child) test = parent.left;
    }
    if (test !== undefined && checks(match, test, method, k)) return true;
    if (exitedUnless(match, statementsBefore(parent, child), method, k)) return true;
  }
  return false;
}

/** The statements that run before `child` in the statement list `parent` holds it in. */
function statementsBefore(parent: ESTree.Node, child: ESTree.Node): readonly ESTree.Node[] {
  let list: readonly ESTree.Node[];
  switch (parent.type) {
    case 'Program':
    case 'BlockStatement':
    case 'StaticBlock':
      list = parent.body;
      break;
    case 'SwitchCase':
      list = parent.consequent;
      break;
    default:
      return [];
  }
  const index = list.indexOf(child);
  return index === -1 ? [] : list.slice(0, index);
}

/**
 * Whether one of `statements` is an `if` that returns, throws, breaks or
 * continues unless the check holds, so that the code after it only runs when
 * it does: `if (!R.startsWith(lit)) return;`.
 */
function exitedUnless(
  match: Matcher,
  statements: readonly ESTree.Node[],
  method: 'startsWith' | 'endsWith',
  k: number,
): boolean {
  return statements.some(
    (statement) =>
      statement.type === 'IfStatement' &&
      exits(statement.consequent) &&
      checksNegated(match, statement.test, method, k),
  );
}

/** Whether `statement` always leaves the block: a `return`, `throw`, `break` or `continue` last. */
function exits(statement: ESTree.Statement): boolean {
  switch (statement.type) {
    case 'ReturnStatement':
    case 'ThrowStatement':
    case 'BreakStatement':
    case 'ContinueStatement':
      return true;
    case 'BlockStatement': {
      const last = statement.body.at(-1);
      return last !== undefined && exits(last);
    }
    default:
      return false;
  }
}

/**
 * Whether `test` is false only when the check holds: `!check`, where `check`
 * may be an `&&` chain that includes it, or an `||` with such a disjunct, as in
 * `!a || !R.startsWith(lit)`.
 */
function checksNegated(
  match: Matcher,
  test: ESTree.Expression,
  method: 'startsWith' | 'endsWith',
  k: number,
): boolean {
  const node = unwrap(test);
  if (node.type === 'LogicalExpression') {
    return (
      node.operator === '||' &&
      (checksNegated(match, node.left, method, k) || checksNegated(match, node.right, method, k))
    );
  }
  return (
    node.type === 'UnaryExpression' &&
    node.operator === '!' &&
    checks(match, node.argument, method, k)
  );
}

/** Whether `test`, or a conjunct of it, is `R.startsWith(lit)`/`R.endsWith(lit)` with `lit` `k` long. */
function checks(
  match: Matcher,
  test: ESTree.Expression,
  method: 'startsWith' | 'endsWith',
  k: number,
): boolean {
  const node = unwrap(test);
  if (node.type === 'LogicalExpression') {
    return (
      node.operator === '&&' &&
      (checks(match, node.left, method, k) || checks(match, node.right, method, k))
    );
  }
  if (node.type !== 'CallExpression' || node.optional || node.arguments.length !== 1) return false;
  const { callee } = node;
  const [prefix] = node.arguments;
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    !callee.optional &&
    callee.property.type === 'Identifier' &&
    callee.property.name === method &&
    prefix?.type === 'Literal' &&
    typeof prefix.value === 'string' &&
    prefix.value.length === k &&
    isSameReceiver(match, callee.object)
  );
}

/** Whether `node` is the receiver again, written the same way and free of side effects. */
function isSameReceiver(match: Matcher, node: ESTree.Expression): boolean {
  return isStable(match.receiver) && isSame(match.context, node, match.receiver);
}

/** Whether `a` and `b` are the same side-effect free expression or string literal. */
function isSame(context: Context, a: ESTree.Expression, b: ESTree.Expression): boolean {
  const left = unwrap(a);
  const right = unwrap(b);
  if (isStringLiteral(left)) return isStringLiteral(right) && left.value === right.value;
  const { sourceCode } = context;
  return isStable(left) && sourceCode.getText(left) === sourceCode.getText(unwrap(right));
}

/**
 * Whether evaluating `node` twice gives the same value with no side effects in
 * between: an identifier, `this`, or a chain of `.name` members of those.
 */
function isStable(node: ESTree.Expression): boolean {
  const value = unwrap(node);
  switch (value.type) {
    case 'Identifier':
    case 'ThisExpression':
      return true;
    case 'MemberExpression':
      return !value.computed && !value.optional && isStable(value.object);
    default:
      return false;
  }
}

/** Whether `node` is `x.length`, for any `x` but `super`. */
function isLengthMember(node: ESTree.Expression): node is ESTree.StaticMemberExpression & {
  object: ESTree.Expression;
} {
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    !node.optional &&
    node.object.type !== 'Super' &&
    node.property.type === 'Identifier' &&
    node.property.name === 'length'
  );
}

function isStringLiteral(node: ESTree.Node): node is ESTree.StringLiteral {
  return node.type === 'Literal' && typeof node.value === 'string';
}

function isNumber(node: ESTree.Expression, value: number): boolean {
  return node.type === 'Literal' && node.value === value;
}

/** `node` without the TypeScript assertions around it, which do not change its value. */
function unwrap(node: ESTree.Expression): ESTree.Expression {
  let current = node;
  while (
    current.type === 'TSNonNullExpression' ||
    current.type === 'TSAsExpression' ||
    current.type === 'TSSatisfiesExpression' ||
    current.type === 'TSTypeAssertion'
  ) {
    current = current.expression;
  }
  return current;
}
