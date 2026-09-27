# Contributing

## Getting set up

Node `^22.13 || >=24` and npm. The plugin has no runtime dependencies; oxlint is
a peer.

```sh
npm ci
npm run check
```

`npm run check` is what CI runs, minus coverage and the package lint:
typecheck, lint, format check, tests, the rule pages check and the
integration tests. Run it before
opening a pull request and there should be no surprises.

| Command                    |                                                             |
| -------------------------- | ----------------------------------------------------------- |
| `npm test`                 | The suite, once                                             |
| `npm run test:watch`       | The suite, on every save                                    |
| `npm run test:coverage`    | With coverage; the thresholds are 100% and are enforced     |
| `npm run test:integration` | Builds, then runs the real oxlint CLI on the packed plugin  |
| `npm run typecheck`        | `tsc --noEmit` over everything                              |
| `npm run lint`             | oxlint, type-aware, over this repository's own code         |
| `npm run format`           | oxfmt, in place (`format:check` to only ask)                |
| `npm run build`            | `dist/`, ESM with declarations and source maps              |
| `npm run docs`             | Regenerates the rule page headers and the README rule table |
| `npm run docs:check`       | Fails when those are out of date                            |
| `npm run lint:package`     | publint and are-the-types-wrong over the packed tarball     |

Tests are colocated: `src/utils/strings.ts` is tested by
`src/utils/strings.test.ts`.

The integration tests in `test/integration/` check what unit tests cannot. They
pack the plugin, install the tarball into throwaway projects and run the
`oxlint` CLI there, with `.oxlintrc.json` and with `oxlint.config.ts`. They lint
the third-party code vendored in `test/integration/corpus/` with every rule,
and snapshot the number of reports per file and rule, so a change in how much
the rules report on real code shows up in review. They apply suggestions with
`--fix-suggestions` and check that the result parses and lints clean. Last,
they run each rule's first suggestion and compare it with graphemic itself.
That part needs `@sjpnz/graphemic` installed and is skipped when it is not,
since the plugin has no dependency on it.

## Supported oxlint versions

The `oxlint` peer range has a floor and no ceiling. oxlint's JS plugin API is
alpha and not covered by its semver, so CI runs the suite three ways: against
the version in the lockfile, against the floor of the peer range, and against
the latest oxlint. The last of these also runs weekly, does not block a merge,
and opens an issue labelled `oxlint-latest` when it fails: that is the warning
that the next oxlint release breaks the plugin for its users.

When an oxlint release changes the API, follow it and raise the peer floor
rather than keeping older versions working with workarounds, and say so in
`CHANGELOG.md`.

## What counts as a string

Many of the operations these rules look at share a name with an array method:
`.length`, `.slice()`, `.at()`, `.indexOf()`, `.includes()`, `x[i]`, `for…of`
and spread. oxlint gives plugins no type information, so a rule reports one of
these only when the syntax alone shows that the receiver is a string. Rules ask
`isStringLike` (in `src/utils/strings.ts`), which answers from the evidence
below and nothing else; rule pages link here rather than repeat it.

A receiver is a string when it is:

| Evidence                                    | Examples                                                                                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A string or template literal                | `'abc'`, `` `a${b}` ``, ``String.raw`…` ``                                                                                                                |
| A `+` with a string on either side          | `'#' + id`, `` name + `…` ``                                                                                                                              |
| A call that always returns a string         | `String(x)`, `x.toString()`, `arr.join(…)`, `n.toFixed(d)`, `String.fromCodePoint(…)`                                                                     |
| A string method called on a string          | `s.trim()`, `s.toLowerCase()`, `s.slice(…)`, `s.replace(…)`, `s.normalize()`, `s.padEnd(…)`                                                               |
| A TypeScript assertion to a string type     | `x as string`, `<string>x`, `x satisfies string`, `x!` of a string                                                                                        |
| A binding annotated with a string type      | `const s: string`, `function f(s: string)`, `(s?: string) => …`, `({ name }: { name: string }) => …`, and class fields `name: string` read as `this.name` |
| A `const` initialised with any of the above | `const label = 'x'; label.length`                                                                                                                         |

A string type is `string`, a string literal type (`'a'`), a template literal
type (`` `id-${number}` ``), or a union of only those, with `undefined` and
`null` allowed alongside (`string | undefined` counts: the rules fire where the
value is used as a string).

An annotation holds whatever is assigned later, since the compiler checks every
assignment, so `let s: string` and annotated parameters count. Without one, only
a `const` does: `let s = 'a'` could be reassigned to anything.

Nothing else counts, so none of these is reported:

- unannotated parameters and `let`/`var` bindings: `function f(s) { s.length }`;
- properties and call results: `user.name.length`, `getName().length`;
- names of a type alias or interface: `(s: UserName) => s.length`, even when
  `UserName` is `string` — aliases are not followed;
- arrays, which are recognised as such: array literals, `Array.from(…)`,
  `Array.of(…)`, `new Array(…)`, `s.split(…)`, and bindings annotated `string[]`,
  `readonly string[]`, `Array<string>` or a tuple.

`String`, `Array` and their static methods count only while they are the
globals, not when the file declares its own.

## Rule pages

Every rule has a page at `docs/rules/<name>.md`; `createRule` links each rule to
it. The part of the page above `<!-- end auto-generated rule header -->` is
generated from the rule's `meta` — the title, description, whether the
`recommended` config enables it, whether it offers suggestions, and its options
from `meta.schema` — and so is the rules table in the README. After adding a
rule or changing its `meta`, run:

```sh
npm run docs
```

`npm run check` runs `npm run docs:check`, which fails when the generated text is
out of date, when a rule has no page, or when a page has no rule.

Start a new page from this template. Write only the header's two lines; the
generator fills in the rest:

````md
# graphemic/<name>

<!-- end auto-generated rule header -->

One paragraph: what the native operation counts and the input it breaks on,
with a concrete example (`'👋🏽'.length === 4`).

## Rule details

### Incorrect

```js
…
```

### Correct

```js
…
```

## Suggestions

| Unit | Replacement | When to choose it |
| ---- | ----------- | ----------------- |
| …    | …           | …                 |

## What counts as a string

Which receivers the rule recognises, linking
[What counts as a string](../../CONTRIBUTING.md#what-counts-as-a-string), with
a JavaScript and a TypeScript example.

## Options

The options and what each changes, or "This rule has no options."

## When not to use it

…
````

## Releasing

Releases are cut by hand; a pushed `v*` tag is the only thing that publishes.

```sh
# 1. Move the Unreleased section of CHANGELOG.md to x.y.z, dated today, and
#    update the link definitions at the foot of the file. Commit it.
npm version x.y.z   # 2. bumps package.json, syncs VERSION, commits, tags
git push --follow-tags
```

Step 2 is the whole ceremony. `npm version` runs the `version` script, which
rewrites the `VERSION` constant in `src/index.ts` from package.json and stages
it, so the constant, the manifest and the tag are one commit and cannot drift.
`VERSION` is also what the plugin reports as `meta.version`.
`.github/scripts/check-version.mjs` checks all three agree — in CI on every
commit, and again in the publish workflow against the tag it is running for,
where a mismatch stops the release. npm versions are immutable, so that check
exists because there is no fixing it afterwards.

`.github/workflows/publish.yml` then re-runs everything CI runs against the
tagged tree and publishes with `--provenance`. No npm token exists: publishing
uses npm trusted publishing, which exchanges the workflow's OIDC identity for a
short-lived credential and signs the attestation linking the tarball to this
repository and commit. Nothing to store, nothing to leak, nothing to rotate.

Before the first release of the package, once:

1. Publish `0.1.0` from a logged-in local CLI (`npm publish --access public`).
   Trusted publishing can only be configured on a package that already exists,
   so this one tarball carries no provenance.
2. On npmjs.com → the package → Settings → Trusted publishers, add this
   repository and `publish.yml`.
3. Every release after that goes through the workflow. Confirm the provenance
   badge on the npm page of the first one that does.
4. Optionally give the `npm` environment a required reviewer in the repository
   settings, which holds a pushed tag until someone approves the publish.

`npm publish --dry-run` prints the tarball without uploading it.

While the package is `0.x` a breaking change bumps the minor. Raising the
`oxlint` peer floor is a breaking change.
