import { groupAncestors, isEdge, isGroup, type GroupElement, type ShapeElement, type StoryElement } from '../egon/types.js';
import { boundsOf } from './geometry.js';

/**
 * Egon's rule for what lies in a group (reworkGroupElements): the element's
 * top-left corner is inside the group's box, edges included.
 */
export function cornerInside(element: StoryElement | { x: number; y: number }, group: StoryElement): boolean {
  const x = (element as Record<string, unknown>)['x'];
  const y = (element as Record<string, unknown>)['y'];
  if (typeof x !== 'number' || typeof y !== 'number') {
    return false;
  }
  const box = boundsOf(group as ShapeElement);
  return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
}

function area(element: StoryElement): number {
  const box = boundsOf(element as ShapeElement);
  return box.width * box.height;
}

/** Whether `group` can hold `element`: never itself, and a group only goes into a larger group that is not inside it. */
function canHold(group: StoryElement, element: StoryElement, byId: Map<string, StoryElement>): boolean {
  if (group.id === element.id) {
    return false;
  }
  return !isGroup(element) || (area(group) > area(element) && !groupAncestors(group, byId).includes(element.id));
}

/** The smallest group that holds the element's top-left corner and can hold the element. */
export function groupAt(element: StoryElement, elements: StoryElement[]): GroupElement | undefined {
  if (isEdge(element)) {
    return undefined;
  }
  const byId = new Map(elements.map((candidate) => [candidate.id, candidate]));
  return elements
    .filter(isGroup)
    .filter((group) => canHold(group, element, byId) && cornerInside(element, group))
    .sort((a, b) => area(a) - area(b) || a.id.localeCompare(b.id))[0];
}

/** Moves the element into the group at its position, or out of every group. */
export function joinGroupAt(element: StoryElement, elements: StoryElement[]): void {
  delete element['parent'];
  const group = groupAt(element, elements);
  if (group) {
    element['parent'] = group.id;
  }
}

/**
 * What a group drawn, moved or resized in Egon does (reworkGroupElements): it
 * takes in the elements beside it, at the same level, whose top-left corner
 * its box now covers.
 */
export function takeIn(group: GroupElement, elements: StoryElement[]): void {
  const byId = new Map(elements.map((candidate) => [candidate.id, candidate]));
  for (const element of elements) {
    if (!isEdge(element) && element['parent'] === group['parent'] && canHold(group, element, byId) && cornerInside(element, group)) {
      element['parent'] = group.id;
    }
  }
}

/**
 * Brings the groups of a story read from a file in line with what Egon shows.
 * Egon reads `parent`, but leaves it out of its files for elements that a
 * group was drawn or resized around, so an element without one goes into the
 * group at its position. A group can only sit in a larger group: a link to a
 * group that is not larger is dropped (Egon keeps one when a group is resized
 * around its old parent), which also rules out loops.
 */
export function settleMembership(elements: StoryElement[]): void {
  const byId = new Map(elements.map((element) => [element.id, element]));
  for (const element of elements.filter(isGroup)) {
    const parent = typeof element['parent'] === 'string' ? byId.get(element['parent']) : undefined;
    if (parent && isGroup(parent) && area(parent) <= area(element)) {
      delete element['parent'];
    }
  }
  for (const element of elements) {
    if (element['parent'] === undefined && !isEdge(element)) {
      joinGroupAt(element, elements);
    }
  }
}
