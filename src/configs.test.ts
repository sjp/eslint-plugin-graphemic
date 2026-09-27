import { describe, expect, it, vi } from 'vitest';

// Until the real rules land the registry is empty, which would leave the config
// builder's selection untested. Two stand-ins, one on each side of the
// recommended line, pin that behaviour down independently of which rules exist.
vi.mock('./rules/index.js', async () => {
  const { createRule } = await import('./utils/createRule.js');
  const stub = (recommended: boolean) =>
    createRule('stub', {
      meta: {
        type: 'problem',
        docs: { description: 'A stand-in.', recommended },
        messages: {},
        schema: [],
      },
      create: () => ({}),
    });
  return { rules: { 'a-recommended': stub(true), 'b-optional': stub(false) } };
});

const { default: plugin } = await import('./index.js');

describe('configs', () => {
  it('recommended switches on only the recommended rules, as errors', () => {
    expect(plugin.configs.recommended.rules).toEqual({ 'graphemic/a-recommended': 'error' });
  });

  it('all switches on every rule, as errors', () => {
    expect(plugin.configs.all.rules).toEqual({
      'graphemic/a-recommended': 'error',
      'graphemic/b-optional': 'error',
    });
  });
});
