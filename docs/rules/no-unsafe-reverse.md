# graphemic/no-unsafe-reverse

Disallow reversing a string by splitting, reversing and joining it, which scrambles characters made of several code points.

✅ Enabled in the `recommended` config.

💡 Offers [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

⚙️ This rule has no options.

<!-- end auto-generated rule header -->

`s.split('').reverse().join('')` is the usual way to reverse a string, and it
reverses UTF-16 code units: every emoji comes back as two lone surrogates in
the wrong order, each shown as `�`. The fix people reach for, `[...s]` or
`Array.from(s)`, reverses code points instead. That keeps surrogate pairs
whole but still scrambles any character made of several code points:
`'👋🏽'` comes back with its skin tone before the wave, and `'ab🇦🇺'` becomes
`'🇺🇦ba'`, a different country's flag.

## Rule details

The rule reports a string broken into an array, reversed, and joined back with
an empty string. The string is broken apart with any of:

- `s.split('')`, with `''`, `""` or an empty template and no limit;
- spreading it as the only element of an array, `[...s]`;
- `Array.from(s)`, with one argument, while `Array` is the built-in one.

The array is reversed with `.reverse()` or `.toReversed()`, and joined with
`.join('')`, `.join("")` or `.join(``)`. The whole chain is reported once.

### Incorrect

```ts
function mirror(word: string) {
  return word.split('').reverse().join('');
}

const backwards = [...name].toReversed().join('');
```

### Correct

```ts
import { graphemes } from '@sjpnz/graphemic';

function mirror(word: string) {
  return graphemes.reverse(word);
}

const backwards = graphemes.reverse(name);

const path = segments.reverse().join('/');
```

## Suggestions

The one suggestion replaces the whole chain with `graphemes.reverse(s)`, which
keeps each user-visible character intact, and adds the import it needs.
graphemic reverses only in characters: reversing code points or code units
is what produces the broken output in the first place, so there is nothing
else to suggest.

A chain with an optional link, such as `s?.split('').reverse().join('')`, is
reported without a suggestion, since its rewrite needs a conditional. So is
one with a comment that the rewrite would delete.

## What counts as a string

The rule does not need to know that `s` is a string: breaking a value apart,
reversing it and joining it with nothing is evidence enough, even in plain
JavaScript:

```js
function mirror(word) {
  return [...word].reverse().join(''); // reported
}
```

The exception is a value the syntax shows is already an array, which is often
copied before it is reversed so the original is left alone; see
[What counts as a string](../../CONTRIBUTING.md#what-counts-as-a-string):

```ts
function f(parts: string[]) {
  return [...parts].reverse().join(''); // not reported
}
```

Other rules report parts of the same chain: `no-unsafe-split` the
`split('')`, and `no-unsafe-iteration` the spread or `Array.from`. Applying
this rule's suggestion clears all of them.

## When not to use it

When the strings the code reverses are known to be ASCII. Even then,
`graphemes.reverse(s)` says what the code means in one call.
