import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

// RuleTester registers its cases through whatever `describe`/`it` it is handed.
// Vitest's are not globals here, so they are wired in once for every suite.
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

/**
 * oxlint's rule tester, for JavaScript modules. oxlint gives JS plugins no type
 * information, so this is the only setup the rules ever run under: whatever a
 * rule knows about a value, it knows from the syntax.
 *
 * @example
 * ruleTester.run('no-unsafe-length', rule, { valid: [...], invalid: [...] });
 */
export const ruleTester = new RuleTester({
  languageOptions: { sourceType: 'module' },
});

/**
 * The same, parsing TypeScript. There are still no types, but annotations are
 * in the syntax tree — `(s: string) => s.length` is evidence a rule can use.
 */
export const tsRuleTester = new RuleTester({
  languageOptions: { sourceType: 'module', parserOptions: { lang: 'ts' } },
});
