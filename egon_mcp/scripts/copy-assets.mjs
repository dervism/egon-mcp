// Runs after tsc: copies non-TypeScript runtime assets from src/ into dist/ and
// records which sources dist/ was built from.
import { cpSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BUILD_INFO_FILE, sourceHash } from '../dist/build-info.js';

const src = fileURLToPath(new URL('../src/', import.meta.url));
const dist = fileURLToPath(new URL('../dist/', import.meta.url));

cpSync(`${src}icons/generated/`, `${dist}icons/generated/`, { recursive: true });
writeFileSync(`${dist}${BUILD_INFO_FILE}`, `${JSON.stringify({ sourceHash: sourceHash(src) }, null, 2)}\n`);
