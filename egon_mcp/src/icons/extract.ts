import { stripTypeScriptTypes } from 'node:module';
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
