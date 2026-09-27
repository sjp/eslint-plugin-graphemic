import type { GraphemicRule } from '../utils/createRule.js';
import noUnsafeIndex from './no-unsafe-index.js';
import noUnsafeIteration from './no-unsafe-iteration.js';
import noUnsafeLength from './no-unsafe-length.js';
import noUnsafePad from './no-unsafe-pad.js';
import noUnsafeReverse from './no-unsafe-reverse.js';
import noUnsafeSlice from './no-unsafe-slice.js';
import noUnsafeSplit from './no-unsafe-split.js';

/**
 * Every rule the plugin ships, keyed by the name users write after
 * `graphemic/`. Keep this sorted: each rule lands in its own change, and a
 * sorted list turns those changes into one-line merges.
 */
export const rules: Record<string, GraphemicRule> = {
  'no-unsafe-index': noUnsafeIndex,
  'no-unsafe-iteration': noUnsafeIteration,
  'no-unsafe-length': noUnsafeLength,
  'no-unsafe-pad': noUnsafePad,
  'no-unsafe-reverse': noUnsafeReverse,
  'no-unsafe-slice': noUnsafeSlice,
  'no-unsafe-split': noUnsafeSplit,
};
