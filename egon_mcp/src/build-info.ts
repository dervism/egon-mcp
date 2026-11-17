// Node loads this file before tsc runs (scripts/record-sources.mjs, through type
// stripping), so it must stay erasable TypeScript and import only node: modules.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** File in dist/ that records which inputs a complete build was made from. */
export const BUILD_INFO_FILE = 'build-info.json';
/** The record while tsc runs; finishBuildRecord renames it to BUILD_INFO_FILE. */
export const PENDING_BUILD_INFO_FILE = 'build-info.pending.json';
/**
 * Folders below src/ that the build copies into dist/ as they are, the files
 * the server cannot run without, and how to make them when they are missing.
 */
export const ASSETS = [
  {
    dir: 'icons/generated',
    required: ['builtin-icons.json'],
    // npm runs this as the prebuild step, but skips it when scripts are ignored.
    hint: 'run "npm run generate:icons"',
  },
];

/**
 * Files that change what tsc emits: the package and compiler settings, and the
 * package file of the TypeScript compiler that is installed and so actually
 * runs (the lockfile only says which one should be). A missing one counts as absent.
 */
const BUILD_SETTINGS = ['package.json', 'tsconfig.json', 'tsconfig.build.json', 'node_modules/typescript/package.json'];
/** Folders that tsc never picks sources from. */
const PACKAGE_FOLDERS = new Set(['node_modules', 'bower_components', 'jspm_packages']);

/**
 * The TypeScript files below `srcDir` that tsc compiles, without tests. Like
 * tsc it follows links to files and folders and skips package folders and
 * folders it cannot read. It also skips hidden files and folders and dangling
 * links, which editors leave behind (Emacs lock links, for example). Relative
 * paths with "/" separators, sorted.
 */
export function sourceFiles(srcDir: string): string[] {
  return walk(srcDir).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'));
}

/**
 * A hash over the inputs of the build in `packageDir`: package.json, both
 * tsconfig files, the installed compiler's package file, the sources and the
 * asset folders, each with its path and content. The build records it, so a
 * test can tell whether dist/ was built from the inputs it sees.
 */
export function sourceHash(packageDir: string): string {
  const hash = createHash('sha256');
  // Each entry is its name, then "-" for a missing file or "+", the length and
  // the content, so no content can look like another file or a missing one.
  const add = (name: string, path: string) => {
    hash.update(`${name}\0`);
    if (existsSync(path)) {
      const content = readFileSync(path);
      hash.update(`+${content.length}\0`).update(content);
    } else {
      hash.update('-');
    }
  };
  for (const name of BUILD_SETTINGS) {
    add(name, join(packageDir, name));
  }
  const srcDir = join(packageDir, 'src');
  for (const file of sourceFiles(srcDir)) {
    add(`src/${file}`, join(srcDir, file));
  }
  for (const { dir } of ASSETS) {
    const from = join(srcDir, dir);
    for (const file of existsSync(from) ? walk(from) : []) {
      add(`src/${dir}/${file}`, join(from, file));
    }
  }
  return hash.digest('hex');
}

/**
 * First build step: forgets the last record and the copied assets, so a build
 * that fails or skips the copy cannot pass on an earlier one, and notes the
 * inputs this build starts from.
 */
export function startBuildRecord(packageDir: string): void {
  const dist = join(packageDir, 'dist');
  rmSync(join(dist, BUILD_INFO_FILE), { force: true });
  for (const { dir } of ASSETS) {
    rmSync(join(dist, dir), { recursive: true, force: true });
  }
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, PENDING_BUILD_INFO_FILE), `${JSON.stringify({ sourceHash: sourceHash(packageDir) }, null, 2)}\n`);
}

/**
 * Copies the asset folders from src/ into cleared folders in dist/, file by
 * file from the same walk sourceHash uses, so dist/ holds exactly what was
 * hashed: links copied as the files they point to, nothing hidden or stale.
 * Fails when a required file is missing, since the server cannot run without it.
 */
export function copyAssets(packageDir: string): void {
  for (const { dir, required, hint } of ASSETS) {
    const from = join(packageDir, 'src', dir);
    const to = join(packageDir, 'dist', dir);
    rmSync(to, { recursive: true, force: true });
    const files = existsSync(from) ? walk(from) : [];
    for (const file of required) {
      if (!files.includes(file)) {
        throw new Error(`src/${dir}/${file} is missing; ${hint}.`);
      }
    }
    for (const file of files) {
      mkdirSync(dirname(join(to, file)), { recursive: true });
      copyFileSync(join(from, file), join(to, file));
    }
  }
}

/**
 * Last build step, after tsc succeeded: copies the assets, then records the
 * build. Missing assets stop it before the record is written.
 */
export function completeBuild(packageDir: string): void {
  copyAssets(packageDir);
  finishBuildRecord(packageDir);
}

/** Turns the note from startBuildRecord into the record; completeBuild calls it once the assets are in place. */
export function finishBuildRecord(packageDir: string): void {
  const dist = join(packageDir, 'dist');
  renameSync(join(dist, PENDING_BUILD_INFO_FILE), join(dist, BUILD_INFO_FILE));
}

/**
 * Regular files below `dir`, following links. Skips hidden names, package
 * folders, dangling links, link loops and, below `dir`, unreadable folders;
 * `dir` itself must be readable.
 */
function walk(dir: string, prefix = '', visited = new Set<string>()): string[] {
  let real: string;
  let names: string[];
  try {
    real = realpathSync(dir);
    names = readdirSync(dir);
  } catch (error) {
    if (prefix === '') {
      throw error;
    }
    return [];
  }
  if (visited.has(real)) {
    return [];
  }
  visited.add(real);
  const files: string[] = [];
  for (const name of names.sort()) {
    if (name.startsWith('.') || PACKAGE_FOLDERS.has(name)) {
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
