// Extracts Egon's built-in icons from the egon.io submodule into a gitignored
// JSON file (see docs/adr/0005-generate-icons-from-submodule.md).
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateIconFile } from '../src/icons/extract.ts';

const source = fileURLToPath(
  new URL(
    '../../modules/egon.io/src/app/tools/icon-set-config/domain/builtInIcons.ts',
    import.meta.url,
  ),
);
const outDir = fileURLToPath(new URL('../src/icons/generated/', import.meta.url));
const outFile = `${outDir}builtin-icons.json`;

if (!existsSync(source)) {
  console.error(
    `Cannot find ${source}.\nRun "git submodule update --init" in the repository root first.`,
  );
  process.exit(1);
}

let count;
try {
  count = generateIconFile(readFileSync(source, 'utf8'), outFile);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
console.log(`Wrote ${count} built-in icons to src/icons/generated/builtin-icons.json`);
