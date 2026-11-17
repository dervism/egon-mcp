// Last build step, after tsc succeeded: copies the asset folders into dist/,
// then marks the build complete (see copyAssets and finishBuildRecord in
// src/build-info.ts).
import { fileURLToPath } from 'node:url';
import { copyAssets, finishBuildRecord } from '../dist/build-info.js';

const packageDir = fileURLToPath(new URL('../', import.meta.url));

copyAssets(packageDir);
finishBuildRecord(packageDir);
