/**
 * NET0ZE release staging script.
 *
 * After `npx tauri build` produces the release artifacts, this script copies
 * them into a dedicated root-level `releases/` layout, generates a root-level
 * quick-launcher (RUN_NET0ZE.cmd) and writes EXECUTABLES_LOCATION.md with the
 * exact relative/absolute paths and sizes of every generated executable.
 *
 * Usage:
 *   node scripts/stage-release.mjs        (stage existing artifacts)
 *   npm run dist:release                  (tauri build + stage, recommended)
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel) => JSON.parse(readFileSync(path.join(root, rel), 'utf8'));

const config = readJson('src-tauri/tauri.conf.json');
const product = config.productName;
const version = config.version;
const arch = 'x64';

const names = {
  nsis: `${product}_${version}_${arch}-setup.exe`,
  msi: `${product}_${version}_${arch}_en-US.msi`,
  exe: 'netoze-desktop.exe',
  loader: 'WebView2Loader.dll',
};

const sources = {
  nsis: path.join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis', names.nsis),
  msi: path.join(root, 'src-tauri', 'target', 'release', 'bundle', 'msi', names.msi),
  exe: path.join(root, 'src-tauri', 'target', 'release', names.exe),
  loader: path.join(root, 'src-tauri', 'resources', names.loader),
};

const targets = {
  nsis: path.join(root, 'releases', 'Installer'),
  msi: path.join(root, 'releases', 'Enterprise_MSI'),
  exe: path.join(root, 'releases', 'Portable_EXE'),
};

const fmt = (bytes) => `${(bytes / 1048576).toFixed(2)} MB (${bytes.toLocaleString('en-US')} bytes)`;

function resolveSource(key) {
  if (existsSync(sources[key])) return sources[key];
  const dir = path.dirname(sources[key]);
  if (!existsSync(dir)) return null;
  const stem = path.basename(sources[key]).split('.')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hit = readdirSync(dir).find((f) => new RegExp(`^${stem}.*\\.(exe|msi)$`, 'i').test(f));
  return hit ? path.join(dir, hit) : null;
}

function stage(key, destDir) {
  const src = resolveSource(key);
  if (!src || !existsSync(src)) {
    console.error(`[stage-release] MISSING source artifact for ${key}: ${sources[key]}`);
    return null;
  }
  mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, path.basename(src));
  copyFileSync(src, dest);
  const size = statSync(dest).size;
  console.log(`[stage-release] staged ${path.relative(root, dest)} (${fmt(size)})`);
  return { src, dest, size, name: path.basename(dest) };
}

const staged = {
  installer: stage('nsis', targets.nsis),
  msi: stage('msi', targets.msi),
  portable: stage('exe', targets.exe),
  loader: stage('loader', targets.exe),
};

if (!staged.installer || !staged.msi || !staged.portable) {
  console.error('[stage-release] FAILED: one or more release artifacts were not found.');
  console.error('[stage-release] Run `npm run dist:release` (tauri build + stage) first.');
  process.exit(1);
}

const rel = (p) => path.relative(root, p).replaceAll('\\', '/');

const lines = [
  `# NET0ZE — Executable Locations`,
  ``,
  `Generated automatically by \`scripts/stage-release.mjs\` during the release build.`,
  `Product: ${product} v${version} (${arch})   |   Build machine path: ${root}`,
  `Generated: ${new Date().toISOString()}`,
  ``,
  `## Staged Release Artifacts (root \`releases/\` layout)`,
  ``,
  `### 1. Installer — PRIMARY USER DOWNLOAD`,
  `- Relative: \`${rel(staged.installer.dest)}\``,
  `- Absolute: \`${staged.installer.dest}\``,
  `- Size: ${fmt(staged.installer.size)}`,
  `- Usage: Single-file normal-user installer. Contains the NET0ZE executable, WebView2Loader.dll, and the official WebView2 Evergreen bootstrapper (registry-gated). No other downloads required.`,
  ``,
  `### 2. Portable EXE — DEVELOPERS / QUICK TESTING`,
  `- Relative: \`${rel(staged.portable.dest)}\``,
  `- Absolute: \`${staged.portable.dest}\``,
  `- Size: ${fmt(staged.portable.size)}`,
  `- Usage: Standalone executable; no installation required. Launch via the root-level \`RUN_NET0ZE.cmd\` quick launcher or directly.`,
  ``,
  `### 3. Enterprise MSI — ENTERPRISE DEPLOYMENT`,
  `- Relative: \`${rel(staged.msi.dest)}\``,
  `- Absolute: \`${staged.msi.dest}\``,
  `- Size: ${fmt(staged.msi.size)}`,
  `- Usage: Optional MSI package for enterprise/group-policy deployment. Not required for normal users.`,
  ``,
  `### Supporting file`,
  `- Relative: \`${rel(staged.loader.dest)}\``,
  `- Absolute: \`${staged.loader.dest}\``,
  `- Size: ${fmt(staged.loader.size)}`,
  `- Usage: Official Microsoft WebView2 loader DLL, shipped alongside the portable EXE.`,
  ``,
  `## Raw Build Outputs (source locations)`,
  `- Portable EXE: \`src-tauri/target/release/netoze-desktop.exe\``,
  `- NSIS installer: \`src-tauri/target/release/bundle/nsis/${names.nsis}\``,
  `- MSI installer: \`src-tauri/target/release/bundle/msi/${names.msi}\``,
  `- WebView2 loader: \`src-tauri/resources/WebView2Loader.dll\``,
  ``,
  `## Quick Launch`,
  `- Double-click \`RUN_NET0ZE.cmd\` (project root) to start the portable build directly.`,
  ``,
  `## Rebuilding`,
  `- \`npm run dist:release\` — builds frontend + Tauri release bundles, then stages everything into this layout automatically.`,
  `- \`npm run stage:release\` — stages already-built artifacts without rebuilding.`,
];
writeFileSync(path.join(root, 'EXECUTABLES_LOCATION.md'), lines.join('\n'), 'utf8');
console.log('[stage-release] wrote EXECUTABLES_LOCATION.md');

const bat = [
  '@echo off',
  'rem NET0ZE quick launcher - starts the portable build staged under releases\\Portable_EXE',
  'setlocal',
  'set "EXE=%~dp0releases\\Portable_EXE\\netoze-desktop.exe"',
  'if not exist "%EXE%" (',
  '    echo [NET0ZE] Portable executable not found:',
  '    echo   %EXE%',
  '    echo [NET0ZE] Build and stage it first with:  npm run dist:release',
  '    pause',
  '    exit /b 1',
  ')',
  `echo [NET0ZE] Launching ${product} ${version} ...`,
  'start "" "%EXE%"',
  'exit /b 0',
].join('\r\n');
writeFileSync(path.join(root, 'RUN_NET0ZE.cmd'), bat, 'utf8');
console.log('[stage-release] wrote RUN_NET0ZE.cmd');

console.log('[stage-release] DONE. Artifacts staged under releases/');
