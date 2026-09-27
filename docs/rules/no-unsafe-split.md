# graphemic/no-unsafe-split

Disallow `split` into UTF-16 code units, and optionally on any separator, which can cut characters apart.

✅ Enabled in the `recommended` config.

💡 Offers [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

⚙️ Options:

| Option       | Type                 | Default   | Description                                                                                                                               |
| ------------ | -------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `separators` | `"empty"` \| `"all"` | `"empty"` | `'empty'` reports only splits into single code units; `'all'` also reports every other separator, since any can match inside a character. |

<!-- end auto-generated rule header -->

`s.split('')` splits a string into UTF-16 code units, not characters.
`'👋🏽'.split('')` is four lone surrogates, each shown as `�`: the wave and its
skin tone are each two code units. It is the most common way to get "the
characters" of a string, and it breaks on every emoji, and on any letter
written with a separate accent.

## Rule details

The rule reports `split` on an empty separator:

- `''`, `""` or an empty template, ` `` `;
- the empty pattern `/(?:)/`, with any flags;
- `new RegExp()`, `new RegExp('')` or `new RegExp('', flags)`, with or without
  `new`, while `RegExp` is the built-in one.

With the `u` or `v` flag, an empty pattern splits into code points instead, so
it keeps surrogate pairs whole. It still parts an emoji from its skin tone, a
flag into its two regional letters, and a letter from a separate accent, so
the rule reports it too, with a message that says so.

Other patterns that happen to match the empty string, such as `/(?=)/`, are
not recognised. `s.split()` with no separator returns `[s]` and is never
reported.

Splitting on a non-empty separator can also cut a character, when the
separator can occur inside one: `'é'.split('e')` separates the accent
from its letter. That is rarer, and reported only with the
[`separators`](#separators) option.

### Incorrect

```ts
function letters(word: string) {
  return word.split('');
}

const firstTwo = name.split('', 2);
```

### Correct

```ts
import { graphemes } from '@sjpnz/graphemic';

function letters(word: string) {
  return graphemes.toArray(word);
}

const firstTwo = graphemes.split(name, '', 2);

const fields = line.split(',');
```

## Suggestions

Each suggestion replaces the call and adds the import it needs.

| Source            | Replacement                  | When to choose it                                            |
| ----------------- | ---------------------------- | ------------------------------------------------------------ |
| `s.split('')`     | `graphemes.toArray(s)`       | What a person sees as characters: almost always              |
| `s.split('')`     | `codePoints.toArray(s)`      | Code that works in code points, e.g. a limit defined in them |
| `s.split('', n)`  | `graphemes.split(s, '', n)`  | The first `n` characters                                     |
| `s.split(sep)`    | `graphemes.split(s, sep)`    | With `separators: 'all'`: split only between characters      |
| `s.split(sep, n)` | `graphemes.split(s, sep, n)` | The same, with a limit                                       |

An empty pattern becomes `''` in the suggestion: `s.split(/(?:)/, 2)` suggests
`graphemes.split(s, '', 2)`. graphemic has no code-point `split`, so a call
with a limit gets only the grapheme suggestion.

graphemic's `split` takes a string separator only, by design, so a regular
expression, or a separator not known to be a string, is reported without
suggestions. So are a call with more than two arguments or a spread, and an
optional chain such as `s?.split('')`, whose rewrite needs a conditional.

## What counts as a string

`split` is reported on any receiver, without checking that it is a string:
nothing but strings has a `split` method in practice, so the name alone is
evidence enough, even in plain JavaScript:

```js
function letters(word) {
  return word.split(''); // reported
}
```

With `separators: 'all'`, the separator must be known to be a string for the
report to carry a suggestion; see
[What counts as a string](../../CONTRIBUTING.md#what-counts-as-a-string). In
TypeScript, a `string` annotation is enough:

```ts
function fields(line: string, sep: string) {
  return line.split(sep); // reported, suggesting graphemes.split(line, sep)
}
```

## Options

### `separators`

With `'all'`, also reports `split` on every other separator, since any can
match inside a character:

```jsonc
// .oxlintrc.json
{
  "rules": {
    "graphemic/no-unsafe-split": ["error", { "separators": "all" }],
  },
}
```

```js
const s = 'a,b';
s.split(','); // reported
s.split(/,\s*/); // reported, without suggestions
```

## When not to use it

When the strings the code splits are known to be ASCII. Even then,
`graphemes.toArray(s)` costs little there, since it hands ASCII straight to the
native `split`, and lets the rule stay on for the rest.
