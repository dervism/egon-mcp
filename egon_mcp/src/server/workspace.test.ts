import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, linkSync, mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readEgonFixture } from '../../test/egon-fixtures.js';
import { parseStoryFile } from '../egon/parse.js';
import { Story } from '../story/story.js';
import { Workspace, WorkspaceError } from './workspace.js';

let root: string;
let workspace: Workspace;

// The pipe test runs the built workspace in a child process; `npm test` builds first.
const builtWorkspace = fileURLToPath(new URL('../../dist/server/workspace.js', import.meta.url));
const sourceWorkspace = fileURLToPath(new URL('./workspace.ts', import.meta.url));

const caseInsensitive = (() => {
  const dir = mkdtempSync(join(tmpdir(), 'egon-case-'));
  writeFileSync(join(dir, 'probe'), '');
  const result = existsSync(join(dir, 'PROBE'));
  rmSync(dir, { recursive: true });
  return result;
})();

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'egon-ws-'));
  workspace = new Workspace(root);
});

const extraDirs: string[] = [];

/** A temp folder outside the workspace root, removed after the test. */
function outsideDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'egon-out-'));
  extraDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of [root, ...extraDirs.splice(0)]) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('Workspace', () => {
  it('creates stories with readable, unique ids', () => {
    const first = workspace.create({ title: 'Order pizza' });
    const second = workspace.create({ title: 'Order pizza' });
    expect(first.id).toBe('order-pizza');
    expect(second.id).toBe('order-pizza-2');
    expect(workspace.get('order-pizza').story.title).toBe('Order pizza');
  });

  it('lists and closes open stories', () => {
    workspace.create({ title: 'A' });
    workspace.create({ title: 'B' });
    expect(workspace.list().map((entry) => entry.id)).toEqual(['a', 'b']);
    workspace.close('a');
    expect(workspace.list().map((entry) => entry.id)).toEqual(['b']);
    expect(() => workspace.get('a')).toThrow(WorkspaceError);
  });

  it('saves a story as .egn inside the root and remembers the path', () => {
    const entry = workspace.create({ title: 'Order pizza' });
    entry.story.addActor({ name: 'Customer' });
    const saved = workspace.save(entry.id, {});
    expect(saved.path).toBe('Order pizza.egn');
    const doc = parseStoryFile(readFileSync(join(root, saved.path), 'utf8'), saved.path);
    expect(doc.elements).toHaveLength(1);
    expect(workspace.get(entry.id).path).toBe('Order pizza.egn');
    expect(workspace.get(entry.id).dirty).toBe(false);
  });

  it('saves other formats and creates folders as needed', () => {
    const entry = workspace.create({ title: 'T' });
    expect(workspace.save(entry.id, { path: 'out/story.egn.svg' }).format).toBe('egn.svg');
    expect(readFileSync(join(root, 'out/story.egn.svg'), 'utf8')).toContain('<!-- <DST>');
    expect(workspace.save(entry.id, { path: 'out/story.md' }).format).toBe('markdown');
    expect(workspace.save(entry.id, { path: 'out/picture.svg' }).format).toBe('svg');
  });

  it('opens Egon files from the root', () => {
    mkdirSync(join(root, 'stories'));
    writeFileSync(join(root, 'stories/sample.egn'), readEgonFixture('egn_export_version_4_0_0.json'));
    const entry = workspace.open('stories/sample.egn');
    expect(entry.story.title).toBe('testTitle');
    expect(entry.path).toBe('stories/sample.egn');
  });

  it('lists story files below the root', () => {
    mkdirSync(join(root, 'a/b'), { recursive: true });
    writeFileSync(join(root, 'one.egn'), '{}');
    writeFileSync(join(root, 'a/two.dst'), '{}');
    writeFileSync(join(root, 'a/b/three.egn.svg'), '<svg/>');
    writeFileSync(join(root, 'a/notes.txt'), '');
    mkdirSync(join(root, 'node_modules/x'), { recursive: true });
    writeFileSync(join(root, 'node_modules/x/hidden.egn'), '{}');
    expect(workspace.listFiles().sort()).toEqual(['a/b/three.egn.svg', 'a/two.dst', 'one.egn']);
  });

  it('refuses paths outside the root', () => {
    const entry = workspace.create({ title: 'T' });
    expect(() => workspace.open('../outside.egn')).toThrow(/outside/);
    expect(() => workspace.open('/etc/passwd')).toThrow(/outside/);
    expect(() => workspace.save(entry.id, { path: '../../evil.egn' })).toThrow(/outside/);
  });

  it('refuses symlinks that lead out of the root', () => {
    const outside = outsideDir();
    writeFileSync(join(outside, 'secret.egn'), readEgonFixture('egn_export_version_4_0_0.json'));
    symlinkSync(outside, join(root, 'link'));
    expect(() => workspace.open('link/secret.egn')).toThrow(/outside/);
    const entry = workspace.create({ title: 'T' });
    expect(() => workspace.save(entry.id, { path: 'link/written.egn' })).toThrow(/outside/);
  });

  it('refuses to write through a dangling symlink', () => {
    const outside = outsideDir();
    symlinkSync(join(outside, 'escaped.egn'), join(root, 'story.egn'));
    const entry = workspace.create({ title: 'T' });
    expect(() => workspace.save(entry.id, { path: 'story.egn' })).toThrow(/symbolic link|outside/);
    expect(existsSync(join(outside, 'escaped.egn'))).toBe(false);
  });

  it('refuses directories that are dangling symlinks', () => {
    const outside = outsideDir();
    symlinkSync(join(outside, 'missing-dir'), join(root, 'linkdir'));
    const entry = workspace.create({ title: 'T' });
    expect(() => workspace.save(entry.id, { path: 'linkdir/story.egn' })).toThrow(/symbolic link|outside/);
  });

  it('saves an .egn.svg story back to its own file without a path', () => {
    const entry = workspace.create({ title: 'Pic' });
    workspace.save(entry.id, { path: 'pic.egn.svg' });
    const reopened = workspace.open('pic.egn.svg');
    expect(workspace.save(reopened.id, {})).toMatchObject({ path: 'pic.egn.svg', format: 'egn.svg' });
  });

  it('keeps the Egon 4 layout when saving an Egon 4 file in place', () => {
    writeFileSync(join(root, 'four.egn'), readEgonFixture('egn_export_version_4_0_0.json'));
    const entry = workspace.open('four.egn');
    expect(workspace.save(entry.id, {})).toMatchObject({ path: 'four.egn', layout: 'egon4' });
    expect(JSON.parse(readFileSync(join(root, 'four.egn'), 'utf8')).domainStory.title).toBe('testTitle');
  });

  it('does not overwrite files it did not write unless asked to', () => {
    writeFileSync(join(root, 'README.md'), 'keep me');
    const entry = workspace.create({ title: 'T' });
    expect(() => workspace.save(entry.id, { path: 'README.md' })).toThrow(/already exists/);
    expect(readFileSync(join(root, 'README.md'), 'utf8')).toBe('keep me');
    workspace.save(entry.id, { path: 'README.md', overwrite: true });
    expect(readFileSync(join(root, 'README.md'), 'utf8')).toContain('# T');
    // Files this workspace wrote may be overwritten again.
    workspace.save(entry.id, { path: 'mine.svg' });
    expect(() => workspace.save(entry.id, { path: 'mine.svg' })).not.toThrow();
  });

  it('does not let one story replace a file another story wrote', () => {
    const first = workspace.create({ title: 'Order' });
    const second = workspace.create({ title: 'Order' });
    workspace.save(first.id, {});
    expect(() => workspace.save(second.id, {})).toThrow(new RegExp(`already exists, and story "${first.id}" opened or wrote it`));
    writeFileSync(join(root, 'mine.egn'), readEgonFixture('egn_export_version_4_0_0.json'));
    const opened = workspace.open('mine.egn');
    expect(() => workspace.save(first.id, { path: 'mine.egn' })).toThrow(new RegExp(`already exists, and story "${opened.id}" opened or wrote it`));
    workspace.save(opened.id, {});
    expect(() => workspace.save(first.id, { path: 'mine.egn' })).toThrow(/already exists/);
  });

  it('does not let a new story inherit the files of a closed story with the same id', () => {
    const original = readEgonFixture('egn_export_version_4_0_0.json');
    writeFileSync(join(root, 'mine.egn'), original);
    const opened = workspace.open('mine.egn');
    workspace.close(opened.id);
    const fresh = workspace.create({ title: opened.story.title });
    expect(fresh.id).toBe(opened.id);
    expect(() => workspace.save(fresh.id, { path: 'mine.egn' })).toThrow(/already exists/);
    expect(readFileSync(join(root, 'mine.egn'), 'utf8')).toBe(original);

    const written = workspace.create({ title: 'Order' });
    workspace.save(written.id, {});
    workspace.close(written.id);
    const again = workspace.create({ title: 'Order' });
    expect(() => workspace.save(again.id, {})).toThrow(/already exists/);
  });

  it('lets a story replace a file only while it holds what the story last read or wrote', () => {
    writeFileSync(join(root, 'mine.egn'), readEgonFixture('egn_export_version_4_0_0.json'));
    const first = workspace.open('mine.egn');
    const second = workspace.open('mine.egn');
    workspace.close(workspace.open('mine.egn').id);
    // Opening a file elsewhere changes nothing on disk.
    expect(() => workspace.save(first.id, {})).not.toThrow();
    expect(() => workspace.save(second.id, {})).toThrow(new RegExp(`was saved by story "${first.id}" after story "${second.id}" opened or wrote it`));
    expect(() => workspace.save(first.id, {})).not.toThrow();
  });

  it('protects a file changed through a linked folder or a hard link', () => {
    mkdirSync(join(root, 'real'));
    symlinkSync(join(root, 'real'), join(root, 'alias'));
    const a = workspace.create({ title: 'A', description: 'first' });
    const b = workspace.create({ title: 'B', description: 'second' });
    workspace.save(a.id, { path: 'real/x.egn' });
    workspace.save(b.id, { path: 'alias/x.egn', overwrite: true });
    expect(() => workspace.save(a.id, { path: 'real/x.egn' })).toThrow(/saved by story "b"/);
    expect(() => workspace.save(b.id, { path: 'real/x.egn' })).not.toThrow();

    workspace.save(a.id, { path: 'y.egn' });
    linkSync(join(root, 'y.egn'), join(root, 'hard.egn'));
    workspace.save(b.id, { path: 'hard.egn', overwrite: true });
    expect(() => workspace.save(a.id, { path: 'y.egn' })).toThrow(/changed on disk/);
  });

  it.runIf(caseInsensitive)('treats another letter case of a file as the same file', () => {
    const a = workspace.create({ title: 'A', description: 'first' });
    const b = workspace.create({ title: 'B', description: 'second' });
    workspace.save(a.id, { path: 'x.egn' });
    workspace.save(b.id, { path: 'X.EGN', overwrite: true });
    expect(() => workspace.save(a.id, { path: 'x.egn' })).toThrow(/saved by story "b"/);
    expect(() => workspace.save(b.id, { path: 'x.egn' })).not.toThrow();
  });

  it('notices any change to the content, even with the same size and modification time', () => {
    const original = readEgonFixture('egn_export_version_4_0_0.json');
    const file = join(root, 'mine.egn');
    const second = 1_700_000_000;
    writeFileSync(file, original);
    utimesSync(file, second, second);
    const opened = workspace.open('mine.egn');
    const before = statSync(file, { bigint: true });
    writeFileSync(file, original.replace('"', "'"));
    utimesSync(file, second, second);
    const after = statSync(file, { bigint: true });
    expect([after.size, after.mtimeNs]).toEqual([before.size, before.mtimeNs]);
    expect(() => workspace.save(opened.id, {})).toThrow(new RegExp(`changed on disk since story "${opened.id}" opened or wrote it`));
  });

  it('refuses to replace a file that was edited or replaced outside the server', () => {
    const original = readEgonFixture('egn_export_version_4_0_0.json');
    writeFileSync(join(root, 'mine.egn'), original);
    const opened = workspace.open('mine.egn');
    writeFileSync(join(root, 'mine.egn'), original + '\n');
    expect(() => workspace.save(opened.id, {})).toThrow(/changed on disk/);

    const written = workspace.create({ title: 'Written' });
    workspace.save(written.id, {});
    writeFileSync(join(root, 'swap.egn'), 'edited elsewhere');
    renameSync(join(root, 'swap.egn'), join(root, 'Written.egn'));
    expect(() => workspace.save(written.id, {})).toThrow(/changed on disk/);
    workspace.save(written.id, { overwrite: true });
    expect(() => workspace.save(written.id, {})).not.toThrow();
  });

  it('accepts a file re-created with the same content, and says "saved by" only for a story that wrote it', () => {
    const story = workspace.create({ title: 'T', description: 'mine' });
    workspace.save(story.id, {});
    workspace.save(story.id, { path: 'T.md' });
    for (const name of ['T.egn', 'T.md']) {
      const bytes = readFileSync(join(root, name));
      rmSync(join(root, name));
      writeFileSync(join(root, name), bytes);
    }
    expect(() => workspace.save(story.id, {})).not.toThrow();
    expect(() => workspace.save(story.id, { path: 'T.md' })).not.toThrow();

    // A reader of the edited file is not its writer.
    writeFileSync(join(root, 'T.egn'), readEgonFixture('egn_export_version_4_0_0.json'));
    workspace.open('T.egn');
    expect(() => workspace.save(story.id, {})).toThrow(/changed on disk/);
  });

  it.runIf(process.platform !== 'win32' && process.getuid?.() !== 0)('says when a file cannot be read to check it', () => {
    const story = workspace.create({ title: 'T' });
    workspace.save(story.id, {});
    // A second story with saved files must exist: without the guard for unreadable
    // files, it would wrongly be named as having opened or written notes.md.
    workspace.save(workspace.create({ title: 'Other' }).id, {});
    chmodSync(join(root, 'T.egn'), 0o000);
    writeFileSync(join(root, 'notes.md'), 'private');
    chmodSync(join(root, 'notes.md'), 0o000);
    try {
      expect(() => workspace.save(story.id, {})).toThrow(/cannot be read/);
      // Nothing to check for a file this story never saw.
      expect(() => workspace.save(story.id, { path: 'notes.md' })).toThrow(/^notes\.md already exists\./);
    } finally {
      chmodSync(join(root, 'T.egn'), 0o644);
      chmodSync(join(root, 'notes.md'), 0o644);
    }
  });

  it('refuses targets that are not regular files, such as folders', () => {
    mkdirSync(join(root, 'folder.egn'));
    mkdirSync(join(root, 'folder.md'));
    const entry = workspace.create({ title: 'T' });
    expect(() => workspace.open('folder.egn')).toThrow(/not a regular file/);
    expect(() => workspace.save(entry.id, { path: 'folder.md' })).toThrow(/not a regular file/);
    expect(() => workspace.save(entry.id, { path: 'folder.md', overwrite: true })).toThrow(/not a regular file/);
  });

  it.runIf(process.platform !== 'win32')('refuses named pipes without blocking (built code)', (context) => {
    expect(existsSync(builtWorkspace), 'dist is missing; run "npm run build" or "npm test"').toBe(true);
    if (statSync(builtWorkspace).mtimeMs < statSync(sourceWorkspace).mtimeMs) {
      // `npm test` always builds first; a watch run after editing the source does not.
      context.skip('dist is older than src/server/workspace.ts; run "npm run build"');
    }
    for (const name of ['pipe.md', 'pipe.egn']) {
      execFileSync('mkfifo', [join(root, name)]);
    }
    // Reading or writing a pipe blocks synchronously, which no timeout inside this
    // process can stop, so the calls run in a child process that gets killed instead.
    const script = `
      const { Workspace } = await import(${JSON.stringify(pathToFileURL(builtWorkspace).href)});
      const workspace = new Workspace(process.argv[1]);
      const entry = workspace.create({ title: 'T' });
      const attempt = (action) => {
        try {
          action();
          return 'no error';
        } catch (error) {
          return error.message;
        }
      };
      console.log(JSON.stringify([
        attempt(() => workspace.save(entry.id, { path: 'pipe.md' })),
        attempt(() => workspace.save(entry.id, { path: 'pipe.md', overwrite: true })),
        attempt(() => workspace.open('pipe.egn')),
      ]));`;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, root], { encoding: 'utf8', timeout: 10_000 });
    expect(result.signal, 'the workspace blocked on a named pipe').toBeNull();
    expect(result.status, result.stderr).toBe(0);
    const messages = JSON.parse(result.stdout) as string[];
    expect(messages).toHaveLength(3);
    for (const message of messages) {
      expect(message).toMatch(/not a regular file/);
    }
  });

  it("keeps a story's own layout when saving back to its file, even if the file is gone, unreadable or replaced", () => {
    writeFileSync(join(root, 'four.egn'), readEgonFixture('egn_export_version_4_0_0.json'));
    const entry = workspace.open('four.egn');
    rmSync(join(root, 'four.egn'));
    expect(workspace.save(entry.id, {}).layout).toBe('egon4');
    writeFileSync(join(root, 'four.egn'), 'not a story');
    expect(workspace.save(entry.id, { overwrite: true }).layout).toBe('egon4');
    writeFileSync(join(root, 'four.egn'), workspace.serialize(Story.create({ title: 'Three' }), 'egn', 'egon3'));
    expect(workspace.save(entry.id, { overwrite: true }).layout).toBe('egon4');
  });

  it('knows its own file through a linked folder after the file was deleted', () => {
    mkdirSync(join(root, 'real'));
    symlinkSync(join(root, 'real'), join(root, 'alias'));
    writeFileSync(join(root, 'real', 'four.egn'), readEgonFixture('egn_export_version_4_0_0.json'));
    const entry = workspace.open('alias/four.egn');
    rmSync(join(root, 'real', 'four.egn'));
    expect(workspace.save(entry.id, { path: 'alias/four.egn' }).layout).toBe('egon4');
  });

  it('takes the layout from the Egon file being replaced when it is not the story\'s own', () => {
    const fours = new Workspace(root, { egonFormat: 'egon4' });
    writeFileSync(join(root, 'three.egn'), fours.serialize(Story.create({ title: 'Three' }), 'egn', 'egon3'));
    const other = fours.create({ title: 'Other' });
    expect(fours.save(other.id, { path: 'three.egn', overwrite: true }).layout).toBe('egon3');

    writeFileSync(join(root, 'four.egn'), readEgonFixture('egn_export_version_4_0_0.json'));
    workspace.close(workspace.open('four.egn').id);
    const fresh = workspace.create({ title: 'Fresh' });
    expect(workspace.save(fresh.id, { path: 'four.egn', overwrite: true }).layout).toBe('egon4');
  });

  it('uses the server layout for a new file at a path an earlier story used', () => {
    writeFileSync(join(root, 'four.egn'), readEgonFixture('egn_export_version_4_0_0.json'));
    workspace.close(workspace.open('four.egn').id);
    rmSync(join(root, 'four.egn'));
    const fresh = workspace.create({ title: 'Fresh' });
    expect(workspace.save(fresh.id, { path: 'four.egn' }).layout).toBe('egon3');
  });

  it('keeps the Egon 4 layout only when saving in place, unless a layout is given', () => {
    writeFileSync(join(root, 'four.egn'), readEgonFixture('egn_export_version_4_0_0.json'));
    const entry = workspace.open('four.egn');
    expect(workspace.save(entry.id, { path: 'copy.egn' }).layout).toBe('egon3');
    expect(workspace.save(entry.id, { path: 'four.egn' }).layout).toBe('egon4');
    expect(workspace.save(entry.id, { path: 'four.egn', layout: 'egon3' }).layout).toBe('egon3');
  });

  it('refuses to write legacy .dst files', () => {
    const entry = workspace.create({ title: 'T' });
    expect(() => workspace.save(entry.id, { path: 'old.dst.svg' })).toThrow(/\.dst/);
    expect(() => workspace.save(entry.id, { path: 'old.dst' })).toThrow(/\.dst|extension/);
  });

  it('builds ids without leftover accents', () => {
    expect(workspace.create({ title: 'Bestellung für Pizza' }).id).toBe('bestellung-fur-pizza');
  });

  it('refuses the file system root as workspace', () => {
    expect(() => new Workspace('/')).toThrow(/--root/);
  });

  it('refuses unsupported file types', () => {
    const entry = workspace.create({ title: 'T' });
    expect(() => workspace.save(entry.id, { path: 'story.exe' })).toThrow(/extension/);
  });

  it('imports a story from text', () => {
    const entry = workspace.importText(readEgonFixture('egn_export_version_4_0_0.json'), 'pasted.egn');
    expect(entry.story.title).toBe('testTitle');
    expect(entry.path).toBeUndefined();
  });

  it('adopts a story built elsewhere as a new, unsaved entry', () => {
    const story = Story.create({ title: 'Built' });
    const entry = workspace.adopt(story);
    expect(entry.id).toBe('built');
    expect(entry.story).toBe(story);
    expect(entry.dirty).toBe(true);
  });

  it('writes the Egon 4 layout when the workspace is configured for it', () => {
    const egon4 = new Workspace(root, { egonFormat: 'egon4' });
    const entry = egon4.create({ title: 'Four' });
    egon4.save(entry.id, {});
    expect(JSON.parse(readFileSync(join(root, 'Four.egn'), 'utf8'))).toHaveProperty('domainStory');
  });

  it('marks stories dirty after a change', () => {
    const entry = workspace.create({ title: 'T' });
    workspace.save(entry.id, {});
    workspace.touch(entry.id);
    expect(workspace.get(entry.id).dirty).toBe(true);
  });
});
