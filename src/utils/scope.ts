import type { Context, ESTree, Scope, Variable } from '@oxlint/plugins';

/**
 * The variable `name` refers to at `node`, found through the scopes around it;
 * `undefined` when nothing in the file or the configured globals declares it.
 *
 * @example
 * resolve(context, node, 'graphemes'); // the import, a parameter that shadows it, or undefined
 */
export function resolve(context: Context, node: ESTree.Node, name: string): Variable | undefined {
  let scope: Scope | null = context.sourceCode.getScope(node);
  for (; scope !== null; scope = scope.upper) {
    const variable = scope.set.get(name);
    if (variable !== undefined) return variable;
  }
  return undefined;
}
