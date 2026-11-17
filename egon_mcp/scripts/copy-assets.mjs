// Runs after tsc succeeded: copies non-TypeScript runtime assets from src/ into
// dist/ and turns the note from record-sources.mjs into the build record.
import { cpSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BUILD_INFO_FILE, PENDING_BUILD_INFO_FILE } from '../dist/build-info.js';

const src = fileURLToPath(new URL('../src/', import.meta.url));
const dist = fileURLToPath(new URL('../dist/', import.meta.url));

cpSync(`${src}icons/generated/`, `${dist}icons/generated/`, { recursive: true });
renameSync(`${dist}${PENDING_BUILD_INFO_FILE}`, `${dist}${BUILD_INFO_FILE}`);
