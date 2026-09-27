import type { ESTree } from '@oxlint/plugins';

import { ruleTester, tsRuleTester } from '../test/ruleTester.js';
import { createRule } from './createRule.js';
import { hasIndexDerivedBounds } from './indexDerivedBounds.js';

// Reports what `hasIndexDerivedBounds` says about each call that is a
// statement of its own, or a branch of `?:`, `&&` or `||` that is (bar a
// `startsWith` or `endsWith` guard), so each case reads as code → answer while
// calls in bounds and tests go unprobed.
const rule = createRule('probe', {
  meta: {
    type: 'problem',
    docs: { description: 'Reports whether calls have index-derived bounds.', recommended: false },
    messages: { derived: '{{derived}}' },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node: ESTree.CallExpression) {
        if (!isStatement(node)) return;
        context.report({
          node,
          messageId: 'derived',
          data: { derived: String(hasIndexDerivedBounds(context, node)) },
        });
      },
    };
  },
});

/** Whether `node` is evaluated as a statement, directly or as a branch. */
function isStatement(node: ESTree.Node): boolean {
  const { parent } = node;
  switch (parent?.type) {
    case 'ExpressionStatement':
      return true;
    case 'ConditionalExpression':
      return parent.test !== node && isStatement(parent);
    case 'LogicalExpression':
      return !isGuard(node) && isStatement(parent);
    case 'ChainExpression':
      return isStatement(parent);
    default:
      return false;
  }
}

/** Whether `node` is a `startsWith` or `endsWith` call, as the test of an `&&` is. */
function isGuard(node: ESTree.Node): boolean {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    node.callee.property.type === 'Identifier' &&
    /^(?:starts|ends)With$/.test(node.callee.property.name)
  );
}

type Case = [code: string, derived: boolean];

function cases(list: Case[]) {
  return {
    valid: [],
    invalid: list.map(([code, derived]) => ({ code, errors: [{ message: String(derived) }] })),
  };
}

ruleTester.run(
  'hasIndexDerivedBounds',
  rule,
  cases([
    // Found positions on the same receiver.
    ["s.slice(0, s.indexOf(','));", true],
    ["s.slice(s.indexOf(':') + 1);", true],
    ["s.slice(s.lastIndexOf('/') + 1);", true],
    ['s.substring(0, s.search(/\\s/));', true],
    ["s.substr(s.indexOf(':'));", true],
    ["s.slice(s.indexOf(', ') + 2);", true],
    ["s.slice(0, s.indexOf(', ') - 2);", true],
    ['s.slice(s.indexOf(sep) + sep.length);', true],
    ["s.slice(s.indexOf('ab') + 'ab'.length);", true],
    ['a.b.slice(a.b.indexOf(x));', true],
    ['this.s.slice(this.s.indexOf(x));', true],
    ['s.slice(0, s.length);', true],
    ['s.slice(0, s.indexOf(x, 3));', true],
    // Stripping a suffix of known length.
    ['s.slice(0, -suffix.length);', true],
    ["s.slice(0, -'.js'.length);", true],
    ['s.slice(0, s.length - suffix.length);', true],
    ['s.slice(0, s.length - a.b.length);', true],
    // A different receiver, or one that could change between the two reads.
    ["a.slice(0, b.indexOf(','));", false],
    ["f().slice(0, f().indexOf(','));", false],
    ["a[0].slice(0, a[0].indexOf(','));", false],
    ["a?.b.slice(0, a?.b.indexOf(','));", false],
    ["s.slice(0, s?.indexOf(','));", false],
    ["s.slice(0, s.indexOf?.(','));", false],
    ["s.slice(0, s['indexOf'](','));", false],
    ['s.slice(0, s.indexOf());', false],
    ['s.slice(0, s.indexOf(...xs));', false],
    ["s.slice(0, s.at(','));", false],
    ['s.slice(0, t.length);', false],
    ['s.slice(0, s.size);', false],
    // Offsets that are not the length of what was searched for.
    ["s.slice(s.indexOf(', ') + 1);", false],
    ["s.slice(s.indexOf(', ') * 2);", false],
    ['s.slice(s.indexOf(sep) + other.length);', false],
    ['s.slice(s.indexOf(f()) + f().length);', false],
    ['s.slice(s.indexOf(/,/) + 1);', false],
    ["s.slice(s.indexOf(',') + s.length);", false],
    ['s.slice(s.indexOf(sep) + sep.size);', false],
    ['s.slice(s.indexOf(sep) + sep?.length);', false],
    ['s.slice(s.indexOf(sep) + sep[`length`]);', false],
    ["s.slice(s.indexOf('ab') + 'ba'.length);", false],
    ["s.slice(s.indexOf('ab') + x.length);", false],
    // Suffix lengths of something that could change, or that is not a length.
    ['s.slice(0, -f().length);', false],
    ['s.slice(0, +suffix.length);', false],
    ['s.slice(0, s.length - f().length);', false],
    ['s.slice(0, s.length + suffix.length);', false],
    ['s.slice(0, t.length - suffix.length);', false],
    ['class A extends B { f() { s.slice(0, -super.length); } }', false],
    // Numbers, which only a guard can vouch for.
    ['s.slice(1);', false],
    ['s.slice(0, -1);', false],
    ['s.slice(0, x);', false],
    ["s.slice(0, 'a');", false],
    // Every bound must qualify, and only `substr`'s start is a bound.
    ["s.slice(1, s.indexOf(','));", false],
    ["s.substr(s.indexOf(':'), 2);", false],
    ['s.slice(...bounds);', false],
    ['s.slice();', false],
    // Not a slicing call at all.
    ['s.at(0);', false],
    ['s[`slice`](0);', false],
    ['class A { #slice; f(s) { s.#slice(0); } }', false],
    ['f(0);', false],
    ['class A extends B { f() { super.slice(0); } }', false],
  ]),
);

ruleTester.run(
  'hasIndexDerivedBounds (guards)',
  rule,
  cases([
    ["if (s.startsWith('#')) s.slice(1);", true],
    ["if (s.startsWith('#')) { s.substring(1); }", true],
    ["if (s.startsWith('#')) s.substr(1);", true],
    ["if (s.startsWith('ab')) s.slice(2);", true],
    ["if (s.startsWith('#')) s.slice(0, 1);", true],
    ["s.startsWith('#') ? s.slice(1) : s;", true],
    ["s.startsWith('#') && s.slice(1);", true],
    ["if (ok && s.startsWith('#')) s.slice(1);", true],
    ["if (s.startsWith('#') && ok) s.slice(1);", true],
    ["if (s.startsWith('#')) { if (ok) { const f = () => { s.slice(1); }; } }", true],
    ["if (s.endsWith('.js')) s.slice(0, -3);", true],
    ["if (s.endsWith('.js')) s.slice(0, s.length - 3);", true],
    ["s.endsWith('.js') ? s.slice(0, -3) : s;", true],
    // The wrong length, method, receiver, branch or kind of check.
    ["if (s.startsWith('#')) s.slice(2);", false],
    ["if (s.startsWith('#')) s.slice(1.5);", false],
    ["if (s.startsWith('#')) s.slice(-1);", false],
    ["if (s.endsWith('#')) s.slice(1);", false],
    ["if (s.startsWith('#')) s.slice(0, -1);", false],
    ["if (t.startsWith('#')) s.slice(1);", false],
    ["if (s.startsWith('#')) {} else s.slice(1);", false],
    ["s.startsWith('#') ? s : s.slice(1);", false],
    ["s.startsWith('#') || s.slice(1);", false],
    ["s.slice(1) && s.startsWith('#');", false],
    ["if (s.startsWith('#') || ok) s.slice(1);", false],
    ["if (!s.startsWith('#')) s.slice(1);", false],
    ["if (s.startsWith('#', 2)) s.slice(1);", false],
    ['if (s.startsWith(prefix)) s.slice(1);', false],
    ['if (s.startsWith(1)) s.slice(1);', false],
    ["if (s?.startsWith('#')) s.slice(1);", false],
    ["if (s.startsWith?.('#')) s.slice(1);", false],
    ["if (s['startsWith']('#')) s.slice(1);", false],
    ["if (s.includes('#')) s.slice(1);", false],
    ["if (check('#')) s.slice(1);", false],
    ["if (s.startsWith('#')) f().slice(1);", false],
    ["while (s.startsWith('#')) s.slice(1);", false],
  ]),
);

tsRuleTester.run(
  'hasIndexDerivedBounds (TypeScript)',
  rule,
  cases([
    ["s.slice(0, s.indexOf(',')!);", true],
    ["s.slice(0, s.indexOf(',') as number);", true],
    ["s.slice(0, s.indexOf(',') satisfies number);", true],
    ["s.slice(0, <number>s.indexOf(','));", true],
    ["s!.slice(0, s.indexOf(','));", true],
    ['s.slice(0, s.indexOf(sep!) + sep.length);', true],
    ["if ((s as string).startsWith('#')) s.slice(1 as number);", true],
  ]),
);
