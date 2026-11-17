import { compareIds, groupAncestors, isActor, isConnection, isGroup, isTextAnnotation, isWorkObject, type ShapeElement, type StoryElement } from '../egon/types.js';
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

/** A row of a group block; `height` counts grid rows, so a tall note gets more than one. */
interface BlockRow {
  ids: string[];
  height: number;
}

/**
 * Arranges actors and work objects on a grid in reading order: each step
 * continues to the right of the element it starts from, and a new row starts
 * when a step introduces an actor that is not on the canvas yet. Members of a
 * group, annotations included, are kept together in a block of their own below
 * the story, one block per outermost group; a group nested in it gets rows of
 * its own inside that block. A note goes with what it is attached to: into the
 * group of its element, or into the group it describes. So no group box
 * encloses anything else, and the story reopens with the same groups. Shapes
 * in no sentence and notes on nothing go on rows after the story, groups
 * without members below everything. Other notes move next to their element,
 * groups are refitted around their members, and every edge is rerouted.
 * Running it twice changes nothing.
 */
export function autoLayout(story: Story): void {
  joinNotesToGroups(story);
  const doc = story.toDocument();
  const byId = new Map(doc.elements.map((element) => [element.id, element]));
  const nodes = doc.elements.filter((element) => isActor(element) || isWorkObject(element)) as ShapeElement[];
  const inGroup = (element: StoryElement) => groupAncestors(element, byId).length > 0;
  const nodeIds = new Set(nodes.filter((node) => !inGroup(node)).map((node) => node.id));

  // Grid cells an element needs: wide or tall notes and empty groups take more than one.
  const span = (id: string) => {
    const box = boundsOf(byId.get(id) as ShapeElement);
    return { cols: Math.max(1, Math.ceil((box.width + 20) / CELL_WIDTH)), rows: Math.max(1, Math.ceil((box.height + 60) / CELL_HEIGHT)) };
  };
  const placed = new Map<string, Cell>();
  const occupied = new Set<string>();
  const take = (id: string, cell: Cell) => {
    placed.set(id, cell);
    occupied.add(key(cell));
  };
  const nextRow = () => Math.max(-1, ...[...placed].map(([id, cell]) => cell.row + span(id).rows - 1)) + 1;

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

  // Elements that take part in no step, and notes that belong to no element, go on rows of their
  // own at the end, in the order they are drawn, since the order of elements in a file means nothing.
  const anchors = noteAnchors(doc.elements);
  const freeNotes = doc.elements.filter((element) => isTextAnnotation(element) && !isNode(anchors.get(element.id)) && !inGroup(element));
  const leftovers = inReadingOrder([...nodes.filter((node) => !placed.has(node.id) && !inGroup(node)), ...freeNotes] as ShapeElement[]);
  let leftoverRow = nextRow();
  let leftoverCol = 0;
  let rowHeight = 1;
  for (const element of leftovers) {
    const { cols, rows } = span(element.id);
    if (leftoverCol > 0 && leftoverCol + cols > MAX_COLUMNS) {
      leftoverRow += rowHeight;
      leftoverCol = 0;
      rowHeight = 1;
    }
    take(element.id, { col: leftoverCol, row: leftoverRow });
    leftoverCol += cols;
    rowHeight = Math.max(rowHeight, rows);
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
  // A note follows the element its chosen link comes from.
  for (const [noteId, anchor] of anchors) {
    if (!readingOrder.has(noteId) && readingOrder.has(anchor.id)) {
      readingOrder.set(noteId, (readingOrder.get(anchor.id) as number) + 0.5);
    }
  }
  const rank = (id: string) => readingOrder.get(id) ?? Number.MAX_SAFE_INTEGER;
  const children = (groupId: string) => doc.elements.filter((element) => element['parent'] === groupId);
  const firstRank = (groupId: string, seen = new Set<string>()): number => {
    seen.add(groupId);
    return Math.min(
      Number.MAX_SAFE_INTEGER,
      ...children(groupId)
        .filter((child) => !seen.has(child.id))
        .map((child) => (isGroup(child) ? firstRank(child.id, seen) : rank(child.id))),
    );
  };

  const gap: BlockRow = { ids: [], height: 1 };

  // The rows of a group's block: its own members first, then each nested group on rows of its
  // own followed by an empty row, so the nested box and the padding around it fit.
  const blockRows = (groupId: string, seen: Set<string>): BlockRow[] => {
    if (seen.has(groupId)) {
      return [];
    }
    seen.add(groupId);
    const own = children(groupId)
      .filter((child) => isActor(child) || isWorkObject(child) || isTextAnnotation(child))
      .sort((a, b) => Number(isTextAnnotation(a)) - Number(isTextAnnotation(b)) || rank(a.id) - rank(b.id) || a.id.localeCompare(b.id))
      .map((child) => child.id);
    const rows: BlockRow[] = [];
    let row: string[] = [];
    let used = 0;
    const closeRow = () => {
      if (row.length > 0) {
        rows.push({ ids: row, height: Math.max(...row.map((id) => span(id).rows)) });
      }
      row = [];
      used = 0;
    };
    for (const id of own) {
      if (row.length > 0 && used + span(id).cols > MAX_COLUMNS) {
        closeRow();
      }
      row.push(id);
      used += span(id).cols;
    }
    closeRow();
    const nested = children(groupId)
      .filter(isGroup)
      .sort((a, b) => firstRank(a.id) - firstRank(b.id) || a.id.localeCompare(b.id));
    for (const group of nested) {
      const inner = blockRows(group.id, seen);
      rows.push(...(inner.length > 0 ? inner : [{ ids: [group.id], height: span(group.id).rows }]), gap);
    }
    return rows;
  };
  const placeRows = (rows: BlockRow[], firstRow: number): number => {
    let at = firstRow;
    for (const { ids, height } of rows) {
      let col = 0;
      for (const id of ids) {
        take(id, { col, row: at });
        col += span(id).cols;
      }
      at += height;
    }
    return at;
  };

  const groups = doc.elements.filter(isGroup);
  const outermost = groups
    .filter((group) => groupAncestors(group, byId).length === 0)
    .sort((a, b) => firstRank(a.id) - firstRank(b.id) || a.id.localeCompare(b.id));
  let blockRow = nextRow();
  const emptyGroups: string[] = [];
  for (const group of outermost) {
    const rows = blockRows(group.id, new Set());
    if (rows.every((row) => row.ids.length === 0)) {
      emptyGroups.push(group.id);
      continue;
    }
    blockRow = placeRows(rows, blockRow) + (rows.at(-1)?.ids.length === 0 ? 0 : 1);
  }
  // Groups without members get rows of their own at the very end.
  for (const id of emptyGroups) {
    blockRow = placeRows([{ ids: [id], height: span(id).rows }, gap], blockRow);
  }

  for (const [id, cell] of placed) {
    story.setBounds(id, { x: ORIGIN.x + cell.col * CELL_WIDTH, y: ORIGIN.y + cell.row * CELL_HEIGHT });
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
    story.setBounds(group.id, enclose(members.map((member) => boundsOf(member))));
  }
}

function placeAnnotations(story: Story): void {
  const elements = story.elements();
  const byId = new Map(elements.map((element) => [element.id, element]));
  for (const [noteId, anchor] of noteAnchors(elements)) {
    const annotation = byId.get(noteId);
    if (!annotation || !isNode(anchor)) {
      continue;
    }
    // Annotations in a group are laid out in the group's block.
    if (groupAncestors(annotation, byId).length > 0) {
      continue;
    }
    const bounds = boundsOf(anchor as unknown as ShapeElement);
    story.setBounds(annotation.id, { x: bounds.x + bounds.width + 20, y: Math.max(0, bounds.y - 45) });
  }
}

/**
 * A note goes with what it is attached to: a note on an actor or work object
 * joins that element's innermost group, or leaves every group, and a note on a
 * group joins that group. Next to its element, a note in any other group would
 * sit in a box it does not belong to.
 */
function joinNotesToGroups(story: Story): void {
  const elements = story.elements();
  const byId = new Map(elements.map((element) => [element.id, element]));
  for (const [noteId, anchor] of noteAnchors(elements)) {
    const annotation = byId.get(noteId) as StoryElement;
    const wanted = isGroup(anchor) ? anchor.id : isNode(anchor) ? groupAncestors(anchor, byId)[0] : annotation['parent'];
    if (wanted !== annotation['parent']) {
      story.setParent(annotation.id, wanted as string | undefined);
    }
  }
}

/**
 * The element each note is attached to. Egon lets several elements link to one
 * note; the link with the lowest id counts, so the choice does not depend on
 * the order of elements in a file.
 */
function noteAnchors(elements: StoryElement[]): Map<string, StoryElement> {
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

/**
 * Shapes in reading order: rows from the top, then left to right. A shape
 * within 50 pixels below the first shape of a row still counts as that row,
 * so a row drawn a little crooked reads left to right.
 */
function inReadingOrder(shapes: ShapeElement[]): ShapeElement[] {
  const byY = [...shapes].sort((a, b) => a.y - b.y || a.x - b.x || compareIds(a.id, b.id));
  const rows: ShapeElement[][] = [];
  for (const shape of byY) {
    const row = rows.at(-1);
    if (row && shape.y - (row[0] as ShapeElement).y < 50) {
      row.push(shape);
    } else {
      rows.push([shape]);
    }
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x || compareIds(a.id, b.id)));
}

function isNode(element: StoryElement | undefined): boolean {
  return element !== undefined && (isActor(element) || isWorkObject(element));
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
