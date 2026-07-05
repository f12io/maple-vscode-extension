# Maple Extension for VS Code

The official [VS Code extension](https://marketplace.visualstudio.com/items?itemName=f12io.maple-vscode-extension) for the [Maple CSS Engine](https://github.com/f12io/maple). This extension provides a rich, intelligent developer experience for writing Maple utility classes in your HTML, Vue, React, Svelte, and PHP files.

## Features

- **Intelligent Autocomplete**: Get suggestions for Maple classes, aliases, and utility values as you type.
- **Hover Help**: Hover over any Maple class to see the exact CSS it generates.
- **Syntax Highlighting**: Beautiful semantic highlighting that distinguishes utilities, properties, and values, making your classes easier to read.
- **Color Picker**: Live color swatches and the native VS Code color picker for any color utility.
- **Diagnostics & Linting**: Real-time warnings for invalid shades, broken syntax, or conflicting utilities.
- **Multi-line Class Formatter**: A specialized formatter that cleanly wraps your utility classes into multiple lines, grouped automatically by their property type.

## Getting Started

By default, the extension is disabled to avoid interfering with non-Maple projects, **unless** you are working on an HTML file that includes `maple.js` or `maple.min.js` in its `<head>`. In that case, the extension automatically activates.

To manually enable it across your entire workspace, open your `settings.json` (or use the VS Code settings UI) and set:

```json
"maple.enabled": true
```

## Settings

You can customize almost every aspect of the extension to fit your workflow.

### Core Settings

- `maple.enabled` _(default: `false`)_: Master switch to enable Maple extension in the current workspace.
- `maple.exclude` _(default: `["**/node_modules/**", "**/.git/**"]`)_: Glob patterns to disable Maple extension features in specific directories.

### Features

- `maple.features.autoComplete` _(default: `true`)_: Toggle auto-suggestions.
- `maple.features.hoverHelp` _(default: `true`)_: Toggle CSS hover tooltips.
- `maple.features.colorPicker` _(default: `true`)_: Toggle live color swatches.
- `maple.features.diagnostics` _(default: `true`)_: Toggle real-time linting and conflict warnings.
- `maple.features.highlighting` _(default: `"on"`)_: Configure semantic syntax highlighting. Options: `"on"`, `"minimal"`, `"off"`.

### Formatter Settings

The extension includes a built-in formatter specifically for Maple classes (triggered via the **`Maple: Format Classes`** command).

- `maple.format.enabled` _(default: `false`)_: Enables the class formatter.
- `maple.format.onSave` _(default: `false`)_: Automatically format Maple classes on save. Requires `maple.format.enabled` to be `true`.
- `maple.format.maxClassesPerLine` _(default: `4`)_: The maximum number of classes to allow on a single line before wrapping. Set to `1` to force every class onto its own line.

> **Prettier Users**: Because Prettier aggressively squashes HTML classes, formatting them in VS Code can cause conflicts and flickering on save. If you actively use Prettier and "Format on Save", install [@f12io/prettier-plugin-maple](https://www.npmjs.com/package/@f12io/prettier-plugin-maple) instead of enabling the built-in formatter — it applies the same Maple layout inside Prettier's own pass (HTML class attributes, JSX/TS constructs, clsx/cva calls, and opt-in strings), so one formatter produces the final state.

## Comment Directives

You can use special comments directly in your code to control the extension's behavior on the fly:

- **`/* maple-disable-file */`**: Completely disables the extension for the entire file.
- **`/* maple-disable-line */`**: Disables the extension for the current line. (Place at the end of the line).
- **`/* maple-disable-next-line */`**: Disables the extension for the immediately following line.
- **`/* maple-disable */`**: Disables all Maple extension features (autocomplete, hover, diagnostics) for all code that follows this comment in the file.
- **`/* maple-enable */`**: Re-enables Maple extension features after a disable comment.
- **`/* maple */`**: Explicitly opts-in the following expression. Every string literal in it — including ternary arms, concatenation parts, template literals, and interpolated strings — is parsed as Maple classes until the statement ends (`;`, a top-level `,`, or a closing bracket). Objects (`/* maple */ { ... }`) opt in their keys.
  - Example: ``const styles = /* maple */ `bgc-red-500 p-4`;``
  - Example: `const styles = /* maple */ isActive ? 'bgc-red-500 p-4' : 'bgc-gray-300 p-2';`

## Commands

- **`Maple: Format Classes`**: Manually format the Maple classes in the currently active document. Requires `maple.format.enabled: true`.

## Supported Languages

The extension provides features for the following file types (when enabled):

- HTML (`.html`)
- React (`.jsx`, `.tsx`)
- Vue (`.vue`)
- Svelte (`.svelte`)
- Razor (`.razor`, `.cshtml`)
- PHP (`.php`)
- Twig (`.twig`)
- JavaScript/TypeScript (Template literals tagged with `/* maple */`)

## Troubleshooting

If a feature stops working, check the **Maple CSS** output channel
(`View → Output → Maple CSS`) for errors and include them when
[filing an issue](https://github.com/f12io/maple-vscode-extension/issues).

## Contributing

Contributions are welcome! See [contributing docs](https://github.com/f12io/maple-vscode-extension/blob/main/.github/CONTRIBUTING.md) for development setup, project layout, and pull request guidelines.

## License

Released under the [Root Source License (ROOT)](LICENSE), an MIT-style permissive license with an additional distribution condition for systems that can recreate the source on demand. © [f12.io](https://f12.io)
