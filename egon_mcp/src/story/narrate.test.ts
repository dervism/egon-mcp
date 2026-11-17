import { describe, expect, it } from 'vitest';
import { Story } from './story.js';
import { narrate, narrativeMarkdown } from './narrate.js';

function pizza() {
  const story = Story.create({ title: 'Order pizza', description: 'Happy path' });
  const customer = story.addActor({ name: 'Customer' });
  const order = story.addWorkObject({ name: 'Order' });
  const clerk = story.addActor({ name: 'Clerk' });
  const pizzaBox = story.addWorkObject({ name: 'Pizza' });
  story.addActivity({ from: customer.id, to: order.id, label: 'tells' });
  story.addActivity({ from: order.id, to: clerk.id, label: 'to' });
  story.addActivity({ from: clerk.id, to: pizzaBox.id, label: 'bakes' });
  return { story, customer, order, clerk, pizzaBox };
}

describe('narrate', () => {
  it('turns each numbered step into a sentence including the recipient', () => {
    const steps = narrate(pizza().story.toDocument());
    expect(steps.map((step) => step.sentence)).toEqual([
      'Customer tells Order to Clerk.',
      'Clerk bakes Pizza.',
    ]);
    expect(steps.map((step) => step.number)).toEqual([1, 2]);
  });

  it('lists the elements that take part in each step', () => {
    const { story, customer, order, clerk } = pizza();
    const [first] = narrate(story.toDocument());
    expect(first?.actors).toEqual(['Customer']);
    expect(first?.workObjects).toEqual(['Order']);
    expect(first?.recipients).toEqual(['Clerk']);
    expect(first?.elementIds).toEqual(expect.arrayContaining([customer.id, order.id, clerk.id]));
  });

  it('joins parallel activities that share a number into one step', () => {
    const { story, customer, order } = pizza();
    const cash = story.addWorkObject({ name: 'Cash' });
    story.addActivity({ from: customer.id, to: cash.id, label: 'pays with', number: 1 });
    const [first] = narrate(story.toDocument());
    expect(first?.sentence).toBe('Customer tells Order to Clerk. Customer pays with Cash.');
    expect(first?.workObjects).toEqual([order.name, 'Cash']);
  });

  it('follows chains of work objects like Egon replay does', () => {
    const story = Story.create({ title: 'T' });
    story.addActor({ name: 'Clerk' });
    story.addWorkObject({ name: 'Order' });
    story.addWorkObject({ name: 'Invoice' });
    story.addActor({ name: 'Customer' });
    story.addActivity({ from: 'Clerk', to: 'Order', label: 'turns' });
    story.addActivity({ from: 'Order', to: 'Invoice', label: 'into' });
    story.addActivity({ from: 'Invoice', to: 'Customer', label: 'for' });
    expect(narrate(story.toDocument())[0]?.sentence).toBe('Clerk turns Order into Invoice for Customer.');
  });

  it('repeats onward activities in every step that reaches the work object', () => {
    const { story, customer, order } = pizza();
    story.addActivity({ from: customer.id, to: order.id, label: 'changes' });
    expect(narrate(story.toDocument())[2]?.sentence).toBe('Customer changes Order to Clerk.');
  });

  it('marks unnamed elements so gaps stay visible', () => {
    const story = Story.create({ title: 'T' });
    const actor = story.addActor({ name: '' });
    const thing = story.addWorkObject({ name: 'Form' });
    story.addActivity({ from: actor.id, to: thing.id });
    expect(narrate(story.toDocument())[0]?.sentence).toBe('[unnamed actor] [unlabeled activity] Form.');
  });
});

describe('narrativeMarkdown', () => {
  it('renders title, description, scope and numbered sentences', () => {
    const { story } = pizza();
    story.setInfo({ scope: { pointInTime: 'to-be', domainPurity: 'digitalized' } });
    expect(narrativeMarkdown(story.toDocument())).toBe(
      [
        '# Order pizza',
        '',
        'Happy path',
        '',
        'Scope: to-be, digitalized',
        '',
        '1. Customer tells Order to Clerk.',
        '2. Clerk bakes Pizza.',
        '',
      ].join('\n'),
    );
  });

  it('says so when a story has no steps yet', () => {
    expect(narrativeMarkdown(Story.create({ title: 'Empty' }).toDocument())).toContain('No activities yet.');
  });
});
