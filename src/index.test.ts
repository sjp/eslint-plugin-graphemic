import { describe, expect, it } from 'vitest';

import plugin, { VERSION } from './index.js';
import { rules } from './rules/index.js';
import { createRule } from './utils/createRule.js';

describe('plugin', () => {
  it('names itself and its version', () => {
    expect(plugin.meta).toEqual({ name: 'eslint-plugin-graphemic', version: VERSION });
  });

  it('exposes every rule', () => {
    expect(plugin.rules).toBe(rules);
  });

  it('builds configs that load the plugin by package name', () => {
    for (const config of Object.values(plugin.configs)) {
      expect(config.jsPlugins).toEqual(['eslint-plugin-graphemic']);
    }
  });

  it('switches on every rule in the all config', () => {
    expect(Object.keys(plugin.configs.all.rules ?? {})).toEqual(
      Object.keys(rules).map((name) => `graphemic/${name}`),
    );
  });

  it('switches on only recommended rules in the recommended config', () => {
    const recommended = Object.entries(rules)
      .filter(([, rule]) => rule.meta.docs.recommended)
      .map(([name]) => `graphemic/${name}`);
    expect(Object.keys(plugin.configs.recommended.rules ?? {})).toEqual(recommended);
  });
});

describe('rules', () => {
  it('are listed in sorted order', () => {
    const names = Object.keys(rules);
    expect(names).toEqual(names.toSorted());
  });

  it.each(Object.entries(rules))('%s links to its own documentation page', (name, rule) => {
    expect(rule.meta).toHaveProperty(
      'docs.url',
      `https://github.com/sjp/eslint-plugin-graphemic/blob/main/docs/rules/${name}.md`,
    );
  });
});

const create = () => ({});

describe('createRule', () => {
  it('fills in the documentation url without touching the rest of the rule', () => {
    const rule = createRule('example', {
      meta: {
        type: 'problem',
        docs: { description: 'An example.', recommended: false },
        messages: { example: 'Example.' },
        schema: [],
      },
      create,
    });

    expect(rule.create).toBe(create);
    expect(rule.meta).toEqual({
      type: 'problem',
      docs: {
        description: 'An example.',
        recommended: false,
        url: 'https://github.com/sjp/eslint-plugin-graphemic/blob/main/docs/rules/example.md',
      },
      messages: { example: 'Example.' },
      schema: [],
    });
  });
});
