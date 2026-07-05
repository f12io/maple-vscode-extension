# @f12io/prettier-plugin-maple

Prettier plugin for the [Maple CSS Engine](https://github.com/f12io/maple).
It automatically formats your Maple utility classes to ensure a consistent
layout across your project. Because it shares the same formatting logic as the
[Maple VS Code extension](https://marketplace.visualstudio.com/items?itemName=f12io.maple-vscode-extension),
you get identical results everywhere—whether you are formatting on save in your
editor, running pre-commit hooks, or running CI pipelines.

## Install

```bash
npm install --save-dev prettier @f12io/prettier-plugin-maple
```

```jsonc
// .prettierrc
{
  "plugins": ["@f12io/prettier-plugin-maple"],
  "mapleMaxClassesPerLine": 4,
}
```

## What gets formatted

Wrapped parsers: `html`, `vue`, `angular`, `babel`, `babel-ts`, `typescript`.

- `class="..."` attributes in HTML/Vue/Angular templates — wrapped onto
  grouped multi-line layout via a printer override, indented to wherever
  Prettier places the element
- `className={`...`}` / `class={...}` JSX expressions, including ternaries
- `clsx(...)`, `classNames(...)`, `cva(...)` arguments
- `/* maple */` opt-in expressions (ternaries, concatenations, objects)
- Embedded `<script>` content in HTML/Vue files
- Vue `:class` and Angular `[ngClass]` string literals (single-line
  normalization — those hosts cannot contain multi-line strings)

Class lists longer than `mapleMaxClassesPerLine` wrap onto grouped lines;
string delimiters are upgraded only when safe (e.g. `'...'` → `` `...` `` in
JS).

```html
<div
  class="
    c-blue
    p-2 m-2 fs-50
    o-50 fw-normal
  "
></div>
```

## Options

| Option                   | Default | Description                                                              |
| ------------------------ | ------- | ------------------------------------------------------------------------ |
| `mapleMaxClassesPerLine` | `4`     | Maximum classes per line before wrapping. `1` forces one class per line. |

## License

Released under the [Root Source License (ROOT)](https://github.com/f12io/maple-vscode-extension/blob/main/LICENSE), an MIT-style permissive license with an additional distribution condition for systems that can recreate the source on demand. © [f12.io](https://f12.io)
