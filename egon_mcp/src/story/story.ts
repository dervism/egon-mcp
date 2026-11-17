import { IconCatalog } from '../icons/catalog.js';
import {
  ACTIVITY_TYPE,
  ACTOR_PREFIX,
  CONNECTION_TYPE,
  EGON_FORMAT_VERSION,
  GROUP_TYPE,
  TEXT_ANNOTATION_TYPE,
  MAX_COORDINATE,
  WORK_OBJECT_PREFIX,
  compareIds,
  groupAncestors,
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
import { boundsOf, DEFAULT_ANNOTATION_SIZE, edgeWaypoints, routeEdge, type Bounds } from './geometry.js';
import { cornerInside, joinGroupAt, membersFor, noteAnchors, settleMembership, takeIn, type StepPicks } from './membership.js';

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

export interface GroupInput {
  name: string;
  members?: string[];
  /** Work objects picked by step numbers (groupBySteps); unlike members, they stay in another group. */
  fromSteps?: StepPicks;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
}

export interface AnnotationInput {
  text: string;
  attachTo?: string;
  x?: number;
  y?: number;
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
/** Hex or a plain color name; the renderer accepts exactly these. */
const COLOR_PATTERN = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20})$/;
const CUSTOM_ICON_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * An editable domain story. Element objects returned from methods are copies;
 * use the id to refer to an element in later calls.
 */
export class Story {
  /** How many transactions are running; only the outermost keeps a copy to undo. */
  private depth = 0;

  /** The highest id number handed out or seen so far, per kind. */
  private readonly highestIds = { shape: 9999, connection: 9999 };

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
    const copy = structuredClone(doc);
    settleMembership(copy.elements);
    return new Story(copy, catalog);
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
    // Egon treats only data URLs as custom icons (util.js, icon-css.service.ts).
    // Browsers refuse SVG images without the SVG namespace on the root.
    const withNamespace = /^<svg\b[^>]*\sxmlns\s*=/i.test(svg) ? svg : svg.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    this.iconMapFor(input.kind)[name] = `data:image/svg+xml;base64,${Buffer.from(withNamespace, 'utf8').toString('base64')}`;
  }

  addActivity(input: ActivityInput): ActivityElement {
    return this.atomic(() => this.applyAddActivity(input));
  }

  private applyAddActivity(input: ActivityInput): ActivityElement {
    const source = this.resolveNode(input.from);
    const target = this.resolveNode(input.to);
    if (source.id === target.id) {
      throw new StoryError('An activity needs two different elements.');
    }
    if (isActor(source) && isActor(target)) {
      throw new StoryError(
        `"${source.name}" and "${target.name}" are two actors, and Egon cannot connect two actors. Put the work object they exchange between them, for example "${source.name} sends Message to ${target.name}".`,
      );
    }
    const activity: ActivityElement = {
      type: ACTIVITY_TYPE,
      name: input.label ?? '',
      id: this.newId('connection'),
      source: source.id,
      target: target.id,
      waypoints: this.route(source, target),
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

  addGroup(input: GroupInput): GroupElement {
    return this.atomic(() => this.applyAddGroup(input));
  }

  private applyAddGroup(input: GroupInput): GroupElement {
    const given = this.givenPosition(input);
    if (given && (input.members?.length || input.fromSteps)) {
      throw new StoryError(
        'Give members to fit the box around them, or x and y to draw it where it should go and take in what it covers, as in Egon; not both.',
      );
    }
    // A name shared by several elements (work objects repeat per sentence) groups all of them.
    const resolved = (input.members ?? []).flatMap((ref) => this.resolveShapes(ref));
    if (resolved.length > 0 || input.fromSteps) {
      return this.fitGroup(input, resolved.map((member) => member.id));
    }
    // A box without members or position goes below the story, so it takes in nothing.
    const bottom = Math.max(
      GRID.originY - 60,
      ...this.doc.elements.filter((element) => !isEdge(element)).map((element) => boundsOf(element as ShapeElement).y + boundsOf(element as ShapeElement).height),
    );
    const bounds = { x: given?.x ?? GRID.originX, y: given?.y ?? bottom + 60, width: input.width ?? 300, height: input.height ?? 200 };
    checkCoordinates(bounds);
    const group = this.newGroup(input, bounds);
    // A box drawn with coordinates goes where it lies and takes in what it covers, as in Egon.
    joinGroupAt(group, this.doc.elements);
    takeIn(group, this.doc.elements);
    return structuredClone(group);
  }

  /**
   * A box fitted around members (ADR 19): it holds them and the notes attached
   * to them, goes into the innermost group that holds every member, and that
   * group and the ones around it grow to fit.
   */
  private fitGroup(input: GroupInput, ids: string[]): GroupElement {
    const { host, members: memberIds, left } = membersFor(ids, this.doc.elements, input.fromSteps);
    if (memberIds.length === 0) {
      const nameOf = (id: string | undefined) => {
        const element = id === undefined ? undefined : this.find(id);
        return element?.name || id;
      };
      throw new StoryError(
        `Every work object of these steps already sits in another group (${left.map((id) => `"${nameOf(id)}" in "${nameOf(this.find(id)?.['parent'] as string)}"`).join(', ')}), so there is nothing to group. Name the ones that belong here in members to move them.`,
      );
    }
    const members = memberIds.map((id) => this.find(id) as ShapeElement);
    // A note goes with the element of its link of lowest id.
    const notes = [...noteAnchors(this.doc.elements)].flatMap(([noteId, anchor]) =>
      members.some((member) => member.id === anchor.id && !isGroup(member)) && !memberIds.includes(noteId) ? [this.find(noteId) as ShapeElement] : [],
    );
    const bounds = enclose([...members, ...notes].map((member) => boundsOf(member)), GROUP_PADDING);
    checkCoordinates(bounds);
    const group = this.newGroup(input, bounds);
    for (const member of [...members, ...notes]) {
      member['parent'] = group.id;
    }
    if (host === undefined) {
      return structuredClone(group);
    }
    group['parent'] = host;
    // The groups around grow where needed, so each stays larger than what it holds.
    const byId = new Map(this.doc.elements.map((element) => [element.id, element]));
    let inner: Bounds = bounds;
    for (const id of [host, ...groupAncestors(byId.get(host), byId)]) {
      const outer = byId.get(id) as ShapeElement;
      const box = union(boundsOf(outer), {
        x: inner.x - GROUP_PADDING,
        y: inner.y - GROUP_PADDING,
        width: inner.width + 2 * GROUP_PADDING,
        height: inner.height + 2 * GROUP_PADDING,
      });
      try {
        this.setGeometry(outer, box);
      } catch (error) {
        throw new StoryError(`The group "${outer.name || outer.id}" would have to grow past a billion pixels to hold the new group. ${(error as Error).message}`);
      }
      inner = box;
    }
    return structuredClone(group);
  }

  private newGroup(input: GroupInput, bounds: Bounds): GroupElement {
    const group: GroupElement = { type: GROUP_TYPE, name: input.name, id: this.newId('shape'), ...bounds };
    if (input.color !== undefined) {
      group.pickedColor = this.checkColor(input.color);
    }
    // Groups go first so Egon draws them underneath the elements they contain.
    this.doc.elements.unshift(group);
    return group;
  }

  addAnnotation(input: AnnotationInput): { annotation: TextAnnotationElement; connection?: ConnectionElement } {
    return this.atomic(() => this.applyAddAnnotation(input));
  }

  private applyAddAnnotation(input: AnnotationInput): {
    annotation: TextAnnotationElement;
    connection?: ConnectionElement;
  } {
    // With a shared name, the note goes to the first element of that name.
    const anchor = input.attachTo ? this.resolveShapes(input.attachTo)[0] : undefined;
    let position: { x: number; y: number };
    const given = this.givenPosition(input);
    if (given) {
      position = given;
    } else if (anchor) {
      const bounds = boundsOf(anchor);
      position = { x: bounds.x + bounds.width + 40, y: Math.max(0, bounds.y - 50) };
      checkCoordinates(position);
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
      // Egon stores an annotation's height in "number" as well (domainStoryRenderer).
      number: DEFAULT_ANNOTATION_SIZE.height,
    };
    this.doc.elements.push(annotation);
    if (anchor && !given) {
      // A note placed next to its element belongs with that element, even if it lands in another group's box.
      const anchorGroup = this.doc.elements.find((element) => element.id === anchor['parent']);
      if (isGroup(anchor)) {
        annotation['parent'] = anchor.id;
      } else if (anchorGroup && isGroup(anchorGroup)) {
        annotation['parent'] = anchorGroup.id;
      }
    } else {
      joinGroupAt(annotation, this.doc.elements);
    }
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
    return this.atomic(() => this.applyUpdate(ref, update));
  }

  /** Runs several edits as one: when one fails, none of them stays. */
  transaction<T>(edit: () => T): T {
    return this.atomic(edit);
  }

  /**
   * Runs an edit and undoes all of it when it fails, ids handed out
   * included, so a refused edit leaves the story as it was. Inside another
   * transaction only the outermost one keeps a copy, so a caller that catches
   * a nested failure and carries on keeps whatever that edit had changed.
   */
  private atomic<T>(edit: () => T): T {
    // Inside another transaction, that one undoes everything.
    if (this.depth > 0) {
      return edit();
    }
    const doc = structuredClone(this.doc);
    const ids = { ...this.highestIds };
    this.depth += 1;
    try {
      return edit();
    } catch (error) {
      this.doc = doc;
      Object.assign(this.highestIds, ids);
      throw error;
    } finally {
      this.depth -= 1;
    }
  }

  private applyUpdate(ref: string, update: ElementUpdate): StoryElement {
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
    const geometry = (['x', 'y', 'width', 'height'] as const).filter((key) => update[key] !== undefined);
    if (!isEdge(element) && geometry.length > 0) {
      const shape = element as ShapeElement;
      // Moving a group in Egon moves everything in it; check where that lands before changing anything.
      const dx = update.x === undefined ? 0 : Math.round(update.x) - shape.x;
      const dy = update.y === undefined ? 0 : Math.round(update.y) - shape.y;
      const byId = new Map(this.doc.elements.map((candidate) => [candidate.id, candidate]));
      const inside = isGroup(shape) && (dx !== 0 || dy !== 0)
        ? (this.doc.elements.filter((candidate) => !isEdge(candidate) && groupAncestors(candidate, byId).includes(shape.id)) as ShapeElement[])
        : [];
      for (const moved of inside) {
        checkCoordinates({ x: moved.x + dx, y: moved.y + dy });
      }
      this.setGeometry(shape, update);
      for (const moved of inside) {
        moved.x += dx;
        moved.y += dy;
        this.rerouteEdgesOf(moved.id);
      }
      // As in Egon, a shape moved into a group's box joins that group, and one moved out leaves it.
      joinGroupAt(shape, this.doc.elements);
      if (isGroup(shape)) {
        // A group can only hold smaller groups.
        const box = boundsOf(shape);
        for (const child of this.doc.elements.filter((candidate) => isGroup(candidate) && candidate['parent'] === shape.id)) {
          const inner = boundsOf(child as ShapeElement);
          if (inner.width * inner.height >= box.width * box.height) {
            joinGroupAt(child, this.doc.elements);
          }
        }
        takeIn(shape, this.doc.elements);
      }
    }
    return structuredClone(element);
  }

  /**
   * Moves or resizes a shape and reroutes its edges without touching group
   * membership. auto_layout uses it, since it decides membership itself.
   */
  setBounds(ref: string, bounds: Partial<Bounds>): void {
    const element = this.resolve(ref);
    if (isEdge(element)) {
      throw new StoryError(`"${ref}" is an activity or connection, not a shape.`);
    }
    this.setGeometry(element as ShapeElement, bounds);
  }

  /** Puts an element into a group, or out of every group with undefined. */
  setParent(ref: string, groupId: string | undefined): void {
    const element = this.resolve(ref);
    if (groupId === undefined) {
      delete element['parent'];
      return;
    }
    const group = this.resolve(groupId);
    if (!isGroup(group) || group.id === element.id) {
      throw new StoryError(`"${groupId}" is not a group that "${ref}" can belong to.`);
    }
    element['parent'] = group.id;
  }

  private setGeometry(shape: ShapeElement, update: Partial<Bounds>): void {
    const keys = (['x', 'y', 'width', 'height'] as const).filter((key) => update[key] !== undefined);
    // Check every value before changing any.
    for (const key of keys) {
      const value = update[key] as number;
      if (!Number.isFinite(value) || ((key === 'width' || key === 'height') && value <= 0)) {
        throw new StoryError(`${key} must be a ${key === 'x' || key === 'y' ? 'finite' : 'positive'} number.`);
      }
      checkCoordinates({ [key]: value });
    }
    for (const key of keys) {
      shape[key] = Math.round(update[key] as number);
    }
    if (isTextAnnotation(shape) && update.height !== undefined) {
      shape['number'] = shape.height;
    }
    this.rerouteEdgesOf(shape.id);
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
    // The members of a removed group go to the group whose box holds them, so the file reopens the same.
    for (const other of this.doc.elements) {
      if (other['parent'] === element.id) {
        joinGroupAt(other, this.doc.elements);
      }
    }
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
    assertRef(ref);
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
    return this.atomic(() => this.applyAddShape(kind, input, defaultIcon));
  }

  private applyAddShape(kind: IconKind, input: ShapeInput, defaultIcon: string): ShapeElement {
    const type = this.typeFor(kind, input.icon ?? defaultIcon);
    const position = this.givenPosition(input) ?? this.nextFreeCell();
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
    // As in Egon, a shape placed inside a group's box belongs to that group.
    joinGroupAt(shape, this.doc.elements);
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
    assertRef(ref);
    // Only actors and work objects can be activity ends, so a group or note of the same name does not count.
    if (!this.find(ref)) {
      const wanted = ref.trim().toLowerCase();
      const nodes = this.doc.elements.filter(
        (element) => (isActor(element) || isWorkObject(element)) && element.name.trim().toLowerCase() === wanted,
      );
      if (nodes.length === 1) {
        return nodes[0] as ShapeElement;
      }
    }
    const element = this.resolve(ref);
    if (!isActor(element) && !isWorkObject(element)) {
      throw new StoryError(`"${ref}" is a ${describeType(element)}. Activities connect actors and work objects.`);
    }
    return element as ShapeElement;
  }

  /**
   * The shape with this id, or the shapes with this name in id order.
   * Actors and work objects win over groups and annotations of the same name.
   * Several matches are only accepted when they are all work objects, which
   * repeat per sentence (ADR 13).
   */
  private resolveShapes(ref: string): ShapeElement[] {
    assertRef(ref);
    const byId = this.find(ref);
    if (byId) {
      if (isEdge(byId)) {
        throw new StoryError(`"${ref}" is an activity or connection, not a shape.`);
      }
      return [byId as ShapeElement];
    }
    const wanted = ref.trim().toLowerCase();
    const matches = this.doc.elements.filter(
      (element) =>
        !isEdge(element) &&
        (element.name.trim().toLowerCase() === wanted ||
          (isTextAnnotation(element) && (element.text ?? '').trim().toLowerCase() === wanted)),
    );
    if (matches.length === 0) {
      throw new StoryError(`There is no element with the id or name "${ref}".`);
    }
    // In id order, which is the order of adding and survives a save.
    matches.sort((a, b) => compareIds(a.id, b.id));
    const nodes = matches.filter((element) => isActor(element) || isWorkObject(element));
    const candidates = nodes.length > 0 ? nodes : matches;
    if (candidates.length > 1 && !candidates.every((element) => isWorkObject(element))) {
      throw new StoryError(
        `"${ref}" is ambiguous: ${candidates.map((m) => `${m.id} (${describeType(m)})`).join(', ')}. Use the id instead.`,
      );
    }
    return candidates as ShapeElement[];
  }

  /** The ids an element reference stands for: the id itself, or every element of that name. */
  idsOf(ref: string): string[] {
    return this.resolveShapes(ref).map((element) => element.id);
  }

  /** x and y when both are given; one without the other is a mistake. */
  private givenPosition(input: { x?: number | undefined; y?: number | undefined }): { x: number; y: number } | undefined {
    if (input.x === undefined && input.y === undefined) {
      return undefined;
    }
    if (input.x === undefined || input.y === undefined) {
      throw new StoryError('Give both x and y, or neither.');
    }
    checkCoordinates({ x: input.x, y: input.y });
    return { x: Math.round(input.x), y: Math.round(input.y) };
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
      edge.waypoints = isActivity(edge)
        ? this.route(source as ShapeElement, target as ShapeElement)
        : edgeWaypoints(boundsOf(source as ShapeElement), boundsOf(target as ShapeElement));
    }
  }

  /** Waypoints for an activity that avoid the other actors and work objects. */
  private route(source: ShapeElement, target: ShapeElement): ActivityElement['waypoints'] {
    const obstacles = this.doc.elements
      .filter((element) => (isActor(element) || isWorkObject(element)) && element.id !== source.id && element.id !== target.id)
      .map((element) => boundsOf(element as ShapeElement));
    return routeEdge(boundsOf(source), boundsOf(target), obstacles);
  }

  private nextFreeCell(): { x: number; y: number } {
    const occupied = this.doc.elements
      .filter((element) => !isEdge(element) && !isGroup(element))
      .map((element) => boundsOf(element as ShapeElement));
    const groups = this.doc.elements.filter(isGroup);
    for (let row = 0; ; ) {
      if (GRID.originY + row * GRID.cellHeight > MAX_COORDINATE) {
        throw new StoryError('There is no free spot within a billion pixels. Give x and y.');
      }
      // The first row where a column blocked only by group boxes can be free again.
      let nextRow = Number.POSITIVE_INFINITY;
      for (let column = 0; column < GRID.columns; column += 1) {
        const cell = { x: GRID.originX + column * GRID.cellWidth, y: GRID.originY + row * GRID.cellHeight, width: 75, height: 75 };
        // A cell inside a group's box would put the new shape into that group.
        const covering = groups.filter((group) => cornerInside(cell, group));
        if (covering.length > 0) {
          const bottom = Math.min(...covering.map((group) => boundsOf(group).y + boundsOf(group).height));
          nextRow = Math.min(nextRow, Math.floor((bottom - GRID.originY) / GRID.cellHeight) + 1);
        } else if (occupied.some((bounds) => intersects(bounds, cell, 30))) {
          nextRow = row + 1;
        } else {
          return { x: cell.x, y: cell.y };
        }
      }
      row = Math.max(row + 1, nextRow);
    }
  }

  /**
   * The next id above every id of that kind the story has had, from 10000 up.
   * Egon and save_story write elements sorted by id, so rising ids keep the
   * order they were added in, which the narrator uses for sentences that share
   * a number. Egon draws its own ids at random below 10000, so these never
   * crowd its range, and a removed element's id is not handed out again.
   */
  private newId(kind: 'shape' | 'connection'): string {
    const pattern = new RegExp(`^${kind}_(\\d+)$`);
    // Ids that elements carry, and ids that dangling arrows still name.
    const taken = new Set(
      this.doc.elements.flatMap((element) => [element.id, element['source'], element['target']].filter((id): id is string => typeof id === 'string')),
    );
    let highest = this.highestIds[kind];
    for (const id of taken) {
      // Past 15 digits a plain number loses precision, and counting from there would make ids too long to open again; the check below still avoids them.
      const digits = pattern.exec(id)?.[1]?.replace(/^0+(?=\d)/, '');
      if (digits !== undefined && digits.length <= 15 && Number(digits) > highest) {
        highest = Number(digits);
      }
    }
    let next = highest + 1;
    while (taken.has(`${kind}_${next}`)) {
      next += 1;
    }
    this.highestIds[kind] = next;
    return `${kind}_${next}`;
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

function checkCoordinates(values: Partial<Bounds>): void {
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'number' && Math.abs(value) > MAX_COORDINATE) {
      throw new StoryError(`${key} must be within a billion pixels.`);
    }
  }
}

function union(a: Bounds, b: Bounds): Bounds {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

function enclose(boxes: Bounds[], padding: number): Bounds {
  const minX = Math.min(...boxes.map((box) => box.x)) - padding;
  const minY = Math.min(...boxes.map((box) => box.y)) - padding;
  const maxX = Math.max(...boxes.map((box) => box.x + box.width)) + padding;
  // Labels sit below actors and work objects, so leave extra room at the bottom.
  const maxY = Math.max(...boxes.map((box) => box.y + box.height)) + padding + 20;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function assertRef(ref: string): void {
  if (ref.trim() === '') {
    throw new StoryError('The element needs an id or name, got an empty one.');
  }
}
