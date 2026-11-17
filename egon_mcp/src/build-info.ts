import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';

/** File in dist/ where the build records which sources it was made from. */
export const BUILD_INFO_FILE = 'build-info.json';

/**
 * A hash over every TypeScript source file below `srcDir` (tests left out),
 * covering each file's relative path and content. The build stores it, so a
 * test can tell whether dist/ was built from the sources it sees.
 */
export function sourceHash(srcDir: string): string {
  const files = (readdirSync(srcDir, { recursive: true }) as string[])
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .map((file) => file.split(sep).join('/'))
    .sort();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(`${file}\0`).update(readFileSync(join(srcDir, file))).update('\0');
  }
  return hash.digest('hex');
}
