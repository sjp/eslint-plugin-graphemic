import type { ESTree } from '@oxlint/plugins';

import { createRule } from '../utils/createRule.js';
import { ruleTester, tsRuleTester } from './ruleTester.js';

// A stand-in rule with the shape every real rule has — a report carrying a
// suggestion — so the harness is proven to work under vitest before any rule
// depends on it: `.length` on a string literal, suggesting graphemes.length.
const rule = createRule('harness', {
  meta: {
    type: 'problem',
    docs: { description: 'Harness check.', recommended: false },
    hasSuggestions: true,
    messages: { length: 'Counts code units.', suggest: 'Count graphemes.' },
    schema: [],
  },
  create(context) {
    return {
      MemberExpression(node: ESTree.MemberExpression) {
        if (node.object.type !== 'Literal' || typeof node.object.value !== 'string') return;
        const receiver = context.sourceCode.getText(node.object);
        context.report({
          node,
          messageId: 'length',
          suggest: [
            {
              messageId: 'suggest',
              fix: (fixer) => fixer.replaceText(node, `graphemes.length(${receiver})`),
            },
          ],
        });
      },
    };
  },
});

const invalid = {
  code: "'ab'.length;",
  errors: [
    {
      messageId: 'length',
      suggestions: [{ messageId: 'suggest', output: "graphemes.length('ab');" }],
    },
  ],
};

ruleTester.run('harness', rule, { valid: ['[].length;'], invalid: [invalid] });

tsRuleTester.run('harness (TypeScript)', rule, {
  valid: ['const s: string = x; s.length;'],
  invalid: [
    {
      code: "const n: number = 'ab'.length;",
      errors: [
        {
          messageId: 'length',
          suggestions: [
            { messageId: 'suggest', output: "const n: number = graphemes.length('ab');" },
          ],
        },
      ],
    },
  ],
});
