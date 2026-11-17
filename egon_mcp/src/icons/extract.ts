import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { basename, dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';

export interface BuiltInIcon {
  name: string;
  svg: string;
  keywords: string[];
}

/**
 * Extracts Egon's built-in icons from the source of
 * `src/app/tools/icon-set-config/domain/builtInIcons.ts`.
 *
 * The file is plain data (string arrays and `new Entry(svg, name, keywords)`
 * calls), so it is evaluated in an empty VM context with minimal stand-ins for
 * Egon's `Entry` and `Dictionary` classes. The context has no Node globals,
 * but a VM context is not a security boundary: only run it on the pinned
 * egon.io submodule.
 */
export function extractBuiltInIcons(typeScriptSource: string): BuiltInIcon[] {
  const javaScript = stripTypeScriptTypes(typeScriptSource)
    .replace(/^\s*import\s[^;]*;\s*$/gm, '')
    .replace(/^export\s+/gm, '');

  const collected: BuiltInIcon[] = [];

  // No parameter properties: scripts/generate-icons.mjs loads this file with
  // Node's strip-only TypeScript support.
  class Entry {
    readonly value: unknown;
    readonly key: unknown;
    readonly keywords: unknown;
    constructor(value: unknown, key: unknown, keywords: unknown = []) {
      this.value = value;
      this.key = key;
      this.keywords = keywords;
    }
  }

  class Dictionary {
    putEntry(entry: Entry): void {
      const name = String(entry.key);
      if (collected.some((icon) => icon.name === name)) {
        return;
      }
      collected.push({
        name,
        svg: String(entry.value),
        keywords: Array.isArray(entry.keywords) ? entry.keywords.map(String) : [],
      });
    }
    set(key: unknown, value: unknown): void {
      this.putEntry(new Entry(value, key));
    }
  }

  runInNewContext(javaScript, Object.freeze({ Entry, Dictionary }), {
    timeout: 2000,
    filename: 'builtInIcons.js',
  });
  return collected;
}

/**
 * Writes the icon list for the build. It refuses an empty list, which means
 * Egon's source has changed shape, and writes through a temporary file renamed
 * into place, so an interrupted run never leaves a cut-off file behind. The
 * temporary name starts with a dot, so the build skips one that a killed run left.
 * With `usable`, the build's own check for the file, it also refuses icons the
 * build would reject, so the generator never writes a file it cannot use.
 */
export function writeIconFile(file: string, icons: BuiltInIcon[], usable?: (content: string) => boolean): void {
  if (icons.length === 0) {
    throw new Error("No built-in icons found in Egon's source; its format may have changed.");
  }
  const content = `${JSON.stringify(icons, null, 1)}\n`;
  if (usable && !usable(content)) {
    throw new Error("Egon's built-in icons do not have the shape the server reads; its format may have changed.");
  }
  mkdirSync(dirname(file), { recursive: true });
  const temporary = join(dirname(file), `.${basename(file)}.${process.pid}.tmp`);
  try {
    writeFileSync(temporary, content);
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}

/** Extracts the icons from Egon's source and writes them (see writeIconFile); returns how many. */
export function generateIconFile(egonSource: string, file: string, usable?: (content: string) => boolean): number {
  let icons: BuiltInIcon[];
  try {
    icons = extractBuiltInIcons(egonSource);
  } catch (error) {
    // The source runs in its own VM context, whose errors fail instanceof Error.
    const reason = (error as { message?: unknown } | null)?.message ?? String(error);
    throw new Error(`Cannot read Egon's built-in icons (${String(reason)}); its format may have changed.`);
  }
  writeIconFile(file, icons, usable);
  return icons.length;
}
