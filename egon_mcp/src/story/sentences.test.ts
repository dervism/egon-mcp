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

  it('reuses actors by name but draws a new work object for each sentence, as in Egon practice', () => {
    const story = Story.create({ title: 'T' });
    addSentence(story, { actor: 'Customer', activity: 'tells', workObject: 'Order', to: [{ activity: 'to', actor: 'Clerk' }] });
    const second = addSentence(story, { actor: 'clerk', activity: 'passes', workObject: 'Order', to: [{ activity: 'to', actor: 'Baker' }] });
    expect(second.created.map((e) => e.name)).toEqual(['Order', 'Baker']);
    expect(story.elements().filter(isActor)).toHaveLength(3);
    expect(story.elements().filter(isWorkObject)).toHaveLength(2);
    expect(narrate(story.toDocument()).map((s) => s.sentence)).toEqual([
      'Customer tells Order to Clerk.',
      'Clerk passes Order to Baker.',
    ]);
  });

  it('reuses the latest work object of that name when asked to', () => {
    const story = Story.create({ title: 'T' });
    addSentence(story, { actor: 'Clerk', activity: 'writes', workObject: 'Order slip' });
    const second = addSentence(story, { actor: 'Clerk', activity: 'signs', workObject: 'order slip', reuseWorkObject: true });
    expect(second.created).toEqual([]);
    expect(story.elements().filter(isWorkObject)).toHaveLength(1);
  });

  it('reuses a work object given by id', () => {
    const story = Story.create({ title: 'T' });
    const first = addSentence(story, { actor: 'Clerk', activity: 'writes', workObject: 'Order slip' });
    const slip = first.created.find((e) => e.name === 'Order slip')!;
    expect(addSentence(story, { actor: 'Clerk', activity: 'signs', workObject: slip.id }).created).toEqual([]);
  });

  it('uses the given icons for new elements and a matching built-in icon by name otherwise', () => {
    const story = Story.create({ title: 'T' });
    addSentence(story, { actor: 'Shop system', actorIcon: 'System', activity: 'sends', workObject: 'Email' });
    const types = story.elements().map((e) => e.type);
    expect(types).toContain('domainStory:actorSystem');
    expect(types).toContain('domainStory:workObjectEmail');
  });

  it('gives a repeated work object the icon and color of the previous one', () => {
    const story = Story.create({ title: 'T' });
    addSentence(story, { actor: 'Baker', activity: 'bakes', workObject: 'Pizza', workObjectIcon: 'Dining' });
    story.updateElement(story.elements().find((e) => e.name === 'Pizza')!.id, { color: '#E53935' });
    addSentence(story, { actor: 'Clerk', activity: 'serves', workObject: 'Pizza' });
    const pizzas = story.elements().filter((e) => e.name === 'Pizza');
    expect(pizzas.map((e) => e.type)).toEqual(['domainStory:workObjectDining', 'domainStory:workObjectDining']);
    expect(pizzas.map((e) => e.pickedColor)).toEqual(['#E53935', '#E53935']);
  });

  it('checks work object names in every case', () => {
    const story = Story.create({ title: 'T' });
    expect(() => addSentence(story, { actor: 'A', activity: 'does', workObject: '   ' })).toThrow(/name/);
    addSentence(story, { actor: 'Customer', activity: 'fills in', workObject: 'Form' });
    expect(() => addSentence(story, { actor: 'Clerk', activity: 'notes', workObject: 'Customer' })).toThrow(/already a actor/);
    const actorId = story.elements().find((e) => e.name === 'Customer')!.id;
    expect(() => addSentence(story, { actor: 'Clerk', activity: 'notes', workObject: actorId })).toThrow(/not a work object/);
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

  it('uses work objects declared up front in the first sentence that names them', () => {
    const story = buildStory({
      title: 'T',
      workObjects: [{ name: 'Pizza', icon: 'Dining', color: '#E53935' }],
      sentences: [
        { actor: 'Baker', activity: 'bakes', workObject: 'Pizza' },
        { actor: 'Clerk', activity: 'serves', workObject: 'Pizza' },
      ],
    });
    const pizzas = story.elements().filter((e) => e.name === 'Pizza');
    expect(pizzas).toHaveLength(2);
    expect(pizzas.every((e) => e.type === 'domainStory:workObjectDining' && e.pickedColor === '#E53935')).toBe(true);
    expect(validateStory(story.toDocument())).toEqual([]);
  });

  it('puts every instance of a name into a group and attaches annotations to the first one', () => {
    const story = buildStory({
      title: 'T',
      sentences: [
        { actor: 'Clerk', activity: 'writes', workObject: 'Slip' },
        { actor: 'Clerk', activity: 'stamps', workObject: 'Slip' },
      ],
      groups: [{ name: 'Desk', members: ['Clerk', 'Slip'] }],
      annotations: [{ text: 'Paper', attachTo: 'Slip' }],
    });
    const group = story.elements().find((e) => e.type === 'domainStory:group')!;
    expect(story.elements().filter((e) => e['parent'] === group.id)).toHaveLength(3);
    expect(story.elements().filter((e) => e.type === 'domainStory:connection')).toHaveLength(1);
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
