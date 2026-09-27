import type { Context, Definition, ESTree, Variable } from '@oxlint/plugins';

import { resolve } from './scope.js';

/** How sure we are that `node` evaluates to a string. */
export type StringEvidence = 'string' | 'not-string' | 'unknown';

/**
 * Works out, from the syntax alone, whether `node` evaluates to a string. There
 * is no type checker to ask, so this only answers `'string'` on positive
 * evidence — a literal, an obviously string-valued expression, or a TypeScript
 * annotation — and `'not-string'` on equally plain evidence of an array.
 * Everything else, including any value that merely might be a string, is
 * `'unknown'`.
 *
 * @example
 * stringEvidence(context, node); // `'#' + id` → 'string', `[a, b]` → 'not-string', `user.name` → 'unknown'
 */
export function stringEvidence(context: Context, node: ESTree.Expression): StringEvidence {
  return evidence(node, { context, resolving: new Set() });
}

/**
 * Whether `node` is known to evaluate to a string: what a rule checks before
 * reporting an operation whose name strings share with arrays, such as
 * `.length` or `.slice()`.
 */
export function isStringLike(context: Context, node: ESTree.Expression): boolean {
  return stringEvidence(context, node) === 'string';
}

interface State {
  context: Context;
  /** `const` bindings whose initialisers are being followed, so `const a = a + ''` terminates. */
  resolving: Set<Variable>;
}

/**
 * One kind of evidence. Each answers `'unknown'` when it has nothing to say
 * about `node`, which passes it on to the next. A source backed by real type
 * information would go first in `SOURCES`, and no rule would need to change.
 */
type EvidenceSource = (node: ESTree.Expression, state: State) => StringEvidence;

const SOURCES: readonly EvidenceSource[] = [
  literalEvidence,
  concatenationEvidence,
  assertionEvidence,
  callEvidence,
  bindingEvidence,
  classFieldEvidence,
];

function evidence(node: ESTree.Expression, state: State): StringEvidence {
  // `a?.b()` is the value of `a.b()` or `undefined`; like an annotation of
  // `string | undefined`, it is the non-nullish value that matters to a rule.
  const target = node.type === 'ChainExpression' ? node.expression : node;
  for (const source of SOURCES) {
    const found = source(target, state);
    if (found !== 'unknown') return found;
  }
  return 'unknown';
}

/** `'abc'`, `` `a${b}` ``, ``String.raw`…` ``, and array literals. */
function literalEvidence(node: ESTree.Expression, state: State): StringEvidence {
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'string' ? 'string' : 'unknown';
    case 'TemplateLiteral':
      return 'string';
    case 'TaggedTemplateExpression':
      // A tag is called like any function: ``String.raw`…` `` is `String.raw(…)`.
      return globalCallEvidence(node.tag, state);
    case 'ArrayExpression':
      return 'not-string';
    default:
      return 'unknown';
  }
}

/** `a + b` is a string as soon as either side is. */
function concatenationEvidence(node: ESTree.Expression, state: State): StringEvidence {
  if (node.type !== 'BinaryExpression' || node.operator !== '+') return 'unknown';
  return evidence(node.left, state) === 'string' || evidence(node.right, state) === 'string'
    ? 'string'
    : 'unknown';
}

/** `x as string`, `<string>x`, `x satisfies string`, `x!`. */
function assertionEvidence(node: ESTree.Expression, state: State): StringEvidence {
  switch (node.type) {
    case 'TSAsExpression':
    case 'TSTypeAssertion':
      // An assertion replaces whatever `x` was known to be, except `as const`,
      // which keeps it.
      return isConstType(node.typeAnnotation)
        ? evidence(node.expression, state)
        : typeEvidence(node.typeAnnotation);
    case 'TSSatisfiesExpression': {
      // `satisfies` checks `x` against the type without changing it, so `x`
      // itself is still evidence when the type says nothing.
      const found = typeEvidence(node.typeAnnotation);
      return found === 'unknown' ? evidence(node.expression, state) : found;
    }
    case 'TSNonNullExpression':
      return evidence(node.expression, state);
    default:
      return 'unknown';
  }
}

/** Global functions whose result is known, when not shadowed. */
const GLOBAL_CALLS: ReadonlyMap<string, StringEvidence> = new Map([
  ['String', 'string'],
  ['Array', 'not-string'],
]);

/** Static methods of globals whose result is known, when not shadowed. */
const STATIC_CALLS: ReadonlyMap<string, StringEvidence> = new Map([
  ['String.fromCharCode', 'string'],
  ['String.fromCodePoint', 'string'],
  ['String.raw', 'string'],
  ['Array.from', 'not-string'],
  ['Array.of', 'not-string'],
]);

/**
 * Methods that return a string whatever they are called on. Not
 * `JSON.stringify`, which returns `undefined` for `undefined` and functions.
 */
const STRING_RETURNING_METHODS: ReadonlySet<string> = new Set([
  'join',
  'toDateString',
  'toExponential',
  'toFixed',
  'toISOString',
  'toLocaleDateString',
  'toLocaleString',
  'toLocaleTimeString',
  'toPrecision',
  'toString',
  'toTimeString',
  'toUTCString',
]);

/**
 * String methods, by what they return when called on a string. Most share a
 * name with an array method, so they only count on a receiver already known to
 * be a string.
 */
const STRING_METHODS: ReadonlyMap<string, StringEvidence> = new Map([
  ['at', 'string'],
  ['charAt', 'string'],
  ['concat', 'string'],
  ['normalize', 'string'],
  ['padEnd', 'string'],
  ['padStart', 'string'],
  ['repeat', 'string'],
  ['replace', 'string'],
  ['replaceAll', 'string'],
  ['slice', 'string'],
  ['split', 'not-string'],
  ['substr', 'string'],
  ['substring', 'string'],
  ['toLocaleLowerCase', 'string'],
  ['toLocaleUpperCase', 'string'],
  ['toLowerCase', 'string'],
  ['toUpperCase', 'string'],
  ['toWellFormed', 'string'],
  ['trim', 'string'],
  ['trimEnd', 'string'],
  ['trimStart', 'string'],
]);

/** `String(x)`, `x.toString()`, `s.trim()`, `Array.from(x)`, `new Array(n)`… */
function callEvidence(node: ESTree.Expression, state: State): StringEvidence {
  if (node.type === 'NewExpression') {
    // `new Array(n)` is an array; `new String(s)` is an object, not a string.
    return globalCallEvidence(node.callee, state) === 'not-string' ? 'not-string' : 'unknown';
  }
  if (node.type !== 'CallExpression') return 'unknown';
  const { callee } = node;
  const global = globalCallEvidence(callee, state);
  if (global !== 'unknown' || !isStaticMember(callee)) return global;
  const method = callee.property.name;
  if (STRING_RETURNING_METHODS.has(method)) return 'string';
  const onString = STRING_METHODS.get(method);
  return onString !== undefined && evidence(callee.object, state) === 'string'
    ? onString
    : 'unknown';
}

/** What calling `callee` returns, when it is a global function or a global's static method. */
function globalCallEvidence(callee: ESTree.Expression, state: State): StringEvidence {
  if (callee.type === 'Identifier') {
    const found = GLOBAL_CALLS.get(callee.name);
    return found !== undefined && isGlobal(callee, state) ? found : 'unknown';
  }
  if (!isStaticMember(callee) || callee.object.type !== 'Identifier') return 'unknown';
  const found = STATIC_CALLS.get(`${callee.object.name}.${callee.property.name}`);
  return found !== undefined && isGlobal(callee.object, state) ? found : 'unknown';
}

/** An identifier: its annotation, or the initialiser of a `const`. */
function bindingEvidence(node: ESTree.Expression, state: State): StringEvidence {
  if (node.type !== 'Identifier') return 'unknown';
  const variable = resolve(state.context, node, node.name);
  const [definition] = variable?.defs ?? [];
  if (variable === undefined || definition === undefined || variable.defs.length > 1) {
    return 'unknown';
  }
  // An annotation is checked by the compiler on every assignment, so it holds
  // for `let`, `var` and parameters as well as `const`.
  const annotated = typeEvidence(bindingAnnotation(definition.name));
  if (annotated !== 'unknown') return annotated;
  // Without one, only a `const` is sure to still hold its initialiser.
  const declarator = definition.name.parent;
  if (
    declarator.type !== 'VariableDeclarator' ||
    declarator.id !== definition.name ||
    declarator.init === null ||
    declarator.parent.type !== 'VariableDeclaration' ||
    declarator.parent.kind !== 'const' ||
    state.resolving.has(variable)
  ) {
    return 'unknown';
  }
  state.resolving.add(variable);
  try {
    return evidence(declarator.init, state);
  } finally {
    state.resolving.delete(variable);
  }
}

/** `this.name` inside a class that declares `name: string`. */
function classFieldEvidence(node: ESTree.Expression): StringEvidence {
  if (node.type !== 'MemberExpression' || node.computed || node.object.type !== 'ThisExpression') {
    return 'unknown';
  }
  const owner = thisOwner(node);
  if (owner === undefined) return 'unknown';
  const name = keyName(node.property);
  const field = owner.body.body.find(
    (element): element is ESTree.PropertyDefinition =>
      element.type === 'PropertyDefinition' &&
      element.static === owner.isStatic &&
      !element.computed &&
      keyName(element.key) === name,
  );
  return typeEvidence(field?.typeAnnotation?.typeAnnotation);
}

/** What a TypeScript type says about its values. */
function typeEvidence(type: ESTree.TSType | null | undefined): StringEvidence {
  switch (type?.type) {
    case 'TSStringKeyword':
    case 'TSTemplateLiteralType':
      return 'string';
    case 'TSLiteralType':
      return type.literal.type === 'Literal' && typeof type.literal.value === 'string'
        ? 'string'
        : 'unknown';
    case 'TSArrayType':
    case 'TSTupleType':
      return 'not-string';
    case 'TSTypeOperator':
      // `readonly string[]`; `keyof` and `unique` never produce strings alone.
      return type.operator === 'readonly' ? typeEvidence(type.typeAnnotation) : 'unknown';
    case 'TSTypeReference':
      return type.typeName.type === 'Identifier' && ARRAY_TYPES.has(type.typeName.name)
        ? 'not-string'
        : 'unknown';
    case 'TSUnionType':
      return unionEvidence(type.types);
    default:
      return 'unknown';
  }
}

const ARRAY_TYPES: ReadonlySet<string> = new Set(['Array', 'ReadonlyArray']);

/**
 * A union is as good as its members, once `undefined` and `null` are set
 * aside: `string | undefined` is reported on, since the rules only fire where
 * the value is used as a string.
 */
function unionEvidence(types: readonly ESTree.TSType[]): StringEvidence {
  const members = types
    .filter((type) => type.type !== 'TSUndefinedKeyword' && type.type !== 'TSNullKeyword')
    .map(typeEvidence);
  const [first = 'unknown'] = members;
  return members.every((member) => member === first) ? first : 'unknown';
}

/** Whether `type` is the `const` of `x as const`. */
function isConstType(type: ESTree.TSType): boolean {
  return (
    type.type === 'TSTypeReference' &&
    type.typeName.type === 'Identifier' &&
    type.typeName.name === 'const'
  );
}

/**
 * The annotation that types the binding `name`: its own, a rest element's, or
 * the property's in an object type literal annotating a destructuring pattern,
 * as in `({ name }: { name: string }) => …`.
 */
function bindingAnnotation(name: Definition['name']): ESTree.TSType | undefined {
  if (name.typeAnnotation) return name.typeAnnotation.typeAnnotation;
  const { parent } = name;
  if (parent.type === 'RestElement') return parent.typeAnnotation?.typeAnnotation;
  // `{ name = 'fallback' }` puts a default between the binding and its property.
  const property = parent.type === 'AssignmentPattern' ? parent.parent : parent;
  if (
    property.type !== 'Property' ||
    property.computed ||
    property.parent.type !== 'ObjectPattern'
  ) {
    return undefined;
  }
  const key = keyName(property.key);
  const literal = property.parent.typeAnnotation?.typeAnnotation;
  if (literal?.type !== 'TSTypeLiteral') return undefined;
  const member = literal.members.find(
    (signature): signature is ESTree.TSPropertySignature =>
      signature.type === 'TSPropertySignature' &&
      !signature.computed &&
      keyName(signature.key) === key,
  );
  return member?.typeAnnotation?.typeAnnotation;
}

/**
 * The class body `this` refers to at `node`, and whether it is the class itself
 * (in a static member) rather than an instance. `undefined` when `this` belongs
 * to a plain function or to no class at all.
 */
function thisOwner(node: ESTree.Node): { body: ESTree.ClassBody; isStatic: boolean } | undefined {
  // Set on the way out of a member whose body sees the class's `this`; still
  // unset on reaching a class body means `node` is in a computed key, whose
  // `this` is the one outside the class.
  let isStatic: boolean | undefined;
  let child = node;
  let current: ESTree.Node | null = node.parent;
  while (current !== null) {
    switch (current.type) {
      case 'FunctionDeclaration':
      case 'FunctionExpression':
        // Every function but an arrow has its own `this`: a class's only when
        // it is one of its methods.
        if (current.parent.type !== 'MethodDefinition') return undefined;
        isStatic = current.parent.static;
        break;
      case 'PropertyDefinition':
        if (current.value === child) isStatic = current.static;
        break;
      case 'StaticBlock':
        isStatic = true;
        break;
      case 'ClassBody':
        if (isStatic !== undefined) return { body: current, isStatic };
        break;
    }
    child = current;
    current = current.parent;
  }
  return undefined;
}

/** Whether `node` is `x.name`, as opposed to `x[name]` or `x.#name`. */
function isStaticMember(node: ESTree.Expression): node is ESTree.StaticMemberExpression {
  return node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier';
}

/** The name a non-computed key spells, with private names keeping their `#`. */
function keyName(key: ESTree.PropertyKey): string | undefined {
  switch (key.type) {
    case 'Identifier':
      return key.name;
    case 'PrivateIdentifier':
      return `#${key.name}`;
    default:
      return undefined;
  }
}

/** Whether `identifier` refers to a global rather than to anything the file declares. */
function isGlobal(identifier: ESTree.IdentifierReference, state: State): boolean {
  const variable = resolve(state.context, identifier, identifier.name);
  return variable === undefined || variable.defs.length === 0;
}
