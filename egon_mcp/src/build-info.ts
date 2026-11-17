// Node loads this file before tsc runs (scripts/record-sources.mjs, through type
// stripping), so it must stay erasable TypeScript and import only node: modules.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** File in dist/ that records which inputs a complete build was made from. */
export const BUILD_INFO_FILE = 'build-info.json';
/** The record while tsc runs; finishBuildRecord renames it to BUILD_INFO_FILE. */
export const PENDING_BUILD_INFO_FILE = 'build-info.pending.json';
/** Folders below src/ that the build copies into dist/ as they are. */
export const ASSET_DIRS = ['icons/generated'];

/** Package files that change what tsc emits. */
const BUILD_SETTINGS = ['package.json', 'tsconfig.json', 'tsconfig.build.json'];

/**
 * The TypeScript files below `srcDir` that tsc compiles, without tests. Like
 * tsc it follows links to files and folders; it skips hidden files and folders
 * and dangling links, which editors leave behind (Emacs lock links, for
 * example). Relative paths with "/" separators, sorted.
 */
export function sourceFiles(srcDir: string): string[] {
  return walk(srcDir).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'));
}

/**
 * A hash over every input of the build in `packageDir`: package.json, both
 * tsconfig files, the sources and the asset folders, each with its path and
 * content. The build records it, so a test can tell whether dist/ was built
 * from the inputs it sees.
 */
export function sourceHash(packageDir: string): string {
  const hash = createHash('sha256');
  const add = (name: string, path: string) => hash.update(`${name}\0`).update(readFileSync(path)).update('\0');
  for (const name of BUILD_SETTINGS) {
    add(name, join(packageDir, name));
  }
  const srcDir = join(packageDir, 'src');
  for (const file of sourceFiles(srcDir)) {
    add(`src/${file}`, join(srcDir, file));
  }
  for (const assets of ASSET_DIRS) {
    const dir = join(srcDir, assets);
    for (const file of existsSync(dir) ? walk(dir) : []) {
      add(`src/${assets}/${file}`, join(dir, file));
    }
  }
  return hash.digest('hex');
}

/** First build step: forgets the last record and notes the inputs this build starts from. */
export function startBuildRecord(packageDir: string): void {
  const dist = join(packageDir, 'dist');
  rmSync(join(dist, BUILD_INFO_FILE), { force: true });
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, PENDING_BUILD_INFO_FILE), `${JSON.stringify({ sourceHash: sourceHash(packageDir) }, null, 2)}\n`);
}

/** Last build step, once tsc and the asset copy succeeded: the note becomes the record. */
export function finishBuildRecord(packageDir: string): void {
  const dist = join(packageDir, 'dist');
  renameSync(join(dist, PENDING_BUILD_INFO_FILE), join(dist, BUILD_INFO_FILE));
}

/** Regular files below `dir`, following links, skipping hidden names, dangling links and loops. */
function walk(dir: string, prefix = '', visited = new Set<string>()): string[] {
  const real = realpathSync(dir);
  if (visited.has(real)) {
    return [];
  }
  visited.add(real);
  const files: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.')) {
      continue;
    }
    const path = join(dir, name);
    let stats;
    try {
      stats = statSync(path);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      files.push(...walk(path, `${prefix}${name}/`, visited));
    } else if (stats.isFile()) {
      files.push(`${prefix}${name}`);
    }
  }
  return files.sort();
}
