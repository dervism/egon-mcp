import { groupAncestors, isActor, isConnection, isGroup, isTextAnnotation, isWorkObject, type ShapeElement, type StoryElement } from '../egon/types.js';
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
 * group, annotations included, are kept together in a block of their own below
 * the story, one block per outermost group; a group nested in it gets rows of
 * its own inside that block. So no group box encloses anything else. Groups
 * without members move below everything. Annotations outside groups move next
 * to the element they describe, groups are refitted around their members, and
 * every edge is rerouted. Running it twice changes nothing.
 */
export function autoLayout(story: Story): void {
  const doc = story.toDocument();
  const byId = new Map(doc.elements.map((element) => [element.id, element]));
  const nodes = doc.elements.filter((element) => isActor(element) || isWorkObject(element)) as ShapeElement[];
  const inGroup = (element: StoryElement) => groupAncestors(element, byId).length > 0;
  const nodeIds = new Set(nodes.filter((node) => !inGroup(node)).map((node) => node.id));

  const placed = new Map<string, Cell>();
  const occupied = new Set<string>();
  const take = (id: string, cell: Cell) => {
    placed.set(id, cell);
    occupied.add(key(cell));
  };
  const nextRow = () => Math.max(-1, ...[...placed.values()].map((cell) => cell.row)) + 1;

  const steps = narrate(doc);
  for (const step of steps) {
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
    if (placed.has(node.id) || inGroup(node)) {
      continue;
    }
    take(node.id, { col: leftoverCol, row: leftoverRow });
    leftoverCol += 1;
    if (leftoverCol >= MAX_COLUMNS) {
      leftoverCol = 0;
      leftoverRow += 1;
    }
  }

  // Reading order decides the order inside group blocks; an annotation follows its element.
  const readingOrder = new Map<string, number>();
  for (const step of steps) {
    for (const id of step.elementIds) {
      if (!readingOrder.has(id)) {
        readingOrder.set(id, readingOrder.size);
      }
    }
  }
  for (const link of doc.elements.filter(isConnection)) {
    if (!readingOrder.has(link.target) && readingOrder.has(link.source)) {
      readingOrder.set(link.target, (readingOrder.get(link.source) as number) + 0.5);
    }
  }
  const rank = (id: string) => readingOrder.get(id) ?? Number.MAX_SAFE_INTEGER;
  const children = (groupId: string) => doc.elements.filter((element) => element['parent'] === groupId);
  const firstRank = (groupId: string): number =>
    Math.min(Number.MAX_SAFE_INTEGER, ...children(groupId).map((child) => (isGroup(child) ? firstRank(child.id) : rank(child.id))));

  // The rows of a group's block: its own members first, then each nested group on rows of its
  // own followed by an empty row, so the nested box and the padding around it fit.
  const blockRows = (groupId: string, seen: Set<string>): string[][] => {
    if (seen.has(groupId)) {
      return [];
    }
    seen.add(groupId);
    const own = children(groupId)
      .filter((child) => isActor(child) || isWorkObject(child) || isTextAnnotation(child))
      .sort((a, b) => Number(isTextAnnotation(a)) - Number(isTextAnnotation(b)) || rank(a.id) - rank(b.id) || a.id.localeCompare(b.id))
      .map((child) => child.id);
    const rows: string[][] = [];
    for (let index = 0; index < own.length; index += MAX_COLUMNS) {
      rows.push(own.slice(index, index + MAX_COLUMNS));
    }
    const nested = children(groupId)
      .filter(isGroup)
      .sort((a, b) => firstRank(a.id) - firstRank(b.id) || a.id.localeCompare(b.id));
    for (const group of nested) {
      const inner = blockRows(group.id, seen);
      rows.push(...(inner.length > 0 ? inner : [[group.id]]), []);
    }
    return rows;
  };

  const groups = doc.elements.filter(isGroup);
  const outermost = groups
    .filter((group) => groupAncestors(group, byId).length === 0)
    .sort((a, b) => firstRank(a.id) - firstRank(b.id) || a.id.localeCompare(b.id));
  let blockRow = nextRow();
  const emptyGroups: string[] = [];
  for (const group of outermost) {
    const rows = blockRows(group.id, new Set());
    if (rows.every((row) => row.length === 0)) {
      emptyGroups.push(group.id);
      continue;
    }
    rows.forEach((row, offset) => row.forEach((id, col) => take(id, { col, row: blockRow + offset })));
    blockRow += rows.length + (rows.at(-1)?.length === 0 ? 0 : 1);
  }
  // Groups without members get rows of their own at the very end.
  for (const id of emptyGroups) {
    take(id, { col: 0, row: blockRow });
    blockRow += Math.ceil(boundsOf(byId.get(id) as ShapeElement).height / CELL_HEIGHT) + 1;
  }

  for (const [id, cell] of placed) {
    story.updateElement(id, { x: ORIGIN.x + cell.col * CELL_WIDTH, y: ORIGIN.y + cell.row * CELL_HEIGHT });
  }

  placeAnnotations(story);
  refitGroups(story);
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

function placeAnnotations(story: Story): void {
  const elements = story.elements();
  const byId = new Map(elements.map((element) => [element.id, element]));
  for (const link of elements.filter(isConnection)) {
    const annotation = byId.get(link.target);
    const anchor = byId.get(link.source);
    if (!annotation || !anchor || !isTextAnnotation(annotation) || !(isActor(anchor) || isWorkObject(anchor))) {
      continue;
    }
    // Annotations in a group are laid out in the group's block.
    if (groupAncestors(annotation, byId).length > 0) {
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
