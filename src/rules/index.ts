import type { GraphemicRule } from '../utils/createRule.js';
import noUnsafeIndex from './no-unsafe-index.js';
import noUnsafeLength from './no-unsafe-length.js';
import noUnsafeSlice from './no-unsafe-slice.js';

/**
 * Every rule the plugin ships, keyed by the name users write after
 * `graphemic/`. Keep this sorted: each rule lands in its own change, and a
 * sorted list turns those changes into one-line merges.
 */
export const rules: Record<string, GraphemicRule> = {
  'no-unsafe-index': noUnsafeIndex,
  'no-unsafe-length': noUnsafeLength,
  'no-unsafe-slice': noUnsafeSlice,
};
