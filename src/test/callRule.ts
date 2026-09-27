import type { ESTree } from '@oxlint/plugins';

import { createRule } from '../utils/createRule.js';
import type { Unit } from '../utils/graphemic.js';
import { type CallSuggestion, callSuggestions } from '../utils/replace.js';

/**
 * One suggestion the stand-in rule offers, as its options spell it. A type
 * alias rather than an interface, so that it counts as JSON for `options`.
 */
export type CallOption = {
  unit: Unit;
  fn: string;
  /** Raw text arguments after the node ones. */
  extra?: string[];
  suffix?: string;
};

/**
 * A stand-in rule for testing the suggestion helpers the way a real rule uses
 * them. It reports `recv.$` and `recv.$(a, b)`, and offers one suggestion per
 * option: a call to that option's function on `recv`, then `a`, `b` and any
 * `extra` text. An optional chain around the member is reported as the whole
 * chain, as a rule would.
 *
 * @example
 * // options [{ unit: 'graphemes', fn: 'length' }]: `'ab'.$` → `graphemes.length('ab')`
 */
export const callRule = createRule('call', {
  meta: {
    type: 'problem',
    docs: { description: 'Suggestion helper check.', recommended: false },
    hasSuggestions: true,
    messages: { report: 'Reported.', suggest: 'Use {{unit}}.' },
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          unit: { type: 'string' },
          fn: { type: 'string' },
          extra: { type: 'array', items: { type: 'string' } },
          suffix: { type: 'string' },
        },
        required: ['unit', 'fn'],
        additionalProperties: false,
      },
    },
  },
  create(context) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the schema has checked them
    const options = context.options as unknown as readonly CallOption[];
    return {
      MemberExpression(member: ESTree.MemberExpression) {
        if (member.computed || member.property.type !== 'Identifier') return;
        if (member.property.name !== '$') return;
        const { parent } = member;
        const call = parent.type === 'CallExpression' && parent.callee === member ? parent : null;
        const replaced = call ?? member;
        const node = replaced.parent.type === 'ChainExpression' ? replaced.parent : replaced;
        const args = [member.object, ...(call?.arguments ?? [])];
        context.report({
          node,
          messageId: 'report',
          suggest: callSuggestions(
            context,
            node,
            options.map(({ unit, fn, extra = [], suffix }) => {
              const suggestion: CallSuggestion = {
                messageId: 'suggest',
                data: { unit },
                unit,
                fn,
                args: [...args, ...extra],
              };
              if (suffix !== undefined) suggestion.suffix = suffix;
              return suggestion;
            }),
          ),
        });
      },
    };
  },
});
