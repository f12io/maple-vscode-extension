# @f12io/maple-language-core

Editor-agnostic language tooling for [Maple CSS Engine](https://github.com/f12io/maple):
region discovery, class extraction, string grammar, and class formatting
logic. This package is the single source of truth consumed by the
[Maple VS Code extension](https://marketplace.visualstudio.com/items?itemName=f12io.maple-vscode-extension)
and [@f12io/prettier-plugin-maple](https://www.npmjs.com/package/@f12io/prettier-plugin-maple).

## What it provides

- **`LanguageServiceRegistry.getService(languageId)`** — a language service
  for `html`, `javascript(react)`, `typescript(react)`, `vue`, `svelte`,
  `php`, `razor`, `aspnetcorerazor`, and `twig`.
- **`service.collectRegions(text)`** — every maple region in a document
  (class attributes, `className={...}`, `clsx()`/`cva()` arguments,
  `/* maple */` opt-in expressions, framework bindings), typed as raw class
  text or code expressions.
- **`service.extractClasses(text)`** — class instances with exact document
  offsets, interpolation-aware per language (JS template literals, C#
  interpolated strings, PHP blocks, Razor expressions).
- **`formatClasses` / `computeFormattingEdits` / `formatText`** — the layout
  engine: wraps class lists by property group, preserves ternary and
  concatenation structure, and upgrades string delimiters only when the host
  language allows multi-line strings.
- **`computeSemanticTokens(text, { languageId, localAliases })`** — offset-based
  highlighting tokens for every maple class in a document, region gating
  included, plus the palette so hosts colorize identically:
  `MAPLE_TOKEN_THEME_COLORS` (token -> VS Code terminal color name, for hosts
  that resolve theme colors) and `MAPLE_TOKEN_COLORS.dark` / `.light` (the same
  palette as hex, for hosts that cannot, such as Monaco).
  `MAPLE_TOKEN_SCOPES` remains for `semanticTokenScopes` registration.
- **`getCompletions(text, offset, ctx)`** — the suggestions for the class being
  typed at an offset: prefixes and full property keys, pseudo-classes, media
  and container queries, aliases, named colors with tones and opacities,
  spacing steps and fractions, gradient functions and stops. Returns `null`
  when the offset is outside every maple region.
- **`getHoverInfo(text, offset, ctx)`** — the class under an offset, its
  generated CSS, and the expansion behind an alias usage (parameters
  substituted, prefixes re-attached). Pretty-printing is left to the host.
- **`validateClass(cls, { tagName, localAliases })`** — validates a single class
  and returns a `MapleValidationIssue`, or `null` if it is valid (or not Maple).
  The issue provides a stable `code` (`invalid-shade`, `shade-in-variable`,
  `important-not-leading`, `important-literal`, `alias-definition-scope`,
  `unknown-class`), a
  ready-to-display `message`, and an optional `fix` containing the corrected
  class when unambiguous. Only the most specific problem is reported, allowing
  callers to filter out host template expressions by `code`.
- **`getDiagnostics(text, ctx)`** — returns all validation issues and utility
  conflicts for Maple classes across a document, in document order. Handles
  region detection, template interpolations, and aliases automatically. Issues
  are returned as warnings with character offsets and related conflict spans,
  making them easy for editor adapters to display.
- **`getDocumentColors(text, ctx)`** — finds all colors in color-bearing classes
  (such as `bgc-accent-500`, `c=[#f97316]`, and shadow colors) and returns their
  sRGB values with document ranges for editor color pickers.
- **`getColorPresentations(text, span, color)`** — provides replacement text
  options when a color is picked in the editor, matching the document's existing
  format and returning the exact range to replace.
- **`parseMapleToken` / `checkConverted` / `getUtilKey`** and the small class
  predicates (`isAliasMarker`, `isAliasDefinition`, `isVariable`,
  `stripImportant`, `stripQuotes`, `getAliasName`) — the shared class-token
  parsing primitives used by semantic highlighting, completions, hover and
  diagnostics.

## Usage

```ts
import {
  LanguageServiceRegistry,
  formatText,
} from '@f12io/maple-language-core';

const service = LanguageServiceRegistry.getService('javascriptreact');
const instances = service.extractClasses(source);

const formatted = formatText(source, 'javascriptreact', 4);
```

## License

Released under the [Root Source License (ROOT)](https://github.com/f12io/maple-vscode-extension/blob/main/LICENSE), an MIT-style permissive license with an additional distribution condition for systems that can recreate the source on demand. © [f12.io](https://f12.io)
