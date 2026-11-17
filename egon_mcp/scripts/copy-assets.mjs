// Last build step, after tsc succeeded: copies the asset folders from src/ into
// dist/, then marks the build complete (finishBuildRecord in src/build-info.ts).
import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ASSET_DIRS, finishBuildRecord } from '../dist/build-info.js';

const packageDir = fileURLToPath(new URL('../', import.meta.url));

for (const assets of ASSET_DIRS) {
  cpSync(`${packageDir}src/${assets}/`, `${packageDir}dist/${assets}/`, { recursive: true });
}
finishBuildRecord(packageDir);
