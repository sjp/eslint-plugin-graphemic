/**
 * A unit graphemic measures strings in. Each is a module of functions with the
 * same names and signatures as its siblings, where the operation makes sense
 * for that unit.
 */
export type Unit = 'graphemes' | 'codePoints' | 'codeUnits' | 'utf8' | 'columns';

/** The package's root entry point. */
export const ROOT = '@sjpnz/graphemic';

/**
 * The functions each unit exports, per graphemic's `src/*.ts`: the only place
 * a rule learns what it can suggest. The lists are copied from the sources,
 * not the README, and a test pins them so a change is deliberate.
 *
 * @example
 * FUNCTIONS.utf8; // ['length', 'slice', 'truncate']
 */
export const FUNCTIONS: Readonly<Record<Unit, readonly string[]>> = {
  graphemes: [
    'length',
    'iterate',
    'toArray',
    'at',
    'slice',
    'truncate',
    'split',
    'chunk',
    'reverse',
    'padStart',
    'padEnd',
    'indexOf',
    'includes',
  ],
  codePoints: ['length', 'iterate', 'toArray', 'at', 'slice', 'truncate'],
  codeUnits: ['length', 'slice', 'truncate'],
  utf8: ['length', 'slice', 'truncate'],
  columns: ['length', 'slice', 'truncate', 'padStart', 'padEnd'],
};

/**
 * The subpath each unit's functions are exported from, as plain functions,
 * per graphemic's `exports` map.
 *
 * @example
 * SUBPATHS.codePoints; // '@sjpnz/graphemic/code-points'
 */
export const SUBPATHS: Readonly<Record<Unit, string>> = {
  graphemes: `${ROOT}/graphemes`,
  codePoints: `${ROOT}/code-points`,
  codeUnits: `${ROOT}/code-units`,
  utf8: `${ROOT}/utf8`,
  columns: `${ROOT}/columns`,
};

/**
 * Whether the root entry point re-exports `unit` as a namespace, as in
 * `import { graphemes } from '@sjpnz/graphemic'`. Every unit but `columns`:
 * its width tables are the package's only bulk data, and esbuild keeps a whole
 * namespace that reaches it through a re-export, so graphemic leaves it out of
 * the root on purpose.
 *
 * @example
 * inRoot('utf8'); // true
 * inRoot('columns'); // false
 */
export function inRoot(unit: Unit): boolean {
  return unit !== 'columns';
}

/**
 * Whether graphemic has `fn` for `unit`.
 *
 * @example
 * hasFunction('graphemes', 'reverse'); // true
 * hasFunction('utf8', 'reverse'); // false
 */
export function hasFunction(unit: Unit, fn: string): boolean {
  return FUNCTIONS[unit].includes(fn);
}
