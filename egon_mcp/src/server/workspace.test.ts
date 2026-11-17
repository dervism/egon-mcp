import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
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
    expect(readFileSync(join(root, 'out/story.egn.svg'), 'utf8')).toContain('%3CDST%3E');
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

  it('marks stories dirty after a change', () => {
    const entry = workspace.create({ title: 'T' });
    workspace.save(entry.id, {});
    workspace.touch(entry.id);
    expect(workspace.get(entry.id).dirty).toBe(true);
  });
});
