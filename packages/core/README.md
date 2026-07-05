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
