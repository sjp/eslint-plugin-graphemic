# graphemic/prefer-truncate

Prefer `truncate` to shortening a string by hand with `length` and `slice`, which can cut a character in half.

✅ Enabled in the `recommended` config.

💡 Offers [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).

⚙️ This rule has no options.

<!-- end auto-generated rule header -->

Shortening a string to a limit is written by hand from `length` and `slice`:
`s.length > 20 ? s.slice(0, 20) + '…' : s`. Both count UTF-16 code units, so
the cut can land inside a character. `'hi 👋🏽'` cut to 4 keeps the first
half of the wave's surrogate pair, and the preview ends in `�`. A flag cut in
half becomes a single regional letter, and an emoji can lose its skin tone.
These are the strings people see: previews, titles, notifications.
graphemic's `truncate` does the whole idiom in one call, never cuts a
character, and adds the ellipsis only when something was cut.

## Rule details

The rule reports a conditional that compares a string's length with a limit
and then either cuts the string from its start or leaves it alone:

```js
s.length > n ? s.slice(0, n) + '…' : s;
s.length > n ? `${s.slice(0, n)}…` : s;
s.length <= n ? s : s.substring(0, n - 1) + '...';
s.length > n ? s.substring(0, n) : s;
```

It also reports the same test as an `if` with no `else`, whose only statement
assigns the shortened string back:

```js
if (s.length > n) s = s.slice(0, n) + '…';
```

More precisely:

- The comparison is `>`, `>=`, `<` or `<=`, with `s.length` on either side.
  The branch that cuts is the one taken when the string is too long.
- The cut is `slice(0, k)`, `substring(0, k)` or `substr(0, k)`.
- The ellipsis, if there is one, is a string literal or a template with no
  expressions. It comes after the cut, as `+ '…'` or `` `${…}…` ``.
- `s` is written the same way throughout. It is a variable, `this`, or a chain
  of property accesses on one, such as `this.title` or `post['summary']`. A
  call like `f().length` is not matched, since it might return something
  different each time. Neither is an optional chain like `a?.b.length`.
- `k` has to follow from the limit `n` in the comparison. With an ellipsis,
  `k` can be `n` or `n` minus a number that leaves room for the ellipsis
  (`n - 1`, `n - 3`). If `n` and `k` are both numbers, `k` can be any number
  up to `n`. Without an ellipsis, `k` has to be exactly the longest length the
  comparison leaves alone: `n` for `length > n`, `n - 1` for `length >= n`.
- A limit that is a negative or fractional number is left alone.
  `truncate` would throw on it.

### Incorrect

```ts
const preview = body.length > 140 ? body.slice(0, 139) + '…' : body;

function title(post: Post) {
  return post.title.length <= 60 ? post.title : `${post.title.substring(0, 57)}...`;
}

if (name.length > 20) name = name.slice(0, 20);
```

### Correct

```ts
import { graphemes } from '@sjpnz/graphemic';

const preview = graphemes.truncate(body, 140, { ellipsis: '…' });

function title(post: Post) {
  return graphemes.truncate(post.title, 60, { ellipsis: '...' });
}

name = graphemes.truncate(name, 20);

// Not a truncation: the cut does not follow from the limit.
const initials = name.length > 20 ? name.slice(0, 2) : name;
```

## Suggestions

Each suggestion replaces the whole conditional, or the whole `if` with
`s = …truncate(…);`, and adds the import it needs. `{ ellipsis }` is passed
only when the original code had one.

| Unit         | Replacement                                    | When to choose it                                                      |
| ------------ | ---------------------------------------------- | ---------------------------------------------------------------------- |
| `graphemes`  | `graphemes.truncate(s, max, { ellipsis: E })`  | At most `max` characters a person sees                                 |
| `codePoints` | `codePoints.truncate(s, max, { ellipsis: E })` | A limit defined in code points, e.g. some social networks              |
| `utf8`       | `utf8.truncate(s, max, { ellipsis: E })`       | A byte limit, e.g. a database column                                   |
| `columns`    | `columns.truncate(s, max, { ellipsis: E })`    | A terminal width                                                       |
| `codeUnits`  | `codeUnits.truncate(s, max, { ellipsis: E })`  | Keep counting UTF-16 code units, and say so, never cutting a character |

`max` is the longest length the comparison leaves alone: `n` for
`length > n` and `length <= n`, and `n - 1` for `length >= n` and
`length < n`. Numbers are worked out in advance, so `length >= 10` gives
`max` 9.

The result differs from the hand-written code in these cases, and each
suggestion's message says what it gives: _at most `max` characters, including
the ellipsis_.

- **The ellipsis counts against `max`.** `s.slice(0, n) + '…'` can be up to
  `n + 1` long. `truncate` keeps the result within `n`, so one character less
  of the text is kept. Code that already leaves room, like
  `s.slice(0, n - 1) + '…'`, gets the same length as before. Code that leaves
  more room than needed, like `s.slice(0, n - 3) + '…'`, gets up to two more
  characters of text.
- **A character that does not fit is dropped whole.** The result can be
  shorter than the hand-written cut when the cut would have landed inside a
  character.
- **Length is counted in the chosen unit.** With `graphemes`, `'👋🏽'` is one
  character long, not four, so a string that used to be cut may now fit.
- **An ellipsis longer than `max` is left off.** `truncate` returns the bare
  cut instead of going over the limit.

A conditional or `if` with a comment that the rewrite would delete is
reported without suggestions.

## What counts as a string

With an ellipsis, the rule does not check that `s` is a string. A cut from the
start, joined to a string, under a length check, is evidence enough, even in
plain JavaScript:

```js
function preview(text) {
  return text.length > 80 ? text.slice(0, 79) + '…' : text; // reported
}
```

Without an ellipsis, `substring` and `substr` are reported on anything, since
only strings have them. `slice` is reported only when `s` is known to be a
string, because the same code is a common way to take the first few items of
an array. See
[What counts as a string](../../CONTRIBUTING.md#what-counts-as-a-string):

```ts
function first(items: string[]) {
  return items.length > 5 ? items.slice(0, 5) : items; // not reported
}

function clip(text: string) {
  return text.length > 5 ? text.slice(0, 5) : text; // reported
}
```

Other rules report parts of the same code: `no-unsafe-length` the
`s.length`, and `no-unsafe-slice` the cut. Applying this rule's suggestion
clears all of them.

## When not to use it

When the strings the code shortens are known to be ASCII. Even then,
`truncate` says what the code means in one call, and adds the ellipsis only
when something was cut.
