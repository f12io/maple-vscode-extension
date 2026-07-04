// Runs from the root `version` lifecycle (npm version <bump>): copies the
// freshly bumped root version into every workspace package so the extension,
// core library, and prettier plugin always release in lockstep.
import { readFileSync, writeFileSync } from 'node:fs';

const root = JSON.parse(readFileSync('package.json', 'utf8'));
const version = root.version;

const workspacePackages = [
  'packages/core/package.json',
  'packages/prettier-plugin/package.json',
];

for (const file of workspacePackages) {
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  pkg.version = version;
  if (pkg.dependencies?.['@f12io/maple-language-core']) {
    pkg.dependencies['@f12io/maple-language-core'] = version;
  }
  writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`${pkg.name} -> ${version}`);
}

// Keep the root's dependency on the workspace core in lockstep too
if (root.dependencies?.['@f12io/maple-language-core']) {
  root.dependencies['@f12io/maple-language-core'] = version;
  writeFileSync('package.json', JSON.stringify(root, null, 2) + '\n');
}
