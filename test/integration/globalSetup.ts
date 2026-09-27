import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    /** The packed plugin, unpacked: what `npm install` would put in `node_modules`. */
    packageDir: string;
  }
}

/**
 * Packs the built plugin once for the whole run, so every fixture installs the
 * tarball users get, `files` list and `exports` map included, not the working
 * tree. `npm run build` has to have run first.
 */
export default function setup(project: TestProject): () => void {
  const root = mkdtempSync(join(tmpdir(), 'graphemic-pack-'));
  const [packed] = JSON.parse(
    execFileSync('npm', ['pack', '--json', '--pack-destination', root], { encoding: 'utf8' }),
  ) as [{ filename: string; files: { path: string }[] }];
  if (!packed.files.some(({ path }) => path === 'dist/index.js')) {
    throw new Error('The package has no dist/index.js: run `npm run build` first.');
  }
  execFileSync('tar', ['-xzf', join(root, packed.filename), '-C', root]);
  project.provide('packageDir', join(root, 'package'));
  return () => rmSync(root, { recursive: true, force: true });
}
