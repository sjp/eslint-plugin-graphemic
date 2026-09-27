# eslint-plugin-graphemic

Oxlint rules that flag string operations which can cut through a user-visible
character, and suggest the [`@sjpnz/graphemic`](https://github.com/sjp/graphemic)
replacement.

## Rules

<!-- begin rules list -->

✅ Enabled in the `recommended` config; `all` enables every rule.

💡 Offers [editor suggestions](https://eslint.org/docs/latest/use/core-concepts#rule-suggestions).
No rule fixes code automatically: each replacement changes behaviour for some input,
so a person chooses it.

| Name                                                               | Description                                                                                                                  | ✅  | 💡  |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | --- | --- |
| [graphemic/no-unsafe-index](docs/rules/no-unsafe-index.md)         | Disallow `s[i]`, `at` and `charAt` on strings, which read one UTF-16 code unit.                                              | ✅  | 💡  |
| [graphemic/no-unsafe-iteration](docs/rules/no-unsafe-iteration.md) | Disallow iterating strings with `for…of`, spread or `Array.from`, which yields code points and splits characters apart.      | ✅  | 💡  |
| [graphemic/no-unsafe-length](docs/rules/no-unsafe-length.md)       | Disallow `.length` on strings, which counts UTF-16 code units.                                                               | ✅  | 💡  |
| [graphemic/no-unsafe-pad](docs/rules/no-unsafe-pad.md)             | Disallow `padStart` and `padEnd`, which measure and cut in UTF-16 code units.                                                | ✅  | 💡  |
| [graphemic/no-unsafe-reverse](docs/rules/no-unsafe-reverse.md)     | Disallow reversing a string by splitting, reversing and joining it, which scrambles characters made of several code points.  | ✅  | 💡  |
| [graphemic/no-unsafe-search](docs/rules/no-unsafe-search.md)       | Disallow `indexOf` and `lastIndexOf` on strings where the code-unit position they return is used, and optionally `includes`. |     | 💡  |
| [graphemic/no-unsafe-slice](docs/rules/no-unsafe-slice.md)         | Disallow `slice`, `substring` and `substr` on strings, which cut at UTF-16 code-unit offsets.                                | ✅  | 💡  |
| [graphemic/no-unsafe-split](docs/rules/no-unsafe-split.md)         | Disallow `split` into UTF-16 code units, and optionally on any separator, which can cut characters apart.                    | ✅  | 💡  |
| [graphemic/prefer-truncate](docs/rules/prefer-truncate.md)         | Prefer `truncate` to shortening a string by hand with `length` and `slice`, which can cut a character in half.               | ✅  | 💡  |

<!-- end rules list -->

## Settings

Settings shared by every rule go under `settings.graphemic` in `.oxlintrc.json`.
All are optional.

```jsonc
{
  "settings": {
    "graphemic": { "importStyle": "subpath" },
  },
}
```

A setting the plugin does not know, or a value it does not accept, stops the
lint with an error naming it, rather than being silently ignored.

### `importStyle`

How a suggestion imports graphemic when the file does not already.

| Value                   | A suggestion adds                                      | and calls             |
| ----------------------- | ------------------------------------------------------ | --------------------- |
| `"namespace"` (default) | `import { graphemes } from '@sjpnz/graphemic';`        | `graphemes.length(s)` |
| `"subpath"`             | `import { length } from '@sjpnz/graphemic/graphemes';` | `length(s)`           |

`"subpath"` is the style graphemic recommends for tree-shaking: it drops unused
functions under every bundler, where esbuild keeps a whole namespace that it
reaches through the root entry point. Function names such as `length` and
`slice` are easily taken, so where the name is already in use the suggestion
imports the subpath as a namespace instead:
`import * as graphemes from '@sjpnz/graphemic/graphemes'`.

Whichever style is set, a suggestion:

- **reuses an import the file already has**, in any style
  (`import { graphemes as g }` gives `g.length(s)`,
  `import { length } from '@sjpnz/graphemic/graphemes'` gives `length(s)`);
- **adds to an existing import** from the right module rather than adding a
  second one (`import { utf8, graphemes } from '@sjpnz/graphemic'`);
- imports `columns` from `@sjpnz/graphemic/columns`, the only place graphemic
  exports it: `import * as columns from '@sjpnz/graphemic/columns'`.

Each suggestion carries its own import, so any one of them can be applied alone.

A rule still reports, but offers no suggestion, where a rewrite would not be
safe:

- the name the import would bind already means something else where it is
  needed (`function f(graphemes) { … }`, or `const graphemes = …` in the file);
- the file is CommonJS (`.cjs`, `.cts`, or a script that uses `require`,
  `module` or `exports`), since graphemic is ESM-only;
- the expression is part of an optional chain (`s?.length`);
- the rewrite would delete a comment.
