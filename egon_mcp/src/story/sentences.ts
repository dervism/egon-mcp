import { compareIds, groupAncestors, iconNameOf, isGroup, isActivity, isActor, isWorkObject, type Scope, type ShapeElement, type StoryElement } from '../egon/types.js';
import { IconCatalog } from '../icons/catalog.js';
import { autoLayout } from './layout.js';
import { blockerIn, takeWholeGroups } from './membership.js';
import { narrate } from './narrate.js';
import { Story, StoryError } from './story.js';

export interface SentenceInput {
  /** Name of the actor who does something. Created if the story has no actor of that name. */
  actor: string;
  actorIcon?: string;
  /** The verb of the sentence, for example "orders" or "writes". */
  activity: string;
  /**
   * Name of the work object the actor works with. Each sentence draws a new
   * work object, as Egon users do, unless this is the id of an existing work
   * object, `reuseWorkObject` is set, or a work object of that name is not used
   * by any activity yet (see `workObjectFor`).
   */
  workObject: string;
  workObjectIcon?: string;
  /** Use the latest work object with this name instead of drawing a new one. */
  reuseWorkObject?: boolean;
  /** Actors who receive the work object, for example `{ activity: "to", actor: "Clerk" }`. */
  to?: { actor: string; activity?: string; actorIcon?: string }[];
  /** Puts the sentence into an existing step instead of appending a new one. */
  number?: number;
}

export interface SentenceResult {
  number: number;
  created: StoryElement[];
  activityIds: string[];
}

export interface ShapeSpec {
  name: string;
  icon?: string;
  color?: string;
}

export interface BuildStoryInput {
  title: string;
  description?: string;
  scope?: Scope;
  /** Actors to create up front, to set their icon or color. */
  actors?: ShapeSpec[];
  /** Work objects to create up front, to set their icon or color. */
  workObjects?: ShapeSpec[];
  sentences: SentenceInput[];
  /** Members by name or id, and the work objects of whole sentences by step number. */
  groups?: { name: string; members?: string[]; steps?: number[]; color?: string }[];
  annotations?: { text: string; attachTo?: string }[];
  /** Arrange the elements on a grid afterwards (default true). */
  layout?: boolean;
}

/**
 * Adds one domain story sentence ("Customer tells Order to Clerk"). Actors are
 * shared across sentences and matched by name; each sentence gets its own work
 * object unless told to reuse one. Without an explicit icon, a new element uses
 * the built-in icon of the same name if there is one (an "Email" work object
 * gets the Email icon), else Person or Document.
 */
export function addSentence(story: Story, input: SentenceInput): SentenceResult {
  const created: StoryElement[] = [];
  const actor = findOrCreateActor(story, input.actor, input.actorIcon, created);
  const workObject = workObjectFor(story, input, created);
  const recipients = (input.to ?? []).map((recipient) => ({
    activity: recipient.activity ?? '',
    actor: findOrCreateActor(story, recipient.actor, recipient.actorIcon, created),
  }));

  const main = story.addActivity({
    from: actor.id,
    to: workObject.id,
    label: input.activity,
    ...(input.number !== undefined ? { number: input.number } : {}),
  });
  const activityIds = [main.id];
  for (const recipient of recipients) {
    activityIds.push(story.addActivity({ from: workObject.id, to: recipient.actor.id, label: recipient.activity }).id);
  }
  return { number: main.number as number, created, activityIds };
}

/** Creates a complete story from sentences in one go. */
export function buildStory(input: BuildStoryInput): Story {
  const story = Story.create({
    title: input.title,
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.scope !== undefined ? { scope: input.scope } : {}),
  });
  // One transaction, so each step does not keep its own copy to undo.
  story.transaction(() => {
    for (const spec of input.actors ?? []) {
      withContext(`actor "${spec.name}"`, () => story.addActor(shapeInput(spec)));
    }
    for (const spec of input.workObjects ?? []) {
      withContext(`work object "${spec.name}"`, () => story.addWorkObject(shapeInput(spec)));
    }
    input.sentences.forEach((sentence, index) => {
      withContext(`sentence ${index + 1}`, () => addSentence(story, sentence));
    });
    // A group that names a shared work object next to its steps goes first, so a group of the other
    // steps finds it settled whatever the order of the list.
    const groups = input.groups ?? [];
    const settles = (group: (typeof groups)[number]) => Boolean(group.steps?.length && group.members?.length);
    for (const group of [...groups.filter(settles), ...groups.filter((group) => !settles(group))]) {
      if (!group.members?.length && !group.steps?.length) {
        throw new StoryError(`The group "${group.name}" needs members or steps.`);
      }
      withContext(`group "${group.name}"`, () =>
        story.addGroup({
          name: group.name,
          members: group.steps
            ? ((named) => [...named, ...membersOfSteps(story, group.steps as number[], named)])(namedForSteps(story, group.members ?? [], group.steps))
            : (group.members ?? []),
          ...(group.color ? { color: group.color } : {}),
        }),
      );
    }
    for (const annotation of input.annotations ?? []) {
      withContext('annotation', () =>
        story.addAnnotation({
          text: annotation.text,
          ...(annotation.attachTo ? { attachTo: annotation.attachTo } : {}),
        }),
      );
    }
    if (input.layout !== false) {
      autoLayout(story);
    }
  });
  return story;
}

function findOrCreateActor(story: Story, name: string, icon: string | undefined, created: StoryElement[]): ShapeElement {
  const existing = sameName(story, name, 'actor');
  if (existing.length > 0) {
    return existing[0] as ShapeElement;
  }
  return create(story, 'actor', name, icon, created);
}

/**
 * The work object for a sentence: an existing one given by id, the latest one
 * of that name with `reuseWorkObject`, a declared one that is not used yet,
 * or a new one that copies icon and color from earlier work objects of the
 * same name.
 */
function workObjectFor(story: Story, input: SentenceInput, created: StoryElement[]): ShapeElement {
  const byId = story.get(input.workObject);
  if (byId) {
    if (!isWorkObject(byId)) {
      throw new StoryError(`"${input.workObject}" is not a work object.`);
    }
    return byId as ShapeElement;
  }
  const existing = sameName(story, input.workObject, 'workObject') as ShapeElement[];
  if (input.reuseWorkObject && existing.length > 0) {
    return existing[existing.length - 1] as ShapeElement;
  }
  const used = new Set(story.elements().flatMap((element) => (isActivity(element) ? [element.source, element.target] : [])));
  const declared = existing.find((element) => !used.has(element.id));
  if (declared) {
    return input.workObjectIcon ? (story.updateElement(declared.id, { icon: input.workObjectIcon }) as ShapeElement) : declared;
  }
  const previous = existing[existing.length - 1];
  const icon = input.workObjectIcon ?? (previous ? iconNameOf(previous.type) : undefined);
  const element = create(story, 'workObject', input.workObject, icon, created);
  if (previous?.pickedColor) {
    const colored = story.updateElement(element.id, { color: previous.pickedColor }) as ShapeElement;
    created[created.length - 1] = colored;
    return colored;
  }
  return element;
}

/** Actors or work objects with this name, after checking the name is not used by the other kind. */
function sameName(story: Story, name: string, kind: 'actor' | 'workObject'): StoryElement[] {
  const wanted = name.trim().toLowerCase();
  if (!wanted) {
    throw new StoryError(`Every sentence needs a name for its ${kind === 'actor' ? 'actor' : 'work object'}.`);
  }
  // In id order, which is the order of adding and survives a save.
  const matches = story
    .elements()
    .filter((element) => element.name.trim().toLowerCase() === wanted)
    .sort((a, b) => compareIds(a.id, b.id));
  const otherKind = matches.find((element) => (kind === 'actor' ? isWorkObject(element) : isActor(element)));
  if (otherKind) {
    throw new StoryError(
      `"${name}" is already a ${isActor(otherKind) ? 'actor' : 'work object'} in this story and cannot also be a ${kind === 'actor' ? 'actor' : 'work object'}.`,
    );
  }
  return matches.filter((element) => (kind === 'actor' ? isActor(element) : isWorkObject(element)));
}

function create(
  story: Story,
  kind: 'actor' | 'workObject',
  name: string,
  icon: string | undefined,
  created: StoryElement[],
): ShapeElement {
  const chosenIcon = icon ?? IconCatalog.builtIn().get(name)?.name;
  const input = { name: name.trim(), ...(chosenIcon ? { icon: chosenIcon } : {}) };
  const element = kind === 'actor' ? story.addActor(input) : story.addWorkObject(input);
  created.push(element);
  return element;
}

function shapeInput(spec: ShapeSpec) {
  return { name: spec.name, ...(spec.icon ? { icon: spec.icon } : {}), ...(spec.color ? { color: spec.color } : {}) };
}

/**
 * The members for a group made from the sentences with these step numbers:
 * their work objects, the second work object of a sentence included, but
 * never their actors, which usually take part in several subdomains. An
 * existing group made only of these (and of `named`, members given in the
 * same call) goes in whole, so inner groups may be drawn before outer ones.
 */
export function membersOfSteps(story: Story, steps: number[], named: string[] = []): string[] {
  const doc = story.toDocument();
  const byId = new Map(doc.elements.map((element) => [element.id, element]));
  const narrative = narrate(doc);
  const nameOf = (id: string) => (byId.get(id) as StoryElement).name || id;
  // The steps each work object takes part in, onward arrows included.
  const stepsOf = new Map<string, number[]>();
  for (const step of narrative) {
    for (const id of step.elementIds) {
      const element = byId.get(id);
      if (element && isWorkObject(element) && !stepsOf.get(id)?.includes(step.number)) {
        stepsOf.set(id, [...(stepsOf.get(id) ?? []), step.number]);
      }
    }
  }
  const ids: string[] = [];
  const stepOf = new Map<string, number>();
  for (const number of steps) {
    const step = narrative.find((candidate) => candidate.number === number);
    if (!step) {
      throw new StoryError(`There is no step ${number}; the story has steps ${narrative.map((candidate) => candidate.number).join(', ') || 'none'}.`);
    }
    for (const id of step.elementIds) {
      if (isWorkObject(byId.get(id) as StoryElement) && !ids.includes(id)) {
        ids.push(id);
        stepOf.set(id, number);
      }
    }
  }
  if (ids.length === 0 && named.length === 0) {
    throw new StoryError(`${steps.length > 1 ? 'Steps' : 'Step'} ${steps.join(', ')} ${steps.length > 1 ? 'have' : 'has'} no work object, so there is nothing to group.`);
  }
  // A work object shared with a sentence outside these steps cannot be in two groups. Naming it in
  // the same call decides that it belongs here. A group it already sits in decides too, unless that
  // group is the one the new box nests in, or one around it, which holds its other sentences as well.
  const plain = ids.filter((id) => (stepsOf.get(id) ?? []).every((number) => steps.includes(number)));
  const chains = plain.map((id) => groupAncestors(byId.get(id), byId));
  const around = chains[0]?.find((group) => chains.every((chain) => chain.includes(group)));
  const aroundChain = around ? [around, ...groupAncestors(byId.get(around), byId)] : [];
  const settled: string[] = [];
  for (const id of ids.filter((candidate) => !plain.includes(candidate))) {
    const home = groupAncestors(byId.get(id), byId)[0];
    if (named.includes(id) || (home !== undefined && !aroundChain.includes(home))) {
      ids.splice(ids.indexOf(id), 1);
      settled.push(id);
      continue;
    }
    const others = (stepsOf.get(id) ?? []).filter((number) => !steps.includes(number));
    throw new StoryError(
      `"${nameOf(id)}" in step ${stepOf.get(id)} is used by ${others.length > 1 ? 'steps' : 'step'} ${others.join(', ')} too, so it cannot go into a group of these steps alone. Decide which group it belongs to: to put it in this one, pass "${nameOf(id)}" in members as well as the steps; grouping other steps later leaves it where it is.`,
    );
  }
  if (ids.length === 0 && named.length === 0) {
    const examples = settled.map((id) => `"${nameOf(id)}" in "${nameOf(groupAncestors(byId.get(id), byId)[0] as string)}"`).join(', ');
    throw new StoryError(
      `Every work object of ${steps.length > 1 ? 'steps' : 'step'} ${steps.join(', ')} serves other steps too and already sits in a group (${examples}), so there is nothing left to group. To move one into this group, pass it in members as well as the steps.`,
    );
  }
  // An existing group made only of these work objects goes in whole, outermost first.
  const members = takeWholeGroups([...ids, ...named], doc.elements);
  const only = members.length === 1 ? (members[0] as string) : undefined;
  if (only && isGroup(byId.get(only) as StoryElement) && !named.includes(only)) {
    throw new StoryError(
      `${steps.length > 1 ? 'Steps' : 'Step'} ${steps.join(', ')} ${steps.length > 1 ? 'are' : 'is'} already the group "${nameOf(only)}"; leave out one of the two groups, or choose other steps.`,
    );
  }
  // What is left must not cross other groups; all in one group is fine, which then holds the new group.
  const homes = members.map((id) => groupAncestors(byId.get(id), byId)[0]);
  const outside = members.find((id, index) => homes[index] === undefined && named.includes(id));
  if (new Set(homes).size > 1 && outside !== undefined) {
    const index = homes.findIndex((home) => home !== undefined);
    throw new StoryError(
      `"${nameOf(outside)}" is in no group while "${nameOf(members[index] as string)}" is in the group "${nameOf(homes[index] as string)}", so the new box would cross it. Leave "${nameOf(outside)}" out, or change or remove that group.`,
    );
  }
  if (new Set(homes).size > 1) {
    const index = homes.findIndex((home) => home !== undefined);
    const id = members[index] as string;
    const home = homes[index] as string;
    const blocker = blockerIn(home, [...ids, ...named], doc.elements);
    const kind = (element: StoryElement) => (isActor(element) ? 'the actor' : isWorkObject(element) ? 'the work object' : 'the note');
    const holds = blocker
      ? `which also holds ${kind(blocker)} "${blocker.name || (blocker['text'] as string | undefined) || blocker.id}"`
      : 'while other work objects of these steps are in no group or another one';
    throw new StoryError(
      `"${nameOf(id)}"${stepOf.has(id) ? ` in step ${stepOf.get(id)}` : ''} is in the group "${nameOf(home)}", ${holds}, so the new box would cross it. Change or remove that group, or choose other steps.`,
    );
  }
  return members;
}

/**
 * The ids that member references stand for next to these steps. A name that
 * several work objects share (one per sentence) means the copies these steps
 * use, so a shared work object can be named before the story has ids.
 */
export function namedForSteps(story: Story, refs: string[], steps: number[]): string[] {
  const inSteps = new Set(
    narrate(story.toDocument())
      .filter((step) => steps.includes(step.number))
      .flatMap((step) => step.elementIds),
  );
  return refs.flatMap((ref) => {
    const ids = story.idsOf(ref);
    if (ids.length <= 1 || story.get(ref)) {
      return ids;
    }
    const used = ids.filter((id) => inSteps.has(id));
    if (used.length === 0) {
      throw new StoryError(`"${ref}" names ${ids.length} elements and these steps use none of them; pass an id from get_story.`);
    }
    return used;
  });
}

function withContext<T>(context: string, action: () => T): T {
  try {
    return action();
  } catch (error) {
    if (error instanceof StoryError) {
      throw new StoryError(`In ${context}: ${error.message}`);
    }
    throw error;
  }
}
