import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { parseStoryFile } from '../egon/parse.js';
import { fileNameFor, toEgnJson, type EgonFormat } from '../egon/serialize.js';
import type { Scope } from '../egon/types.js';
import { renderStorySvg } from '../render/svg.js';
import { narrativeMarkdown } from '../story/narrate.js';
import { Story } from '../story/story.js';

export class WorkspaceError extends Error {
  override name = 'WorkspaceError';
}

export type SaveFormat = 'egn' | 'egn.svg' | 'svg' | 'markdown';

export interface StoryEntry {
  id: string;
  story: Story;
  /** Path relative to the workspace root that the story was opened from or last saved to as .egn / .egn.svg. */
  path?: string;
  /** The .egn layout of that file, used whenever the story is saved back to it. */
  layout?: EgonFormat;
  dirty: boolean;
}

/** What a story last read from or wrote to a file. */
interface SeenContent {
  hash: string;
  wrote: boolean;
}

export interface SaveOptions {
  path?: string;
  format?: SaveFormat;
  /** Replace an existing file that this story did not open or write, or that changed since it did. */
  overwrite?: boolean;
  /** .egn layout; default: the story's own layout for its own file, else the layout of the Egon file replaced, else the server's. */
  layout?: EgonFormat;
}

export interface SaveResult {
  path: string;
  format: SaveFormat;
  bytes: number;
  /** The .egn layout used, for .egn and .egn.svg files. */
  layout?: EgonFormat;
}

const STORY_FILE = /\.(egn|dst)(\s*\(\d+\))?(\.svg)?$/i;
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);
const MAX_LISTED_FILES = 500;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

/**
 * The stories open in this server, plus file access confined to one root
 * directory (see docs/adr/0006-workspace-root-sandbox.md).
 */
export class Workspace {
  private readonly entries = new Map<string, StoryEntry>();
  /**
   * For each open story, the files it opened or wrote (see fileKey) with a hash
   * of the content it read or wrote. A story may replace a file without
   * `overwrite` only while the file still holds that content.
   */
  private readonly seen = new Map<string, Map<string, SeenContent>>();
  readonly root: string;
  /** Layout of written .egn files (docs/adr/0007-write-egon-3-file-layout.md). */
  readonly egonFormat: EgonFormat;

  constructor(root: string, options: { egonFormat?: EgonFormat } = {}) {
    this.egonFormat = options.egonFormat ?? 'egon3';
    if (!existsSync(root)) {
      throw new WorkspaceError(`The workspace root ${root} does not exist.`);
    }
    this.root = realpathSync(root);
    if (parse(this.root).root === this.root) {
      throw new WorkspaceError(
        `Refusing to use the file system root ${this.root} as workspace. Start the server with --root <dir> or set EGON_MCP_ROOT.`,
      );
    }
  }

  create(input: { title: string; description?: string; scope?: Scope }): StoryEntry {
    return this.add(Story.create(input), undefined, true);
  }

  open(path: string): StoryEntry {
    const absolute = this.resolveExisting(path);
    if (!statSync(absolute).isFile()) {
      throw new WorkspaceError(`${path} is not a regular file.`);
    }
    if (lstatSync(absolute).size > MAX_FILE_BYTES) {
      throw new WorkspaceError(`${path} is larger than 20 MB.`);
    }
    const bytes = readFileSync(absolute);
    const doc = parseStoryFile(bytes.toString('utf8'), absolute);
    const relativePath = this.relative(absolute);
    const keepPath = /\.egn(\.svg)?$/i.test(relativePath) ? relativePath : undefined;
    const entry = this.add(Story.fromDocument(doc), keepPath, false);
    entry.layout = layoutOf(doc.version);
    this.remember(entry.id, absolute, bytes, false);
    return entry;
  }

  /** Registers a story that was built in memory, for example by build_story. */
  adopt(story: Story): StoryEntry {
    return this.add(story, undefined, true);
  }

  importText(content: string, fileName = 'story.egn'): StoryEntry {
    return this.add(Story.fromDocument(parseStoryFile(content, fileName)), undefined, true);
  }

  get(id: string): StoryEntry {
    const entry = this.entries.get(id);
    if (!entry) {
      const open = [...this.entries.keys()];
      throw new WorkspaceError(
        `No open story has the id "${id}".` + (open.length > 0 ? ` Open stories: ${open.join(', ')}.` : ' No stories are open.'),
      );
    }
    return entry;
  }

  list(): StoryEntry[] {
    return [...this.entries.values()];
  }

  close(id: string): void {
    this.get(id);
    this.entries.delete(id);
    // Ids are reused, so a later story with the same title must not inherit these files.
    this.seen.delete(id);
  }

  touch(id: string): void {
    this.get(id).dirty = true;
  }

  /**
   * Writes a story to disk. The format follows the file extension. Without a
   * path, the story goes back to the file it came from, else to "<title>.egn".
   * An existing file is only replaced if it still holds what this story last
   * read from or wrote to it, or with `overwrite`. Without `layout`, a story
   * saved back to its own file keeps the layout it last opened or saved that
   * file with, and any other Egon file keeps its layout (ADR 15).
   */
  save(id: string, options: SaveOptions): SaveResult {
    const entry = this.get(id);
    const path = options.path ?? entry.path ?? fileNameFor(entry.story.title, extensionFor(options.format ?? 'egn'));
    const format = options.format ?? formatFromPath(path);
    if (formatFromPath(path) !== format) {
      throw new WorkspaceError(`The extension of ${path} does not match the format ${format}.`);
    }
    const absolute = this.resolveForWrite(path);
    const egonFile = format === 'egn' || format === 'egn.svg';
    const exists = lexists(absolute);
    if (exists && !options.overwrite) {
      this.assertMayReplace(absolute, path, entry);
    }
    const layout =
      options.layout ??
      (this.isOwnFile(entry, absolute) ? entry.layout : undefined) ??
      (exists && egonFile ? layoutOfFile(absolute) : undefined) ??
      this.egonFormat;
    const content = this.serialize(entry.story, format, layout);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
    this.remember(id, absolute, content, true);
    const relativePath = this.relative(absolute);
    const result: SaveResult = { path: relativePath, format, bytes: Buffer.byteLength(content) };
    if (egonFile) {
      entry.path = relativePath;
      entry.layout = layout;
      entry.dirty = false;
      result.layout = layout;
    }
    return result;
  }

  serialize(story: Story, format: SaveFormat, layout: EgonFormat = this.egonFormat): string {
    const doc = story.toDocument();
    switch (format) {
      case 'egn':
        return toEgnJson(doc, { format: layout });
      case 'egn.svg':
        return renderStorySvg(doc, { title: true, embedStory: true, whiteBackground: true, format: layout });
      case 'svg':
        return renderStorySvg(doc, { title: true, whiteBackground: true });
      case 'markdown':
        return narrativeMarkdown(doc);
    }
  }

  /** Egon story files (.egn, .dst, .egn.svg, .dst.svg) below `directory`, relative to the root. */
  listFiles(directory = '.'): string[] {
    const start = this.resolveExisting(directory);
    const found: string[] = [];
    const walk = (dir: string, depth: number) => {
      if (depth > 8 || found.length >= MAX_LISTED_FILES) {
        return;
      }
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (found.length >= MAX_LISTED_FILES) {
          return;
        }
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && !SKIPPED_DIRECTORIES.has(entry.name)) {
            walk(full, depth + 1);
          }
        } else if (entry.isFile() && STORY_FILE.test(entry.name)) {
          found.push(this.relative(full));
        }
      }
    };
    walk(start, 0);
    return found;
  }

  /** Records the content this story read from or wrote to a file. */
  private remember(storyId: string, absolute: string, content: Buffer | string, wrote: boolean): void {
    let files = this.seen.get(storyId);
    if (!files) {
      files = new Map();
      this.seen.set(storyId, files);
    }
    files.set(fileKey(absolute), { hash: hashOf(content), wrote });
  }

  private isOwnFile(entry: StoryEntry, absolute: string): boolean {
    return entry.path !== undefined && fileKey(this.lexicallyInside(entry.path)) === fileKey(absolute);
  }

  private assertMayReplace(absolute: string, path: string, entry: StoryEntry): void {
    const key = fileKey(absolute);
    const current = currentHash(absolute);
    const known = this.seen.get(entry.id)?.get(key);
    if (known !== undefined && known.hash === current) {
      return;
    }
    const advice = 'Pass overwrite: true to replace it, or choose another path.';
    const ownFile = known !== undefined || this.isOwnFile(entry, absolute);
    if (current === undefined && ownFile) {
      throw new WorkspaceError(`${path} cannot be read to check it for changes. ${advice}`);
    }
    const holders =
      current === undefined
        ? []
        : [...this.seen].filter(([storyId, files]) => storyId !== entry.id && files.get(key)?.hash === current);
    const holder = holders[0]?.[0];
    const writer = holders.find(([, files]) => files.get(key)?.wrote)?.[0];
    if (ownFile) {
      throw new WorkspaceError(
        writer
          ? `${path} was saved by story "${writer}" after story "${entry.id}" opened or wrote it. ${advice}`
          : `${path} changed on disk since story "${entry.id}" opened or wrote it. ${advice}`,
      );
    }
    throw new WorkspaceError(`${path} already exists${holder ? `, and story "${holder}" opened or wrote it` : ''}. ${advice}`);
  }

  private add(story: Story, path: string | undefined, dirty: boolean): StoryEntry {
    const entry: StoryEntry = { id: this.uniqueId(story.title), story, dirty };
    if (path) {
      entry.path = path;
    }
    this.entries.set(entry.id, entry);
    return entry;
  }

  private uniqueId(title: string): string {
    const base =
      title
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'story';
    let id = base;
    for (let counter = 2; this.entries.has(id); counter += 1) {
      id = `${base}-${counter}`;
    }
    return id;
  }

  private resolveExisting(path: string): string {
    const candidate = this.lexicallyInside(path);
    if (!existsSync(candidate)) {
      throw new WorkspaceError(`${path} does not exist in the workspace ${this.root}.`);
    }
    const real = realpathSync(candidate);
    this.assertInside(real, path);
    return real;
  }

  private resolveForWrite(path: string): string {
    if (!/\.(egn|egn\.svg|svg|md)$/i.test(path)) {
      throw new WorkspaceError(`Cannot write ${path}: use the extension .egn, .egn.svg, .svg or .md.`);
    }
    const candidate = this.lexicallyInside(path);
    if (lexists(candidate) && lstatSync(candidate).isSymbolicLink()) {
      throw new WorkspaceError(`${path} is a symbolic link. Write to a regular file inside the workspace root.`);
    }
    if (lexists(candidate) && !lstatSync(candidate).isFile()) {
      throw new WorkspaceError(`${path} is not a regular file.`);
    }
    // Check the nearest existing ancestor, including dangling links, so that
    // links cannot lead the write out of the root.
    let existing = dirname(candidate);
    while (!lexists(existing)) {
      existing = dirname(existing);
    }
    let real: string;
    try {
      real = realpathSync(existing);
    } catch {
      throw new WorkspaceError(`${path} goes through a broken symbolic link.`);
    }
    this.assertInside(real, path);
    return candidate;
  }

  private lexicallyInside(path: string): string {
    const candidate = isAbsolute(path) ? resolve(path) : resolve(this.root, path);
    this.assertInside(candidate, path);
    return candidate;
  }

  private assertInside(absolute: string, original: string): void {
    if (absolute !== this.root && !absolute.startsWith(this.root + sep)) {
      throw new WorkspaceError(`${original} is outside the workspace root ${this.root}.`);
    }
  }

  private relative(absolute: string): string {
    return relative(this.root, absolute).split(sep).join('/');
  }
}

export function formatFromPath(path: string): SaveFormat {
  if (/\.dst(\.svg)?$/i.test(path)) {
    throw new WorkspaceError(`${path}: the server reads .dst files but writes only .egn, .egn.svg, .svg and .md.`);
  }
  if (/\.egn\.svg$/i.test(path)) {
    return 'egn.svg';
  }
  if (/\.egn$/i.test(path)) {
    return 'egn';
  }
  if (/\.svg$/i.test(path)) {
    return 'svg';
  }
  if (/\.md$/i.test(path)) {
    return 'markdown';
  }
  throw new WorkspaceError(`Cannot tell the format of ${path} from its extension. Use .egn, .egn.svg, .svg or .md.`);
}

function extensionFor(format: SaveFormat): 'egn' | 'egn.svg' | 'svg' | 'md' {
  return format === 'markdown' ? 'md' : format;
}

/** Like existsSync, but true for dangling symbolic links too. */
function lexists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * One key per file path, whatever its spelling: links in the path resolved
 * and, where the file system ignores case, the file's own letter case. Works
 * for files that do not exist yet. Hard links stay separate keys, but the
 * content hash still notices changes made through them.
 */
function fileKey(absolute: string): string {
  try {
    return realpathSync.native(absolute);
  } catch {
    try {
      return join(realpathSync.native(dirname(absolute)), basename(absolute));
    } catch {
      return absolute;
    }
  }
}

function hashOf(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Hash of the file's content now, or undefined if it is too large, not a regular file or unreadable. */
function currentHash(absolute: string): string | undefined {
  try {
    const stats = statSync(absolute);
    return !stats.isFile() || stats.size > MAX_FILE_BYTES ? undefined : hashOf(readFileSync(absolute));
  } catch {
    return undefined;
  }
}

function layoutOf(version: string): EgonFormat {
  return version.startsWith('4') ? 'egon4' : 'egon3';
}

/** The layout of an existing Egon file, or undefined if it is not one or cannot be read. */
function layoutOfFile(absolute: string): EgonFormat | undefined {
  try {
    const stats = statSync(absolute);
    if (!stats.isFile() || stats.size > MAX_FILE_BYTES) {
      return undefined;
    }
    return layoutOf(parseStoryFile(readFileSync(absolute, 'utf8'), absolute).version);
  } catch {
    return undefined;
  }
}
