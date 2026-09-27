# graphemic/no-unsafe-search

Disallow `indexOf` and `lastIndexOf` on strings where the code-unit position they return is used, and optionally `includes`.

Not enabled in the `recommended` config; `all` enables it.

💡 Offers [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

⚙️ Options:

| Option          | Type    | Default | Description                                                                                                                                |
| --------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `checkIncludes` | boolean | `false` | Also report `includes`, and `indexOf` or `lastIndexOf` compared with `-1` or `0` to check for a match, which can match inside a character. |

<!-- end auto-generated rule header -->

`indexOf` and `lastIndexOf` return a position in UTF-16 code units. In
`'hi 👋🏽!'`, `indexOf('!')` is 7, but the `!` is the fifth character: the
waving hand and its skin tone take four code units. That is harmless when the
position goes straight back into a code-unit operation on the same string, and
wrong once it is shown to a person, stored as a character offset, or mixed
with positions counted in characters.

The native searches also match inside a character. In a `résumé` whose last
`é` is an `e` followed by a combining accent, `includes('e')` is `true`: it
finds the `e` under the accent. graphemic's `indexOf` and `includes` match only
where both ends of the match are character boundaries.

The rule is not in the `recommended` config. Most `indexOf` calls are fine, and
reporting all of them would bury the ones that are not.

## Rule details

The rule reports `.indexOf()` and `.lastIndexOf()` on a string when the
position it returns is used as a number. It leaves alone:

- a check for whether there is a match: the search compared with `-1`
  (`=== -1`, `!== -1`, `> -1`, `<= -1`), with `0` for sign (`>= 0`, `< 0`), in
  either order, or behind `~`. These are reported with the
  [`checkIncludes`](#checkincludes) option;
- a comparison with `0` (`=== 0`, `!== 0`): the start of the string is `0` in
  every unit;
- a position that goes straight back into the same string where the code has
  found a boundary: a bound of `slice`, `substring` or `substr`, or where
  another `indexOf`, `lastIndexOf` or `includes` starts, alone or plus or minus
  the length of what was searched for, as in `s.slice(s.indexOf(', ') + 2)`.
  These are the positions `graphemic/no-unsafe-slice` leaves alone; see its
  [rule details](no-unsafe-slice.md#rule-details). The string must be a
  variable, `this`, or a chain of `.name` properties on those, written the
  same way both times.

A position kept in a variable first is reported, even if it is only used in
one of those ways later: `const i = s.indexOf(','); s.slice(0, i)`. So is a
search used for its truthiness, as in `if (s.indexOf(x))`, which is also a bug
of its own: it is falsy when the match is at the start.

`.includes()` is reported only with `checkIncludes`. A call with no arguments
is never reported.

### Incorrect

```ts
function caret(line: string, token: string) {
  return ' '.repeat(line.indexOf(token)) + '^';
}

const column = text.lastIndexOf('\n');
```

### Correct

```ts
import { graphemes } from '@sjpnz/graphemic';

function caret(line: string, token: string) {
  return ' '.repeat(graphemes.indexOf(line, token)) + '^';
}

function key(line: string) {
  return line.slice(0, line.indexOf('='));
}

function hasComma(s: string) {
  return s.indexOf(',') !== -1;
}
```

## Suggestions

Each suggestion replaces the call, or with `checkIncludes` the whole check,
and adds the import it needs.

| Source                | Replacement                      |
| --------------------- | -------------------------------- |
| `s.indexOf(x, from)`  | `graphemes.indexOf(s, x, from)`  |
| `s.includes(x, from)` | `graphemes.includes(s, x, from)` |
| `s.indexOf(x) !== -1` | `graphemes.includes(s, x)`       |
| `s.indexOf(x) === -1` | `!graphemes.includes(s, x)`      |
| `~s.indexOf(x)`       | `graphemes.includes(s, x)`       |

`graphemes.indexOf` returns a character index, so any code that uses the
result must count in characters too: `s.slice(0, i)` has to become
`graphemes.slice(s, 0, i)`. The starting position `from`, when given, is a
character index as well.

graphemic has no `lastIndexOf`, so `.lastIndexOf()` is reported without a
suggestion: search with `graphemes.indexOf`, or look through
`graphemes.toArray(s)` from the end. A check for a match with `lastIndexOf`
suggests `graphemes.includes`, except with a starting position, which for
`lastIndexOf` is where the search ends.

graphemic has no code-unit search, so there is no suggestion that keeps
today's behaviour.

These are reported without suggestions: a call with more than two arguments,
with a spread argument, or searching for a regular expression, which
graphemic refuses where the native search turns it into its source text; and
an optional chain such as `s?.indexOf(x)`, because rewriting it needs a
conditional.

## What counts as a string

`indexOf`, `lastIndexOf` and `includes` are shared with arrays and typed
arrays, so the rule reports them only when the syntax shows the receiver is a
string; see [What counts as a string](../../CONTRIBUTING.md#what-counts-as-a-string).
In JavaScript:

```js
const label = 'Name: Ada';
render(label.indexOf(':')); // reported

function f(s) {
  return s.indexOf(':'); // not reported: `s` could be an array
}
```

In TypeScript, a `string` annotation is enough:

```ts
function f(s: string) {
  return s.indexOf(':'); // reported
}
```

## Options

### `checkIncludes`

With `true`, also reports `includes`, and checks for a match with `indexOf` or
`lastIndexOf`, since either can find a match inside a character:

```jsonc
// .oxlintrc.json
{
  "rules": {
    "graphemic/no-unsafe-search": ["error", { "checkIncludes": true }],
  },
}
```

```js
const s = 'r\u00E9sume\u0301'; // the last é is an e and a combining accent
s.includes('e'); // reported
s.indexOf('e') !== -1; // reported
s.indexOf('r') === 0; // not reported
```

## When not to use it

When the strings the code searches are known to be ASCII, or every position it
finds is used with other APIs that count in UTF-16 code units.
