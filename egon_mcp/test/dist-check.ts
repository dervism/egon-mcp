import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD_INFO_FILE, sourceHash } from '../src/build-info.js';

export const BUILD_HINT = 'run "npm run build" or "npm test"';

/**
 * Whether dist/ holds a complete build of the current sources: "missing" when
 * no build finished, "stale" when it was built from other sources (a watch
 * run after an edit, or npm test --ignore-scripts), else "current".
 */
export function distState(packageDir = fileURLToPath(new URL('../', import.meta.url))): 'missing' | 'stale' | 'current' {
  const record = join(packageDir, 'dist', BUILD_INFO_FILE);
  if (!existsSync(record)) {
    return 'missing';
  }
  let recorded: unknown;
  try {
    recorded = (JSON.parse(readFileSync(record, 'utf8')) as { sourceHash?: unknown }).sourceHash;
  } catch {
    return 'missing';
  }
  return recorded === sourceHash(packageDir) ? 'current' : 'stale';
}
