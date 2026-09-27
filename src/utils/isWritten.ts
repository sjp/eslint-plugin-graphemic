import type { ESTree } from '@oxlint/plugins';

/**
 * Whether `node` is written to rather than read: `x.p = 0`, `x.p++`,
 * `delete x.p`, `for (x.p of …)`, `[x.p] = …`. A string's properties and
 * indexes cannot be set, so a rule that sees one of these has a receiver that
 * is not a string after all, whatever the evidence said.
 */
export function isWritten(node: ESTree.Expression): boolean {
  const { parent } = node;
  switch (parent.type) {
    case 'AssignmentExpression':
    case 'AssignmentPattern':
    case 'ForInStatement':
    case 'ForOfStatement':
      return parent.left === node;
    case 'UpdateExpression':
    case 'ArrayPattern':
    case 'RestElement':
      return true;
    case 'UnaryExpression':
      return parent.operator === 'delete';
    case 'Property':
      return parent.parent.type === 'ObjectPattern' && parent.value === node;
    default:
      return false;
  }
}
