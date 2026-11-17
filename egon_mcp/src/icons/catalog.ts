import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ICON_FIX, isIconList } from '../build-info.js';
import type { IconMap, IconSet } from '../egon/types.js';
import type { BuiltInIcon } from './extract.js';

/** The icon set Egon starts with (IconDictionaryService.NAMES_OF_DEFAULT_ICONS). */
export const DEFAULT_ICON_NAMES = {
  actors: ['Person', 'Group', 'System'],
  workObjects: ['Document', 'Folder', 'Call', 'Email', 'Conversation', 'Info'],
} as const;

const GENERATED_FILE = new URL('./generated/builtin-icons.json', import.meta.url);

let builtInCatalog: IconCatalog | undefined;

export class IconCatalog {
  private readonly byLowerName = new Map<string, BuiltInIcon>();

  constructor(private readonly icons: readonly BuiltInIcon[]) {
    for (const icon of icons) {
      this.byLowerName.set(icon.name.toLowerCase(), icon);
    }
  }

  /**
   * The icons extracted from the egon.io submodule (see scripts/generate-icons.mjs),
   * loaded once through fromFile. Tests may point it at another file.
   */
  static builtIn(file: URL = GENERATED_FILE): IconCatalog {
    if (file !== GENERATED_FILE) {
      return IconCatalog.fromFile(file);
    }
    builtInCatalog ??= IconCatalog.fromFile(file);
    return builtInCatalog;
  }

  /** Reads an icon list as the icon generator writes it, after the same check the build makes. */
  static fromFile(file: URL): IconCatalog {
    const path = fileURLToPath(file);
    const fix = `${ICON_FIX} in egon_mcp (needs the egon.io submodule).`;
    let content: string;
    try {
      content = readFileSync(file, 'utf8');
    } catch (error) {
      const { code, message } = error as NodeJS.ErrnoException;
      if (code === 'ENOENT') {
        throw new Error(`Built-in icon data ${path} is missing; ${fix}`);
      }
      // A folder in the way or missing rights: say why, since the fix may need a hand first.
      throw new Error(`Built-in icon data ${path} cannot be read (${message}). Make it readable or remove it, then ${fix}`);
    }
    if (!isIconList(content)) {
      throw new Error(`Built-in icon data ${path} is not usable; ${fix}`);
    }
    return new IconCatalog(JSON.parse(content) as BuiltInIcon[]);
  }

  names(): string[] {
    return this.icons.map((icon) => icon.name);
  }

  all(): readonly BuiltInIcon[] {
    return this.icons;
  }

  get(name: string): BuiltInIcon | undefined {
    return this.byLowerName.get(name.trim().toLowerCase());
  }

  /**
   * Ranks icons for a free-text query: exact name, then name prefix, then name
   * or keyword containing every query word.
   */
  search(query: string, limit = 20): BuiltInIcon[] {
    const normalized = normalize(query);
    if (!normalized) {
      return [];
    }
    const words = normalized.split(' ');
    const scored: { icon: BuiltInIcon; score: number }[] = [];
    for (const icon of this.icons) {
      const name = normalize(icon.name);
      const keywords = icon.keywords.map(normalize);
      let score = 0;
      if (name === normalized) {
        score = 100;
      } else if (keywords.includes(normalized)) {
        score = 60;
      } else if (name.startsWith(normalized)) {
        score = 50;
      } else if (words.every((word) => name.includes(word) || keywords.some((k) => k.includes(word)))) {
        score = 20 + (words.some((word) => name.includes(word)) ? 10 : 0);
      }
      if (score > 0) {
        scored.push({ icon, score });
      }
    }
    return scored
      .sort((a, b) => b.score - a.score || a.icon.name.localeCompare(b.icon.name))
      .slice(0, limit)
      .map((entry) => entry.icon);
  }

  /** Egon's default icon set with the SVG of each icon. */
  defaultIconSet(): IconSet {
    return {
      name: 'default',
      actors: this.iconMap(DEFAULT_ICON_NAMES.actors),
      workObjects: this.iconMap(DEFAULT_ICON_NAMES.workObjects),
    };
  }

  private iconMap(names: readonly string[]): IconMap {
    const map: IconMap = {};
    for (const name of names) {
      map[name] = this.get(name)?.svg ?? '';
    }
    return map;
  }
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}
