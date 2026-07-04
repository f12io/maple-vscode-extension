# Contributing

Thanks for your interest in improving the Maple VS Code Extension!

## Getting started

```bash
git clone https://github.com/f12io/maple-vscode-extension.git
cd maple-vscode-extension
npm install
```

Open the folder in VS Code and press `F5` ("Run Extension") to launch an
Extension Development Host with the extension loaded against the sample files
in `tests/`.

## Project layout

- `src/extension.ts` — activation entry point; registers all providers
- `src/providers/` — one file per editor feature (completion, hover, diagnostics, semantic tokens, colors, decorations, formatter)
- `src/services/languages/` — per-framework class extraction (HTML, React, Vue, Svelte, Angular, PHP, Twig, Razor); all extend `BaseLanguageService`
- `src/helpers/` — parsing, caching, config, and logging utilities
- `src/constants/` — shared regexes and language definitions
- `tests/` — Vitest suites plus fixture files for each supported framework
- `__mocks__/vscode.ts` — the VS Code API mock used by the tests

## Development workflow

| Command             | What it does                      |
| ------------------- | --------------------------------- |
| `npm run watch`     | Bundle with esbuild in watch mode |
| `npm run typecheck` | Type-check without emitting       |
| `npm run lint`      | ESLint                            |
| `npm test`          | Run the Vitest suite              |
| `npm run package`   | Build a `.vsix` with vsce         |

## Pull requests

1. Keep changes focused; one feature or fix per PR.
2. `npm run lint`, `npm run typecheck`, and `npm test` must pass.
3. Add or update tests for behavior changes — especially extraction logic in
   `src/services/languages/`, which is covered by fixture files in `tests/`.
4. Update `CHANGELOG.md` under the `[Unreleased]` heading.

## Reporting issues

Please include the file type you were editing, a minimal snippet that
reproduces the problem, and any errors shown in the "Maple CSS" output channel
(`View → Output → Maple CSS`).

## Releasing (maintainers)

Releases are fully automated and mirror the Maple engine's release flow. From
an up-to-date, clean `main` checkout:

```bash
npm run release -- patch   # or minor / major / an explicit version
```

This runs the preversion gate (clean main synced with origin, lint, typecheck,
tests, production bundle), bumps the version, commits, tags `vX.Y.Z`, and
pushes. The tag triggers `.github/workflows/release.yml`, which:

1. Validates the tag points at `origin/main` HEAD and matches
   `package.json`/`package-lock.json`
2. Lints, type-checks, tests, and packages the `.vsix`
3. Creates a draft GitHub release with generated notes and the `.vsix` attached
4. Publishes to the VS Code Marketplace (and Open VSX if configured)
5. Flips the draft release to published
