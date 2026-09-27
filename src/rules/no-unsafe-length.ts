import type { Context, ESTree } from '@oxlint/plugins';

import { createRule } from '../utils/createRule.js';
import type { Unit } from '../utils/graphemic.js';
import { callSuggestions } from '../utils/replace.js';
import { resolve } from '../utils/scope.js';
import { isStringLike } from '../utils/strings.js';

interface Options {
  ignoreDestructuring?: boolean;
}

/** Every unit graphemic can count in, in the order the suggestions are offered. */
const UNITS: readonly Unit[] = ['graphemes', 'codePoints', 'utf8', 'columns', 'codeUnits'];

/**
 * Comparisons against which a length is exact whatever unit it counts in,
 * because zero code units is zero graphemes and anything more is at least one:
 * `s.length > 0` is `true` for exactly the same strings in every unit. Keyed by
 * the operator with the length on the left; `MIRRORED` flips it for `0 < s.length`.
 */
const EMPTINESS: Readonly<Record<string, number>> = {
  '===': 0,
  '!==': 0,
  '==': 0,
  '!=': 0,
  '>': 0,
  '<=': 0,
  '>=': 1,
  '<': 1,
};

const MIRRORED: Readonly<Record<string, string>> = {
  '===': '===',
  '!==': '!==',
  '==': '==',
  '!=': '!=',
  '<': '>',
  '>=': '<=',
  '<=': '>=',
  '>': '<',
};

export default createRule('no-unsafe-length', {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow `.length` on strings, which counts UTF-16 code units.',
      recommended: true,
    },
    hasSuggestions: true,
    messages: {
      length: "`.length` counts UTF-16 code units, not characters: `'👋🏽'.length` is 4.",
      destructure:
        "Destructuring `length` counts UTF-16 code units, not characters: `'👋🏽'.length` is 4.",
      graphemes: 'Count user-visible characters (graphemes).',
      codePoints:
        'Count code points, for a limit defined in code points, e.g. some social networks.',
      utf8: 'Count UTF-8 bytes, for a byte limit, e.g. a database column.',
      columns: 'Count terminal columns, for terminal alignment.',
      codeUnits: 'Keep counting UTF-16 code units, and say so.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          ignoreDestructuring: {
            type: 'boolean',
            default: true,
            description: 'Leave `const { length } = s` and `({ length } = s)` unreported.',
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the schema has checked them
    const { ignoreDestructuring = true } = (context.options[0] ?? {}) as Options;

    /** Reports each `length` that `pattern` takes from `value`, when `value` is a string. */
    function checkPattern(pattern: ESTree.Node, value: ESTree.Expression): void {
      if (pattern.type !== 'ObjectPattern' || !isStringLike(context, value)) return;
      for (const property of pattern.properties) {
        if (property.type === 'Property' && isLengthKey(property.key, property.computed)) {
          context.report({ node: property, messageId: 'destructure' });
        }
      }
    }

    return {
      MemberExpression(member: ESTree.MemberExpression) {
        if (!isLengthKey(member.property, member.computed)) return;
        if (member.object.type === 'Super' || !isStringLike(context, member.object)) return;
        // `s?.length` is reported as the whole chain, which is what gets replaced.
        const node = member.parent.type === 'ChainExpression' ? member.parent : member;
        if (isWritten(node) || isExact(context, node)) return;
        context.report({
          node,
          messageId: 'length',
          suggest: callSuggestions(
            context,
            node,
            UNITS.map((unit) => ({ messageId: unit, unit, fn: 'length', args: [member.object] })),
          ),
        });
      },
      VariableDeclarator(declarator: ESTree.VariableDeclarator) {
        if (ignoreDestructuring || declarator.init === null) return;
        checkPattern(declarator.id, declarator.init);
      },
      AssignmentExpression(assignment: ESTree.AssignmentExpression) {
        if (ignoreDestructuring) return;
        checkPattern(assignment.left, assignment.right);
      },
    };
  },
});

/**
 * Whether `key` names `length`: `s.length`, `s['length']`, `` s[`length`] ``,
 * and the same in a pattern's `{ length }` or `{ 'length': n }`. A name only
 * known at runtime, as in `s[key]`, does not.
 */
function isLengthKey(key: ESTree.Node, computed: boolean): boolean {
  switch (key.type) {
    case 'Identifier':
      return !computed && key.name === 'length';
    case 'Literal':
      return key.value === 'length';
    case 'TemplateLiteral':
      // With no expressions there is exactly one quasi.
      return (
        key.expressions.length === 0 && key.quasis.every((quasi) => quasi.value.cooked === 'length')
      );
    default:
      return false;
  }
}

/**
 * Whether `node` is written to rather than read. Only an array's length can be
 * set, so none of these is a string's: `x.length = 0`, `x.length++`,
 * `delete x.length`, `for (x.length of …)`, `[x.length] = …`.
 */
function isWritten(node: ESTree.Expression): boolean {
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

/**
 * Whether the length at `node` is used only in a way where every unit agrees:
 * compared against zero, or tested for truthiness.
 */
function isExact(context: Context, node: ESTree.Expression): boolean {
  const { parent } = node;
  if (parent.type === 'BinaryExpression') {
    const [operator, other] =
      parent.left === node
        ? [parent.operator, parent.right]
        : [MIRRORED[parent.operator], parent.left];
    const bound = operator === undefined ? undefined : EMPTINESS[operator];
    return bound !== undefined && other.type === 'Literal' && other.value === bound;
  }
  return isTruthinessTest(context, node);
}

/**
 * Whether `node`'s value is only tested for truthiness: a condition, the
 * operand of `!`, the argument of the global `Boolean`, or an operand of a
 * logical expression that is itself only tested. The left side of `&&` counts
 * wherever it is: it passes its own value on only when that value is falsy,
 * and a falsy length is 0 in every unit.
 */
function isTruthinessTest(context: Context, node: ESTree.Expression): boolean {
  const { parent } = node;
  switch (parent.type) {
    case 'IfStatement':
    case 'WhileStatement':
    case 'DoWhileStatement':
    case 'ForStatement':
    case 'ConditionalExpression':
      return parent.test === node;
    case 'UnaryExpression':
      return parent.operator === '!';
    case 'CallExpression':
      return (
        parent.arguments[0] === node &&
        parent.callee.type === 'Identifier' &&
        parent.callee.name === 'Boolean' &&
        isGlobal(context, parent.callee)
      );
    case 'LogicalExpression':
      return (
        (parent.operator === '&&' && parent.left === node) || isTruthinessTest(context, parent)
      );
    default:
      return false;
  }
}

/** Whether `identifier` refers to a global rather than to anything the file declares. */
function isGlobal(context: Context, identifier: ESTree.IdentifierReference): boolean {
  const variable = resolve(context, identifier, identifier.name);
  return variable === undefined || variable.defs.length === 0;
}
