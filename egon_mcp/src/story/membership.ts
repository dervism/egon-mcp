import { groupAncestors, isConnection, isEdge, isGroup, isTextAnnotation, type GroupElement, type ShapeElement, type StoryElement } from '../egon/types.js';
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
 * Brings the groups of a story read from a file in line with its drawing.
 * Egon's import reads `parent` and then drops it, so files saved again from
 * Egon often lack it for elements that a group was drawn or resized around.
 * Elements without a `parent` that names a group go into the group at their
 * position, by the rule Egon uses when a group is drawn. A group can only sit
 * in a larger group: a link to a group that is not larger is dropped (Egon
 * keeps one when a group is resized around its old parent), which also rules
 * out loops.
 */
export function settleMembership(elements: StoryElement[]): void {
  const byId = new Map(elements.map((element) => [element.id, element]));
  for (const element of elements) {
    const parent = typeof element['parent'] === 'string' ? byId.get(element['parent']) : undefined;
    if (element['parent'] !== undefined && (!parent || !isGroup(parent) || (isGroup(element) && area(parent) <= area(element)))) {
      delete element['parent'];
    }
  }
  for (const element of elements) {
    if (element['parent'] === undefined && !isEdge(element)) {
      joinGroupAt(element, elements);
    }
  }
}

/** Everything a group holds, nested groups and their contents included, but no arrows. */
export function contentsOf(groupId: string, elements: StoryElement[]): string[] {
  return elements.flatMap((element) =>
    element['parent'] !== groupId || isEdge(element) ? [] : isGroup(element) ? [element.id, ...contentsOf(element.id, elements)] : [element.id],
  );
}

/**
 * What counts as chosen when these ids become members: the ids, everything
 * inside a chosen group, and every note attached to a chosen element.
 */
function chosenWith(ids: string[], elements: StoryElement[]): Set<string> {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const chosen = new Set(ids.flatMap((id) => (isGroup(byId.get(id) as StoryElement) ? [id, ...contentsOf(id, elements)] : [id])));
  for (const link of elements.filter(isConnection)) {
    const target = byId.get(link.target);
    if (target && isTextAnnotation(target) && chosen.has(link.source)) {
      chosen.add(target.id);
    }
  }
  return chosen;
}

/**
 * The first thing in the group that keeps it from going in whole with these
 * ids: an element that is not chosen. A note on the group itself, or on a
 * group inside it, belongs to the group and does not count.
 */
export function blockerIn(groupId: string, ids: string[], elements: StoryElement[]): StoryElement | undefined {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const chosen = chosenWith(ids, elements);
  const inside = contentsOf(groupId, elements);
  const groupsHere = new Set([groupId, ...inside.filter((id) => isGroup(byId.get(id) as StoryElement))]);
  const notesOnGroups = new Set(
    elements
      .filter(isConnection)
      .filter((link) => groupsHere.has(link.source) && isTextAnnotation(byId.get(link.target) ?? ({ type: '' } as StoryElement)))
      .map((link) => link.target),
  );
  const blocker = inside.find((id) => !isGroup(byId.get(id) as StoryElement) && !chosen.has(id) && !notesOnGroups.has(id));
  return blocker === undefined ? undefined : byId.get(blocker);
}

/**
 * The members for a new group, with every existing group whose contents are
 * all chosen taken in whole instead of one by one, outermost first, so no
 * group is left empty and inner groups may be drawn before outer ones. A group
 * passed alone stays as it is, so a box can be drawn around it. A group that holds anything else, such as
 * an actor of a subdomain, is not taken; its chosen members move one by one.
 */
export function takeWholeGroups(ids: string[], elements: StoryElement[]): string[] {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const whole = (groupId: string) =>
    contentsOf(groupId, elements).some((id) => !isGroup(byId.get(id) as StoryElement)) && blockerIn(groupId, ids, elements) === undefined;
  const pick = (promoteGroups: boolean) => {
    const picked: string[] = [];
    for (const id of ids) {
      const keep = !promoteGroups && isGroup(byId.get(id) as StoryElement);
      const member = keep ? id : (groupAncestors(byId.get(id), byId).filter(whole).at(-1) ?? id);
      if (!picked.includes(member)) {
        picked.push(member);
      }
    }
    // A member inside another member goes along with it.
    return picked.filter((id) => !groupAncestors(byId.get(id), byId).some((ancestor) => picked.includes(ancestor)));
  };
  // A named group is taken up into its parent like any member, except when that parent would be
  // the only member: then the caller means a box around the named group itself.
  const promoted = pick(true);
  const only = promoted.length === 1 ? (promoted[0] as string) : undefined;
  if (only && !ids.includes(only) && ids.some((id) => isGroup(byId.get(id) as StoryElement))) {
    return pick(false);
  }
  return promoted;
}
