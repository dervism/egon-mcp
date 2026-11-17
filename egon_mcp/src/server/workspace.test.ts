import { existsSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { readEgonFixture } from '../../test/egon-fixtures.js';
import { parseStoryFile } from '../egon/parse.js';
import { Story } from '../story/story.js';
import { Workspace, WorkspaceError } from './workspace.js';

let root: string;
let workspace: Workspace;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'egon-ws-'));
  workspace = new Workspace(root);
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
    const outside = mkdtempSync(join(tmpdir(), 'egon-out-'));
    writeFileSync(join(outside, 'secret.egn'), readEgonFixture('egn_export_version_4_0_0.json'));
    symlinkSync(outside, join(root, 'link'));
    expect(() => workspace.open('link/secret.egn')).toThrow(/outside/);
    const entry = workspace.create({ title: 'T' });
    expect(() => workspace.save(entry.id, { path: 'link/written.egn' })).toThrow(/outside/);
  });

  it('refuses to write through a dangling symlink', () => {
    const outside = mkdtempSync(join(tmpdir(), 'egon-out-'));
    symlinkSync(join(outside, 'escaped.egn'), join(root, 'story.egn'));
    const entry = workspace.create({ title: 'T' });
    expect(() => workspace.save(entry.id, { path: 'story.egn' })).toThrow(/symbolic link|outside/);
    expect(existsSync(join(outside, 'escaped.egn'))).toBe(false);
  });

  it('refuses directories that are dangling symlinks', () => {
    const outside = mkdtempSync(join(tmpdir(), 'egon-out-'));
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
    expect(() => workspace.save(second.id, {})).toThrow(/already exists/);
    writeFileSync(join(root, 'mine.egn'), readEgonFixture('egn_export_version_4_0_0.json'));
    const opened = workspace.open('mine.egn');
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
