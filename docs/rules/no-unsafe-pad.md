# graphemic/no-unsafe-pad

Disallow `padStart` and `padEnd`, which measure and cut in UTF-16 code units.

✅ Enabled in the `recommended` config.

💡 Offers [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

⚙️ This rule has no options.

<!-- end auto-generated rule header -->

`padStart` and `padEnd` measure the target length in UTF-16 code units, and
cut the fill at a code unit. `'👋🏽'.padStart(3, '.')` adds nothing, because
the one emoji is already 4 code units long. `'ab'.padEnd(5, '👋🏽')` needs
three more code units and takes them from the fill, so the string ends in a
wave followed by half of the skin tone.

For a terminal table, native padding is wrong twice: what lines columns up is
width, not length. `'東'` is 1 code unit and 1 character, but it takes up 2
columns.

## Rule details

The rule reports every `padStart` and `padEnd` call that has a target length,
except graphemic's own: `graphemes.padStart(s, 8)` or `columns.padEnd(s, 8)`,
called through an import of `@sjpnz/graphemic` in the same file.

It leaves out the most common correct use, zero-padding a number. When the
receiver is a number turned into a string, and the fill is left out or is a
string literal in printable ASCII, every unit gives the same answer. A number
turned into a string is one of these:

- `String(n)`, while `String` is the built-in function;
- `n.toString(…)`, `n.toFixed(…)` or `n.toPrecision(…)`, with any arguments;
- `` `${n}` ``, a template with nothing but a single expression;
- a `const` with no type annotation whose initialiser is one of the above,
  directly or through other such `const`s.

There is no type information, so the rule trusts that shape whatever `n` is.
The one exception is an `n` known to be a string, such as a parameter
annotated `string`. Then `String(n)` is the same text, and it is reported.

`'abc'.padEnd(5)` is reported even though it is all ASCII. So is a call with
no arguments, `s.padStart()`, which pads nothing.

### Incorrect

```ts
const label = name.padEnd(20);

const row = cells.map((cell) => cell.padStart(8)).join(' ');

const stars = String(rating).padStart(5, '★');
```

### Correct

```ts
import { graphemes } from '@sjpnz/graphemic';
import * as columns from '@sjpnz/graphemic/columns';

const label = graphemes.padEnd(name, 20);

const row = cells.map((cell) => columns.padStart(cell, 8)).join(' ');

const time = `${String(hours).padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
```

## Suggestions

Each suggestion replaces the call and adds the import it needs.

| Source                | Replacement                      | When to choose it                    |
| --------------------- | -------------------------------- | ------------------------------------ |
| `s.padStart(n, fill)` | `graphemes.padStart(s, n, fill)` | A length in characters a person sees |
| `s.padStart(n, fill)` | `columns.padStart(s, n, fill)`   | Lining up text in a terminal         |
| `s.padEnd(n, fill)`   | `graphemes.padEnd(s, n, fill)`   | A length in characters a person sees |
| `s.padEnd(n, fill)`   | `columns.padEnd(s, n, fill)`     | Lining up text in a terminal         |

Only the arguments given are passed on. graphemic's fill defaults to `' '`,
like the native one. graphemic has no code-unit padding, so there is no
suggestion that keeps today's behaviour.

A call with more than two arguments, or with a spread argument, is reported
without suggestions: a third argument would reach the `options` parameter of
`columns.padStart`. So is an optional chain such as `s?.padStart(2)`, because
rewriting it needs a conditional.

## What counts as a string

`padStart` and `padEnd` are reported on any receiver, without checking that it
is a string. Nothing but strings has these methods in practice, so the name
alone is evidence enough, even in plain JavaScript:

```js
function label(name) {
  return name.padEnd(20); // reported
}
```

A string is only needed to tell `String(n)` apart from the same text wrapped
again; see
[What counts as a string](../../CONTRIBUTING.md#what-counts-as-a-string):

```ts
function twoDigits(n: number) {
  return String(n).padStart(2, '0'); // not reported
}

function twoWide(n: string) {
  return String(n).padStart(2, '0'); // reported: `n` is already text
}
```

## When not to use it

When the strings the code pads are known to be ASCII, and its output never
goes to a terminal table with wide characters in it. Even then,
`graphemes.padStart` costs little on ASCII, since it passes it straight to the
native method, and lets the rule stay on for the rest.
