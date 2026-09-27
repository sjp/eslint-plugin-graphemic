import type { CreateRule, RuleMeta } from '@oxlint/plugins';

const DOCS_BASE_URL = 'https://github.com/sjp/eslint-plugin-graphemic/blob/main/docs/rules';

/**
 * The metadata every rule in this plugin must state. The linter treats all of
 * it as optional; here it is not, because the recommended config is derived
 * from `docs.recommended` and the README's rules table from the rest.
 */
export interface GraphemicRuleMeta extends RuleMeta {
  type: 'problem' | 'suggestion';
  docs: {
    description: string;
    /** Whether the rule is switched on by `configs.recommended`. */
    recommended: boolean;
    /** Filled in by `createRule`; never written by hand. */
    url?: string;
  };
  messages: Record<string, string>;
  schema: NonNullable<RuleMeta['schema']>;
}

/**
 * A rule in this plugin. Always the `create` form rather than oxlint's
 * `createOnce`: `create` is the API ESLint shares, so the rules stay portable
 * to ESLint without a compatibility wrapper.
 */
export interface GraphemicRule extends CreateRule {
  meta: GraphemicRuleMeta;
}

/**
 * Defines a rule named `name`, filling in the link to its documentation page so
 * that no rule can point somewhere else by accident.
 *
 * @example
 * export default createRule('no-unsafe-length', {
 *   meta: { type: 'problem', docs: { description: '…', recommended: true }, messages: {}, schema: [] },
 *   create(context) { return {}; },
 * });
 */
export function createRule(name: string, rule: GraphemicRule): GraphemicRule {
  return {
    ...rule,
    meta: { ...rule.meta, docs: { ...rule.meta.docs, url: `${DOCS_BASE_URL}/${name}.md` } },
  };
}
