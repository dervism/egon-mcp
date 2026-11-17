// Last build step, after tsc succeeded: see completeBuild in src/build-info.ts.
import { fileURLToPath } from 'node:url';
import { completeBuild } from '../dist/build-info.js';

try {
  completeBuild(fileURLToPath(new URL('../', import.meta.url)));
} catch (error) {
  console.error(`Build incomplete: ${error.message}`);
  process.exit(1);
}
