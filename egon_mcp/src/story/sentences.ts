import { isActor, isWorkObject, type Scope, type ShapeElement, type StoryElement } from '../egon/types.js';
import { IconCatalog } from '../icons/catalog.js';
import { autoLayout } from './layout.js';
import { Story, StoryError } from './story.js';

export interface SentenceInput {
  /** Name of the actor who does something. Created if the story has no actor of that name. */
  actor: string;
  actorIcon?: string;
  /** The verb of the sentence, for example "orders" or "writes". */
  activity: string;
  /** Name of the work object the actor works with. Created when missing. */
  workObject: string;
  workObjectIcon?: string;
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
  groups?: { name: string; members: string[]; color?: string }[];
  annotations?: { text: string; attachTo?: string }[];
  /** Arrange the elements on a grid afterwards (default true). */
  layout?: boolean;
}

/**
 * Adds one domain story sentence ("Customer tells Order to Clerk"), creating
 * the actors and work objects that do not exist yet. Without an explicit
 * icon, a new element uses the built-in icon of the same name if there is one
 * (an "Email" work object gets the Email icon), else Person or Document.
 */
export function addSentence(story: Story, input: SentenceInput): SentenceResult {
  const created: StoryElement[] = [];
  const actor = findOrCreate(story, 'actor', input.actor, input.actorIcon, created);
  const workObject = findOrCreate(story, 'workObject', input.workObject, input.workObjectIcon, created);
  const recipients = (input.to ?? []).map((recipient) => ({
    activity: recipient.activity ?? '',
    actor: findOrCreate(story, 'actor', recipient.actor, recipient.actorIcon, created),
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
  for (const spec of input.actors ?? []) {
    withContext(`actor "${spec.name}"`, () => story.addActor(shapeInput(spec)));
  }
  for (const spec of input.workObjects ?? []) {
    withContext(`work object "${spec.name}"`, () => story.addWorkObject(shapeInput(spec)));
  }
  input.sentences.forEach((sentence, index) => {
    withContext(`sentence ${index + 1}`, () => addSentence(story, sentence));
  });
  for (const group of input.groups ?? []) {
    withContext(`group "${group.name}"`, () =>
      story.addGroup({ name: group.name, members: group.members, ...(group.color ? { color: group.color } : {}) }),
    );
  }
  for (const annotation of input.annotations ?? []) {
    withContext('annotation', () =>
      story.addAnnotation({ text: annotation.text, ...(annotation.attachTo ? { attachTo: annotation.attachTo } : {}) }),
    );
  }
  if (input.layout !== false) {
    autoLayout(story);
  }
  return story;
}

function findOrCreate(
  story: Story,
  kind: 'actor' | 'workObject',
  name: string,
  icon: string | undefined,
  created: StoryElement[],
): ShapeElement {
  const wanted = name.trim().toLowerCase();
  if (!wanted) {
    throw new StoryError(`Every sentence needs a name for its ${kind === 'actor' ? 'actor' : 'work object'}.`);
  }
  const sameName = story.elements().filter((element) => element.name.trim().toLowerCase() === wanted);
  const match = sameName.find((element) => (kind === 'actor' ? isActor(element) : isWorkObject(element)));
  if (match) {
    return match as ShapeElement;
  }
  const other = sameName.find((element) => isActor(element) || isWorkObject(element));
  if (other) {
    throw new StoryError(
      `"${name}" is already a ${isActor(other) ? 'actor' : 'work object'} in this story and cannot also be a ${kind === 'actor' ? 'actor' : 'work object'}.`,
    );
  }
  const chosenIcon = icon ?? IconCatalog.builtIn().get(name)?.name;
  const input = { name: name.trim(), ...(chosenIcon ? { icon: chosenIcon } : {}) };
  const element = kind === 'actor' ? story.addActor(input) : story.addWorkObject(input);
  created.push(element);
  return element;
}

function shapeInput(spec: ShapeSpec) {
  return { name: spec.name, ...(spec.icon ? { icon: spec.icon } : {}), ...(spec.color ? { color: spec.color } : {}) };
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
