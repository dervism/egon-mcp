/**
 * Types that mirror Egon's file format (see
 * modules/egon.io/src/app/domain/entities). Element types are the strings Egon
 * writes into `.egn` files.
 */

export const ACTOR_PREFIX = 'domainStory:actor';
export const WORK_OBJECT_PREFIX = 'domainStory:workObject';
export const ACTIVITY_TYPE = 'domainStory:activity';
export const CONNECTION_TYPE = 'domainStory:connection';
export const GROUP_TYPE = 'domainStory:group';
export const TEXT_ANNOTATION_TYPE = 'domainStory:textAnnotation';

/** Egon's file format version that this server writes. */
export const EGON_FORMAT_VERSION = '4.0.0';

export interface Point {
  x: number;
  y: number;
}

export interface Waypoint extends Point {
  original?: Point;
}

export interface Scope {
  granularity?: string;
  pointInTime?: string;
  domainPurity?: string;
}

/** Icon name to SVG source, in the order Egon shows them in the palette. */
export type IconMap = Record<string, string>;

export interface IconSet {
  name: string;
  actors: IconMap;
  workObjects: IconMap;
}

interface BaseElement {
  id: string;
  type: string;
  name: string;
  pickedColor?: string;
  [extra: string]: unknown;
}

export interface ShapeElement extends BaseElement {
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export interface ActorElement extends ShapeElement {}
export interface WorkObjectElement extends ShapeElement {}

export interface GroupElement extends ShapeElement {
  width: number;
  height: number;
}

export interface TextAnnotationElement extends ShapeElement {
  text?: string;
  width: number;
  height: number;
}

export interface EdgeElement extends BaseElement {
  source: string;
  target: string;
  waypoints: Waypoint[];
}

export interface ActivityElement extends EdgeElement {
  number?: number | null;
  multipleNumberAllowed?: boolean;
}

export type ConnectionElement = EdgeElement;

export type StoryElement = ShapeElement | EdgeElement;

/** A parsed domain story: Egon's `DomainStory` plus the icon set it uses. */
export interface StoryDocument {
  title: string;
  description: string;
  version: string;
  scope?: Scope;
  iconSet: IconSet;
  elements: StoryElement[];
}

export function isActor(element: { type: string }): boolean {
  return element.type.startsWith(ACTOR_PREFIX);
}

export function isWorkObject(element: { type: string }): boolean {
  return element.type.startsWith(WORK_OBJECT_PREFIX);
}

export function isActivity(element: { type: string }): element is ActivityElement {
  return element.type === ACTIVITY_TYPE;
}

export function isConnection(element: { type: string }): element is ConnectionElement {
  return element.type === CONNECTION_TYPE;
}

export function isEdge(element: { type: string }): element is EdgeElement {
  return isActivity(element) || isConnection(element);
}

export function isGroup(element: { type: string }): element is GroupElement {
  return element.type === GROUP_TYPE;
}

export function isTextAnnotation(element: { type: string }): element is TextAnnotationElement {
  return element.type === TEXT_ANNOTATION_TYPE;
}

/** Returns the icon name of an actor or work object type, or '' for other types. */
export function iconNameOf(type: string): string {
  if (type.startsWith(ACTOR_PREFIX)) {
    return type.slice(ACTOR_PREFIX.length);
  }
  if (type.startsWith(WORK_OBJECT_PREFIX)) {
    return type.slice(WORK_OBJECT_PREFIX.length);
  }
  return '';
}
