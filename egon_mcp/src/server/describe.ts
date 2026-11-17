import {
  iconNameOf,
  isActivity,
  isActor,
  isConnection,
  isGroup,
  isTextAnnotation,
  isWorkObject,
  type ShapeElement,
  type StoryElement,
} from '../egon/types.js';
import { noteAnchors } from '../story/layout.js';
import { narrate } from '../story/narrate.js';
import { validateStory } from '../story/validate.js';
import type { StoryEntry } from './workspace.js';

/** A compact, agent-friendly view of a story: names instead of raw Egon objects. */
export function describeStory(entry: StoryEntry, options: { positions?: boolean } = {}) {
  const doc = entry.story.toDocument();
  const byId = new Map(doc.elements.map((element) => [element.id, element]));
  const nameOf = (id: string) => byId.get(id)?.name || byId.get(id)?.['text'] || id;
  const anchors = noteAnchors(doc.elements);
  const position = (element: StoryElement) =>
    options.positions ? { x: (element as ShapeElement).x, y: (element as ShapeElement).y } : {};
  const color = (element: StoryElement) => (element.pickedColor ? { color: element.pickedColor } : {});

  const shape = (element: StoryElement) => ({
    id: element.id,
    name: element.name,
    icon: iconNameOf(element.type),
    ...color(element),
    ...(typeof element['parent'] === 'string' ? { group: nameOf(element['parent']) } : {}),
    ...position(element),
  });

  const issues = validateStory(doc);
  return {
    storyId: entry.id,
    title: doc.title,
    description: doc.description,
    ...(doc.scope ? { scope: doc.scope } : {}),
    ...(entry.path ? { path: entry.path } : {}),
    unsavedChanges: entry.dirty,
    actors: doc.elements.filter(isActor).map(shape),
    workObjects: doc.elements.filter(isWorkObject).map(shape),
    activities: doc.elements.filter(isActivity).map((activity) => ({
      id: activity.id,
      number: typeof activity.number === 'number' ? activity.number : null,
      label: activity.name,
      from: nameOf(activity.source),
      to: nameOf(activity.target),
      fromId: activity.source,
      toId: activity.target,
      ...color(activity),
    })),
    groups: doc.elements.filter(isGroup).map((group) => ({
      id: group.id,
      name: group.name,
      members: doc.elements.filter((element) => element['parent'] === group.id).map((element) => nameOf(element.id)),
      ...color(group),
      ...position(group),
    })),
    annotations: doc.elements.filter(isTextAnnotation).map((annotation) => {
      // The same link auto_layout follows: with several, the one of lowest id.
      const anchor = anchors.get(annotation.id);
      return {
        id: annotation.id,
        text: annotation.text ?? '',
        ...(anchor ? { attachedTo: nameOf(anchor.id) } : {}),
        ...position(annotation),
      };
    }),
    steps: narrate(doc).map((step) => `${step.number}. ${step.sentence}`),
    issueCount: {
      errors: issues.filter((issue) => issue.severity === 'error').length,
      warnings: issues.filter((issue) => issue.severity === 'warning').length,
    },
  };
}

/** One line per open story for list_stories. */
export function summarizeEntry(entry: StoryEntry) {
  const doc = entry.story.toDocument();
  return {
    storyId: entry.id,
    title: doc.title,
    ...(entry.path ? { path: entry.path } : {}),
    unsavedChanges: entry.dirty,
    actors: doc.elements.filter(isActor).length,
    workObjects: doc.elements.filter(isWorkObject).length,
    steps: narrate(doc).length,
  };
}
