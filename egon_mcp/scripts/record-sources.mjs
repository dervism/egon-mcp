// First build step, before tsc: see startBuildRecord in src/build-info.ts.
import { fileURLToPath } from 'node:url';
import { startBuildRecord } from '../src/build-info.ts';

startBuildRecord(fileURLToPath(new URL('../', import.meta.url)));
