import { readdirSync, readFileSync } from 'node:fs';

import { expect, it } from 'vitest';

import { rules } from '../../src/rules/index.js';
import { Fixture, oxlintConfig } from './harness.js';

const CORPUS = new URL('corpus/', import.meta.url);

// Real code, JavaScript and TypeScript, that nobody wrote with these rules in
// mind. `lint` throws if any rule crashes on it. The counts are a snapshot so
// that a change which reports more or less on real code — a new false
// positive, or a case that stopped being caught — shows up in review.
it('lints real-world code with every rule without crashing', () => {
  const files = Object.fromEntries(
    readdirSync(CORPUS).map((name) => [name, readFileSync(new URL(name, CORPUS), 'utf8')]),
  );
  const fixture = new Fixture({ 'oxlint.config.ts': oxlintConfig('all'), ...files });

  const counts: Record<string, Record<string, number>> = {};
  for (const name of Object.keys(files).toSorted()) {
    counts[name] = Object.fromEntries(Object.keys(rules).map((rule) => [rule, 0]));
  }
  for (const { rule, file } of fixture.lint(...Object.keys(files))) {
    const perRule = counts[file];
    const name = rule.replace(/^graphemic\//, '');
    if (perRule?.[name] === undefined) throw new Error(`unexpected report ${rule} in ${file}`);
    perRule[name] += 1;
  }

  expect(counts).toMatchSnapshot();
});
