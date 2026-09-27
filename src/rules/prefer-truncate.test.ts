import type { Unit } from '../utils/graphemic.js';
import { ruleTester, tsRuleTester } from '../test/ruleTester.js';
import rule from './prefer-truncate.js';

const IMPORTS: Readonly<Record<Unit, string>> = {
  graphemes: "import { graphemes } from '@sjpnz/graphemic';\n",
  codePoints: "import { codePoints } from '@sjpnz/graphemic';\n",
  utf8: "import { utf8 } from '@sjpnz/graphemic';\n",
  columns: "import * as columns from '@sjpnz/graphemic/columns';\n",
  codeUnits: "import { codeUnits } from '@sjpnz/graphemic';\n",
};

const UNITS: readonly Unit[] = ['graphemes', 'codePoints', 'utf8', 'columns', 'codeUnits'];

/**
 * The one report on `code`, whose suggestions replace `replaced` in it with
 * each unit's `truncate` on `args`, importing it, in the rule's order.
 * `units` leaves some out.
 */
function reported(code: string, replaced: string, args: string, units = UNITS) {
  return rewritten(code, replaced, (call) => `${call}(${args})`, units);
}

/** `reported` for the statement form, which assigns the call back to `target`. */
function assigned(code: string, replaced: string, target: string, args: string, units = UNITS) {
  return rewritten(code, replaced, (call) => `${target} = ${call}(${args});`, units);
}

function rewritten(
  code: string,
  replaced: string,
  replacement: (call: string) => string,
  units: readonly Unit[],
) {
  return {
    code,
    errors: [
      {
        messageId: 'truncate',
        suggestions: units.map((unit) => ({
          messageId: unit,
          output: IMPORTS[unit] + code.replace(replaced, replacement(`${unit}.truncate`)),
        })),
      },
    ],
  };
}

/** The one report on `code`, which has no suggestions. */
function unsuggested(code: string) {
  return { code, errors: [{ messageId: 'truncate', suggestions: [] }] };
}

ruleTester.run('prefer-truncate', rule, {
  valid: [
    // A different string measured, cut or kept.
    "a.length > n ? b.slice(0, n) + '…' : a;",
    "a.length > n ? a.slice(0, n) + '…' : b;",
    "a.length > n ? a.slice(0, n) + '…' : a.b;",
    // Not cut from the start.
    "s.length > n ? s.slice(1, n) + '…' : s;",
    "s.length > n ? s.slice('0', n) + '…' : s;",
    "s.length > n ? s.slice(-n) + '…' : s;",
    "s.length > n ? s.slice(0) + '…' : s;",
    "s.length > n ? s.slice(0, n, x) + '…' : s;",
    "s.length > n ? s.slice(0, ...n) + '…' : s;",
    "s.length > n ? s.slice(...args) + '…' : s;",
    // A cut that does not follow from the guard.
    "s.length > n ? s.slice(0, m) + '…' : s;",
    "s.length > n ? s.slice(0, n + 1) + '…' : s;",
    "s.length > n ? s.slice(0, n - m) + '…' : s;",
    "s.length > n ? s.slice(0, n - 1.5) + '…' : s;",
    "s.length > 10 ? s.slice(0, 11) + '…' : s;",
    // Without an ellipsis, the cut must be exactly the threshold.
    's.length > n ? s.substring(0, n - 1) : s;',
    's.length >= n ? s.substring(0, n) : s;',
    's.length > 10 ? s.substr(0, 9) : s;',
    "s.length > n ? s.slice(0, n - 1) + '' : s;",
    // Without an ellipsis, `slice` needs a string: this could be an array.
    's.length > n ? s.slice(0, n) : s;',
    'items.length > 5 ? items.slice(0, 5) : items;',
    // Branches the wrong way round for the comparison.
    "s.length > n ? s : s.slice(0, n) + '…';",
    "s.length <= n ? s.slice(0, n) + '…' : s;",
    // Not a length comparison.
    "s.length === n ? s.slice(0, n) + '…' : s;",
    "n === s.length ? s.slice(0, n) + '…' : s;",
    "s.length + 1 > n ? s.slice(0, n) + '…' : s;",
    "s.size > n ? s.slice(0, n) + '…' : s;",
    "s['length'] > n ? s.slice(0, n) + '…' : s;",
    "s?.length > n ? s.slice(0, n) + '…' : s;",
    "cond ? s.slice(0, n) + '…' : s;",
    'class A { #x; f(o) { return #x in o ? o.substring(0, 1) : o; } }',
    // Strings that are not plain references.
    "f().length > n ? f().slice(0, n) + '…' : f();",
    "a[i].length > n ? a[i].slice(0, n) + '…' : a[i];",
    "a?.b.length > n ? a?.b.slice(0, n) + '…' : a?.b;",
    "(a + b).length > n ? (a + b).slice(0, n) + '…' : a + b;",
    "'abc'.length > 2 ? 'abc'.slice(0, 2) + '…' : 'abc';",
    // Thresholds graphemic would throw on.
    "s.length >= 0 ? s.slice(0, 0) + '…' : s;",
    "s.length > -1 ? s.slice(0, -1) + '…' : s;",
    "s.length > 2.5 ? s.slice(0, 2.5) + '…' : s;",
    "s.length > '5' ? s.slice(0, '5') + '…' : s;",
    // Anything but a literal ellipsis, after the cut.
    's.length > n ? s.slice(0, n) + e : s;',
    's.length > n ? s.slice(0, n) + 1 : s;',
    's.length > n ? s.slice(0, n) + `${e}` : s;',
    "s.length > n ? '…' + s.slice(0, n) : s;",
    "s.length > n ? s.slice(0, n) - '…' : s;",
    's.length > n ? `>${s.slice(0, n)}…` : s;',
    's.length > n ? `${s.slice(0, n)}${e}` : s;',
    // Other cuts.
    "s.length > n ? s.trim(0, n) + '…' : s;",
    "s.length > n ? s['slice'](0, n) + '…' : s;",
    "s.length > n ? s.slice?.(0, n) + '…' : s;",
    "s.length > n ? s?.slice(0, n) + '…' : s;",
    "s.length > n ? slice(0, n) + '…' : s;",
    // The statement form: an `else`, more than one statement, or not `s = …`.
    "if (s.length > n) s = s.slice(0, n) + '…'; else s = '';",
    "if (s.length > n) { s = s.slice(0, n) + '…'; log(s); }",
    'if (s.length > n) {}',
    "if (s.length > n) s += s.slice(0, n) + '…';",
    "if (s.length > n) t = s.slice(0, n) + '…';",
    "if (s.length > n) return s.slice(0, n) + '…';",
    "if (s.length > n) f(s.slice(0, n) + '…');",
    "if (s.length <= n) s = s.slice(0, n) + '…';",
    "if (s.size > n) s = s.slice(0, n) + '…';",
    "if (s.length > n) s = s.slice(1, n) + '…';",
    'if (s.length > n) s = s.slice(0, n);',
  ].map((code) => (code.startsWith('if') ? `function f() { ${code} }` : code)),
  invalid: [
    // Each recognised form.
    reported(
      "const r = s.length > n ? s.slice(0, n) + '…' : s;",
      "s.length > n ? s.slice(0, n) + '…' : s",
      "s, n, { ellipsis: '…' }",
    ),
    reported(
      'const r = s.length > n ? `${s.slice(0, n)}…` : s;',
      's.length > n ? `${s.slice(0, n)}…` : s',
      "s, n, { ellipsis: '…' }",
    ),
    reported(
      "const r = s.length <= n ? s : s.substring(0, n - 1) + '...';",
      "s.length <= n ? s : s.substring(0, n - 1) + '...'",
      "s, n, { ellipsis: '...' }",
    ),
    assigned(
      "if (s.length > n) s = s.slice(0, n) + '…';",
      "if (s.length > n) s = s.slice(0, n) + '…';",
      's',
      "s, n, { ellipsis: '…' }",
    ),

    // Without an ellipsis, `substring` and `substr` need no evidence of a string.
    reported(
      'const r = s.length > n ? s.substring(0, n) : s;',
      's.length > n ? s.substring(0, n) : s',
      's, n',
    ),
    reported(
      'const r = s.length > n ? s.substr(0, n) : s;',
      's.length > n ? s.substr(0, n) : s',
      's, n',
    ),
    // An empty ellipsis is none; the concatenation shows `s` is a string.
    reported(
      "const r = s.length > n ? s.slice(0, n) + '' : s;",
      "s.length > n ? s.slice(0, n) + '' : s",
      's, n',
    ),
    reported(
      'const r = s.length > n ? `${s.slice(0, n)}` : s;',
      's.length > n ? `${s.slice(0, n)}` : s',
      's, n',
    ),

    // Either orientation, every comparison.
    reported(
      "const r = n < s.length ? s.slice(0, n) + '…' : s;",
      "n < s.length ? s.slice(0, n) + '…' : s",
      "s, n, { ellipsis: '…' }",
    ),
    reported(
      "const r = n >= s.length ? s : s.slice(0, n) + '…';",
      "n >= s.length ? s : s.slice(0, n) + '…'",
      "s, n, { ellipsis: '…' }",
    ),
    reported(
      "const r = s.length < 10 ? s : s.slice(0, 9) + '…';",
      "s.length < 10 ? s : s.slice(0, 9) + '…'",
      "s, 9, { ellipsis: '…' }",
    ),
    reported(
      "const r = 10 > s.length ? s : s.slice(0, 9) + '…';",
      "10 > s.length ? s : s.slice(0, 9) + '…'",
      "s, 9, { ellipsis: '…' }",
    ),
    reported(
      'const r = 10 <= s.length ? s.substr(0, 9) : s;',
      '10 <= s.length ? s.substr(0, 9) : s',
      's, 9',
    ),

    // `>=` folds its threshold down by one.
    reported(
      "const r = s.length >= 10 ? s.slice(0, 9) + '…' : s;",
      "s.length >= 10 ? s.slice(0, 9) + '…' : s",
      "s, 9, { ellipsis: '…' }",
    ),
    reported(
      "const r = s.length >= 10 ? s.slice(0, 10) + '…' : s;",
      "s.length >= 10 ? s.slice(0, 10) + '…' : s",
      "s, 9, { ellipsis: '…' }",
    ),
    reported(
      'const r = s.length >= 10 ? s.substring(0, 9) : s;',
      's.length >= 10 ? s.substring(0, 9) : s',
      's, 9',
    ),
    reported(
      'const r = s.length >= 1 ? s.substring(0, 0) : s;',
      's.length >= 1 ? s.substring(0, 0) : s',
      's, 0',
    ),
    reported(
      "const r = s.length >= n ? s.slice(0, n - 1) + '…' : s;",
      "s.length >= n ? s.slice(0, n - 1) + '…' : s",
      "s, n - 1, { ellipsis: '…' }",
    ),
    reported(
      'const r = s.length >= n ? s.substring(0, n - 1) : s;',
      's.length >= n ? s.substring(0, n - 1) : s',
      's, n - 1',
    ),
    reported(
      "const r = s.length >= a + b ? s.slice(0, a + b - 1) + '…' : s;",
      "s.length >= a + b ? s.slice(0, a + b - 1) + '…' : s",
      "s, a + b - 1, { ellipsis: '…' }",
    ),
    reported(
      "const r = s.length >= o.max ? s.slice(0, o.max) + '…' : s;",
      "s.length >= o.max ? s.slice(0, o.max) + '…' : s",
      "s, o.max - 1, { ellipsis: '…' }",
    ),
    reported(
      "const r = s.length >= max() ? s.slice(0, max()) + '…' : s;",
      "s.length >= max() ? s.slice(0, max()) + '…' : s",
      "s, max() - 1, { ellipsis: '…' }",
    ),
    reported(
      "const r = s.length >= +n ? s.slice(0, +n) + '…' : s;",
      "s.length >= +n ? s.slice(0, +n) + '…' : s",
      "s, +n - 1, { ellipsis: '…' }",
    ),
    reported(
      "const r = s.length >= this.n ? s.slice(0, this.n) + '…' : s;",
      "s.length >= this.n ? s.slice(0, this.n) + '…' : s",
      "s, this.n - 1, { ellipsis: '…' }",
    ),
    reported(
      "const r = s.length >= (a ? b : c) ? s.slice(0, (a ? b : c) - 1) + '…' : s;",
      "s.length >= (a ? b : c) ? s.slice(0, (a ? b : c) - 1) + '…' : s",
      "s, (a ? b : c) - 1, { ellipsis: '…' }",
    ),
    reported(
      "const r = s.length >= a << b ? s.slice(0, a << b) + '…' : s;",
      "s.length >= a << b ? s.slice(0, a << b) + '…' : s",
      "s, (a << b) - 1, { ellipsis: '…' }",
    ),
    reported(
      "const r = s.length > (a, b) ? s.slice(0, (a, b)) + '…' : s;",
      "s.length > (a, b) ? s.slice(0, (a, b)) + '…' : s",
      "s, (a, b), { ellipsis: '…' }",
    ),

    // With an ellipsis, the cut can leave room for it, or not.
    reported(
      "const r = s.length > 10 ? s.slice(0, 7) + '...' : s;",
      "s.length > 10 ? s.slice(0, 7) + '...' : s",
      "s, 10, { ellipsis: '...' }",
    ),
    reported(
      "const r = s.length > n ? s.slice(0, n - 3) + '...' : s;",
      "s.length > n ? s.slice(0, n - 3) + '...' : s",
      "s, n, { ellipsis: '...' }",
    ),

    // The ellipsis keeps its spelling, or is written as a literal from a template.
    reported(
      'const r = s.length > n ? s.slice(0, n) + "…" : s;',
      's.length > n ? s.slice(0, n) + "…" : s',
      's, n, { ellipsis: "…" }',
    ),
    reported(
      'const r = s.length > n ? s.slice(0, n) + `…` : s;',
      's.length > n ? s.slice(0, n) + `…` : s',
      's, n, { ellipsis: `…` }',
    ),
    reported(
      'const r = s.length > n ? `${s.slice(0, n)}\\u2026` : s;',
      's.length > n ? `${s.slice(0, n)}\\u2026` : s',
      's, n, { ellipsis: `\\u2026` }',
    ),
    reported(
      "const r = s.length > n ? `${s.slice(0, n)}' more` : s;",
      "s.length > n ? `${s.slice(0, n)}' more` : s",
      "s, n, { ellipsis: `' more` }",
    ),

    // Plain references: `this`, and property chains by name or literal key.
    reported(
      "const r = this.title.length > 80 ? this.title.slice(0, 79) + '…' : this.title;",
      "this.title.length > 80 ? this.title.slice(0, 79) + '…' : this.title",
      "this.title, 80, { ellipsis: '…' }",
    ),
    reported(
      "const r = a['b'].length > n ? a['b'].slice(0, n) + '…' : a['b'];",
      "a['b'].length > n ? a['b'].slice(0, n) + '…' : a['b']",
      "a['b'], n, { ellipsis: '…' }",
    ),

    // The statement form, braced, and on a property.
    assigned(
      "if (this.title.length > 80) { this.title = this.title.slice(0, 79) + '…'; }",
      "if (this.title.length > 80) { this.title = this.title.slice(0, 79) + '…'; }",
      'this.title',
      "this.title, 80, { ellipsis: '…' }",
    ),
    assigned(
      'if (s.length >= 10) s = `${s.slice(0, 9)}…`;',
      'if (s.length >= 10) s = `${s.slice(0, 9)}…`;',
      's',
      "s, 9, { ellipsis: '…' }",
    ),
    assigned(
      'if (s.length > n) s = s.substring(0, n);',
      'if (s.length > n) s = s.substring(0, n);',
      's',
      's, n',
    ),
    assigned(
      "if (x) y(); else if (s.length > n) s = s.slice(0, n) + '…';",
      "if (s.length > n) s = s.slice(0, n) + '…';",
      's',
      "s, n, { ellipsis: '…' }",
    ),

    // A comment the rewrite would delete: reported, with no suggestion.
    unsuggested("const r = s.length > n ? s.slice(0, n) /* cut */ + '…' : s;"),
    unsuggested("if (s.length > n) {\n  // Keep previews short.\n  s = s.slice(0, n) + '…';\n}"),
    // A comment after the conditional is outside what is replaced.
    reported(
      "const r = s.length > n ? s.slice(0, n) + '…' : s /* kept */;",
      "s.length > n ? s.slice(0, n) + '…' : s",
      "s, n, { ellipsis: '…' }",
    ),

    // A unit whose import would clash with a local name is left out.
    reported(
      "function f(graphemes) { return s.length > n ? s.slice(0, n) + '…' : s; }",
      "s.length > n ? s.slice(0, n) + '…' : s",
      "s, n, { ellipsis: '…' }",
      UNITS.filter((unit) => unit !== 'graphemes'),
    ),
    assigned(
      "function f(utf8) { if (s.length > n) s = s.slice(0, n) + '…'; }",
      "if (s.length > n) s = s.slice(0, n) + '…';",
      's',
      "s, n, { ellipsis: '…' }",
      UNITS.filter((unit) => unit !== 'utf8'),
    ),
  ],
});

tsRuleTester.run('prefer-truncate (TypeScript)', rule, {
  valid: [
    // Known arrays, cut without an ellipsis.
    '(items: string[], n: number) => items.length > n ? items.slice(0, n) : items;',
  ],
  invalid: [
    // A string annotation is evidence enough for `slice` without an ellipsis.
    reported(
      'const f = (s: string, n: number) => s.length > n ? s.slice(0, n) : s;',
      's.length > n ? s.slice(0, n) : s',
      's, n',
    ),
    assigned(
      'function f(s: string) { if (s.length > 10) s = s.slice(0, 10); }',
      'if (s.length > 10) s = s.slice(0, 10);',
      's',
      's, 10',
    ),
  ],
});
