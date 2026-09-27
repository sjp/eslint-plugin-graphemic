import type { ESTree } from '@oxlint/plugins';

import { ruleTester, tsRuleTester } from '../test/ruleTester.js';
import { createRule } from './createRule.js';
import { isStringLike, stringEvidence, type StringEvidence } from './strings.js';

// Reports what `stringEvidence` says about the argument of every `probe(…)`
// call, and whether `isStringLike` agrees, so each case reads as code → answer.
const rule = createRule('probe', {
  meta: {
    type: 'problem',
    docs: { description: 'Reports the string evidence for probe arguments.', recommended: false },
    messages: { evidence: '{{evidence}} {{stringLike}}' },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node: ESTree.CallExpression) {
        const [argument] = node.arguments;
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'probe') return;
        if (argument === undefined || argument.type === 'SpreadElement') return;
        context.report({
          node: argument,
          messageId: 'evidence',
          data: {
            evidence: stringEvidence(context, argument),
            stringLike: String(isStringLike(context, argument)),
          },
        });
      },
    };
  },
});

type Case = [code: string, expected: StringEvidence];

function cases(list: Case[]) {
  return {
    valid: ['other(1);', 'probe();', 'probe(...args);'],
    invalid: list.map(([code, expected]) => ({
      code,
      errors: [{ message: `${expected} ${String(expected === 'string')}` }],
    })),
  };
}

ruleTester.run(
  'stringEvidence',
  rule,
  cases([
    // Literals.
    ["probe('abc');", 'string'],
    ['probe(`a${b}`);', 'string'],
    ['probe(1);', 'unknown'],
    ['probe(null);', 'unknown'],
    ['probe([1, 2]);', 'not-string'],
    ['probe({});', 'unknown'],

    // Tagged templates are calls of their tag.
    ['probe(String.raw`a\\u{1F44B}`);', 'string'],
    ['probe(tag`abc`);', 'unknown'],
    ['probe(html.raw`abc`);', 'unknown'],
    ['const String = { raw: (s) => s }; probe(String.raw`abc`);', 'unknown'],

    // Concatenation.
    ["probe('#' + id);", 'string'],
    ['probe(name + `!`);', 'string'],
    ['probe(a + b);', 'unknown'],
    ["probe(a - '1');", 'unknown'],
    ["probe(1 + 2 + 'px');", 'string'],

    // Calls that always return a string.
    ['probe(String(x));', 'string'],
    ['probe(x.toString());', 'string'],
    ['probe(n.toString(16));', 'string'],
    ["probe(arr.join(', '));", 'string'],
    ['probe(n.toFixed(2));', 'string'],
    ['probe(n.toPrecision(3));', 'string'],
    ['probe(date.toISOString());', 'string'],
    ['probe(String.fromCharCode(65));', 'string'],
    ['probe(String.fromCodePoint(0x1f44b));', 'string'],
    ['probe(x?.toString());', 'string'],
    ['probe(JSON.stringify(x));', 'unknown'],
    ['probe(f());', 'unknown'],
    ['probe(f()());', 'unknown'],
    ['probe(x[method]());', 'unknown'],
    ['class A { #join() {} m() { probe(this.#join()); } }', 'unknown'],
    ['probe(Number(x));', 'unknown'],
    ['probe(String.prototype.at.call(s, 0));', 'unknown'],
    ['function String() {} probe(String(x));', 'unknown'],

    // String methods on string evidence.
    ["probe(' a '.trim());", 'string'],
    ["probe(('a' + b).toLowerCase());", 'string'],
    ["probe('abc'.slice(1));", 'string'],
    ["probe('abc'.replace('a', 'b'));", 'string'],
    ["probe('abc'.normalize());", 'string'],
    ["probe('abc'.padEnd(5));", 'string'],
    ["probe('abc'.at(0));", 'string'],
    ["probe(' a '.trim().toUpperCase());", 'string'],
    ["probe('a,b'.split(','));", 'not-string'],
    ['probe(s.trim());', 'unknown'],
    ['probe(items.slice(1));', 'unknown'],
    ["probe('abc'.includes('a'));", 'unknown'],

    // Arrays.
    ['probe(Array.from(x));', 'not-string'],
    ['probe(Array.of(1, 2));', 'not-string'],
    ['probe(Array(3));', 'not-string'],
    ['probe(new Array(3));', 'not-string'],
    ['probe(new String(x));', 'unknown'],
    ['probe(new Thing());', 'unknown'],
    ['const Array = { from: String }; probe(Array.from(x));', 'unknown'],
    ['probe(Array.isArray(x));', 'unknown'],

    // `const` bindings.
    ["const label = 'x'; probe(label);", 'string'],
    ['const a = [1, 2]; probe(a);', 'not-string'],
    ["const a = 'x'; const b = a; probe(b);", 'string'],
    ["const a = 'x'; probe(a + a);", 'string'],
    ['const a = f(); probe(a);', 'unknown'],
    ['const a = a + b; probe(a);', 'unknown'],
    ["const { a } = { a: 'x' }; probe(a);", 'unknown'],
    ["const [a] = ['x']; probe(a);", 'unknown'],
    ["let s = 'a'; probe(s);", 'unknown'],
    ["let s = 'a'; s = other; probe(s);", 'unknown'],
    ["var s = 'a'; probe(s);", 'unknown'],
    ["var s = 'a'; var s = 'b'; probe(s);", 'unknown'],
    ['let s; probe(s);', 'unknown'],
    ["const s = 'a'; { const s = [1]; probe(s); }", 'not-string'],
    ["const s = [1]; { const s = 'a'; probe(s); }", 'string'],
    ["const s = 'a'; function f(s) { probe(s); }", 'unknown'],
    ['function f(s) { probe(s); }', 'unknown'],
    ["function f(s = 'a') { probe(s); }", 'unknown'],
    ["for (const s of ['a']) probe(s);", 'unknown'],
    ['function s() {} probe(s);', 'unknown'],
    ["import s from 'mod'; probe(s);", 'unknown'],
    ['try {} catch (s) { probe(s); }', 'unknown'],
    ['probe(undeclared);', 'unknown'],

    // `this` is never evidence without a class field annotation.
    ['probe(this.name);', 'unknown'],
    ['class A { name = "x"; m() { probe(this.name); } }', 'unknown'],

    // Other expressions.
    ["probe(c ? 'a' : 'b');", 'unknown'],
    ['probe(user.name);', 'unknown'],
    ["probe((0, 'a'));", 'unknown'],
  ]),
);

tsRuleTester.run(
  'stringEvidence (TypeScript)',
  rule,
  cases([
    // Assertions.
    ['probe(x as string);', 'string'],
    ['probe(<string>x);', 'string'],
    ['probe(x satisfies string);', 'string'],
    ['probe(x as unknown as string);', 'string'],
    ['probe(x as string[]);', 'not-string'],
    ['probe(x as UserName);', 'unknown'],
    ["probe('a' as UserName);", 'unknown'],
    ["probe('a' as const);", 'string'],
    ["probe(<const>'a');", 'string'],
    ["probe('a' satisfies UserName);", 'string'],
    ['probe(x satisfies UserName);', 'unknown'],
    ['probe([] satisfies string[]);', 'not-string'],
    ['function f(s: string | undefined) { probe(s!); }', 'string'],
    ['probe(x!);', 'unknown'],

    // Annotated bindings.
    ['const s: string = x; probe(s);', 'string'],
    ['function f(s: string) { probe(s); }', 'string'],
    ['const f = (s?: string) => probe(s);', 'string'],
    ["function f(s: string = 'a') { probe(s); }", 'string'],
    ["let s: 'a' | 'b' = 'a'; probe(s);", 'string'],
    ["let s: 'a'; probe(s);", 'string'],
    ['let s: `id-${number}`; probe(s);', 'string'],
    ['let s: 1 | 2; probe(s);', 'unknown'],
    ["let s: 'a' | 1; probe(s);", 'unknown'],
    ['function f(s: string | undefined) { probe(s); }', 'string'],
    ['function f(s: string | null | undefined) { probe(s); }', 'string'],
    ['function f(s: null | undefined) { probe(s); }', 'unknown'],
    ['function f(s: string | string[]) { probe(s); }', 'unknown'],
    ['function f(s: UserName) { probe(s); }', 'unknown'],
    ['function f(s: Array<string>) { probe(s); }', 'not-string'],
    ['function f(s: ReadonlyArray<string>) { probe(s); }', 'not-string'],
    ['function f(s: ns.Array<string>) { probe(s); }', 'unknown'],
    ['function f(s: keyof T) { probe(s); }', 'unknown'],
    ["let s: string = 'a'; s = other; probe(s);", 'string'],
    ['var s: string; probe(s);', 'string'],
    ["const s: UserName = 'a'; probe(s);", 'string'],
    ['let s: UserName = x; probe(s);', 'unknown'],
    ['const t = s.trim(); function f(s: string) { probe(t); }', 'unknown'],
    ['function f(s: string) { const t = s.trim(); probe(t); }', 'string'],
    ['function f(s: number) { probe(s); }', 'unknown'],

    // Arrays and tuples.
    ['function f(s: string[]) { probe(s); }', 'not-string'],
    ['function f(s: readonly string[]) { probe(s); }', 'not-string'],
    ['function f(s: [string, string]) { probe(s); }', 'not-string'],
    ['function f(s: string[] | undefined) { probe(s); }', 'not-string'],
    ['function f(...s: string[]) { probe(s); }', 'not-string'],
    ['function f(...s) { probe(s); }', 'unknown'],

    // Destructured parameters with an object type literal.
    ['function f({ name }: { name: string }) { probe(name); }', 'string'],
    ['const f = ({ name }: { name?: string }) => probe(name);', 'string'],
    ["function f({ name = 'x' }: { name: string }) { probe(name); }", 'string'],
    ['function f({ name: n }: { name: string }) { probe(n); }', 'string'],
    ['function f({ tags }: { name: string; tags: string[] }) { probe(tags); }', 'not-string'],
    ['function f({ name }: { other: string }) { probe(name); }', 'unknown'],
    ['function f({ name }: { name }) { probe(name); }', 'unknown'],
    ['function f({ name }: { [name]: string }) { probe(name); }', 'unknown'],
    ['function f({ name }: { name(): string }) { probe(name); }', 'unknown'],
    ['function f({ name }: Props) { probe(name); }', 'unknown'],
    ['function f({ name }) { probe(name); }', 'unknown'],
    ['function f({ [key]: name }: { name: string }) { probe(name); }', 'unknown'],
    ["function f({ 'name': name }: { name: string }) { probe(name); }", 'unknown'],
    ['function f([name]: [string]) { probe(name); }', 'unknown'],
    ['function f({ a: { name } }: { a: { name: string } }) { probe(name); }', 'unknown'],

    // Class fields.
    ['class A { name: string; m() { probe(this.name); } }', 'string'],
    ['class A { name: string[]; m() { probe(this.name); } }', 'not-string'],
    ['class A { #name: string; m() { probe(this.#name); } }', 'string'],
    ['class A { static name: string; static m() { probe(this.name); } }', 'string'],
    ['class A { static name: string; m() { probe(this.name); } }', 'unknown'],
    ['class A { name: string; static m() { probe(this.name); } }', 'unknown'],
    ['class A { name: string; m() { return () => probe(this.name); } }', 'string'],
    ['class A { name: string; f = () => probe(this.name); }', 'string'],
    ['class A { static name: string; static { probe(this.name); } }', 'string'],
    ['class A { name: string; m() { function g() { probe(this.name); } } }', 'unknown'],
    ['class A { name: string; m() { probe(this.other); } }', 'unknown'],
    ['class A { name: string; m() { probe(this[name]); } }', 'unknown'],
    ['class A { #name: string; m() { probe(this.name); } }', 'unknown'],
    ["class A { ['name']: string; m() { probe(this.name); } }", 'unknown'],
    ['class A { name: string; [probe(this.name)] = 1; }', 'unknown'],
    ['class A { name: string; [probe(this.name)]() {} }', 'unknown'],
    ['class A { name: string; m() { class B { [probe(this.name)] = 1; } } }', 'string'],
    ['class A { name: string; get m() { return probe(this.name); } }', 'string'],
    ['const o = { name: "x", m() { probe(this.name); } };', 'unknown'],
    ['function f() { probe(this.name); }', 'unknown'],
    ['class A { name: string; m() { probe(other.name); } }', 'unknown'],
  ]),
);
