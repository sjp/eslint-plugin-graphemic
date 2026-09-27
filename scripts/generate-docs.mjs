/**
 * Writes the parts of the documentation that come from the rules' metadata: the
 * rules table in the README and the header of every `docs/rules/<name>.md`.
 * With `--check`, writes nothing and fails if either is out of date.
 *
 * Reads the built plugin, so run `npm run build` first (`npm run docs` and
 * `npm run docs:check` do). Output goes through oxfmt before it is written or
 * compared, so the generated text never disagrees with `npm run format:check`.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const check = process.argv.includes('--check');
const root = join(import.meta.dirname, '..');
const rulesDir = join(root, 'docs', 'rules');

const { default: plugin } = await import('../dist/index.js');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const PREFIX = 'graphemic';
const README_BEGIN = '<!-- begin rules list -->';
const README_END = '<!-- end rules list -->';
const HEADER_END = '<!-- end auto-generated rule header -->';
const SUGGESTIONS_URL = 'https://eslint.org/docs/latest/use/core-concepts#rule-suggestions';
// The rule pages as the published package links them: the repository's
// default branch, not whatever checkout the script runs in.
const DOCS_BASE_URL = `${pkg.homepage.replace(/#readme$/, '')}/blob/main/docs/rules`;

const errors = [];
const outputs = new Map();

const names = Object.keys(plugin.rules).toSorted();
const pages = existsSync(rulesDir)
  ? readdirSync(rulesDir)
      .filter((file) => file.endsWith('.md'))
      .map((file) => file.slice(0, -'.md'.length))
  : [];

for (const name of names) {
  const { url } = plugin.rules[name].meta.docs;
  if (url !== `${DOCS_BASE_URL}/${name}.md`) {
    errors.push(`${name}: docs.url is ${url}, but its page is published at ${DOCS_BASE_URL}.`);
  }
}
const documented = names.filter((name) => pages.includes(name));
for (const name of names.filter((rule) => !pages.includes(rule))) {
  errors.push(`${name}: no docs/rules/${name}.md (see "Rule pages" in CONTRIBUTING.md).`);
}
for (const page of pages.filter((file) => !names.includes(file))) {
  errors.push(`docs/rules/${page}.md: no rule named ${page} in src/rules/index.ts.`);
}

outputs.set('README.md', replaceBetween('README.md', README_BEGIN, README_END, rulesList()));
for (const name of documented) {
  const path = `docs/rules/${name}.md`;
  const current = readFileSync(join(root, path), 'utf8');
  const end = current.indexOf(HEADER_END);
  if (end === -1) {
    errors.push(`${path}: missing ${HEADER_END}`);
    continue;
  }
  outputs.set(path, ruleHeader(name, plugin.rules[name].meta) + current.slice(end));
}

const stale = [];
for (const [path, content] of outputs) {
  const formatted = format(path, content);
  if (formatted === readFileSync(join(root, path), 'utf8')) continue;
  stale.push(path);
  if (!check) writeFileSync(join(root, path), formatted);
}

if (check && stale.length > 0) {
  errors.push(...stale.map((path) => `${path}: out of date; run \`npm run docs\`.`));
}
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
if (!check) console.log(stale.length > 0 ? `Updated ${stale.join(', ')}.` : 'Docs up to date.');

function rulesList() {
  if (names.length === 0) return 'No rules yet.';
  const rows = names.map((name) => {
    const { meta } = plugin.rules[name];
    return [
      `[${PREFIX}/${name}](docs/rules/${name}.md)`,
      escapeCell(meta.docs.description),
      meta.docs.recommended ? '✅' : '',
      meta.hasSuggestions ? '💡' : '',
    ];
  });
  return [
    '✅ Enabled in the `recommended` config; `all` enables every rule.',
    '',
    `💡 Offers [editor suggestions](${SUGGESTIONS_URL}).`,
    'No rule fixes code automatically: each replacement changes behaviour for some input,',
    'so a person chooses it.',
    '',
    table(['Name', 'Description', '✅', '💡'], rows),
  ].join('\n');
}

function ruleHeader(name, meta) {
  const lines = [`# ${PREFIX}/${name}`, '', meta.docs.description, ''];
  lines.push(
    meta.docs.recommended
      ? '✅ Enabled in the `recommended` config.'
      : 'Not enabled in the `recommended` config; `all` enables it.',
    '',
  );
  if (meta.hasSuggestions) {
    lines.push(`💡 Offers [editor suggestions](${SUGGESTIONS_URL}).`, '');
  }
  lines.push(...optionsSummary(name, meta.schema), '', '');
  return lines.join('\n');
}

/**
 * Summarises the one shape of schema a rule here uses: no options, or a single
 * options object. Anything else fails loudly rather than being misdescribed.
 */
function optionsSummary(name, schema) {
  const items = Array.isArray(schema) ? schema : [schema];
  if (items.length === 0) return ['⚙️ This rule has no options.'];
  const [options] = items;
  if (items.length > 1 || options.type !== 'object' || !options.properties) {
    errors.push(`${name}: the generator only describes a schema of one options object.`);
    return [];
  }
  const rows = Object.entries(options.properties).map(([key, property]) => [
    `\`${key}\``,
    escapeCell(typeOf(property)),
    'default' in property ? `\`${JSON.stringify(property.default)}\`` : '',
    escapeCell(property.description ?? ''),
  ]);
  return ['⚙️ Options:', '', table(['Option', 'Type', 'Default', 'Description'], rows)];
}

function typeOf(property) {
  if (property.enum)
    return property.enum.map((value) => `\`${JSON.stringify(value)}\``).join(' | ');
  if (property.type === 'array' && property.items?.type) return `${property.items.type}[]`;
  return [property.type ?? 'any'].flat().join(' | ');
}

function table(headings, rows) {
  return [headings, headings.map(() => '---'), ...rows].map(tableRow).join('\n');
}

function tableRow(cells) {
  return `| ${cells.join(' | ')} |`;
}

function escapeCell(text) {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function replaceBetween(path, begin, end, content) {
  const current = readFileSync(join(root, path), 'utf8');
  const start = current.indexOf(begin);
  const stop = current.indexOf(end);
  if (start === -1 || stop < start) {
    errors.push(`${path}: needs ${begin} followed by ${end}.`);
    return current;
  }
  return `${current.slice(0, start + begin.length)}\n\n${content}\n\n${current.slice(stop)}`;
}

function format(path, content) {
  const result = spawnSync('npx', ['oxfmt', `--stdin-filepath=${path}`], {
    cwd: root,
    input: content,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`oxfmt failed on ${path}:\n${result.stderr}`);
  return result.stdout;
}
