import type { GraphemicRule } from '../utils/createRule.js';

/**
 * Every rule the plugin ships, keyed by the name users write after
 * `graphemic/`. Keep this sorted: each rule lands in its own change, and a
 * sorted list turns those changes into one-line merges.
 */
export const rules: Record<string, GraphemicRule> = {};
