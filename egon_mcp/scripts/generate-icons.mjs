// Extracts Egon's built-in icons from the egon.io submodule into a gitignored
// JSON file (see docs/adr/0005-generate-icons-from-submodule.md).
// Tests pass both paths: node scripts/generate-icons.mjs [<egon source file> <output file>].
import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isIconList } from '../src/build-info.ts';
import { generateIconFile } from '../src/icons/extract.ts';

const args = process.argv.slice(2);
if ((args.length !== 0 && args.length !== 2) || args.some((arg) => arg.startsWith('-'))) {
  console.error('Usage: node scripts/generate-icons.mjs [<egon source file> <output file>]');
  process.exit(2);
}
const source =
  args[0] ??
  fileURLToPath(new URL('../../modules/egon.io/src/app/tools/icon-set-config/domain/builtInIcons.ts', import.meta.url));
const outFile = args[1] ?? fileURLToPath(new URL('../src/icons/generated/builtin-icons.json', import.meta.url));

if (!existsSync(source)) {
  console.error(`Cannot find ${source}. Run "git submodule update --init" in the repository root first.`);
  process.exit(1);
}

let count;
try {
  count = generateIconFile(readFileSync(source, 'utf8'), outFile, isIconList);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
console.log(`Wrote ${count} built-in icons to ${relative(process.cwd(), outFile)}`);
