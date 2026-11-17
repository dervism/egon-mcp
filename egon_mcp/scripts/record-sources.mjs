// Runs before tsc: forgets the last build record and notes which sources this
// build starts from. copy-assets.mjs makes the note the record once tsc succeeded,
// so a failed or partial build never leaves a record that matches.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BUILD_INFO_FILE, PENDING_BUILD_INFO_FILE, sourceHash } from '../src/build-info.ts';

const packageDir = fileURLToPath(new URL('../', import.meta.url));
const dist = `${packageDir}dist/`;

rmSync(`${dist}${BUILD_INFO_FILE}`, { force: true });
mkdirSync(dist, { recursive: true });
writeFileSync(`${dist}${PENDING_BUILD_INFO_FILE}`, `${JSON.stringify({ sourceHash: sourceHash(packageDir) }, null, 2)}\n`);
