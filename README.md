<div align="center">

# Maple Intellisense

**The official VS Code extension for [Maple](https://maple.f12.io) — a variable-first, framework-agnostic runtime CSS engine.**

Rich autocompletion • Hover docs • Semantic highlighting • Conflict detection

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/f12io.maple-intellisense?label=VS%20Marketplace&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=f12io.maple-intellisense)
[![License](https://img.shields.io/badge/license-ROOT-blue)](https://github.com/f12io/maple/blob/main/LICENSE)

</div>

---

## Features

### ⚡ Intelligent Autocompletion

Maple Intellisense understands the full Maple class syntax and provides context-aware completions at every stage of authoring a class:

| Context          | Example trigger   | What you get                                                               |
| ---------------- | ----------------- | -------------------------------------------------------------------------- |
| **Initial**      | `class="..."`     | Popular property abbreviations, shortcuts, self selector `&`               |
| **Property**     | `class="bg..."`   | Filtered abbreviations, camelCase & kebab-case aliases                     |
| **Value**        | `class="bgc-..."` | Colors with previews, numeric scales, enumerated values                    |
| **Pseudo-class** | `class="&:..."`   | Full list of interactive & structural pseudo-classes                       |
| **Media query**  | `class="md:..."`  | Responsive breakpoints, `@dark`, `@print`, orientation, custom `mnw=/mxw=` |

Every suggestion includes an inline CSS preview so you always know what style will be generated.

#### Responsive Breakpoints

| Prefix | Breakpoint |
| ------ | ---------- |
| `sm`   | ≥ 640px    |
| `md`   | ≥ 768px    |
| `lg`   | ≥ 1024px   |
| `xl`   | ≥ 1280px   |
| `2xl`  | ≥ 1536px   |

#### Viewport / Media Queries

`@dark` · `@light` · `@print` · `@motion-reduce` · `@motion-safe` · `@browser` · `@standalone` · `@fullscreen` · `@pip` · `@supports` · `landscape` · `portrait`

Custom breakpoints: `mnw=640px:`, `mxw=1024px:`

---

### 🎨 Hover Documentation

Hover over any Maple class to instantly see the generated CSS, formatted and syntax-highlighted:

```
bgc-primary-600/80
```

```css
.bgc-primary-600\/80 {
  background-color: oklch(
    from var(--bgc-primary, var(--background-primary, var(--primary, primary)))
      calc(l * 0.6) c h / 0.8
  );
}
```

---

### 🖍 Semantic Syntax Highlighting

Maple Intellisense applies fine-grained semantic colors to each part of a Maple class, making complex class strings easy to read at a glance:

| Token           | Color role      | Example                            |
| --------------- | --------------- | ---------------------------------- |
| Media query     | Keyword         | `md` in `md:p-4`                   |
| Parent selector | Attribute       | `^.card` in `^.card:c-red`         |
| Self selector   | Attribute       | `&:hover` in `&:hover:bgc-blue`    |
| Child selector  | Attribute       | `/span` in `/span:fw=700`          |
| Utility key     | Property name   | `bgc` in `bgc-primary`             |
| Value           | String / number | `primary-600` in `bgc-primary-600` |
| Separator       | Embedded        | `:` between segments               |

---

### 🩺 Conflict Detection

Conflicting Maple utilities on the same element are highlighted with a **warning diagnostic** so you can catch CSS overrides before they reach the browser.

```html
<!-- ⚠️ Warning: Conflicted utility usage -->
<div class="p-4 p-8 bgc-red bgc-blue"></div>
```

The diagnostic is sourced as `Maple` and appears in the Problems panel with the exact range of the conflicting classes.

---

### ♻️ Language Server Architecture

Maple Intellisense is built on the **Language Server Protocol (LSP)**, running a dedicated `mapleLsp` server process. This means:

- Zero performance impact on the VS Code UI thread
- Debuggable server via `--inspect=6009`
- Restartable without reloading the window: **`Maple: Restart Language Server`**

---

## Supported Languages

| Language   | File extensions |
| ---------- | --------------- |
| HTML       | `.html`         |
| JavaScript | `.js`           |
| TypeScript | `.ts`           |
| JSX        | `.jsx`          |
| TSX        | `.tsx`          |
| Vue        | `.vue`          |
| Svelte     | `.svelte`       |

---

## Commands

| Command                          | Description                                       |
| -------------------------------- | ------------------------------------------------- |
| `Maple: Restart Language Server` | Restarts the LSP server without reloading VS Code |

---

## Installation

### From the Marketplace

1. Open VS Code
2. Press `Ctrl+P` / `Cmd+P` and run:
   ```
   ext install f12io.maple-intellisense
   ```
3. Or search **"Maple Intellisense"** in the Extensions view (`Ctrl+Shift+X`)

### From source

```bash
git clone https://github.com/f12io/maple-extension
cd maple-extension
npm install
npm run compile
```

Press `F5` in VS Code to launch an Extension Development Host.

---

## Quick Start

Add Maple to your project, then start writing classes:

```html
<!doctype html>
<html lang="en">
  <head>
    <script src="https://unpkg.com/@f12io/maple/dist/maple.js"></script>
  </head>
  <body>
    <div class="bgc-blue c-white p-4 rad-8">Hello, Maple!</div>
  </body>
</html>
```

> [!IMPORTANT]
> Load Maple as a **blocking** script in the `<head>`. Do not use `async`, `defer`, `type="module"`, or place the script at the bottom of the body — doing so may cause unstyled content on first paint.

---

## Maple Syntax Cheat Sheet

### CSS Property Abbreviations

```
d      → display          p     → padding          m    → margin
w      → width            h     → height            c    → color
bgc    → background-color fs    → font-size         fw   → font-weight
rad    → border-radius    of    → overflow          o    → opacity
pos    → position         t/r/b/l → top/right/bottom/left
```

### Direct Value Assignment

```html
<div class="w=86% c=#ff0000 fs=1.5rem"></div>
```

### CSS Variable Injection

```html
<div class="--primary=teal bgc-primary c-white"></div>
```

### Responsive Variants

```html
<div class="p-2 md:p-4 lg:p-8"></div>
```

### State Variants (self selector)

```html
<div class="&:hover:bgc-primary-600 &:focus:outline=none"></div>
```

### Parent Selector

```html
<button class="^.card:c-red ^.nav:c-white">Context-aware button</button>
```

### Child Selector

```html
<div class="/span:fw=700 /a:c-primary"><span>Bold</span> — <a>Linked</a></div>
```

### Color Variants & Alpha

```html
<div class="c-primary-600/80 bgc-coral-400 bg-teal/70"></div>
```

---

## Requirements

- **VS Code** `^1.109.0`
- **Maple** runtime (for actual styling):
  ```html
  <script src="https://unpkg.com/@f12io/maple/dist/maple.js"></script>
  ```

---

## Extension Settings

This extension currently contributes no user-configurable settings. All behaviour is automatic once the extension is installed.

---

## Known Limitations

- **JavaScript required.** Maple generates styles at runtime — pages without JavaScript will be unstyled.
- **Relative OKLCH colors** require [browser support](https://caniuse.com/mdn-css_types_color_oklch_relative_syntax) (~90% as of writing).
- **Arbitrary runtime values** (e.g. `w=${progress}%`) can cause unbounded CSSOM growth if values are highly variable.

---

## Release Notes

### 0.0.1

- Initial release
- IntelliSense completions: properties, values, media queries, pseudo-classes, breakpoints
- Hover documentation with generated CSS preview
- Semantic syntax highlighting for all Maple class segments
- Conflict detection diagnostics (warning level)
- LSP architecture with restart command

---

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/f12io/maple-extension).

---

## License

Released under [ROOT](https://github.com/f12io/maple/blob/main/LICENSE) License © [f12.io](https://f12.io)
