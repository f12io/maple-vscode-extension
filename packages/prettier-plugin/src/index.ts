/**
 * @f12io/prettier-plugin-maple
 *
 * Wraps Prettier's built-in parsers with a preprocess step that formats
 * Maple CSS classes — className/class JSX expressions, clsx/classNames/cva
 * arguments, and maple opt-in comment strings — using the same layout engine
 * as the Maple VS Code extension, so a single Prettier pass produces the
 * final state.
 *
 * HTML-family `class` attributes need one extra step: Prettier's html
 * printer normally collapses attribute values onto a single line, so the
 * html-family parsers are re-pointed at a custom AST format whose printer
 * intercepts class attributes (in `embed`, which the html printer uses for
 * attribute nodes) and emits maple's multi-line layout as doc primitives —
 * indentation then adapts to wherever Prettier places the element.
 */
import {
  formatClasses,
  formatText,
  LanguageServiceRegistry,
} from '@f12io/maple-language-core';
import type {
  Doc,
  Parser,
  ParserOptions,
  Printer,
  SupportOptions,
} from 'prettier';
import { doc } from 'prettier';
import { parsers as babelParsers } from 'prettier/plugins/babel';
import * as htmlPlugin from 'prettier/plugins/html';
import { parsers as htmlParsers } from 'prettier/plugins/html';
import { parsers as typescriptParsers } from 'prettier/plugins/typescript';

declare module 'prettier' {
  interface Options {
    mapleMaxClassesPerLine?: number;
  }
}

export const options: SupportOptions = {
  mapleMaxClassesPerLine: {
    category: 'Maple',
    type: 'int',
    default: 4,
    description:
      'Maximum number of Maple classes per line before wrapping. Set to 1 to force each class onto its own line.',
  },
};

function withMaple(
  base: Parser,
  languageId: string,
  astFormat?: string,
): Parser {
  return {
    ...base,
    ...(astFormat ? { astFormat } : {}),
    preprocess(text: string, parserOptions: ParserOptions) {
      const maxClassesPerLine =
        (parserOptions as ParserOptions & { mapleMaxClassesPerLine?: number })
          .mapleMaxClassesPerLine ?? 4;
      const pre = base.preprocess ? base.preprocess(text, parserOptions) : text;
      // A base preprocess may be async (Parser allows Promise<string>)
      if (typeof pre === 'string') {
        return formatText(pre, languageId, maxClassesPerLine);
      }
      return pre.then((resolved) =>
        formatText(resolved, languageId, maxClassesPerLine),
      );
    },
  } as Parser;
}

/**
 * Parser name → maple language id. JSX-capable parsers map to the React
 * service (className expressions, clsx calls); the angular parser shares the
 * html service, which includes Angular bindings.
 */
/**
 * The html-family parsers are pointed at a custom AST format so Prettier
 * resolves OUR printer (which understands multi-line class attributes)
 * instead of the builtin html printer that collapses attribute values.
 */
const MAPLE_HTML_AST = 'maple-html';

export const parsers: Record<string, Parser> = {
  html: withMaple(htmlParsers.html, 'html', MAPLE_HTML_AST),
  vue: withMaple(htmlParsers.vue, 'vue', MAPLE_HTML_AST),
  angular: withMaple(htmlParsers.angular, 'html', MAPLE_HTML_AST),
  babel: withMaple(babelParsers.babel, 'javascriptreact'),
  'babel-ts': withMaple(babelParsers['babel-ts'], 'typescriptreact'),
  typescript: withMaple(typescriptParsers.typescript, 'typescriptreact'),
};

const PRINTER_LANGUAGE: Record<string, string> = {
  html: 'html',
  angular: 'html',
  vue: 'vue',
};

/**
 * Prints a `class` attribute with maple's multi-line layout when it exceeds
 * mapleMaxClassesPerLine. Returns undefined to fall back to Prettier's own
 * attribute printing (which collapses values onto a single line).
 */
function printMapleClassAttribute(
  node: {
    type?: string;
    kind?: string;
    name?: string;
    fullName?: string;
    rawName?: string;
    value?: unknown;
  },
  parserOptions: ParserOptions & { mapleMaxClassesPerLine?: number },
): Doc | undefined {
  // Prettier's html AST discriminates via `kind` (older versions used `type`)
  const nodeKind = node.kind ?? node.type;
  const name = node.fullName ?? node.name;
  if (nodeKind !== 'attribute' || name !== 'class') return undefined;
  if (typeof node.value !== 'string') return undefined;

  // options.parser may be a custom parser object rather than a name; only a
  // known html-family name selects a specific service, everything else falls
  // back to the html service
  const parserName =
    typeof parserOptions.parser === 'string' ? parserOptions.parser : '';
  const languageId = PRINTER_LANGUAGE[parserName] ?? 'html';
  const service = LanguageServiceRegistry.getService(languageId);
  if (!service) return undefined;

  const maxClassesPerLine = parserOptions.mapleMaxClassesPerLine ?? 4;
  const formatted = formatClasses(
    node.value.trim(),
    '',
    maxClassesPerLine,
    service,
  );
  if (!formatted.includes('\n')) return undefined;

  const lines = formatted
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const { hardline, indent, join } = doc.builders;
  return [
    node.rawName ?? name,
    '="',
    indent([hardline, join(hardline, lines)]),
    hardline,
    '"',
  ];
}

const htmlPrinter = (
  htmlPlugin as unknown as { printers: Record<string, Printer> }
).printers.html;

export const printers: Record<string, Printer> = {
  [MAPLE_HTML_AST]: {
    ...htmlPrinter,
    // The html printer routes attribute nodes through `embed` (returning a
    // doc there bypasses `print`), so that is where class attributes must be
    // intercepted.
    embed(path, embedOptions) {
      const maple = printMapleClassAttribute(
        path.node as never,
        embedOptions as ParserOptions & { mapleMaxClassesPerLine?: number },
      );
      if (maple !== undefined) return maple;
      return htmlPrinter.embed?.(path, embedOptions) ?? null;
    },
  },
};

export default { options, parsers, printers };
