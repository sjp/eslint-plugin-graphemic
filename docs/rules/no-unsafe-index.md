# graphemic/no-unsafe-index

Disallow `s[i]`, `at` and `charAt` on strings, which read one UTF-16 code unit.

✅ Enabled in the `recommended` config.

💡 Offers [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

⚙️ This rule has no options.

<!-- end auto-generated rule header -->

`s[i]`, `s.at(i)` and `s.charAt(i)` return one UTF-16 code unit, not the
character a person sees. Outside the Basic Multilingual Plane that is half a
character: `'👋🏽'[0]` is a lone surrogate, which renders as `�`. Inside it, a
character can still be several code units: a decomposed `'e\u0301'.at(0)` is
`'e'` without its accent. `s.at(-1)` for "the last character" is the classic
case: on `'👋🏽'` it returns half of the skin tone.

## Rule details

The rule reports:

- `s[i]` where `i` is an index: a number, an identifier or any expression that
  might be one. Property names are not indexes, so `s['length']`,
  ``s[`key`]``, and well-known symbols such as `s[Symbol.iterator]` are left
  alone;
- `s.at(i)`;
- `s.charAt(i)`, on any receiver, since only strings have `charAt`.

Writes such as `s[0] = 'x'` and `delete s[0]` are not reported: they do nothing
to a string, so the receiver is not one.

`charCodeAt` and `codePointAt` are not reported. They say in their names which
unit they read.

### Incorrect

```ts
function initial(name: string) {
  return name[0];
}

const last = `${greeting}`.at(-1);
const first = label.charAt(0);
```

### Correct

```ts
import { graphemes } from '@sjpnz/graphemic';

function initial(name: string) {
  return graphemes.at(name, 0);
}

const last = graphemes.at(`${greeting}`, -1);
const first = graphemes.at(label, 0) ?? '';
```

## Suggestions

Each suggestion replaces the read with a call on the string, and adds the
import it needs.

| Unit        | Replacement           | When to choose it                         |
| ----------- | --------------------- | ----------------------------------------- |
| Graphemes   | `graphemes.at(s, i)`  | Reading what a person sees as a character |
| Code points | `codePoints.at(s, i)` | An index counted in code points           |

`charAt` returns `''` out of range where `at` returns `undefined`, so its
suggestions add `?? ''`, parenthesised where the expression around it needs
it: `'>' + s.charAt(0)` becomes `'>' + (graphemes.at(s, 0) ?? '')`. A missing
index, as in `s.charAt()` or `s.at()`, becomes `0`.

These are reported without suggestions, because the rewrite would change more
than the unit:

- `s[-1]`, with a message of its own: `[]` does not count back from the end,
  so it is always `undefined`, while `graphemes.at(s, -1)` is the last
  character. The code is already broken in a different way.
- `s.charAt(-1)`, which is `''` for the same reason.
- `s[1.5]` and `s[0n]`, which look up a property that `at` would not.
- a spread or extra argument, as in `s.at(...args)`;
- an optional chain, such as `s?.[0]` or `s?.at(0)`: rewriting it needs a
  conditional, not a call.

## What counts as a string

`[]` and `at` are shared with arrays, so the rule reports them only when the
syntax shows the receiver is a string; see
[What counts as a string](../../CONTRIBUTING.md#what-counts-as-a-string). In
JavaScript that means literals and values built from them:

```js
const label = 'Name';
label[0]; // reported

function f(s) {
  return s[0]; // not reported: `s` could be anything
}
```

In TypeScript, a `string` annotation is enough:

```ts
function f(s: string) {
  return s.at(-1); // reported
}
```

## Known false positives

ASCII prefix checks such as `s[0] === '#'` are reported. They are still subtly
wrong: `'#\uFE0F\u20E3'` is the keycap emoji, and it starts with `#`. When
you really mean the first code unit, `s.startsWith('#')` says so and is not
reported.

## When not to use it

When the strings the code handles are known to be ASCII, such as hex digits or
identifiers the code generated itself.
