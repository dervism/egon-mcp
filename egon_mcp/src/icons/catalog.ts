import { readFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSystemErrorMessage } from 'node:util';
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

/**
 * Text for an error from reading a file: the system's words for system errors,
 * without the path that Node's own message repeats, else the message itself.
 */
export function readErrorReason(error: unknown): string {
  const { code, errno, message } = (error ?? {}) as NodeJS.ErrnoException;
  // libuv error numbers are negative integers; getSystemErrorMessage throws for anything else.
  if (Number.isSafeInteger(errno) && (errno as number) < 0) {
    return `${code}: ${getSystemErrorMessage(errno as number)}`;
  }
  // Node's own messages may end in a period, which would land before a closing bracket.
  return typeof message === 'string' ? message.replace(/\.$/, '') : 'unknown error';
}

/**
 * Whether an error from the reads and stats in this module is a mistake in the
 * call itself, such as a NUL in a path (ERR_INVALID_ARG_VALUE), which no change
 * to the files can fix. For these calls Node throws those as TypeErrors, while
 * file system, data and environment problems (ENOENT, ERR_STRING_TOO_LONG,
 * ERR_ACCESS_DENIED under --permission) are plain Errors.
 */
export function isArgumentError(error: unknown): boolean {
  return error instanceof TypeError;
}

/** Like statSync, but undefined for a path it cannot look at; argument errors pass on. */
function statIfPossible(path: string) {
  try {
    return statSync(path, { throwIfNoEntry: false });
  } catch (error) {
    if (isArgumentError(error)) {
      throw error;
    }
    return undefined;
  }
}

/**
 * The closest existing ancestor of `path` if it is a file instead of a folder.
 * A folder it cannot look into counts as no file in the way. Argument errors,
 * such as a NUL in the path, pass on.
 */
export function blockingAncestor(path: string): string | undefined {
  for (let dir = dirname(path); dir !== dirname(dir); dir = dirname(dir)) {
    const stats = statIfPossible(dir);
    if (stats) {
      return stats.isDirectory() ? undefined : dir;
    }
  }
  return undefined;
}

const ICON_DATA_FIX = `${ICON_FIX} in egon_mcp (needs the egon.io submodule).`;

/**
 * The error to report when the icon data at `path` could not be read. A file
 * standing where a folder above it should be shows as ENOTDIR on POSIX and as
 * a missing path on Windows; both get the same message, which names that file.
 */
export function iconReadError(path: string, error: unknown): Error {
  const { code } = (error ?? {}) as NodeJS.ErrnoException;
  // Only these two codes can mean a file in the way; other errors are reported as they are.
  const blocker = code === 'ENOENT' || code === 'ENOTDIR' ? blockingAncestor(path) : undefined;
  if (code === 'ENOENT' && !blocker) {
    return new Error(`Built-in icon data ${path} is missing; ${ICON_DATA_FIX}`, { cause: error });
  }
  const reason = blocker ? `${blocker} is a file, not a folder` : readErrorReason(error);
  return new Error(
    `Built-in icon data ${path} cannot be read (${reason}). ` +
      `Fix what stops it from being read, such as access rights or a file or folder in the way, then ${ICON_DATA_FIX}`,
    { cause: error },
  );
}

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
    let content: string;
    try {
      content = readFileSync(file, 'utf8');
    } catch (error) {
      // An argument error, such as a NUL in the path, is not a data problem: pass it on.
      throw isArgumentError(error) ? error : iconReadError(path, error);
    }
    if (!isIconList(content)) {
      throw new Error(`Built-in icon data ${path} is not usable; ${ICON_DATA_FIX}`);
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
