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

  it('does not double "and" when a recipient arrow is already labeled "and", as the book draws it', () => {
    const story = Story.create({ title: 'Send an invoice' });
    const clerk = story.addActor({ name: 'Clerk' });
    const invoice = story.addWorkObject({ name: 'Invoice' });
    const customer = story.addActor({ name: 'Customer' });
    const accountant = story.addActor({ name: 'Accountant' });
    const archive = story.addActor({ name: 'Archive' });
    story.addActivity({ from: clerk.id, to: invoice.id, label: 'sends' });
    story.addActivity({ from: invoice.id, to: customer.id, label: 'to' });
    story.addActivity({ from: invoice.id, to: accountant.id, label: 'and' });
    story.addActivity({ from: invoice.id, to: archive.id, label: 'to' });
    expect(narrate(story.toDocument())[0]?.sentence).toBe('Clerk sends Invoice to Customer and Accountant and to Archive.');
  });

  it('reads a lone "and" arrow as written, and several leading ones after the first other arrow', () => {
    const lone = Story.create({ title: 'T' });
    const clerk = lone.addActor({ name: 'Clerk' });
    const invoice = lone.addWorkObject({ name: 'Invoice' });
    lone.addActivity({ from: clerk.id, to: invoice.id, label: 'sends' });
    lone.addActivity({ from: invoice.id, to: lone.addActor({ name: 'Accountant' }).id, label: 'and' });
    expect(narrate(lone.toDocument())[0]?.sentence).toBe('Clerk sends Invoice and Accountant.');

    const several = Story.create({ title: 'T' });
    const sender = several.addActor({ name: 'Clerk' });
    const letter = several.addWorkObject({ name: 'Invoice' });
    several.addActivity({ from: sender.id, to: letter.id, label: 'sends' });
    several.addActivity({ from: letter.id, to: several.addActor({ name: 'A' }).id, label: 'and' });
    several.addActivity({ from: letter.id, to: several.addActor({ name: 'B' }).id, label: 'and' });
    several.addActivity({ from: letter.id, to: several.addActor({ name: 'C' }).id, label: 'to' });
    expect(narrate(several.toDocument())[0]?.sentence).toBe('Clerk sends Invoice to C and A and B.');
  });

  it('reads an arrow labeled "and" after the arrow it continues, whatever its case, and leaves other words alone', () => {
    const story = Story.create({ title: 'Send an invoice' });
    const clerk = story.addActor({ name: 'Clerk' });
    const invoice = story.addWorkObject({ name: 'Invoice' });
    const accountant = story.addActor({ name: 'Accountant' });
    const customer = story.addActor({ name: 'Customer' });
    const phone = story.addActor({ name: 'Phone' });
    story.addActivity({ from: clerk.id, to: invoice.id, label: 'sends' });
    // Drawn first, but read after the arrow it continues.
    story.addActivity({ from: invoice.id, to: accountant.id, label: 'And' });
    story.addActivity({ from: invoice.id, to: customer.id, label: 'to' });
    story.addActivity({ from: invoice.id, to: phone.id, label: 'android' });
    expect(narrate(story.toDocument())[0]?.sentence).toBe('Clerk sends Invoice to Customer And Accountant and android Phone.');
  });

  it('orders parallel sentences and onward arrows by where they are drawn, so saving does not change the reading', () => {
    // Egon and save_story write elements sorted by id, which says nothing about the story.
    const story = Story.create({ title: 'T' });
    const leasing = story.addActor({ name: 'Leasing agent', x: 0, y: 0 });
    const offer = story.addWorkObject({ name: 'Offer', x: 200, y: 0 });
    const term = story.addWorkObject({ name: 'Term', x: 400, y: 200 });
    const rate = story.addWorkObject({ name: 'Rate', x: 400, y: 0 });
    const customer = story.addActor({ name: 'Customer', x: 0, y: 400 });
    const signed = story.addWorkObject({ name: 'Signature', x: 200, y: 400 });
    story.addActivity({ from: leasing.id, to: offer.id, label: 'prepares' });
    story.addActivity({ from: offer.id, to: term.id, label: 'and' });
    story.addActivity({ from: offer.id, to: rate.id, label: 'with' });
    story.addActivity({ from: customer.id, to: signed.id, label: 'gives', number: 1 });
    const doc = story.toDocument();
    const expected = ['Leasing agent prepares Offer with Rate and Term. Customer gives Signature.'];
    expect(narrate(doc).map((step) => step.sentence)).toEqual(expected);
    for (const order of [[...doc.elements].reverse(), [...doc.elements].sort((a, b) => b.id.localeCompare(a.id))]) {
      expect(narrate({ ...doc, elements: order }).map((step) => step.sentence)).toEqual(expected);
    }
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
