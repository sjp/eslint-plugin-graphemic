import { ruleTester, tsRuleTester } from '../test/ruleTester.js';
import rule from './no-unsafe-pad.js';

const GRAPHEMES = "import { graphemes } from '@sjpnz/graphemic';\n";
const COLUMNS = "import * as columns from '@sjpnz/graphemic/columns';\n";

/**
 * The one report on `code`, with `messageId`, whose suggestions replace
 * `replaced` in it with graphemic's `messageId` method on `args`, in graphemes
 * then columns, importing each.
 */
function reported(code: string, messageId: string, replaced: string, args: string) {
  return {
    code,
    errors: [
      {
        messageId,
        suggestions: [
          {
            messageId: 'graphemes',
            output: GRAPHEMES + code.replace(replaced, `graphemes.${messageId}(${args})`),
          },
          {
            messageId: 'columns',
            output: COLUMNS + code.replace(replaced, `columns.${messageId}(${args})`),
          },
        ],
      },
    ],
  };
}

/** The one report on `code`, with `messageId`, which has no suggestions. */
function unsuggested(code: string, messageId: string) {
  return { code, errors: [{ messageId, suggestions: [] }] };
}

ruleTester.run('no-unsafe-pad', rule, {
  valid: [
    // Zero-padding a number, with an ASCII fill or none.
    "String(n).padStart(2, '0');",
    "String(n).padEnd(8, ' ');",
    'String(n).padStart(2);',
    'String().padStart(2);',
    'String(...args).padStart(2);',
    "n.toString().padStart(2, '0');",
    "n.toString(16).padStart(2, '0');",
    "n.toFixed(2).padStart(8, '0');",
    "n.toPrecision(3).padEnd(8, '.');",
    "`${d}`.padStart(2, '0');",
    'String(n).padStart(2, `0`);',
    "String(n).padStart(2, '');",
    "n?.toString().padStart(2, '0');",
    // The same through `const` bindings.
    "const d = String(n); d.padStart(2, '0');",
    "const a = n.toString(16); const b = a; b.padStart(2, '0');",
    "const d = n?.toString(); d.padStart(2, '0');",
    // Nothing to pad to.
    's.padStart();',
    // Other methods, and pads looked up some other way.
    "s.trimStart('0');",
    "s['padStart'](2);",
    'class A extends B { f() { return super.padStart(2); } }',
  ],
  invalid: [
    // Any receiver: only strings have these methods.
    reported('name.padEnd(20);', 'padEnd', 'name.padEnd(20)', 'name, 20'),
    reported("s.padStart(3, '.');", 'padStart', "s.padStart(3, '.')", "s, 3, '.'"),
    reported(
      "'\u{1F44B}\u{1F3FD}'.padStart(3, '.');",
      'padStart',
      "'\u{1F44B}\u{1F3FD}'.padStart(3, '.')",
      "'\u{1F44B}\u{1F3FD}', 3, '.'",
    ),
    // An ASCII literal is reported like any other string.
    reported("'abc'.padEnd(5);", 'padEnd', "'abc'.padEnd(5)", "'abc', 5"),
    reported('(a + b).padEnd(n);', 'padEnd', '(a + b).padEnd(n)', 'a + b, n'),
    // A number shape with a fill that is not printable ASCII, or not a literal.
    reported(
      "String(n).padStart(2, '\u{1F44B}');",
      'padStart',
      "String(n).padStart(2, '\u{1F44B}')",
      "String(n), 2, '\u{1F44B}'",
    ),
    reported(
      "String(n).padStart(2, '\\r\\n');",
      'padStart',
      "String(n).padStart(2, '\\r\\n')",
      "String(n), 2, '\\r\\n'",
    ),
    reported(
      'String(n).padStart(2, 0);',
      'padStart',
      'String(n).padStart(2, 0)',
      'String(n), 2, 0',
    ),
    reported(
      'String(n).padStart(2, fill);',
      'padStart',
      'String(n).padStart(2, fill)',
      'String(n), 2, fill',
    ),
    reported(
      'String(n).padStart(2, `${z}`);',
      'padStart',
      'String(n).padStart(2, `${z}`)',
      'String(n), 2, `${z}`',
    ),
    // Not the shape of a formatted number.
    reported(
      "String.raw`a`.padStart(2, '0');",
      'padStart',
      "String.raw`a`.padStart(2, '0')",
      "String.raw`a`, 2, '0'",
    ),
    reported(
      "`#${d}`.padStart(2, '0');",
      'padStart',
      "`#${d}`.padStart(2, '0')",
      "`#${d}`, 2, '0'",
    ),
    reported(
      "`${a}${b}`.padStart(2, '0');",
      'padStart',
      "`${a}${b}`.padStart(2, '0')",
      "`${a}${b}`, 2, '0'",
    ),
    reported("`x`.padStart(2, '0');", 'padStart', "`x`.padStart(2, '0')", "`x`, 2, '0'"),
    reported(
      "format(n).padStart(2, '0');",
      'padStart',
      "format(n).padStart(2, '0')",
      "format(n), 2, '0'",
    ),
    reported(
      "n.toUpperCase().padStart(2, '0');",
      'padStart',
      "n.toUpperCase().padStart(2, '0')",
      "n.toUpperCase(), 2, '0'",
    ),
    reported("n[f]().padStart(2, '0');", 'padStart', "n[f]().padStart(2, '0')", "n[f](), 2, '0'"),
    reported("f()().padStart(2, '0');", 'padStart', "f()().padStart(2, '0')", "f()(), 2, '0'"),
    reported("d.padStart(2, '0');", 'padStart', "d.padStart(2, '0')", "d, 2, '0'"),
    // A formatted string of a string is text like any other.
    reported(
      "String('\u{1F44B}').padStart(3, '.');",
      'padStart',
      "String('\u{1F44B}').padStart(3, '.')",
      "String('\u{1F44B}'), 3, '.'",
    ),
    reported(
      "'ab'.toString().padStart(3);",
      'padStart',
      "'ab'.toString().padStart(3)",
      "'ab'.toString(), 3",
    ),
    reported("`${'ab'}`.padStart(3);", 'padStart', "`${'ab'}`.padStart(3)", "`${'ab'}`, 3"),
    // A `String` the file declares.
    reported(
      "function String() {} String(n).padStart(2, '0');",
      'padStart',
      "String(n).padStart(2, '0')",
      "String(n), 2, '0'",
    ),
    // Bindings that are not a single, unannotated `const`.
    reported(
      "let d = String(n); d.padStart(2, '0');",
      'padStart',
      "d.padStart(2, '0')",
      "d, 2, '0'",
    ),
    reported(
      "var d = String(n); var d; d.padStart(2, '0');",
      'padStart',
      "d.padStart(2, '0')",
      "d, 2, '0'",
    ),
    reported(
      "const [d] = [String(n)]; d.padStart(2, '0');",
      'padStart',
      "d.padStart(2, '0')",
      "d, 2, '0'",
    ),
    reported(
      "function f(d) { return d.padStart(2, '0'); }",
      'padStart',
      "d.padStart(2, '0')",
      "d, 2, '0'",
    ),
    reported(
      "for (const d of xs) d.padStart(2, '0');",
      'padStart',
      "d.padStart(2, '0')",
      "d, 2, '0'",
    ),
    reported(
      "const a = b, b = a; b.padStart(2, '0');",
      'padStart',
      "b.padStart(2, '0')",
      "b, 2, '0'",
    ),
    // Too many arguments, or a spread: no suggestions, and never exempt.
    unsuggested("String(n).padStart(2, '0', x);", 'padStart'),
    unsuggested('s.padEnd(...args);', 'padEnd'),
    unsuggested('s.padEnd(2, ...fill);', 'padEnd'),
    // An optional chain needs a conditional to rewrite.
    unsuggested('s?.padStart(2);', 'padStart'),
    unsuggested("s?.trim().padEnd(2, '-');", 'padEnd'),
  ],
});

tsRuleTester.run('no-unsafe-pad (TypeScript)', rule, {
  valid: [
    "function f(n: number) { return String(n).padStart(2, '0'); }",
    "function f(n: number) { return (n as number).toString().padStart(2, '0'); }",
  ],
  invalid: [
    reported(
      'function f(n: string) { return String(n).padStart(2); }',
      'padStart',
      'String(n).padStart(2)',
      'String(n), 2',
    ),
    reported(
      "function f(n: string) { return n.toString().padStart(2, '0'); }",
      'padStart',
      "n.toString().padStart(2, '0')",
      "n.toString(), 2, '0'",
    ),
    reported(
      "function f(n: string) { return `${n}`.padStart(2, '0'); }",
      'padStart',
      "`${n}`.padStart(2, '0')",
      "`${n}`, 2, '0'",
    ),
    reported(
      "function f(n: number) { const d: string = String(n); return d.padStart(2, '0'); }",
      'padStart',
      "d.padStart(2, '0')",
      "d, 2, '0'",
    ),
  ],
});
