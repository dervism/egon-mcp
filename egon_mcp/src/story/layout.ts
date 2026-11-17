import { isActor, isConnection, isGroup, isTextAnnotation, isWorkObject, type ShapeElement, type StoryElement } from '../egon/types.js';
import { boundsOf, type Bounds } from './geometry.js';
import { narrate } from './narrate.js';
import type { Story } from './story.js';

const CELL_WIDTH = 220;
const CELL_HEIGHT = 200;
const ORIGIN = { x: 60, y: 80 };
const MAX_COLUMNS = 5;
const GROUP_PADDING = 40;

interface Cell {
  col: number;
  row: number;
}

/**
 * Arranges actors and work objects on a grid in reading order: each step
 * continues to the right of the element it starts from, and a new row starts
 * when a step introduces an actor that is not on the canvas yet. Members of a
 * group are kept together in a block of their own below, one block per group,
 * so no group box encloses anything else. Groups are refitted around their
 * members, annotations move next to the element they describe, and every edge
 * is rerouted.
 */
export function autoLayout(story: Story): void {
  const doc = story.toDocument();
  const nodes = doc.elements.filter((element) => isActor(element) || isWorkObject(element)) as ShapeElement[];
  const byId = new Map(doc.elements.map((element) => [element.id, element]));
  const topGroup = new Map<string, string>();
  for (const node of nodes) {
    const group = outermostGroup(node, byId);
    if (group) {
      topGroup.set(node.id, group);
    }
  }
  const nodeIds = new Set(nodes.filter((node) => !topGroup.has(node.id)).map((node) => node.id));

  const placed = new Map<string, Cell>();
  const occupied = new Set<string>();
  const take = (id: string, cell: Cell) => {
    placed.set(id, cell);
    occupied.add(key(cell));
  };
  const nextRow = () => Math.max(-1, ...[...placed.values()].map((cell) => cell.row)) + 1;

  for (const step of narrate(doc)) {
    let previous: Cell | undefined;
    for (const id of step.elementIds.filter((candidate) => nodeIds.has(candidate))) {
      const existing = placed.get(id);
      if (existing) {
        previous = existing;
        continue;
      }
      const cell = previous ? findFree(occupied, previous.col + 1, previous.row) : findFree(occupied, 0, nextRow());
      take(id, cell);
      previous = cell;
    }
  }

  // Elements that take part in no step go on rows of their own at the end.
  let leftoverRow = nextRow();
  let leftoverCol = 0;
  for (const node of nodes) {
    if (placed.has(node.id) || topGroup.has(node.id)) {
      continue;
    }
    take(node.id, { col: leftoverCol, row: leftoverRow });
    leftoverCol += 1;
    if (leftoverCol >= MAX_COLUMNS) {
      leftoverCol = 0;
      leftoverRow += 1;
    }
  }

  // Each group gets a block of rows of its own, members in reading order.
  const readingOrder = new Map<string, number>();
  for (const step of narrate(doc)) {
    for (const id of step.elementIds) {
      if (!readingOrder.has(id)) {
        readingOrder.set(id, readingOrder.size);
      }
    }
  }
  const rank = (id: string) => readingOrder.get(id) ?? Number.MAX_SAFE_INTEGER;
  const blocks = new Map<string, string[]>();
  for (const node of [...nodes].sort((a, b) => rank(a.id) - rank(b.id))) {
    const group = topGroup.get(node.id);
    if (group) {
      blocks.set(group, [...(blocks.get(group) ?? []), node.id]);
    }
  }
  let blockRow = nextRow();
  for (const members of blocks.values()) {
    // Members of a group nested inside this one stay next to each other.
    const ordered = [...members].sort((a, b) => String(byId.get(a)?.['parent']).localeCompare(String(byId.get(b)?.['parent'])) || rank(a) - rank(b));
    ordered.forEach((id, index) => take(id, { col: index % MAX_COLUMNS, row: blockRow + Math.floor(index / MAX_COLUMNS) }));
    blockRow += Math.ceil(ordered.length / MAX_COLUMNS);
  }

  for (const [id, cell] of placed) {
    story.updateElement(id, { x: ORIGIN.x + cell.col * CELL_WIDTH, y: ORIGIN.y + cell.row * CELL_HEIGHT });
  }

  refitGroups(story);
  placeAnnotations(story);
  story.rerouteAllEdges();
}

/** Fits every group around its members, inner groups first so outer ones enclose them. */
function refitGroups(story: Story): void {
  const byId = new Map(story.elements().map((element) => [element.id, element]));
  const depth = (id: string) => groupAncestors(byId.get(id), byId).length;
  const groups = story.elements().filter(isGroup).sort((a, b) => depth(b.id) - depth(a.id));
  for (const group of groups) {
    const members = story.elements().filter((element) => element['parent'] === group.id) as ShapeElement[];
    if (members.length === 0) {
      continue;
    }
    story.updateElement(group.id, enclose(members.map((member) => boundsOf(member))));
  }
}

/** The ids of the groups around `element`, innermost first. */
export function groupAncestors(element: StoryElement | undefined, byId: Map<string, StoryElement>): string[] {
  const found: string[] = [];
  let parent = element?.['parent'];
  while (typeof parent === 'string' && !found.includes(parent)) {
    const group = byId.get(parent);
    if (!group || !isGroup(group)) {
      break;
    }
    found.push(parent);
    parent = group['parent'];
  }
  return found;
}

function outermostGroup(element: StoryElement, byId: Map<string, StoryElement>): string | undefined {
  return groupAncestors(element, byId).at(-1);
}

function placeAnnotations(story: Story): void {
  const elements = story.elements();
  const byId = new Map(elements.map((element) => [element.id, element]));
  for (const link of elements.filter(isConnection)) {
    const annotation = byId.get(link.target);
    const anchor = byId.get(link.source);
    if (!annotation || !anchor || !isTextAnnotation(annotation) || !(isActor(anchor) || isWorkObject(anchor))) {
      continue;
    }
    const bounds = boundsOf(anchor as ShapeElement);
    story.updateElement(annotation.id, { x: bounds.x + bounds.width + 20, y: Math.max(0, bounds.y - 45) });
  }
}

/** The free cell closest to (col, row), preferring the same row and then rows below. */
function findFree(occupied: Set<string>, col: number, row: number): Cell {
  const startCol = Math.min(col, MAX_COLUMNS - 1);
  for (let dRow = 0; ; dRow += 1) {
    for (let dCol = 0; startCol + dCol < MAX_COLUMNS; dCol += 1) {
      const cell = { col: startCol + dCol, row: row + dRow };
      if (!occupied.has(key(cell))) {
        return cell;
      }
    }
    for (let back = startCol - 1; back >= 0; back -= 1) {
      const cell = { col: back, row: row + dRow + 1 };
      if (!occupied.has(key(cell))) {
        return cell;
      }
    }
  }
}

function enclose(boxes: Bounds[]): Bounds {
  const minX = Math.min(...boxes.map((box) => box.x)) - GROUP_PADDING;
  const minY = Math.min(...boxes.map((box) => box.y)) - GROUP_PADDING;
  const maxX = Math.max(...boxes.map((box) => box.x + box.width)) + GROUP_PADDING;
  const maxY = Math.max(...boxes.map((box) => box.y + box.height)) + GROUP_PADDING + 20;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function key(cell: Cell): string {
  return `${cell.col},${cell.row}`;
}
