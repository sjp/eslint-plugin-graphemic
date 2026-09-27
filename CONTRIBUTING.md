# Contributing

## What counts as a string

Many of the operations these rules look at share a name with an array method:
`.length`, `.slice()`, `.at()`, `.indexOf()`, `.includes()`, `x[i]`, `for…of`
and spread. oxlint gives plugins no type information, so a rule reports one of
these only when the syntax alone shows that the receiver is a string. Rules ask
`isStringLike` (in `src/utils/strings.ts`), which answers from the evidence
below and nothing else; rule pages link here rather than repeat it.

A receiver is a string when it is:

| Evidence                                    | Examples                                                                                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A string or template literal                | `'abc'`, `` `a${b}` ``, ``String.raw`…` ``                                                                                                                |
| A `+` with a string on either side          | `'#' + id`, `` name + `…` ``                                                                                                                              |
| A call that always returns a string         | `String(x)`, `x.toString()`, `arr.join(…)`, `n.toFixed(d)`, `String.fromCodePoint(…)`                                                                     |
| A string method called on a string          | `s.trim()`, `s.toLowerCase()`, `s.slice(…)`, `s.replace(…)`, `s.normalize()`, `s.padEnd(…)`                                                               |
| A TypeScript assertion to a string type     | `x as string`, `<string>x`, `x satisfies string`, `x!` of a string                                                                                        |
| A binding annotated with a string type      | `const s: string`, `function f(s: string)`, `(s?: string) => …`, `({ name }: { name: string }) => …`, and class fields `name: string` read as `this.name` |
| A `const` initialised with any of the above | `const label = 'x'; label.length`                                                                                                                         |

A string type is `string`, a string literal type (`'a'`), a template literal
type (`` `id-${number}` ``), or a union of only those, with `undefined` and
`null` allowed alongside (`string | undefined` counts: the rules fire where the
value is used as a string).

An annotation holds whatever is assigned later, since the compiler checks every
assignment, so `let s: string` and annotated parameters count. Without one, only
a `const` does: `let s = 'a'` could be reassigned to anything.

Nothing else counts, so none of these is reported:

- unannotated parameters and `let`/`var` bindings: `function f(s) { s.length }`;
- properties and call results: `user.name.length`, `getName().length`;
- names of a type alias or interface: `(s: UserName) => s.length`, even when
  `UserName` is `string` — aliases are not followed;
- arrays, which are recognised as such: array literals, `Array.from(…)`,
  `Array.of(…)`, `new Array(…)`, `s.split(…)`, and bindings annotated `string[]`,
  `readonly string[]`, `Array<string>` or a tuple.

`String`, `Array` and their static methods count only while they are the
globals, not when the file declares its own.

## Rule pages

Every rule has a page at `docs/rules/<name>.md`; `createRule` links each rule to
it. The part of the page above `<!-- end auto-generated rule header -->` is
generated from the rule's `meta` — the title, description, whether the
`recommended` config enables it, whether it offers suggestions, and its options
from `meta.schema` — and so is the rules table in the README. After adding a
rule or changing its `meta`, run:

```sh
npm run docs
```

`npm run check` runs `npm run docs:check`, which fails when the generated text is
out of date, when a rule has no page, or when a page has no rule.

Start a new page from this template. Write only the header's two lines; the
generator fills in the rest:

````md
# graphemic/<name>

<!-- end auto-generated rule header -->

One paragraph: what the native operation counts and the input it breaks on,
with a concrete example (`'👋🏽'.length === 4`).

## Rule details

### Incorrect

```js
…
```

### Correct

```js
…
```

## Suggestions

| Unit | Replacement | When to choose it |
| ---- | ----------- | ----------------- |
| …    | …           | …                 |

## What counts as a string

Which receivers the rule recognises, linking
[What counts as a string](../../CONTRIBUTING.md#what-counts-as-a-string), with
a JavaScript and a TypeScript example.

## Options

The options and what each changes, or "This rule has no options."

## When not to use it

…
````
