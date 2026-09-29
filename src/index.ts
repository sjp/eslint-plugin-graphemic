/**
 * Lint rules for string operations that count, cut or index in UTF-16 code
 * units — `.length`, `.slice`, `s[i]`, `split('')` and the rest — where the
 * author almost always meant user-visible characters. Each report suggests the
 * `@sjpnz/graphemic` function that names its unit instead.
 *
 * For oxlint and ESLint. The rules use the `create` API the two share, so one
 * plugin serves both, but only oxlint is tested and supported for now; ESLint
 * support is on its way.
 *
 * @example
 * // oxlint.config.ts
 * import { defineConfig } from 'oxlint';
 * import graphemic from 'eslint-plugin-graphemic';
 *
 * export default defineConfig({ extends: [graphemic.configs.recommended] });
 *
 * @example
 * // .oxlintrc.json
 * {
 *   "jsPlugins": ["eslint-plugin-graphemic"],
 *   "rules": { "graphemic/no-unsafe-length": "error" }
 * }
 */

import type { Plugin } from '@oxlint/plugins';
import type { OxlintConfig } from 'oxlint';

import { rules } from './rules/index.js';
import type { GraphemicRule } from './utils/createRule.js';

/** The package version, replaced at release time. */
export const VERSION = '0.0.0';

const PACKAGE_NAME = 'eslint-plugin-graphemic';
const PLUGIN_NAME = 'graphemic';

export interface GraphemicPlugin extends Plugin {
  meta: { name: string; version: string };
  rules: Record<string, GraphemicRule>;
  /**
   * Ready-made oxlint configs, for `extends` in `oxlint.config.ts`. oxlint
   * itself ignores a plugin's `configs`; these are plain config objects that
   * load the plugin by package name.
   */
  configs: { recommended: OxlintConfig; all: OxlintConfig };
}

function config(include: (recommended: boolean) => boolean): OxlintConfig {
  const enabled: Record<string, 'error'> = {};
  for (const [ruleName, rule] of Object.entries(rules)) {
    if (include(rule.meta.docs.recommended)) enabled[`${PLUGIN_NAME}/${ruleName}`] = 'error';
  }
  return { jsPlugins: [PACKAGE_NAME], rules: enabled };
}

const plugin: GraphemicPlugin = {
  // oxlint takes the rule prefix from `meta.name`, stripping `eslint-plugin-`.
  meta: { name: PACKAGE_NAME, version: VERSION },
  rules,
  configs: {
    recommended: config((recommended) => recommended),
    all: config(() => true),
  },
};

export default plugin;
