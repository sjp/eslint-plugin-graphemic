import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { rules } from '../../src/rules/index.js';
import { Fixture, oxlintConfig, oxlintrc } from './harness.js';

// Each line is reported by an idiom rule and, inside it, by the primitive rules
// for the operations the idiom is made of.
const SOURCE = `const s = 'hi \u{1F44B}\u{1F3FD}';
export const reversed = s.split('').reverse().join('');
export const truncated = s.length > 5 ? s.slice(0, 5) + '…' : s;
`;

/** The lines any rule still reports in `file`, with every rule on. */
function reportedLines(fixture: Fixture, file: string): number[] {
  fixture.write('.oxlintrc.json', oxlintrc(Object.keys(rules)));
  return fixture.lint(file).map(({ line }) => line);
}

/** Throws unless Node parses `file` as a module. */
function assertParses(fixture: Fixture, file: string): void {
  const result = spawnSync(process.execPath, ['--check', join(fixture.dir, file)], {
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr);
}

describe('suggestions compose', () => {
  it('overlapping reports settle into code no rule reports', () => {
    const fixture = new Fixture({ 'oxlint.config.ts': oxlintConfig('all'), 'a.mjs': SOURCE });
    expect(fixture.lint('a.mjs').length).toBeGreaterThan(2);

    // oxlint applies one of each set of overlapping suggestions per run, and
    // which one it picks is its choice, so only the end state is asserted.
    expect(fixture.fixSuggestions('a.mjs')).toBeGreaterThan(0);

    assertParses(fixture, 'a.mjs');
    expect(fixture.lint('a.mjs')).toEqual([]);
    // Every fix that needed graphemic shared one import rather than adding its own.
    expect(fixture.read('a.mjs').match(/from '@sjpnz\/graphemic'/g)).toHaveLength(1);
  });

  it('no-unsafe-reverse alone replaces the whole idiom', () => {
    const fixture = new Fixture({
      '.oxlintrc.json': oxlintrc(['no-unsafe-reverse']),
      'a.mjs': SOURCE,
    });

    fixture.fixSuggestions('a.mjs');

    expect(fixture.read('a.mjs')).toBe(`import { graphemes } from '@sjpnz/graphemic';
const s = 'hi \u{1F44B}\u{1F3FD}';
export const reversed = graphemes.reverse(s);
export const truncated = s.length > 5 ? s.slice(0, 5) + '…' : s;
`);
    assertParses(fixture, 'a.mjs');
    expect(fixture.lint('a.mjs')).toEqual([]);
    expect(reportedLines(fixture, 'a.mjs')).not.toContain(3);
  });

  it('prefer-truncate alone replaces the whole idiom', () => {
    const fixture = new Fixture({
      '.oxlintrc.json': oxlintrc(['prefer-truncate']),
      'a.mjs': SOURCE,
    });

    fixture.fixSuggestions('a.mjs');

    expect(fixture.read('a.mjs')).toBe(`import { graphemes } from '@sjpnz/graphemic';
const s = 'hi \u{1F44B}\u{1F3FD}';
export const reversed = s.split('').reverse().join('');
export const truncated = graphemes.truncate(s, 5, { ellipsis: '…' });
`);
    assertParses(fixture, 'a.mjs');
  });
});
