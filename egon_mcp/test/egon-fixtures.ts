import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const egonTestFiles = new URL(
  '../../modules/egon.io/src/app/tools/import/services/test-files/',
  import.meta.url,
);

export const egonSourceRoot = fileURLToPath(new URL('../../modules/egon.io/', import.meta.url));

/** Reads one of Egon's own sample export files from the egon.io submodule. */
export function readEgonFixture(name: string): string {
  return readFileSync(new URL(name, egonTestFiles), 'utf8');
}
