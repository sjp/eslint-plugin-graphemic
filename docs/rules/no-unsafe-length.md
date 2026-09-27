# graphemic/no-unsafe-length

Disallow `.length` on strings, which counts UTF-16 code units.

✅ Enabled in the `recommended` config.

💡 Offers [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

⚙️ Options:

| Option                | Type    | Default | Description                                                     |
| --------------------- | ------- | ------- | --------------------------------------------------------------- |
| `ignoreDestructuring` | boolean | `true`  | Leave `const { length } = s` and `({ length } = s)` unreported. |

<!-- end auto-generated rule header -->

`.length` counts UTF-16 code units, not the characters a person sees.
`'👋🏽'.length` is 4: one visible character, made of two code points, each
stored as two code units. Flags and accented letters do the same
(`'🇦🇺'.length` is 4, a decomposed `'e\u0301'.length` is 2), so a 20-character
limit rejects five emoji and a counter disagrees with the text box beside it.

What each unit makes of `'👋🏽'`:

| Unit              | Count |
| ----------------- | ----- |
| Graphemes         | 1     |
| Code points       | 2     |
| UTF-16 code units | 4     |
| UTF-8 bytes       | 8     |
| Terminal columns  | 2     |

## Rule details

The rule reports `.length`, `['length']` and ``[`length`]`` read from a
string. It leaves alone the uses that come out the same in every unit, because
zero code units is zero characters and anything more is at least one:

- comparisons with zero: `s.length === 0`, `!== 0`, `== 0`, `!= 0`, `> 0`,
  `>= 1`, `< 1`, `<= 0`, and the same written the other way round
  (`0 < s.length`);
- truthiness tests: `if (s.length)`, the test of a `while`, `do…while`, `for`
  or `?:`, `!s.length`, `!!s.length`, `Boolean(s.length)`, and an operand of
  `&&`, `||` or `??` whose result is itself only tested;
- the left side of `&&` anywhere, as in `{s.length && <List />}`: it passes its
  own value on only when that value is 0;
- writes, such as `x.length = 0`, which only make sense on an array.

### Incorrect

```ts
function validate(name: string) {
  if (name.length > 20) throw new Error('Too long');
}

const remaining = 280 - `${greeting}${body}`.length;
```

### Correct

```ts
import { graphemes } from '@sjpnz/graphemic';

function validate(name: string) {
  if (graphemes.length(name) > 20) throw new Error('Too long');
  if (name.length === 0) throw new Error('Required');
}
```

## Suggestions

Each suggestion replaces the `.length` with a call on the string, and adds the
import it needs.

| Unit              | Replacement            | When to choose it                                         |
| ----------------- | ---------------------- | --------------------------------------------------------- |
| Graphemes         | `graphemes.length(s)`  | Counting what a person sees as characters: almost always  |
| Code points       | `codePoints.length(s)` | A limit defined in code points, e.g. some social networks |
| UTF-8 bytes       | `utf8.length(s)`       | A byte limit, e.g. a database column                      |
| Terminal columns  | `columns.length(s)`    | Terminal alignment                                        |
| UTF-16 code units | `codeUnits.length(s)`  | Keeping today's count, and saying so                      |

`codeUnits.length(s)` returns exactly what `s.length` did. Use it where code
units really are meant, such as an offset handed to an API that counts them,
instead of disabling the rule.

An optional chain, `s?.length`, is reported without suggestions: rewriting it
needs a conditional, not a call.

## What counts as a string

`.length` is shared with arrays, so the rule reports it only when the syntax
shows the receiver is a string; see
[What counts as a string](../../CONTRIBUTING.md#what-counts-as-a-string). In
JavaScript that means literals and values built from them:

```js
const label = 'Name';
label.length; // reported

function f(s) {
  return s.length; // not reported: `s` could be anything
}
```

In TypeScript, a `string` annotation is enough:

```ts
function f(s: string) {
  return s.length; // reported
}
```

## Options

### `ignoreDestructuring`

With `false`, also reports taking `length` from a string by destructuring, in
a declaration or an assignment. These reports have no suggestion, since the
rewrite is a different statement:

```jsonc
// .oxlintrc.json
{
  "rules": {
    "graphemic/no-unsafe-length": ["error", { "ignoreDestructuring": false }],
  },
}
```

```js
const { length } = 'abc'; // reported
({ length: n } = 'abc'); // reported
```

## When not to use it

When the strings the code handles are known to be ASCII, or when every length
it takes feeds an API that counts in UTF-16 code units. Even then,
`codeUnits.length(s)` says so where it happens, and keeps the rule on for the
rest.
