import {
  isActivity,
  isActor,
  isWorkObject,
  type ActivityElement,
  type StoryDocument,
  type StoryElement,
} from '../egon/types.js';
import { compareKeys, readingPosition } from './geometry.js';

export interface NarrativeStep {
  number: number;
  sentence: string;
  actors: string[];
  workObjects: string[];
  recipients: string[];
  /** Ids of every actor, work object and activity that takes part in the step. */
  elementIds: string[];
}

/**
 * Reads a story as numbered sentences, the way Egon's replay builds them
 * (StoryCreatorService). A step is every actor activity with the same number.
 * From a work object the sentence continues along all of its outgoing
 * activities until it reaches an actor, so "Customer tells Order to Clerk"
 * is one sentence. A work object reached in several steps repeats its onward
 * activities in each of them, as in Egon. Sentences that share a number, and
 * the onward arrows of one work object, are read in the order they are drawn:
 * top to bottom, then left to right. Element order cannot decide it, because
 * Egon and save_story write elements sorted by id.
 */
export function narrate(doc: StoryDocument): NarrativeStep[] {
  const byId = new Map(doc.elements.map((element) => [element.id, element]));
  const drawn = (activity: ActivityElement) => [...readingPosition(byId.get(activity.source)), ...readingPosition(byId.get(activity.target))];
  const activities = doc.elements
    .filter(isActivity)
    .sort((a, b) => compareKeys([...drawn(a), a.id], [...drawn(b), b.id]));
  const numbered = activities
    .filter((activity) => typeof activity.number === 'number' && isActorId(byId, activity.source))
    .sort((a, b) => (a.number as number) - (b.number as number));

  const steps = new Map<number, NarrativeStep>();
  for (const activity of numbered) {
    const number = activity.number as number;
    let step = steps.get(number);
    if (!step) {
      step = { number, sentence: '', actors: [], workObjects: [], recipients: [], elementIds: [] };
      steps.set(number, step);
    }
    const source = byId.get(activity.source);
    const target = byId.get(activity.target);
    if (!source || !target) {
      continue;
    }
    addUnique(step.actors, displayName(source));
    addUnique(step.elementIds, source.id, activity.id);
    const clause = `${displayName(source)} ${label(activity)} ${continueFrom(target, step, byId, activities, new Set())}`;
    step.sentence = step.sentence ? `${step.sentence} ${clause}.` : `${clause}.`;
  }
  return [...steps.values()];
}

/** Names `element` and, for a work object, appends where its outgoing activities lead. */
function continueFrom(
  element: StoryElement,
  step: NarrativeStep,
  byId: Map<string, StoryElement>,
  activities: ActivityElement[],
  visited: Set<string>,
): string {
  addUnique(step.elementIds, element.id);
  if (isActor(element)) {
    addUnique(step.recipients, displayName(element));
    return displayName(element);
  }
  if (isWorkObject(element)) {
    addUnique(step.workObjects, displayName(element));
  }
  if (visited.has(element.id)) {
    return displayName(element);
  }
  visited.add(element.id);
  const parts: string[] = [];
  for (const next of activities.filter((candidate) => candidate.source === element.id)) {
    const target = byId.get(next.target);
    if (!target) {
      continue;
    }
    addUnique(step.elementIds, next.id);
    parts.push(`${label(next)} ${continueFrom(target, step, byId, activities, visited)}`);
  }
  if (parts.length === 0) {
    return displayName(element);
  }
  // Join onward arrows with "and". An arrow already labeled "and" (as the book labels a second
  // recipient) continues the arrow drawn before it and gets no extra "and"; one drawn before
  // any other arrow is read after the first of them.
  const startsWithAnd = (part: string) => /^and\b/i.test(part);
  const ordered: string[] = [];
  let leading: string[] = [];
  for (const part of parts) {
    if (startsWithAnd(part) && ordered.length === 0) {
      leading.push(part);
      continue;
    }
    ordered.push(part);
    if (!startsWithAnd(part) && leading.length > 0) {
      ordered.push(...leading);
      leading = [];
    }
  }
  ordered.push(...leading);
  const joined = ordered.map((part, index) => (index === 0 ? part : startsWithAnd(part) ? ` ${part}` : ` and ${part}`)).join('');
  return `${displayName(element)} ${joined}`;
}

function isActorId(byId: Map<string, StoryElement>, id: string): boolean {
  const element = byId.get(id);
  return element !== undefined && isActor(element);
}

export function narrativeMarkdown(doc: StoryDocument): string {
  const lines = [`# ${doc.title || 'Untitled domain story'}`, ''];
  if (doc.description.trim()) {
    lines.push(doc.description.trim(), '');
  }
  const scope = [doc.scope?.granularity, doc.scope?.pointInTime, doc.scope?.domainPurity].filter(Boolean);
  if (scope.length > 0) {
    lines.push(`Scope: ${scope.join(', ')}`, '');
  }
  const steps = narrate(doc);
  if (steps.length === 0) {
    lines.push('No activities yet.');
  } else {
    for (const step of steps) {
      lines.push(`${step.number}. ${step.sentence}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

function displayName(element: StoryElement): string {
  if (element.name.trim()) {
    return element.name.trim();
  }
  if (isActor(element)) {
    return '[unnamed actor]';
  }
  if (isWorkObject(element)) {
    return '[unnamed work object]';
  }
  return '[unnamed]';
}

function label(activity: ActivityElement): string {
  return activity.name.trim() || '[unlabeled activity]';
}

function addUnique(list: string[], ...values: string[]): void {
  for (const value of values) {
    if (!list.includes(value)) {
      list.push(value);
    }
  }
}
