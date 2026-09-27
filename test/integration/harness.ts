import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, inject } from 'vitest';

const require = createRequire(import.meta.url);

const OXLINT = join(dirname(require.resolve('oxlint/package.json')), 'bin', 'oxlint');

// oxlint loads `oxlint.config.ts` with Node's own type stripping, which Node
// 22 before 22.18 has only behind this flag. Users there have to pass it too.
const NODE_ARGS = process.features.typescript === false ? ['--experimental-strip-types'] : [];

/**
 * Where `@sjpnz/graphemic` is installed, or `undefined` when it is not: it is
 * not a dependency of this repository, since the plugin only writes imports of
 * it and never runs it.
 */
export const GRAPHEMIC_DIR: string | undefined = (() => {
  try {
    return dirname(require.resolve('@sjpnz/graphemic/package.json'));
  } catch {
    return undefined;
  }
})();

/** One report from the CLI's JSON output. */
export interface Diagnostic {
  /** `graphemic/no-unsafe-length`, in the form users write in their config. */
  rule: string;
  file: string;
  line: number;
  message: string;
}

interface JsonOutput {
  diagnostics: {
    code?: string;
    message: string;
    filename: string;
    labels: { span: { line: number } }[];
  }[];
}

/** A throwaway project with the packed plugin installed, as a user would have it. */
export class Fixture {
  readonly dir: string;

  constructor(files: Record<string, string>) {
    this.dir = mkdtempSync(join(tmpdir(), 'graphemic-fixture-'));
    const modules = join(this.dir, 'node_modules');
    mkdirSync(join(modules, '@sjpnz'), { recursive: true });
    symlinkSync(inject('packageDir'), join(modules, 'eslint-plugin-graphemic'), 'dir');
    if (GRAPHEMIC_DIR !== undefined) {
      symlinkSync(GRAPHEMIC_DIR, join(modules, '@sjpnz', 'graphemic'), 'dir');
    }
    for (const [name, text] of Object.entries(files)) this.write(name, text);
    fixtures.push(this);
  }

  read(name: string): string {
    return readFileSync(join(this.dir, name), 'utf8');
  }

  write(name: string, text: string): void {
    mkdirSync(dirname(join(this.dir, name)), { recursive: true });
    writeFileSync(join(this.dir, name), text);
  }

  /**
   * Runs `oxlint --format json` and returns this plugin's reports, sorted by
   * file, line and rule. Anything else that is not a plain rule report — a rule
   * that threw, a config that failed to load, a file that did not parse —
   * throws, so a test cannot pass by linting nothing.
   */
  lint(...args: string[]): Diagnostic[] {
    const stdout = this.oxlint('--format', 'json', ...args);
    let output: JsonOutput;
    try {
      output = JSON.parse(stdout) as JsonOutput;
    } catch {
      throw new Error(`oxlint did not print JSON:\n${stdout}`);
    }
    const reports: Diagnostic[] = [];
    for (const { code, message, filename, labels } of output.diagnostics) {
      if (code === undefined) throw new Error(`oxlint failed on ${filename}:\n${message}`);
      const match = /^graphemic\((.+)\)$/.exec(code);
      if (match === null) continue;
      reports.push({
        rule: `graphemic/${match[1]}`,
        file: filename,
        line: labels[0]?.span.line ?? 0,
        message,
      });
    }
    return reports.toSorted(
      (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.rule.localeCompare(b.rule),
    );
  }

  /**
   * Applies the first suggestion of every report in `file`, and again on the
   * result, until nothing changes. oxlint applies one of a set of overlapping
   * suggestions per run, so settling takes a run per level of overlap.
   * Returns the number of runs that changed the file.
   */
  fixSuggestions(file: string, maxRuns = 5): number {
    for (let run = 0; run < maxRuns; run++) {
      const before = this.read(file);
      this.oxlint('--fix-suggestions', file);
      if (this.read(file) === before) return run;
    }
    throw new Error(`${file} was still changing after ${maxRuns} runs of --fix-suggestions`);
  }

  /** Runs `code` as an ES module in this fixture, and parses what it prints as JSON. */
  run(code: string): unknown {
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', code], {
      cwd: this.dir,
      encoding: 'utf8',
    });
    if (result.status !== 0) throw new Error(result.stderr);
    return JSON.parse(result.stdout);
  }

  private oxlint(...args: string[]): string {
    const result = spawnSync(process.execPath, [...NODE_ARGS, OXLINT, ...args], {
      cwd: this.dir,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    // Exit code 1 means "found problems", which is what these tests are for.
    if (result.status !== 0 && result.status !== 1) {
      throw new Error(`oxlint exited with ${result.status}:\n${result.stderr}${result.stdout}`);
    }
    return result.stdout;
  }
}

const fixtures: Fixture[] = [];

afterAll(() => {
  for (const { dir } of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/**
 * An `.oxlintrc.json` that loads the plugin by package name and turns on
 * `rules`, with oxlint's own default rules off so reports are only this
 * plugin's.
 */
export function oxlintrc(rules: string[], settings?: object): string {
  return JSON.stringify({
    categories: { correctness: 'off' },
    jsPlugins: ['eslint-plugin-graphemic'],
    rules: Object.fromEntries(rules.map((rule) => [`graphemic/${rule}`, 'error'])),
    ...(settings === undefined ? {} : { settings }),
  });
}

/** An `oxlint.config.ts` that extends one of the plugin's shipped configs. */
export function oxlintConfig(config: 'recommended' | 'all', settings?: object): string {
  return `import graphemic from 'eslint-plugin-graphemic';

export default {
  categories: { correctness: 'off' },
  extends: [graphemic.configs.${config}],${settings === undefined ? '' : `\n  settings: ${JSON.stringify(settings)},`}
};
`;
}
