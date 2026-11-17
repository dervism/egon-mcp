import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseStoryFile } from '../egon/parse.js';
import { fileNameFor, toEgnJson } from '../egon/serialize.js';
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
  dirty: boolean;
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
  readonly root: string;

  constructor(root: string) {
    if (!existsSync(root)) {
      throw new WorkspaceError(`The workspace root ${root} does not exist.`);
    }
    this.root = realpathSync(root);
  }

  create(input: { title: string; description?: string; scope?: Scope }): StoryEntry {
    return this.add(Story.create(input), undefined, true);
  }

  open(path: string): StoryEntry {
    const absolute = this.resolveExisting(path);
    if (lstatSync(absolute).size > MAX_FILE_BYTES) {
      throw new WorkspaceError(`${path} is larger than 20 MB.`);
    }
    const doc = parseStoryFile(readFileSync(absolute, 'utf8'), absolute);
    const relativePath = this.relative(absolute);
    const keepPath = /\.egn(\.svg)?$/i.test(relativePath) ? relativePath : undefined;
    return this.add(Story.fromDocument(doc), keepPath, false);
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
  }

  touch(id: string): void {
    this.get(id).dirty = true;
  }

  /** Writes a story to disk. The format follows the file extension. */
  save(id: string, options: { path?: string; format?: SaveFormat }): { path: string; format: SaveFormat; bytes: number } {
    const entry = this.get(id);
    const format = options.format ?? (options.path ? formatFromPath(options.path) : 'egn');
    const path = options.path ?? entry.path ?? fileNameFor(entry.story.title, extensionFor(format));
    if (formatFromPath(path) !== format) {
      throw new WorkspaceError(`The extension of ${path} does not match the format ${format}.`);
    }
    const absolute = this.resolveForWrite(path);
    const content = this.serialize(entry.story, format);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content);
    const relativePath = this.relative(absolute);
    if (format === 'egn' || format === 'egn.svg') {
      entry.path = relativePath;
      entry.dirty = false;
    }
    return { path: relativePath, format, bytes: Buffer.byteLength(content) };
  }

  serialize(story: Story, format: SaveFormat): string {
    const doc = story.toDocument();
    switch (format) {
      case 'egn':
        return toEgnJson(doc);
      case 'egn.svg':
        return renderStorySvg(doc, { title: true, embedStory: true, whiteBackground: true });
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
    // Walk up to the nearest existing ancestor and make sure links do not lead out of the root.
    let existing = candidate;
    while (!existsSync(existing)) {
      existing = dirname(existing);
    }
    this.assertInside(realpathSync(existing), path);
    if (existsSync(candidate) && lstatSync(candidate).isSymbolicLink()) {
      this.assertInside(realpathSync(candidate), path);
    }
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
  if (/\.(egn|dst)\.svg$/i.test(path)) {
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
