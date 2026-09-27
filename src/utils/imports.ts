import type { Context, ESTree, Fix, Fixer, Scope, Settings } from '@oxlint/plugins';

import { hasFunction, inRoot, ROOT, SUBPATHS, type Unit } from './graphemic.js';
import { resolve } from './scope.js';

/** How a new import of graphemic is written; see {@link GraphemicSettings}. */
export type ImportStyle = 'namespace' | 'subpath';

/**
 * The plugin's shared settings, from `settings.graphemic` in the linter's
 * config. Every rule reads them the same way, through {@link readSettings}.
 */
export interface GraphemicSettings {
  /**
   * `'namespace'` (the default) adds `import { graphemes } from
   * '@sjpnz/graphemic'` and calls `graphemes.length(s)`. `'subpath'` adds
   * `import { length } from '@sjpnz/graphemic/graphemes'` and calls
   * `length(s)`, the style graphemic recommends for tree-shaking under every
   * bundler; where the function's name is already taken in the file it falls
   * back to `import * as graphemes from '@sjpnz/graphemic/graphemes'`.
   */
  importStyle: ImportStyle;
}

const DEFAULT_SETTINGS: GraphemicSettings = { importStyle: 'namespace' };

const IMPORT_STYLES: ReadonlySet<unknown> = new Set<ImportStyle>(['namespace', 'subpath']);

/**
 * Reads and validates `settings.graphemic`. A missing object or key takes its
 * default; anything else that is not a known key with a known value throws, so
 * a typo in the config is an error on the first file linted rather than a
 * setting silently ignored.
 *
 * @example
 * readSettings({ graphemic: { importStyle: 'subpath' } }); // { importStyle: 'subpath' }
 * readSettings({}); // { importStyle: 'namespace' }
 */
export function readSettings(settings: Readonly<Settings>): GraphemicSettings {
  const graphemic = settings['graphemic'];
  if (graphemic === undefined) return DEFAULT_SETTINGS;
  if (typeof graphemic !== 'object' || graphemic === null || Array.isArray(graphemic)) {
    throw new TypeError(
      `eslint-plugin-graphemic: settings.graphemic must be an object, got ${JSON.stringify(graphemic)}.`,
    );
  }
  for (const key of Object.keys(graphemic)) {
    if (key !== 'importStyle') {
      throw new TypeError(
        `eslint-plugin-graphemic: unknown setting settings.graphemic.${key}; the only setting is importStyle.`,
      );
    }
  }
  const { importStyle = DEFAULT_SETTINGS.importStyle } = graphemic;
  if (!isImportStyle(importStyle)) {
    throw new TypeError(
      `eslint-plugin-graphemic: settings.graphemic.importStyle must be "namespace" or "subpath", got ${JSON.stringify(importStyle)}.`,
    );
  }
  return { importStyle };
}

function isImportStyle(value: unknown): value is ImportStyle {
  return IMPORT_STYLES.has(value);
}

/** A way to call a graphemic function from the file being linted. */
export interface GraphemicCallee {
  /** Source text to call, e.g. `graphemes.length` or `length` or `g.length`. */
  text: string;
  /** Fixes that make `text` resolve — an added import, or none. */
  fix(fixer: Fixer): Fix[];
}

/**
 * How to call `unit`'s `fn` at `node`: through an import the file already
 * has, or one the returned fix adds. In order, it
 *
 * 1. reuses an import of `fn`, of `unit`'s namespace, or of the root
 *    namespace, when the name it binds still means that import at `node`;
 * 2. adds a specifier to a named import from the right module
 *    (`import { utf8 } from '@sjpnz/graphemic'` gains `graphemes`);
 * 3. adds a new import after the last one, or at the top of the file after
 *    any hashbang and directive prologue.
 *
 * The name a new import binds follows `settings.graphemic.importStyle`, and
 * `columns` always comes from `@sjpnz/graphemic/columns`, the only place
 * graphemic exports it.
 *
 * Returns `null` when there is no safe way to reference the function: the name
 * an import would bind is already declared, shadowed at `node`, or used as a
 * global; or the file is CommonJS, which cannot import graphemic (it is
 * ESM-only).
 *
 * Every call stands alone. Two suggestions for the same file are applied
 * independently, so each carries its own import rather than sharing one.
 *
 * @example
 * const callee = graphemicCallee(context, node, 'graphemes', 'length');
 * if (callee) {
 *   fix = (fixer) => [fixer.replaceText(node, `${callee.text}(s)`), ...callee.fix(fixer)];
 * }
 */
export function graphemicCallee(
  context: Context,
  node: ESTree.Node,
  unit: Unit,
  fn: string,
): GraphemicCallee | null {
  if (!hasFunction(unit, fn)) {
    throw new Error(`eslint-plugin-graphemic: graphemic has no ${unit}.${fn}.`);
  }
  const { importStyle } = readSettings(context.settings);
  if (!isModule(context, node)) return null;

  const imports = context.sourceCode.ast.body.filter(
    (statement): statement is ESTree.ImportDeclaration => statement.type === 'ImportDeclaration',
  );
  const existing = reuse(context, node, imports, unit, fn);
  if (existing !== undefined) return { text: existing, fix: () => [] };

  const free = bindings(importStyle, unit, fn).filter((binding) =>
    isFree(context, node, binding.local),
  );
  for (const binding of free) {
    const last = binding.named ? lastNamedSpecifier(imports, binding.module) : undefined;
    if (last !== undefined) {
      return {
        text: binding.text,
        fix: (fixer) => [fixer.insertTextAfter(last, `, ${binding.local}`)],
      };
    }
  }
  const [binding] = free;
  if (binding === undefined) return null;
  return {
    text: binding.text,
    fix: (fixer) => [insertImport(context, fixer, node, imports, binding)],
  };
}

/**
 * Whether `node` is one of graphemic's unit namespaces, reached through an
 * import this file has: `graphemes` after `import { graphemes } from
 * '@sjpnz/graphemic'`, `columns` after `import * as columns from
 * '@sjpnz/graphemic/columns'`, or `g.utf8` after `import * as g from
 * '@sjpnz/graphemic'`. Some graphemic functions share a name with a string
 * method, and they are what the rules suggest: a rule that reports
 * `s.padStart(8)` on any receiver must not report `graphemes.padStart(s, 8)`.
 *
 * @example
 * // import { graphemes } from '@sjpnz/graphemic';
 * isGraphemicNamespace(context, receiver); // true for `graphemes`, false for `s`
 */
export function isGraphemicNamespace(context: Context, node: ESTree.Node): boolean {
  if (node.type === 'Identifier') {
    const found = importOf(context, node, node.name);
    if (found === undefined) return false;
    const { specifier, source } = found;
    if (specifier.type === 'ImportNamespaceSpecifier') return UNIT_SUBPATHS.has(source);
    // graphemic has no default export, so only a named import can be of it.
    return (
      specifier.type === 'ImportSpecifier' &&
      source === ROOT &&
      ROOT_UNITS.has(exportName(specifier.imported))
    );
  }
  if (node.type !== 'MemberExpression' || node.computed) return false;
  if (node.object.type !== 'Identifier' || node.property.type !== 'Identifier') return false;
  const found = importOf(context, node.object, node.object.name);
  return (
    found?.specifier.type === 'ImportNamespaceSpecifier' &&
    found.source === ROOT &&
    ROOT_UNITS.has(node.property.name)
  );
}

const UNIT_SUBPATHS: ReadonlySet<string> = new Set(Object.values(SUBPATHS));

/** The units the root entry point re-exports as namespaces, by name. */
const ROOT_UNITS: ReadonlySet<string> = new Set(
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SUBPATHS is keyed by Unit
  (Object.keys(SUBPATHS) as Unit[]).filter(inRoot),
);

/** The value import `name` refers to at `node`, and the module it is from. */
function importOf(
  context: Context,
  node: ESTree.Node,
  name: string,
): { specifier: ESTree.ImportDeclarationSpecifier; source: string } | undefined {
  for (const statement of context.sourceCode.ast.body) {
    if (statement.type !== 'ImportDeclaration' || statement.importKind === 'type') continue;
    for (const specifier of statement.specifiers) {
      if (specifier.local.name !== name) continue;
      if (specifier.type === 'ImportSpecifier' && specifier.importKind === 'type') continue;
      if (isImportAt(context, node, specifier)) {
        return { specifier, source: statement.source.value };
      }
    }
  }
  return undefined;
}

/**
 * Whether the file can use `import`. oxlint parses `.js` and `.ts` files as
 * "unambiguous": a file without `import` or `export` is reported as a script
 * even in a `"type": "module"` package, and that is exactly the file a first
 * import is added to. So a script counts as a module unless it uses CommonJS's
 * `require`, `module` or `exports`; `.cjs` and `.cts` files never do.
 */
function isModule(context: Context, node: ESTree.Node): boolean {
  switch (context.languageOptions.sourceType) {
    case 'module':
      return true;
    case 'commonjs':
      return false;
    default:
      return !globalScope(context, node).through.some((ref) =>
        COMMONJS_GLOBALS.has(ref.identifier.name),
      );
  }
}

const COMMONJS_GLOBALS: ReadonlySet<string> = new Set(['require', 'module', 'exports']);

/** The source text that reaches `unit`'s `fn` through an import the file already has. */
function reuse(
  context: Context,
  node: ESTree.Node,
  imports: readonly ESTree.ImportDeclaration[],
  unit: Unit,
  fn: string,
): string | undefined {
  for (const declaration of imports) {
    if (declaration.importKind === 'type') continue;
    for (const specifier of declaration.specifiers) {
      const text = callText(specifier, declaration.source.value, unit, fn);
      if (text !== undefined && isImportAt(context, node, specifier)) return text;
    }
  }
  return undefined;
}

/** What `specifier`, imported from `source`, lets a file write to call `unit`'s `fn`. */
function callText(
  specifier: ESTree.ImportDeclarationSpecifier,
  source: string,
  unit: Unit,
  fn: string,
): string | undefined {
  const local = specifier.local.name;
  if (specifier.type === 'ImportNamespaceSpecifier') {
    if (source === SUBPATHS[unit]) return `${local}.${fn}`;
    if (source === ROOT && inRoot(unit)) return `${local}.${unit}.${fn}`;
    return undefined;
  }
  // graphemic has no default export, so only a named import can be of it.
  if (specifier.type !== 'ImportSpecifier' || specifier.importKind === 'type') return undefined;
  const imported = exportName(specifier.imported);
  if (source === SUBPATHS[unit] && imported === fn) return local;
  if (source === ROOT && inRoot(unit) && imported === unit) return `${local}.${fn}`;
  return undefined;
}

/** The name an import specifier imports: `a` in `{ a as b }` and in `{ 'a' as b }`. */
function exportName(name: ESTree.ModuleExportName): string {
  return name.type === 'Literal' ? name.value : name.name;
}

/** Whether `specifier`'s local name still means that import at `node`. */
function isImportAt(
  context: Context,
  node: ESTree.Node,
  specifier: ESTree.ImportDeclarationSpecifier,
): boolean {
  const [declared] = context.sourceCode.getDeclaredVariables(specifier);
  return resolve(context, node, specifier.local.name) === declared;
}

/** A name an import could bind to reach a graphemic function, and how to call through it. */
interface Binding {
  module: string;
  /** `import { local }` if true, `import * as local` if false. */
  named: boolean;
  local: string;
  text: string;
}

/** The bindings a new import could add, most preferred first. */
function bindings(style: ImportStyle, unit: Unit, fn: string): Binding[] {
  const namespace = {
    module: SUBPATHS[unit],
    named: false,
    local: unit,
    text: `${unit}.${fn}`,
  };
  if (style === 'subpath') {
    return [{ module: SUBPATHS[unit], named: true, local: fn, text: fn }, namespace];
  }
  // The root re-exports every unit but `columns` as a namespace, under the
  // unit's name.
  return inRoot(unit)
    ? [{ module: ROOT, named: true, local: unit, text: `${unit}.${fn}` }]
    : [namespace];
}

/**
 * Whether a module-scope import of `name` would be what `name` means at
 * `node`, and would change the meaning of nothing else: nothing in the file
 * declares it where `node` can see, and no code reads it as a global.
 */
function isFree(context: Context, node: ESTree.Node, name: string): boolean {
  const variable = resolve(context, node, name);
  if (variable !== undefined && variable.defs.length > 0) return false;
  return !globalScope(context, node).through.some((ref) => ref.identifier.name === name);
}

/** The last specifier of a named import from `module`, which another specifier can follow. */
function lastNamedSpecifier(
  imports: readonly ESTree.ImportDeclaration[],
  module: string,
): ESTree.ImportSpecifier | undefined {
  for (const declaration of imports) {
    const last = declaration.specifiers.at(-1);
    // A namespace import cannot sit beside named ones, and a type-only import
    // would make the new specifier type-only too; both have to be left alone.
    if (
      declaration.source.value === module &&
      declaration.importKind !== 'type' &&
      last?.type === 'ImportSpecifier'
    ) {
      return last;
    }
  }
  return undefined;
}

/** A fix adding a new import declaration for `binding`. */
function insertImport(
  context: Context,
  fixer: Fixer,
  node: ESTree.Node,
  imports: readonly ESTree.ImportDeclaration[],
  binding: Binding,
): Fix {
  const last = imports.at(-1);
  // Match the file's quotes where it has an import to copy them from.
  const quote = last?.source.raw?.[0] ?? "'";
  const specifier = binding.named ? `{ ${binding.local} }` : `* as ${binding.local}`;
  const declaration = `import ${specifier} from ${quote}${binding.module}${quote};`;
  if (last !== undefined) return fixer.insertTextAfter(last, `\n${declaration}`);
  // A hashbang is a comment before the first statement, and a directive
  // prologue has to stay first to stay a prologue.
  const { body } = context.sourceCode.ast;
  const prologue = body.filter(
    (statement) =>
      statement.type === 'ExpressionStatement' && typeof statement.directive === 'string',
  );
  const directive = prologue.at(-1);
  if (directive !== undefined) return fixer.insertTextAfter(directive, `\n${declaration}`);
  // `node` is in the file, so the file has a first statement; the default is
  // only there to say so to the compiler.
  const [first = node] = body;
  return fixer.insertTextBefore(first, `${declaration}\n`);
}

/** The outermost scope, whose `through` lists every reference to an undeclared global. */
function globalScope(context: Context, node: ESTree.Node): Scope {
  let scope = context.sourceCode.getScope(node);
  while (scope.upper !== null) scope = scope.upper;
  return scope;
}
