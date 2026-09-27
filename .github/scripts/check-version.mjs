// Checks that the version number agrees everywhere it is written down.
//
// It appears in three places, each of which can be updated without the others:
// package.json, the `VERSION` the built package exports, and — at release time —
// the git tag the publish workflow is running for. A release where they disagree
// is not recoverable: npm versions are immutable, so a tarball published under
// the wrong number stays published under the wrong number.
//
// Reads the version out of `dist/` rather than out of the source, because what
// is about to be uploaded is the only copy that matters. Pass the tag as the one
// argument to include it in the comparison; with no argument it compares the two
// local copies, which is what CI wants on every commit.

import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const { VERSION } = await import(new URL('../../dist/index.js', import.meta.url));

const tag = process.argv[2];
const found = [
  ['package.json', manifest.version],
  ['dist/index.js VERSION', VERSION],
  // A tag is `v0.1.0`; every other copy is `0.1.0`.
  ...(tag === undefined ? [] : [['git tag', tag.replace(/^v/, '')]]),
];

for (const [source, value] of found) {
  console.log(`${source.padEnd(22)} ${value}`);
}

const versions = new Set(found.map(([, value]) => value));
if (versions.size > 1) {
  console.error(`error: version mismatch between ${found.map(([source]) => source).join(', ')}`);
  process.exit(1);
}
