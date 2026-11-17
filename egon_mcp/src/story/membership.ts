import { compareIds, groupAncestors, isActor, isConnection, isEdge, isGroup, isTextAnnotation, isWorkObject, type GroupElement, type ShapeElement, type StoryElement } from '../egon/types.js';
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

/** The actors and work objects inside a group, at any depth. */
function peopleAndThings(groupId: string, elements: StoryElement[]): string[] {
  return elements.flatMap((element) =>
    element['parent'] !== groupId ? [] : isGroup(element) ? peopleAndThings(element.id, elements) : isActor(element) || isWorkObject(element) ? [element.id] : [],
  );
}

/**
 * The element each note belongs to: the source of its link of lowest id, so
 * every tool reads a note linked from several elements the same way.
 */
export function noteAnchors(elements: StoryElement[]): Map<string, StoryElement> {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const anchors = new Map<string, StoryElement>();
  const links = elements.filter(isConnection).sort((a, b) => compareIds(a.id, b.id));
  for (const link of links) {
    const note = byId.get(link.target);
    const anchor = byId.get(link.source);
    if (note && anchor && isTextAnnotation(note) && !anchors.has(note.id)) {
      anchors.set(note.id, anchor);
    }
  }
  return anchors;
}

/** Work objects that steps pick for a group: those that first appear in them, and those used by these steps alone. */
export interface StepPicks {
  picked: string[];
  only: string[];
}

/**
 * Where a new group goes and what it holds (ADR 19). An existing group goes in
 * whole when all its actors and work objects are chosen: named, inside a named
 * group, or used by the steps alone. Named elements always move in. With
 * `steps`, the new group goes into the innermost group around what they
 * picked (the top level when they picked nothing), and a pick moves in only
 * from that group; one in any other group stays there (`left`). Without
 * steps, the new group goes into the innermost group around the named ones.
 */
export function membersFor(
  named: string[],
  elements: StoryElement[],
  steps?: StepPicks,
): { host: string | undefined; members: string[]; left: string[] } {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const chosen = new Set([...named.flatMap((id) => (isGroup(byId.get(id) as StoryElement) ? [id, ...peopleAndThings(id, elements)] : [id])), ...(steps?.only ?? [])]);
  const whole = (groupId: string) => {
    const inside = peopleAndThings(groupId, elements);
    return inside.length > 0 && inside.every((id) => chosen.has(id));
  };
  const promote = (ids: string[]) => [...new Set(ids.map((id) => groupAncestors(byId.get(id), byId).filter(whole).at(-1) ?? id))];
  const around = (ids: string[]) => {
    const chains = ids.map((id) => groupAncestors(byId.get(id), byId));
    return chains[0]?.find((group) => chains.every((chain) => chain.includes(group)));
  };
  const fromNames = promote(named);
  const fromSteps = promote(steps?.picked ?? []);
  const host = steps ? around(fromSteps) : around(fromNames);
  const kept = fromSteps.filter((id) => byId.get(id)?.['parent'] === host);
  // Whatever lies inside another member goes along with it.
  const picked = [...new Set([...kept, ...fromNames])];
  const members = picked.filter((id) => !groupAncestors(byId.get(id), byId).some((ancestor) => picked.includes(ancestor)));
  const left = (steps?.picked ?? []).filter((id) => !members.some((member) => member === id || groupAncestors(byId.get(id), byId).includes(member)));
  return { host, members, left };
}
