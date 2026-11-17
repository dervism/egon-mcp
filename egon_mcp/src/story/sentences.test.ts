import { describe, expect, it } from 'vitest';
import { isActor, isWorkObject } from '../egon/types.js';
import { narrate } from './narrate.js';
import { addSentence, buildStory } from './sentences.js';
import { Story } from './story.js';
import { validateStory } from './validate.js';

describe('addSentence', () => {
  it('creates missing actors and work objects and links them in one step', () => {
    const story = Story.create({ title: 'T' });
    const result = addSentence(story, {
      actor: 'Customer',
      activity: 'tells',
      workObject: 'Order',
      to: [{ activity: 'to', actor: 'Clerk' }],
    });
    expect(result.number).toBe(1);
    expect(result.created.map((e) => e.name)).toEqual(['Customer', 'Order', 'Clerk']);
    expect(narrate(story.toDocument())[0]?.sentence).toBe('Customer tells Order to Clerk.');
  });

  it('reuses elements that already exist, matching names case-insensitively', () => {
    const story = Story.create({ title: 'T' });
    addSentence(story, { actor: 'Customer', activity: 'tells', workObject: 'Order', to: [{ activity: 'to', actor: 'Clerk' }] });
    const second = addSentence(story, { actor: 'clerk', activity: 'confirms', workObject: 'order' });
    expect(second.created).toEqual([]);
    expect(story.elements().filter(isActor)).toHaveLength(2);
    expect(story.elements().filter(isWorkObject)).toHaveLength(1);
  });

  it('uses the given icons for new elements and a matching built-in icon by name otherwise', () => {
    const story = Story.create({ title: 'T' });
    addSentence(story, { actor: 'Shop system', actorIcon: 'System', activity: 'sends', workObject: 'Email' });
    const types = story.elements().map((e) => e.type);
    expect(types).toContain('domainStory:actorSystem');
    expect(types).toContain('domainStory:workObjectEmail');
  });

  it('adds parallel activities to an existing step', () => {
    const story = Story.create({ title: 'T' });
    addSentence(story, { actor: 'A', activity: 'fills in', workObject: 'Form' });
    const parallel = addSentence(story, { actor: 'B', activity: 'reads', workObject: 'Form', number: 1 });
    expect(parallel.number).toBe(1);
  });

  it('refuses to use a work object as the actor of a sentence', () => {
    const story = Story.create({ title: 'T' });
    addSentence(story, { actor: 'A', activity: 'fills in', workObject: 'Form' });
    expect(() => addSentence(story, { actor: 'Form', activity: 'x', workObject: 'Y' })).toThrow(/work object/);
  });

  it('supports a sentence that addresses another actor through a work object', () => {
    const story = Story.create({ title: 'T' });
    addSentence(story, { actor: 'Customer', activity: 'calls', workObject: 'Phone call', workObjectIcon: 'Call', to: [{ actor: 'Waiter' }] });
    expect(narrate(story.toDocument())[0]?.sentence).toBe('Customer calls Phone call [unlabeled activity] Waiter.');
  });
});

describe('buildStory', () => {
  it('builds and lays out a complete story from sentences', () => {
    const story = buildStory({
      title: 'Order pizza',
      description: 'Happy path',
      scope: { pointInTime: 'as-is', granularity: 'coarse-grained' },
      actors: [{ name: 'Pizza baker', icon: 'Person', color: '#FB8C00' }],
      sentences: [
        { actor: 'Customer', activity: 'tells', workObject: 'Order', to: [{ activity: 'to', actor: 'Clerk' }] },
        { actor: 'Clerk', activity: 'writes', workObject: 'Order slip', to: [{ activity: 'for', actor: 'Pizza baker' }] },
        { actor: 'Pizza baker', activity: 'bakes', workObject: 'Pizza', workObjectIcon: 'Dining' },
      ],
      groups: [{ name: 'Kitchen', members: ['Pizza baker', 'Pizza'] }],
      annotations: [{ text: 'Handwritten', attachTo: 'Order slip' }],
    });
    const doc = story.toDocument();
    expect(doc.title).toBe('Order pizza');
    expect(narrate(doc).map((s) => s.sentence)).toEqual([
      'Customer tells Order to Clerk.',
      'Clerk writes Order slip for Pizza baker.',
      'Pizza baker bakes Pizza.',
    ]);
    expect(doc.elements.find((e) => e.name === 'Pizza baker')?.pickedColor).toBe('#FB8C00');
    expect(validateStory(doc)).toEqual([]);
  });

  it('names the failing sentence in errors', () => {
    expect(() =>
      buildStory({
        title: 'T',
        sentences: [
          { actor: 'A', activity: 'fills in', workObject: 'Form' },
          { actor: 'B', actorIcon: 'Nonsense', activity: 'reads', workObject: 'Form' },
        ],
      }),
    ).toThrow(/sentence 2/i);
  });
});
