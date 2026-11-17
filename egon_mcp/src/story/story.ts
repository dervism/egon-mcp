import { IconCatalog } from '../icons/catalog.js';
import {
  ACTIVITY_TYPE,
  ACTOR_PREFIX,
  CONNECTION_TYPE,
  EGON_FORMAT_VERSION,
  GROUP_TYPE,
  TEXT_ANNOTATION_TYPE,
  WORK_OBJECT_PREFIX,
  iconNameOf,
  isActivity,
  isActor,
  isEdge,
  isGroup,
  isTextAnnotation,
  isWorkObject,
  type ActivityElement,
  type ActorElement,
  type ConnectionElement,
  type EdgeElement,
  type GroupElement,
  type Scope,
  type ShapeElement,
  type StoryDocument,
  type StoryElement,
  type TextAnnotationElement,
  type WorkObjectElement,
} from '../egon/types.js';
import { boundsOf, DEFAULT_ANNOTATION_SIZE, edgeWaypoints, type Bounds } from './geometry.js';

export class StoryError extends Error {
  override name = 'StoryError';
}

export type IconKind = 'actor' | 'workObject';

export interface ShapeInput {
  name: string;
  icon?: string;
  x?: number;
  y?: number;
  color?: string;
}

export interface ActivityInput {
  /** Id or name of the source actor or work object. */
  from: string;
  /** Id or name of the target actor or work object. */
  to: string;
  label?: string;
  /** Puts the activity into an existing step (parallel activities share a number). */
  number?: number;
  color?: string;
}

export interface ElementUpdate {
  name?: string;
  icon?: string;
  color?: string | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** Activities: moves the activity to this step and renumbers the others. */
  number?: number;
  /** Text annotations: the annotation text. */
  text?: string;
}

/** Grid that new shapes snap to when the caller gives no position. */
const GRID = { originX: 100, originY: 100, cellWidth: 200, cellHeight: 175, columns: 6 };
const GROUP_PADDING = 40;
const COLOR_PATTERN = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|rgba?\([\d\s.,%]+\))$/;
const CUSTOM_ICON_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * An editable domain story. Element objects returned from methods are copies;
 * use the id to refer to an element in later calls.
 */
export class Story {
  private constructor(
    private doc: StoryDocument,
    private readonly catalog: IconCatalog,
  ) {}

  static create(
    input: { title: string; description?: string; scope?: Scope },
    catalog: IconCatalog = IconCatalog.builtIn(),
  ): Story {
    const doc: StoryDocument = {
      title: input.title,
      description: input.description ?? '',
      version: EGON_FORMAT_VERSION,
      iconSet: catalog.defaultIconSet(),
      elements: [],
    };
    if (input.scope) {
      doc.scope = { ...input.scope };
    }
    return new Story(doc, catalog);
  }

  static fromDocument(doc: StoryDocument, catalog: IconCatalog = IconCatalog.builtIn()): Story {
    return new Story(structuredClone(doc), catalog);
  }

  toDocument(): StoryDocument {
    return structuredClone(this.doc);
  }

  get title(): string {
    return this.doc.title;
  }

  elements(): StoryElement[] {
    return structuredClone(this.doc.elements);
  }

  get(id: string): StoryElement | undefined {
    const element = this.find(id);
    return element ? structuredClone(element) : undefined;
  }

  setInfo(info: { title?: string; description?: string; scope?: Scope | null }): void {
    if (info.title !== undefined) {
      this.doc.title = info.title;
    }
    if (info.description !== undefined) {
      this.doc.description = info.description;
    }
    if (info.scope === null) {
      delete this.doc.scope;
    } else if (info.scope !== undefined) {
      this.doc.scope = { ...this.doc.scope, ...info.scope };
    }
  }

  addActor(input: ShapeInput): ActorElement {
    return this.addShape('actor', input, 'Person');
  }

  addWorkObject(input: ShapeInput): WorkObjectElement {
    return this.addShape('workObject', input, 'Document');
  }

  /** Registers an icon that is not built into Egon. The story file carries its SVG. */
  addCustomIcon(input: { kind: IconKind; name: string; svg: string }): void {
    const name = input.name.trim();
    if (!CUSTOM_ICON_NAME.test(name)) {
      throw new StoryError(
        `Custom icon name "${input.name}" is invalid. Use letters, digits, "-" and "_" only.`,
      );
    }
    const builtIn = this.catalog.get(name);
    if (builtIn) {
      throw new StoryError(`"${builtIn.name}" is a built-in Egon icon. Use it directly or pick another name.`);
    }
    const svg = input.svg.trim();
    if (!/^<svg[\s>]/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) {
      throw new StoryError('A custom icon must be a single <svg>...</svg> document.');
    }
    if (/<script|\son[a-z]+\s*=|javascript:|<foreignObject/i.test(svg)) {
      throw new StoryError('Custom icon SVGs must not contain scripts, event handlers or foreignObject.');
    }
    this.iconMapFor(input.kind)[name] = svg;
  }

  addActivity(input: ActivityInput): ActivityElement {
    const source = this.resolveNode(input.from);
    const target = this.resolveNode(input.to);
    if (source.id === target.id) {
      throw new StoryError('An activity needs two different elements.');
    }
    if (isWorkObject(source) && isWorkObject(target)) {
      throw new StoryError(
        `"${source.name}" and "${target.name}" are both work objects. In domain storytelling an actor does something with a work object, so connect an actor to each of them instead.`,
      );
    }
    const activity: ActivityElement = {
      type: ACTIVITY_TYPE,
      name: input.label ?? '',
      id: this.newId('connection'),
      source: source.id,
      target: target.id,
      waypoints: edgeWaypoints(boundsOf(source), boundsOf(target)),
    };
    if (isActor(source)) {
      if (input.number !== undefined) {
        this.assertStepNumber(input.number, this.maxNumber() + 1);
        activity.number = input.number;
        if (this.numberedActivities().some((other) => other.number === input.number)) {
          activity.multipleNumberAllowed = true;
        }
      } else {
        activity.number = this.maxNumber() + 1;
      }
    } else {
      activity.number = null;
    }
    if (input.color !== undefined) {
      activity.pickedColor = this.checkColor(input.color);
    }
    this.doc.elements.push(activity);
    return structuredClone(activity);
  }

  addGroup(input: { name: string; members?: string[]; x?: number; y?: number; width?: number; height?: number; color?: string }): GroupElement {
    let bounds: Bounds;
    const members = (input.members ?? []).map((ref) => this.resolveShape(ref));
    if (members.length > 0 && input.x === undefined && input.y === undefined) {
      bounds = enclose(members.map((member) => boundsOf(member)), GROUP_PADDING);
    } else {
      bounds = {
        x: input.x ?? GRID.originX,
        y: input.y ?? GRID.originY,
        width: input.width ?? 300,
        height: input.height ?? 200,
      };
    }
    const group: GroupElement = {
      type: GROUP_TYPE,
      name: input.name,
      id: this.newId('shape'),
      ...bounds,
    };
    if (input.color !== undefined) {
      group.pickedColor = this.checkColor(input.color);
    }
    // Groups go first so Egon draws them underneath the elements they contain.
    this.doc.elements.unshift(group);
    return structuredClone(group);
  }

  addAnnotation(input: { text: string; attachTo?: string; x?: number; y?: number }): {
    annotation: TextAnnotationElement;
    connection?: ConnectionElement;
  } {
    const anchor = input.attachTo ? this.resolveShape(input.attachTo) : undefined;
    let position: { x: number; y: number };
    if (input.x !== undefined && input.y !== undefined) {
      position = { x: input.x, y: input.y };
    } else if (anchor) {
      const bounds = boundsOf(anchor);
      position = { x: bounds.x + bounds.width + 40, y: Math.max(0, bounds.y - 50) };
    } else {
      position = this.nextFreeCell();
    }
    const annotation: TextAnnotationElement = {
      type: TEXT_ANNOTATION_TYPE,
      name: '',
      text: input.text,
      id: this.newId('shape'),
      ...position,
      width: Math.max(DEFAULT_ANNOTATION_SIZE.width, Math.min(300, input.text.length * 7 + 20)),
      height: DEFAULT_ANNOTATION_SIZE.height,
    };
    this.doc.elements.push(annotation);
    if (!anchor) {
      return { annotation: structuredClone(annotation) };
    }
    const connection: ConnectionElement = {
      type: CONNECTION_TYPE,
      name: '',
      id: this.newId('connection'),
      source: anchor.id,
      target: annotation.id,
      waypoints: edgeWaypoints(boundsOf(anchor), boundsOf(annotation)),
    };
    this.doc.elements.push(connection);
    return { annotation: structuredClone(annotation), connection: structuredClone(connection) };
  }

  updateElement(ref: string, update: ElementUpdate): StoryElement {
    const element = this.resolve(ref);
    if (update.name !== undefined) {
      element.name = update.name;
    }
    if (update.color !== undefined) {
      if (update.color === null || update.color === '') {
        delete element.pickedColor;
      } else {
        element.pickedColor = this.checkColor(update.color);
      }
    }
    if (update.icon !== undefined) {
      if (!isActor(element) && !isWorkObject(element)) {
        throw new StoryError('Only actors and work objects have icons.');
      }
      const kind: IconKind = isActor(element) ? 'actor' : 'workObject';
      element.type = this.typeFor(kind, update.icon);
    }
    if (update.text !== undefined) {
      if (!isTextAnnotation(element)) {
        throw new StoryError('Only text annotations have text. Use "name" for other elements.');
      }
      element.text = update.text;
    }
    if (update.number !== undefined) {
      if (!isActivity(element) || typeof element.number !== 'number') {
        throw new StoryError('Only activities that start at an actor have a number.');
      }
      this.moveToStep(element, update.number);
    }
    if (!isEdge(element)) {
      const shape = element as ShapeElement;
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        const value = update[key];
        if (value !== undefined) {
          if (!Number.isFinite(value) || ((key === 'width' || key === 'height') && value <= 0)) {
            throw new StoryError(`${key} must be a ${key === 'x' || key === 'y' ? 'finite' : 'positive'} number.`);
          }
          shape[key] = Math.round(value);
        }
      }
      this.rerouteEdgesOf(shape.id);
    }
    return structuredClone(element);
  }

  /** Removes an element. Removing a shape also removes the activities and connections attached to it. */
  removeElement(ref: string): StoryElement[] {
    const element = this.resolve(ref);
    const removedIds = new Set([element.id]);
    for (const other of this.doc.elements) {
      if (isEdge(other) && (other.source === element.id || other.target === element.id)) {
        removedIds.add(other.id);
      }
    }
    const removed = this.doc.elements.filter((candidate) => removedIds.has(candidate.id));
    this.doc.elements = this.doc.elements.filter((candidate) => !removedIds.has(candidate.id));
    if (removed.some((candidate) => isActivity(candidate))) {
      this.compactNumbers();
    }
    return structuredClone(removed);
  }

  /** Renumbers the steps 1..n without gaps, keeping their order and parallel steps. */
  compactNumbers(): void {
    const ordered = this.numberedActivities().sort((a, b) => (a.number as number) - (b.number as number));
    let step = 0;
    let previous: number | undefined;
    for (const activity of ordered) {
      if (activity.number !== previous) {
        step += 1;
        previous = activity.number as number;
      }
      activity.number = step;
    }
    this.refreshParallelFlags();
  }

  /** Recomputes the waypoints of every activity and connection from the shape positions. */
  rerouteAllEdges(): void {
    for (const element of this.doc.elements) {
      if (isEdge(element)) {
        this.reroute(element);
      }
    }
  }

  /** Finds an element by id, or by name for actors, work objects, groups and annotations. */
  resolve(ref: string): StoryElement {
    const byId = this.find(ref);
    if (byId) {
      return byId;
    }
    const wanted = ref.trim().toLowerCase();
    const matches = this.doc.elements.filter(
      (element) =>
        !isEdge(element) &&
        (element.name.trim().toLowerCase() === wanted ||
          (isTextAnnotation(element) && (element.text ?? '').trim().toLowerCase() === wanted)),
    );
    if (matches.length === 1) {
      return matches[0] as StoryElement;
    }
    if (matches.length > 1) {
      throw new StoryError(
        `"${ref}" is ambiguous: ${matches.map((m) => `${m.id} (${describeType(m)})`).join(', ')}. Use the id instead.`,
      );
    }
    throw new StoryError(`There is no element with the id or name "${ref}".`);
  }

  private addShape(kind: IconKind, input: ShapeInput, defaultIcon: string): ShapeElement {
    const type = this.typeFor(kind, input.icon ?? defaultIcon);
    const position = input.x !== undefined && input.y !== undefined ? { x: Math.round(input.x), y: Math.round(input.y) } : this.nextFreeCell();
    const shape: ShapeElement = {
      type,
      name: input.name,
      id: this.newId('shape'),
      ...position,
    };
    if (input.color !== undefined) {
      shape.pickedColor = this.checkColor(input.color);
    }
    this.doc.elements.push(shape);
    return structuredClone(shape);
  }

  /** Returns the Egon type for an icon and makes sure the icon is in the story's icon set. */
  private typeFor(kind: IconKind, icon: string): string {
    const prefix = kind === 'actor' ? ACTOR_PREFIX : WORK_OBJECT_PREFIX;
    const map = this.iconMapFor(kind);
    const custom = Object.keys({ ...this.doc.iconSet.actors, ...this.doc.iconSet.workObjects }).find(
      (name) => name.toLowerCase() === icon.trim().toLowerCase() && !this.catalog.get(name),
    );
    if (custom) {
      map[custom] ??= this.doc.iconSet.actors[custom] ?? this.doc.iconSet.workObjects[custom] ?? '';
      return prefix + custom;
    }
    const builtIn = this.catalog.get(icon);
    if (!builtIn) {
      const suggestions = this.catalog.search(icon, 5).map((match) => match.name);
      throw new StoryError(
        `Unknown icon "${icon}".` +
          (suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : '') +
          ' Use search_icons to find one, or add a custom icon.',
      );
    }
    map[builtIn.name] ??= builtIn.svg;
    return prefix + builtIn.name;
  }

  private iconMapFor(kind: IconKind): Record<string, string> {
    return kind === 'actor' ? this.doc.iconSet.actors : this.doc.iconSet.workObjects;
  }

  private resolveNode(ref: string): ShapeElement {
    const element = this.resolve(ref);
    if (!isActor(element) && !isWorkObject(element)) {
      throw new StoryError(`"${ref}" is a ${describeType(element)}. Activities connect actors and work objects.`);
    }
    return element as ShapeElement;
  }

  private resolveShape(ref: string): ShapeElement {
    const element = this.resolve(ref);
    if (isEdge(element)) {
      throw new StoryError(`"${ref}" is an activity or connection, not a shape.`);
    }
    return element as ShapeElement;
  }

  private find(id: string): StoryElement | undefined {
    return this.doc.elements.find((element) => element.id === id);
  }

  private numberedActivities(): ActivityElement[] {
    return this.doc.elements.filter(
      (element): element is ActivityElement => isActivity(element) && typeof element.number === 'number',
    );
  }

  private maxNumber(): number {
    return this.numberedActivities().reduce((max, activity) => Math.max(max, activity.number as number), 0);
  }

  private assertStepNumber(number: number, max: number): void {
    if (!Number.isInteger(number) || number < 1 || number > max) {
      throw new StoryError(`The number must be a whole number from 1 to ${max}.`);
    }
  }

  /** Moves one activity to step `number`; activities from that step on shift by one. */
  private moveToStep(activity: ActivityElement, number: number): void {
    const others = this.numberedActivities().filter((other) => other.id !== activity.id);
    const steps = [...new Set(others.map((other) => other.number as number))].sort((a, b) => a - b);
    this.assertStepNumber(number, steps.length + 1);
    const remap = new Map<number, number>();
    steps.forEach((step, index) => remap.set(step, index + 1 >= number ? index + 2 : index + 1));
    for (const other of others) {
      other.number = remap.get(other.number as number) as number;
    }
    activity.number = number;
    this.refreshParallelFlags();
  }

  private refreshParallelFlags(): void {
    const counts = new Map<number, number>();
    for (const activity of this.numberedActivities()) {
      counts.set(activity.number as number, (counts.get(activity.number as number) ?? 0) + 1);
    }
    for (const activity of this.numberedActivities()) {
      if ((counts.get(activity.number as number) ?? 0) > 1) {
        activity.multipleNumberAllowed = true;
      } else {
        delete activity.multipleNumberAllowed;
      }
    }
  }

  private rerouteEdgesOf(shapeId: string): void {
    for (const element of this.doc.elements) {
      if (isEdge(element) && (element.source === shapeId || element.target === shapeId)) {
        this.reroute(element);
      }
    }
  }

  private reroute(edge: EdgeElement): void {
    const source = this.find(edge.source);
    const target = this.find(edge.target);
    if (source && target && !isEdge(source) && !isEdge(target)) {
      edge.waypoints = edgeWaypoints(boundsOf(source as ShapeElement), boundsOf(target as ShapeElement));
    }
  }

  private nextFreeCell(): { x: number; y: number } {
    const occupied = this.doc.elements
      .filter((element) => !isEdge(element) && !isGroup(element))
      .map((element) => boundsOf(element as ShapeElement));
    for (let index = 0; ; index += 1) {
      const cell = {
        x: GRID.originX + (index % GRID.columns) * GRID.cellWidth,
        y: GRID.originY + Math.floor(index / GRID.columns) * GRID.cellHeight,
        width: 75,
        height: 75,
      };
      if (!occupied.some((bounds) => intersects(bounds, cell, 30))) {
        return { x: cell.x, y: cell.y };
      }
    }
  }

  private newId(kind: 'shape' | 'connection'): string {
    const taken = new Set(this.doc.elements.map((element) => element.id));
    for (let digits = 4; ; digits += 1) {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const id = `${kind}_${Math.floor(Math.random() * 10 ** digits)
          .toString()
          .padStart(digits, '0')}`;
        if (!taken.has(id)) {
          return id;
        }
      }
    }
  }

  private checkColor(color: string): string {
    const value = color.trim();
    if (!COLOR_PATTERN.test(value)) {
      throw new StoryError(`"${color}" is not a valid color. Use a hex value such as #1E88E5.`);
    }
    return value;
  }
}

export function describeType(element: { type: string }): string {
  if (isActor(element)) {
    return `actor (${iconNameOf(element.type)})`;
  }
  if (isWorkObject(element)) {
    return `work object (${iconNameOf(element.type)})`;
  }
  if (isActivity(element)) {
    return 'activity';
  }
  if (isGroup(element)) {
    return 'group';
  }
  if (isTextAnnotation(element)) {
    return 'text annotation';
  }
  if (element.type === CONNECTION_TYPE) {
    return 'annotation connection';
  }
  return element.type;
}

function intersects(a: Bounds, b: Bounds, margin: number): boolean {
  return (
    a.x < b.x + b.width + margin &&
    b.x < a.x + a.width + margin &&
    a.y < b.y + b.height + margin &&
    b.y < a.y + a.height + margin
  );
}

function enclose(boxes: Bounds[], padding: number): Bounds {
  const minX = Math.min(...boxes.map((box) => box.x)) - padding;
  const minY = Math.min(...boxes.map((box) => box.y)) - padding;
  const maxX = Math.max(...boxes.map((box) => box.x + box.width)) + padding;
  // Labels sit below actors and work objects, so leave extra room at the bottom.
  const maxY = Math.max(...boxes.map((box) => box.y + box.height)) + padding + 20;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
