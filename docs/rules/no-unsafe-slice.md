# graphemic/no-unsafe-slice

Disallow `slice`, `substring` and `substr` on strings, which cut at UTF-16 code-unit offsets.

✅ Enabled in the `recommended` config.

💡 Offers [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

⚙️ Options:

| Option                    | Type    | Default | Description                                                                                                                         |
| ------------------------- | ------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `allowIndexDerivedBounds` | boolean | `true`  | Leave slices whose bounds come from `indexOf`, `lastIndexOf`, `search` or a checked prefix or suffix on the same string unreported. |

<!-- end auto-generated rule header -->

`slice`, `substring` and `substr` take offsets in UTF-16 code units, so a cut
can land inside a character. `'👋🏽'.slice(0, 2)` is `'👋'`: the wave keeps its
first two code units and loses its skin tone. The same cut can leave half a
surrogate pair (shown as `�`), split a flag into two regional letters, or part
a letter from its accent. The result usually still looks like text, which is
why it goes unnoticed.

## Rule details

The rule reports `.slice()` on a string, and `.substring()` and `.substr()` on
anything: no other built-in has those two.

It leaves alone the slices that cut where the code has already found a
boundary in the same string, because every bound is:

- `0`;
- a position from `s.indexOf(x)`, `s.lastIndexOf(x)` or `s.search(x)` on the
  string being sliced, alone or plus or minus the length of `x`
  (`s.indexOf(', ') + 2`, `s.indexOf(sep) + sep.length`);
- `s.length`, or `s.length - x.length` or `-x.length`, which strip a suffix;
- a number `k`, `-k` or `s.length - k` inside a check that `s` starts (for
  `k`) or ends (for the others) with a string literal `k` code units long, as
  in `if (s.startsWith('#')) s.slice(1)`. The check can be the test of an `if`
  or `?:`, the left of `&&`, or part of a longer `&&` chain. It can also be an
  earlier `if` that leaves unless the check holds, as in
  `if (!s.startsWith('#')) return;`, which may `return`, `throw`, `break` or
  `continue`.

For these, the string being sliced and any `x` must be a variable, `this`, or
a chain of `.name` properties on those, written the same way both times, so
that it cannot change between the search and the slice. `substr` qualifies
only with a start and no length. A call with no arguments, such as `s.slice()`,
copies the whole string and is never reported.

A search that finds nothing returns -1, which is not a boundary:
`s.slice(0, s.indexOf(','))` on a string with no comma drops its last code
unit, and can split the last character. The rule assumes the code has checked
for that, as it almost always has.

### Incorrect

```ts
function initials(name: string) {
  return name.slice(0, 2);
}

const preview = `${title}: ${body}`.substring(0, 80);
```

### Correct

```ts
import { graphemes } from '@sjpnz/graphemic';

function initials(name: string) {
  return graphemes.slice(name, 0, 2);
}

function key(line: string) {
  return line.slice(0, line.indexOf('='));
}

function unhash(tag: string) {
  return tag.startsWith('#') ? tag.slice(1) : tag;
}
```

## Suggestions

Each suggestion replaces the call with a `slice` call on the string, passing
through the bounds that were given, and adds the import it needs.

| Unit              | Replacement                 | When to choose it                                          |
| ----------------- | --------------------------- | ---------------------------------------------------------- |
| Graphemes         | `graphemes.slice(s, a, b)`  | Offsets in what a person sees as characters: almost always |
| Code points       | `codePoints.slice(s, a, b)` | A limit defined in code points, e.g. some social networks  |
| UTF-8 bytes       | `utf8.slice(s, a, b)`       | A byte limit, e.g. a database column                       |
| Terminal columns  | `columns.slice(s, a, b)`    | Terminal alignment                                         |
| UTF-16 code units | `codeUnits.slice(s, a, b)`  | Keeping today's offsets, but never cutting a character     |

`codeUnits.slice(s, a, b)` takes the same offsets as `s.slice(a, b)` and moves
each cut inward to the nearest character boundary, so it can return a little
less, but never half a character. graphemic's `slice` treats its bounds as the
native `slice` does: negatives count back from the end, and a range that ends
before it starts is empty.

`substring` differs from `slice`: it treats negative bounds as 0 and swaps
bounds given in the wrong order. When the bounds are plain numbers in order,
or `0` and a `.length`, the two agree. Otherwise the report says so, and the
arguments are worth checking before accepting a suggestion.

`substr(start, length)` becomes `slice(s, start, start + length)`, with two
numbers folded into one: `s.substr(2, 3)` suggests `graphemes.slice(s, 2, 5)`.
It is only rewritten when `start` is a non-negative number or a variable, so
writing it twice is safe; a start that is negative, or an expression, is
reported without suggestions, as is a negative literal `length`.

These are also reported without suggestions: a call with more than two
arguments, and an optional chain such as `s?.slice(1)`, whose rewrite needs a
conditional.

## What counts as a string

`slice` is shared with arrays and typed arrays, so the rule reports it only
when the syntax shows the receiver is a string; see
[What counts as a string](../../CONTRIBUTING.md#what-counts-as-a-string).
`substring` and `substr` are reported on any receiver. In JavaScript:

```js
const label = 'Name';
label.slice(1); // reported

function f(s) {
  s.substring(1); // reported: only strings have substring
  return s.slice(1); // not reported: `s` could be an array
}
```

In TypeScript, a `string` annotation is enough:

```ts
function f(s: string) {
  return s.slice(1); // reported
}
```

## Options

### `allowIndexDerivedBounds`

With `false`, also reports the slices described in
[Rule details](#rule-details) whose bounds come from a search or a checked
prefix or suffix:

```jsonc
// .oxlintrc.json
{
  "rules": {
    "graphemic/no-unsafe-slice": ["error", { "allowIndexDerivedBounds": false }],
  },
}
```

```js
const s = 'key=value';
s.slice(0, s.indexOf('=')); // reported
```

## When not to use it

When the strings the code slices are known to be ASCII, or every offset it
uses comes from an API that counts in UTF-16 code units. Even then,
`codeUnits.slice(s, a, b)` says so where it happens, and keeps the rule on for
the rest.
