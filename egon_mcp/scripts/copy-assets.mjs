// Copies non-TypeScript runtime assets from src/ into dist/ after tsc.
import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

cpSync(
  fileURLToPath(new URL('../src/icons/generated/', import.meta.url)),
  fileURLToPath(new URL('../dist/icons/generated/', import.meta.url)),
  { recursive: true },
);
