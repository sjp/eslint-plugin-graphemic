import type { Context, ESTree } from '@oxlint/plugins';
import type { RuleTester } from 'oxlint/plugins-dev';
import { describe, expect, it } from 'vitest';

import { type CallOption, callRule } from '../test/callRule.js';
import { ruleTester, tsRuleTester } from '../test/ruleTester.js';
import { graphemicCallee, readSettings } from './imports.js';

const LENGTH: CallOption[] = [{ unit: 'graphemes', fn: 'length' }];
const ROOT_IMPORT = "import { graphemes } from '@sjpnz/graphemic';";

/** An invalid case whose one report suggests `output`, or nothing when it is `null`. */
function suggests(
  code: string,
  output: string | null,
  extra: Pick<RuleTester.InvalidTestCase, 'settings' | 'languageOptions' | 'filename'> & {
    options?: CallOption[];
  } = {},
): RuleTester.InvalidTestCase {
  const { options = LENGTH, ...rest } = extra;
  return {
    code,
    options,
    ...rest,
    errors: [
      {
        messageId: 'report',
        suggestions: output === null ? [] : [{ messageId: 'suggest', output }],
      },
    ],
  };
}

const subpath = { settings: { graphemic: { importStyle: 'subpath' } } } as const;

ruleTester.run('graphemicCallee', callRule, {
  valid: [],
  invalid: [
    // No import yet: add one, at the top.
    suggests("'ab'.$;", `${ROOT_IMPORT}\ngraphemes.length('ab');`),
    suggests(
      "const x = 1;\n\nexport const n = 'ab'.$;",
      `${ROOT_IMPORT}\nconst x = 1;\n\nexport const n = graphemes.length('ab');`,
    ),

    // Reusing an import the file has.
    suggests(`${ROOT_IMPORT}\n'ab'.$;`, `${ROOT_IMPORT}\ngraphemes.length('ab');`),
    suggests(
      "import { graphemes as g } from '@sjpnz/graphemic';\n'ab'.$;",
      "import { graphemes as g } from '@sjpnz/graphemic';\ng.length('ab');",
    ),
    suggests(
      "import { 'graphemes' as g } from '@sjpnz/graphemic';\n'ab'.$;",
      "import { 'graphemes' as g } from '@sjpnz/graphemic';\ng.length('ab');",
    ),
    suggests(
      "import * as g from '@sjpnz/graphemic/graphemes';\n'ab'.$;",
      "import * as g from '@sjpnz/graphemic/graphemes';\ng.length('ab');",
    ),
    suggests(
      "import * as graphemic from '@sjpnz/graphemic';\n'ab'.$;",
      "import * as graphemic from '@sjpnz/graphemic';\ngraphemic.graphemes.length('ab');",
    ),
    suggests(
      "import { length } from '@sjpnz/graphemic/graphemes';\n'ab'.$;",
      "import { length } from '@sjpnz/graphemic/graphemes';\nlength('ab');",
    ),
    suggests(
      "import { slice, length as count } from '@sjpnz/graphemic/graphemes';\n'ab'.$;",
      "import { slice, length as count } from '@sjpnz/graphemic/graphemes';\ncount('ab');",
    ),
    // The first import that still means itself at the node wins.
    suggests(
      `${ROOT_IMPORT}\nimport * as g from '@sjpnz/graphemic/graphemes';\nfunction f(graphemes) { return 'ab'.$; }`,
      `${ROOT_IMPORT}\nimport * as g from '@sjpnz/graphemic/graphemes';\nfunction f(graphemes) { return g.length('ab'); }`,
    ),

    // Imports of something else are not reused.
    suggests(
      "import { length } from '@sjpnz/graphemic/utf8';\n'ab'.$;",
      `import { length } from '@sjpnz/graphemic/utf8';\n${ROOT_IMPORT}\ngraphemes.length('ab');`,
    ),
    suggests(
      "import * as u from '@sjpnz/graphemic/utf8';\n'ab'.$;",
      `import * as u from '@sjpnz/graphemic/utf8';\n${ROOT_IMPORT}\ngraphemes.length('ab');`,
    ),
    // A default import is of nothing graphemic has; the new import copies its quotes.
    suggests(
      'import React from "react";\n\'ab\'.$;',
      'import React from "react";\nimport { graphemes } from "@sjpnz/graphemic";\ngraphemes.length(\'ab\');',
    ),

    // Adding a specifier to an existing named import from the right module.
    suggests(
      "import { utf8 } from '@sjpnz/graphemic';\n'ab'.$;",
      "import { utf8, graphemes } from '@sjpnz/graphemic';\ngraphemes.length('ab');",
    ),
    suggests(
      "import { utf8, } from '@sjpnz/graphemic';\n'ab'.$;",
      "import { utf8, graphemes, } from '@sjpnz/graphemic';\ngraphemes.length('ab');",
    ),

    // A name that already means something else: no suggestion, rather than a guessed alias.
    suggests("function f(graphemes) { return 'ab'.$; }", null),
    suggests(`${ROOT_IMPORT}\nfunction f(graphemes) { return 'ab'.$; }`, null),
    suggests("const graphemes = [];\n'ab'.$;", null),
    suggests("'ab'.$;\nfunction graphemes() {}", null),
    // An undeclared global of that name would be captured by the import.
    suggests("graphemes.init();\n'ab'.$;", null),
    // A name declared in some other function is no obstacle.
    suggests(
      "function f() { const graphemes = []; }\n'ab'.$;",
      `${ROOT_IMPORT}\nfunction f() { const graphemes = []; }\ngraphemes.length('ab');`,
    ),

    // columns is only on its subpath, and exports plain functions there.
    suggests(
      "'ab'.$;",
      "import * as columns from '@sjpnz/graphemic/columns';\ncolumns.length('ab');",
      { options: [{ unit: 'columns', fn: 'length' }] },
    ),
    suggests(
      "import * as graphemic from '@sjpnz/graphemic';\n'ab'.$;",
      "import * as graphemic from '@sjpnz/graphemic';\nimport * as columns from '@sjpnz/graphemic/columns';\ncolumns.length('ab');",
      { options: [{ unit: 'columns', fn: 'length' }] },
    ),
    suggests("import { columns } from '@sjpnz/graphemic';\n'ab'.$;", null, {
      options: [{ unit: 'columns', fn: 'length' }],
    }),
    suggests(
      "import { length } from '@sjpnz/graphemic/columns';\n'ab'.$;",
      "import { length } from '@sjpnz/graphemic/columns';\nlength('ab');",
      { options: [{ unit: 'columns', fn: 'length' }] },
    ),
    suggests(
      "import { length } from '@sjpnz/graphemic/columns';\n'ab'.$(1);",
      "import { length } from '@sjpnz/graphemic/columns';\nimport * as columns from '@sjpnz/graphemic/columns';\ncolumns.slice('ab', 1);",
      { options: [{ unit: 'columns', fn: 'slice' }] },
    ),

    // importStyle: 'subpath'.
    suggests(
      "'ab'.$;",
      "import { length } from '@sjpnz/graphemic/graphemes';\nlength('ab');",
      subpath,
    ),
    suggests(
      "import { slice } from '@sjpnz/graphemic/graphemes';\n'ab'.$;",
      "import { slice, length } from '@sjpnz/graphemic/graphemes';\nlength('ab');",
      subpath,
    ),
    suggests(`${ROOT_IMPORT}\n'ab'.$;`, `${ROOT_IMPORT}\ngraphemes.length('ab');`, subpath),
    // `length` is taken, so the subpath comes in as a namespace.
    suggests(
      "const length = 1;\n'ab'.$;",
      "import * as graphemes from '@sjpnz/graphemic/graphemes';\nconst length = 1;\ngraphemes.length('ab');",
      subpath,
    ),
    suggests(
      "import { length } from '@sjpnz/graphemic/utf8';\n'ab'.$;",
      "import { length } from '@sjpnz/graphemic/utf8';\nimport * as graphemes from '@sjpnz/graphemic/graphemes';\ngraphemes.length('ab');",
      subpath,
    ),
    suggests("const length = 1, graphemes = 2;\n'ab'.$;", null, subpath),
    suggests("'ab'.$;", "import { length } from '@sjpnz/graphemic/columns';\nlength('ab');", {
      ...subpath,
      options: [{ unit: 'columns', fn: 'length' }],
    }),
    // An empty settings object takes the default.
    suggests("'ab'.$;", `${ROOT_IMPORT}\ngraphemes.length('ab');`, { settings: { graphemic: {} } }),

    // After a hashbang and a directive prologue, which have to stay first.
    suggests(
      "#!/usr/bin/env node\n'ab'.$;",
      `#!/usr/bin/env node\n${ROOT_IMPORT}\ngraphemes.length('ab');`,
    ),
    suggests(
      "#!/usr/bin/env node\n'use strict';\n'use client';\n\n'ab'.$;",
      `#!/usr/bin/env node\n'use strict';\n'use client';\n${ROOT_IMPORT}\n\ngraphemes.length('ab');`,
    ),
    // A comment heading the file stays above the import.
    suggests(
      "// Licence header.\n\n'ab'.$;",
      `// Licence header.\n\n${ROOT_IMPORT}\ngraphemes.length('ab');`,
    ),

    // graphemic is ESM-only.
    suggests("'ab'.$;", null, { languageOptions: { sourceType: 'commonjs' } }),
    suggests("const x = require('x');\n'ab'.$;", null, {
      languageOptions: { sourceType: 'script' },
    }),
    suggests("module.exports = 'ab'.$;", null, { languageOptions: { sourceType: 'script' } }),
    // A file with no import or export yet is parsed as a script; it is the
    // file most in need of an import.
    suggests("'ab'.$;", `${ROOT_IMPORT}\ngraphemes.length('ab');`, {
      languageOptions: { sourceType: 'script' },
    }),
    suggests("'use strict';\n'ab'.$;", `'use strict';\n${ROOT_IMPORT}\ngraphemes.length('ab');`, {
      languageOptions: { sourceType: 'script' },
    }),

    // Each suggestion carries its own import.
    {
      code: "'ab'.$;",
      options: [
        { unit: 'graphemes', fn: 'length' },
        { unit: 'utf8', fn: 'length' },
      ],
      errors: [
        {
          messageId: 'report',
          suggestions: [
            { messageId: 'suggest', output: `${ROOT_IMPORT}\ngraphemes.length('ab');` },
            {
              messageId: 'suggest',
              output: "import { utf8 } from '@sjpnz/graphemic';\nutf8.length('ab');",
            },
          ],
        },
      ],
    },
  ],
});

tsRuleTester.run('graphemicCallee (TypeScript)', callRule, {
  valid: [],
  invalid: [
    // A type-only import is neither reused nor added to.
    suggests("import type { graphemes } from '@sjpnz/graphemic';\n'ab'.$;", null),
    suggests("import { type graphemes } from '@sjpnz/graphemic';\n'ab'.$;", null),
    suggests(
      "import type { Boundary } from '@sjpnz/graphemic';\n'ab'.$;",
      `import type { Boundary } from '@sjpnz/graphemic';\n${ROOT_IMPORT}\ngraphemes.length('ab');`,
    ),
    // A value import whose specifiers happen to be types can take one more.
    suggests(
      "import { type Boundary } from '@sjpnz/graphemic';\n'ab'.$;",
      "import { type Boundary, graphemes } from '@sjpnz/graphemic';\ngraphemes.length('ab');",
    ),
    suggests(
      "import { type length } from '@sjpnz/graphemic/graphemes';\n'ab'.$;",
      "import { type length } from '@sjpnz/graphemic/graphemes';\nimport * as graphemes from '@sjpnz/graphemic/graphemes';\ngraphemes.length('ab');",
      subpath,
    ),
    // A type of the same name would clash with the import.
    suggests("type graphemes = string;\n'ab'.$;", null),
    suggests("'ab'.$;", `${ROOT_IMPORT}\ngraphemes.length('ab');`, { filename: 'file.mts' }),
    suggests("'ab'.$;", null, {
      filename: 'file.cts',
      languageOptions: { sourceType: 'commonjs' },
    }),
  ],
});

describe('graphemicCallee', () => {
  it('rejects a function graphemic does not have', () => {
    expect(() => graphemicCallee({} as Context, {} as ESTree.Node, 'utf8', 'reverse')).toThrow(
      'eslint-plugin-graphemic: graphemic has no utf8.reverse.',
    );
  });
});

describe('readSettings', () => {
  it('defaults to namespace imports', () => {
    expect(readSettings({})).toStrictEqual({ importStyle: 'namespace' });
    expect(readSettings({ graphemic: {} })).toStrictEqual({ importStyle: 'namespace' });
  });

  it('reads importStyle', () => {
    expect(readSettings({ graphemic: { importStyle: 'subpath' } })).toStrictEqual({
      importStyle: 'subpath',
    });
    expect(readSettings({ graphemic: { importStyle: 'namespace' } })).toStrictEqual({
      importStyle: 'namespace',
    });
  });

  it('rejects anything else, naming the setting', () => {
    expect(() => readSettings({ graphemic: { importStyle: 'named' } })).toThrow(
      'eslint-plugin-graphemic: settings.graphemic.importStyle must be "namespace" or "subpath", got "named".',
    );
    expect(() => readSettings({ graphemic: { importstyle: 'subpath' } })).toThrow(
      'eslint-plugin-graphemic: unknown setting settings.graphemic.importstyle; the only setting is importStyle.',
    );
    for (const graphemic of ['subpath', null, ['subpath']]) {
      expect(() => readSettings({ graphemic })).toThrow(
        `eslint-plugin-graphemic: settings.graphemic must be an object, got ${JSON.stringify(graphemic)}.`,
      );
    }
  });
});
