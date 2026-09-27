// Carries the version from package.json into the `VERSION` the package exports.
//
// `npm version` bumps package.json and nothing else, so the exported constant
// would quietly keep the previous release's number — wrong in every consumer,
// invisible in the diff, and impossible to correct once published. npm runs this
// as the `version` lifecycle script, after the bump and before the commit it
// makes, and package.json stages the rewritten file so it lands in that same
// commit and tag rather than trailing a release behind.

import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = new URL('../../src/index.ts', import.meta.url);

// Deliberately narrow: the declaration is matched whole, including its quotes,
// so this rewrites the release constant and nothing that merely mentions it.
const DECLARATION = /(export const VERSION = ')([^']*)(';)/;

const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

const before = readFileSync(SOURCE, 'utf8');

if (!DECLARATION.test(before)) {
  console.error("error: no `export const VERSION = '…'` declaration found in src/index.ts");
  process.exit(1);
}

writeFileSync(SOURCE, before.replace(DECLARATION, `$1${version}$3`));
console.log(`src/index.ts: VERSION is now ${version}`);
