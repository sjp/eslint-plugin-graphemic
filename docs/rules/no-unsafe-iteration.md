# graphemic/no-unsafe-iteration

Disallow iterating strings with `for…of`, spread or `Array.from`, which yields code points and splits characters apart.

✅ Enabled in the `recommended` config.

💡 Offers [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

⚙️ This rule has no options.

<!-- end auto-generated rule header -->

Iterating a string with `for…of`, spread or `Array.from` steps through code
points, not characters. That is better than `split('')`, since it never splits
a surrogate pair, but a character can still be several code points:
`[...'👋🏽']` is two elements, a wave and a separate skin tone. A flag comes
apart into two regional letters in the same way, and a letter written with a
separate accent into the letter and a floating accent. Spreading a string is
the usual fix people reach for after learning `split('')` is wrong, and it
still breaks on the same input.

## Rule details

The rule reports three ways of iterating a string:

- `for (const c of s)`, but not `for await`;
- spreading it into an array literal, `[...s]` or `[x, ...s]`;
- `Array.from(s)` and `Array.from(s, fn)`, while `Array` is the built-in one.

Spreading into a call's arguments, `f(...s)`, or into an object is not
reported, and neither are `new Set(s)` or destructuring `const [first] = s`.

### Incorrect

```ts
function initials(name: string) {
  const letters = [...name];
  return letters[0];
}

function each(word: string) {
  for (const letter of word) {
    console.log(letter);
  }
}
```

### Correct

```ts
import { graphemes } from '@sjpnz/graphemic';

function initials(name: string) {
  const letters = graphemes.toArray(name);
  return letters[0];
}

function each(word: string) {
  for (const letter of graphemes.iterate(word)) {
    console.log(letter);
  }
}
```

## Suggestions

Each suggestion replaces the iterated string or the array built from it, and
adds the import it needs. Each has a code-point form too, which keeps today's
behaviour and says so.

| Source              | Replacement                        | When to choose it                                 |
| ------------------- | ---------------------------------- | ------------------------------------------------- |
| `for (c of s)`      | `for (c of graphemes.iterate(s))`  | What a person sees as characters: almost always   |
| `for (c of s)`      | `for (c of codePoints.iterate(s))` | Code that works in code points, and should say so |
| `[...s]`            | `graphemes.toArray(s)`             | Characters, as an array                           |
| `[x, ...s]`         | `[x, ...graphemes.iterate(s)]`     | The same, among other elements                    |
| `Array.from(s)`     | `graphemes.toArray(s)`             | Characters, as an array                           |
| `Array.from(s, fn)` | `graphemes.toArray(s).map(fn)`     | Characters, each mapped through `fn`              |

`map` passes the array to its callback as a third argument, which
`Array.from` does not, so `.map(fn)` is suggested only when `fn` is written
inline and could not see it: an arrow or function expression with at most two
parameters, no rest parameter, and no use of `arguments`, and no `thisArg`
after it. Anything else keeps `Array.from` and replaces only the string, which
behaves the same whatever `fn` does: `Array.from(graphemes.iterate(s), fn)`.

An optional call such as `Array?.from(s)` is reported without suggestions,
since its rewrite needs a conditional.

## What counts as a string

`for…of`, spread and `Array.from` are used far more often on arrays, so the
rule reports them only when the syntax shows the value is a string; see
[What counts as a string](../../CONTRIBUTING.md#what-counts-as-a-string). In
JavaScript that means literals and values built from them:

```js
const flag = '\u{1F1E6}\u{1F1FA}';
[...flag]; // reported

function f(s) {
  return [...s]; // not reported: `s` could be anything
}
```

In TypeScript, a `string` annotation is enough, so the rule is most useful
there:

```ts
function f(s: string) {
  return Array.from(s); // reported
}
```

## When not to use it

When the strings the code iterates are known to be ASCII, or it really does
work in code points, such as an encoder. In that case, prefer the
`codePoints` suggestion to turning the rule off: it keeps the behaviour and
tells the reader it was meant.
