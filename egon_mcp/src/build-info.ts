import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** File in dist/ that records which sources a complete build was made from. */
export const BUILD_INFO_FILE = 'build-info.json';
/** The record while tsc runs; the build renames it to BUILD_INFO_FILE once it succeeds. */
export const PENDING_BUILD_INFO_FILE = 'build-info.pending.json';

const COMPILER_SETTINGS = ['tsconfig.json', 'tsconfig.build.json'];

/**
 * The TypeScript files below `srcDir` that tsc compiles: regular files only,
 * without tests and without hidden files or folders (editors leave those,
 * such as Emacs lock links). Relative paths with "/" separators, sorted.
 */
export function sourceFiles(srcDir: string): string[] {
  return readdirSync(srcDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts'))
    .map((entry) => relative(srcDir, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .filter((file) => !file.split('/').some((part) => part.startsWith('.')))
    .sort();
}

/**
 * A hash over the compiler settings and every source file of the package in
 * `packageDir`, with each file's path and content. The build records it, so a
 * test can tell whether dist/ was built from the sources it sees.
 */
export function sourceHash(packageDir: string): string {
  const hash = createHash('sha256');
  const add = (name: string, path: string) => hash.update(`${name}\0`).update(readFileSync(path)).update('\0');
  for (const name of COMPILER_SETTINGS) {
    add(name, join(packageDir, name));
  }
  const srcDir = join(packageDir, 'src');
  for (const file of sourceFiles(srcDir)) {
    add(`src/${file}`, join(srcDir, file));
  }
  return hash.digest('hex');
}
