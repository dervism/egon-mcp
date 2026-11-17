import { IconCatalog } from '../icons/catalog.js';
import {
  groupAncestors,
  iconNameOf,
  isActivity,
  isActor,
  isConnection,
  isEdge,
  isGroup,
  isTextAnnotation,
  isWorkObject,
  type ShapeElement,
  type StoryDocument,
  type StoryElement,
} from '../egon/types.js';
import { boundsOf, type Bounds } from './geometry.js';

export type Severity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  severity: Severity;
  code: string;
  message: string;
  elementIds: string[];
}

const PLACEHOLDER_TITLE = 'Click to add title';

/**
 * Checks a story for problems that break the import into Egon (errors) or
 * that make the story hard to read (warnings).
 */
export function validateStory(doc: StoryDocument, catalog: IconCatalog = IconCatalog.builtIn()): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (severity: Severity, code: string, message: string, ...elementIds: string[]) =>
    issues.push({ severity, code, message, elementIds });

  if (!doc.title.trim() || doc.title.trim() === PLACEHOLDER_TITLE) {
    add('warning', 'missing-title', 'The story has no title.');
  }

  const byId = new Map<string, StoryElement>();
  for (const element of doc.elements) {
    if (byId.has(element.id)) {
      add('error', 'duplicate-id', `Two elements share the id ${element.id}.`, element.id);
    }
    byId.set(element.id, element);
  }

  for (const element of doc.elements) {
    if (isActor(element) || isWorkObject(element)) {
      checkIcon(element, doc, catalog, add);
      if (!element.name.trim()) {
        add('warning', 'unnamed-element', `The ${isActor(element) ? 'actor' : 'work object'} ${element.id} has no name.`, element.id);
      }
    }
    const parent = element['parent'];
    if (typeof parent === 'string' && !isGroup(byId.get(parent) ?? { type: '' })) {
      add('warning', 'dangling-reference', `${element.id} belongs to group ${parent}, which does not exist.`, element.id);
    }
    if (isEdge(element)) {
      checkEdge(element, byId, add);
    }
  }

  checkNumbering(doc, byId, add);
  checkConnectedness(doc, add);
  checkOverlaps(doc, add);
  checkGroups(doc, byId, add);
  return issues;
}

/**
 * Group boxes should hold their members and nothing else, because readers take
 * whatever is inside a box as part of the group. Nested groups are fine.
 */
function checkGroups(doc: StoryDocument, byId: Map<string, StoryElement>, add: AddIssue): void {
  const groups = doc.elements.filter(isGroup) as (ShapeElement & { width?: number; height?: number })[];
  const isInside = (id: string, group: string) => groupAncestors(byId.get(id), byId).includes(group);
  for (const group of groups) {
    const box = boundsOf(group);
    for (const shape of doc.elements.filter((element) => isNode(element)) as ShapeElement[]) {
      const bounds = boundsOf(shape);
      const centerX = bounds.x + bounds.width / 2;
      const centerY = bounds.y + bounds.height / 2;
      const enclosed = centerX > box.x && centerX < box.x + box.width && centerY > box.y && centerY < box.y + box.height;
      if (enclosed && !isInside(shape.id, group.id)) {
        add(
          'warning',
          'group-encloses-non-member',
          `The group "${group.name || group.id}" encloses "${shape.name || shape.id}", which is not in it. Run auto_layout or move one of them.`,
          group.id,
          shape.id,
        );
      }
    }
  }
  for (const [index, a] of groups.entries()) {
    for (const b of groups.slice(index + 1)) {
      const nested = isInside(a.id, b.id) || isInside(b.id, a.id);
      if (!nested && overlap(boundsOf(a), boundsOf(b)) > 0) {
        add(
          'warning',
          'overlapping-groups',
          `The groups "${a.name || a.id}" and "${b.name || b.id}" overlap. Run auto_layout or move one of them.`,
          a.id,
          b.id,
        );
      }
    }
  }
}

type AddIssue = (severity: Severity, code: string, message: string, ...elementIds: string[]) => void;

function checkIcon(element: StoryElement, doc: StoryDocument, catalog: IconCatalog, add: AddIssue): void {
  const icon = iconNameOf(element.type);
  const custom = doc.iconSet.actors[icon] ?? doc.iconSet.workObjects[icon];
  if (!catalog.get(icon) && !custom) {
    add(
      'error',
      'unknown-icon',
      `${element.id} uses the icon "${icon}", which is neither built into Egon nor included in the story's icon set.`,
      element.id,
    );
  }
}

function checkEdge(
  edge: StoryElement & { source: string; target: string; waypoints: unknown },
  byId: Map<string, StoryElement>,
  add: AddIssue,
): void {
  const source = byId.get(edge.source);
  const target = byId.get(edge.target);
  if (!source || !target) {
    add(
      'error',
      'dangling-reference',
      `${edge.id} connects ${edge.source} to ${edge.target}, but ${!source ? edge.source : edge.target} does not exist. Egon drops or fails on such edges.`,
      edge.id,
    );
    return;
  }
  if (!Array.isArray(edge.waypoints) || edge.waypoints.length < 2) {
    add('error', 'missing-waypoints', `${edge.id} needs at least two waypoints for Egon to draw it.`, edge.id);
  }
  if (isActivity(edge)) {
    if (isActor(source) && isActor(target)) {
      add(
        'error',
        'actor-to-actor',
        `${edge.id} connects two actors, which Egon does not allow. Put a work object between them.`,
        edge.id,
      );
    } else if (!isNode(source) || !isNode(target)) {
      add('error', 'invalid-endpoint', `${edge.id} is an activity but does not connect two actors or work objects.`, edge.id);
    }
    if (!edge.name.trim()) {
      add('warning', 'unlabeled-activity', `The activity ${edge.id} has no label.`, edge.id);
    }
  } else if (isConnection(edge) && !isTextAnnotation(target)) {
    add('error', 'invalid-endpoint', `${edge.id} is an annotation link but does not end at a text annotation.`, edge.id);
  }
}

function checkNumbering(doc: StoryDocument, byId: Map<string, StoryElement>, add: AddIssue): void {
  const numbers = new Set<number>();
  for (const activity of doc.elements.filter(isActivity)) {
    const source = byId.get(activity.source);
    if (!source) {
      continue;
    }
    const hasNumber = typeof activity.number === 'number' && activity.number > 0;
    if (isActor(source)) {
      if (hasNumber) {
        numbers.add(activity.number as number);
      } else {
        add(
          'warning',
          'missing-number',
          `The activity ${activity.id} starts at an actor but has no number. Egon will assign one on import.`,
          activity.id,
        );
      }
    } else if (hasNumber) {
      add(
        'info',
        'number-ignored',
        `The activity ${activity.id} starts at a work object, so Egon ignores its number.`,
        activity.id,
      );
    }
  }
  const highest = Math.max(0, ...numbers);
  const missing: number[] = [];
  for (let step = 1; step <= highest; step += 1) {
    if (!numbers.has(step)) {
      missing.push(step);
    }
  }
  if (missing.length > 0) {
    add(
      'warning',
      'numbering-gap',
      `Step ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing. Egon's replay reports missing sentences; run renumber to close the gap.`,
    );
  }
}

function checkConnectedness(doc: StoryDocument, add: AddIssue): void {
  const connected = new Set<string>();
  for (const element of doc.elements) {
    if (isActivity(element)) {
      connected.add(element.source);
      connected.add(element.target);
    }
  }
  for (const element of doc.elements) {
    if ((isActor(element) || isWorkObject(element)) && !connected.has(element.id)) {
      add(
        'warning',
        'unconnected-element',
        `"${element.name || element.id}" takes part in no activity.`,
        element.id,
      );
    }
  }
}

function checkOverlaps(doc: StoryDocument, add: AddIssue): void {
  const shapes = doc.elements.filter((element) => isNode(element)) as ShapeElement[];
  for (let i = 0; i < shapes.length; i += 1) {
    for (let j = i + 1; j < shapes.length; j += 1) {
      const a = shapes[i] as ShapeElement;
      const b = shapes[j] as ShapeElement;
      if (overlap(boundsOf(a), boundsOf(b)) > 0.25) {
        add(
          'warning',
          'overlapping-shapes',
          `"${a.name || a.id}" and "${b.name || b.id}" overlap. Run auto_layout or move one of them.`,
          a.id,
          b.id,
        );
      }
    }
  }
}

function isNode(element: StoryElement): boolean {
  return isActor(element) || isWorkObject(element);
}

/** Overlapping area as a share of the smaller box. */
function overlap(a: Bounds, b: Bounds): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (width <= 0 || height <= 0) {
    return 0;
  }
  return (width * height) / Math.min(a.width * a.height, b.width * b.height);
}
