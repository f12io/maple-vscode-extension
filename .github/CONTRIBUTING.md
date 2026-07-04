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

## Repository layout

This is an npm workspace monorepo shipping three artifacts in lockstep:

- **Root** — the VS Code extension (`src/`, bundled to `dist/extension.js`)
- **`packages/core`** — `@f12io/maple-language-core`: editor-agnostic region
  discovery, extraction, and the class layout engine. No `vscode` imports
  allowed here; both other artifacts consume it.
- **`packages/prettier-plugin`** — `@f12io/prettier-plugin-maple`: thin
  Prettier adapter over the core engine.

Tests and the esbuild bundle resolve the workspace packages from source (via
aliases), so no build step is needed during development. `npm run
build:packages` produces the publishable `dist/` output and type-checks both
packages; `npm run typecheck` runs it plus the extension check.

All three artifacts share one version. `npm run release -- patch` bumps the
root, and the `version` lifecycle syncs `packages/*/package.json` before the
release commit; the tag then publishes the extension to the Marketplace and
both packages to npm (via npm trusted publishing).

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
5. Publishes both packages to npm (via npm trusted publishing)
6. Flips the draft release to published
