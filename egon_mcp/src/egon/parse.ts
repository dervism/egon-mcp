import { ACTIVITY_TYPE, CONNECTION_TYPE, type IconMap, type IconSet, type Scope, type StoryDocument, type StoryElement } from './types.js';

export class StoryParseError extends Error {
  override name = 'StoryParseError';
}

/** Properties that bpmn-io adds at runtime and Egon strips on import. */
const BPMN_BOOKKEEPING = ['$type', 'di', '$descriptor'];

/**
 * Parses any file Egon can import: `.egn`, legacy `.dst`, and `.egn.svg` /
 * `.dst.svg` images with an embedded story. Follows the logic of Egon's
 * ImportDomainStoryService.
 */
export function parseStoryFile(text: string, fileName = 'story.egn'): StoryDocument {
  const isSvg = /\.svg$/i.test(fileName.trim()) || text.trimStart().startsWith('<');
  const json = isSvg ? extractJsonFromSvg(text) : text;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new StoryParseError(`The file is not valid JSON: ${(error as Error).message}`);
  }

  const fallbackTitle = titleFromFileName(fileName);
  if (Array.isArray(parsed)) {
    return fromLegacyArray(parsed, fallbackTitle, defaultIconSet());
  }
  if (!isRecord(parsed)) {
    throw new StoryParseError('The file does not contain a domain story object.');
  }

  const iconSet = readIconSet(parsed['iconSet'] ?? parsed['domain'] ?? parsed['config']);
  const storyPart = parsed['domainStory'] ?? parsed['dst'];
  if (storyPart === undefined) {
    throw new StoryParseError('The file has neither a "domainStory" nor a "dst" entry.');
  }
  const story = typeof storyPart === 'string' ? parseJson(storyPart, 'dst') : storyPart;

  if (Array.isArray(story)) {
    return fromLegacyArray(story, fallbackTitle, iconSet);
  }
  if (!isRecord(story) || !Array.isArray(story['businessObjects'])) {
    throw new StoryParseError('The domain story has no list of business objects.');
  }

  const doc: StoryDocument = {
    title: asString(story['title']) ?? fallbackTitle,
    description: asString(story['description']) ?? '',
    version: asString(story['version']) ?? '?',
    iconSet,
    elements: story['businessObjects'].filter(isRecord).filter(hasType).map(cleanElement),
  };
  const scope = readScope(story['scope']);
  if (scope) {
    doc.scope = scope;
  }
  return repairLegacyTypes(doc);
}

/**
 * Egon's ImportRepairService: icon names lose their spaces, and stories from
 * version 0.5 or older (or without a version) get their old work object types
 * converted.
 */
function repairLegacyTypes(doc: StoryDocument): StoryDocument {
  const prefix = Number(doc.version.substring(0, doc.version.lastIndexOf('.')));
  const legacy = Number.isNaN(prefix) || prefix <= 0.5;
  for (const element of doc.elements) {
    element.type = element.type.replace(/ /g, '-');
    if (legacy) {
      if (element.type === 'domainStory:workObject') {
        element.type = 'domainStory:workObjectDocument';
      } else if (element.type === 'domainStory:workObjectBubble') {
        element.type = 'domainStory:workObjectConversation';
      }
    }
  }
  return doc;
}

/** Egon's `restoreTitleFromFileName`: strips extensions and the date suffix. */
export function titleFromFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  return base
    .replace(/_\d+-\d+-\d+( ?_?-?\(\d+\))?(-?\d)?(\.dst|\.egn)(\.svg)?$/i, '')
    .replace(/(\.egn|\.dst)?(\.svg)?$/i, '')
    .replace(/\.json$/i, '');
}

/** Egon's `unsanitizeTextFromSvgExport` followed by `<DST>` extraction. */
function extractJsonFromSvg(svg: string): string {
  const text = svg
    .replaceAll('––', '--')
    .replaceAll('&#34;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&#43;', '+')
    .replaceAll('&#61;', '=')
    .replaceAll('%3C', '<')
    .replaceAll('%3E', '>');
  const start = text.indexOf('<DST>');
  const end = text.indexOf('</DST>');
  if (start < 0 || end < start) {
    throw new StoryParseError('The SVG has no embedded domain story (no <DST> block).');
  }
  return text
    .slice(start + '<DST>'.length, end)
    .replaceAll('<!--', '')
    .replaceAll('-->', '');
}

function fromLegacyArray(entries: unknown[], title: string, iconSet: IconSet): StoryDocument {
  const doc: StoryDocument = { title, description: '', version: '?', iconSet, elements: [] };
  for (const entry of entries.filter(isRecord)) {
    if (hasType(entry)) {
      doc.elements.push(cleanElement(entry));
    } else if ('info' in entry) {
      doc.description = asString(entry['info']) ?? '';
    } else if ('version' in entry) {
      doc.version = asString(entry['version']) ?? '?';
    }
  }
  return repairLegacyTypes(doc);
}

function readIconSet(value: unknown): IconSet {
  if (value === undefined || value === null) {
    return defaultIconSet();
  }
  const record = typeof value === 'string' ? parseJson(value, 'icon set') : value;
  if (!isRecord(record)) {
    throw new StoryParseError('The icon set is not an object.');
  }
  return {
    name: asString(record['name']) ?? 'default',
    actors: readIconMap(record['actors']),
    workObjects: readIconMap(record['workObjects']),
  };
}

function readIconMap(value: unknown): IconMap {
  const map: IconMap = {};
  if (isRecord(value)) {
    for (const [name, svg] of Object.entries(value)) {
      map[name] = typeof svg === 'string' ? svg : '';
    }
  }
  return map;
}

function readScope(value: unknown): Scope | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const scope: Scope = {};
  for (const key of ['granularity', 'pointInTime', 'domainPurity'] as const) {
    const entry = asString(value[key]);
    if (entry) {
      scope[key] = entry;
    }
  }
  return Object.keys(scope).length > 0 ? scope : undefined;
}

/** Stories without an icon set predate configurable icons; Egon then uses its defaults. */
function defaultIconSet(): IconSet {
  return { name: 'default', actors: {}, workObjects: {} };
}

/**
 * Copies an element, drops bpmn-io bookkeeping and checks field types, so
 * that values from untrusted files are safe to use in rendered SVG.
 */
function cleanElement(raw: Record<string, unknown>): StoryElement {
  const element: Record<string, unknown> = { ...raw };
  for (const key of BPMN_BOOKKEEPING) {
    delete element[key];
  }
  const type = element['type'] as string;
  const id = element['id'];
  if (typeof id !== 'string' || !id.trim()) {
    throw new StoryParseError(`An element of type ${type} has no id.`);
  }
  element['name'] = element['name'] === undefined || element['name'] === null ? '' : String(element['name']);
  if (element['text'] !== undefined && typeof element['text'] !== 'string') {
    element['text'] = element['text'] === null ? '' : String(element['text']);
  }
  for (const key of ['pickedColor', 'parent']) {
    if (element[key] !== undefined && typeof element[key] !== 'string') {
      delete element[key];
    }
  }
  if (type === ACTIVITY_TYPE || type === CONNECTION_TYPE) {
    for (const key of ['source', 'target']) {
      if (typeof element[key] !== 'string') {
        throw new StoryParseError(`${id}: ${key} must be an element id.`);
      }
    }
    if (!Array.isArray(element['waypoints'])) {
      throw new StoryParseError(`${id}: waypoints must be a list of points.`);
    }
    element['waypoints'] = element['waypoints'].map((point, index) => readWaypoint(point, `${id}: waypoint ${index + 1}`));
    if (type === ACTIVITY_TYPE) {
      const number = finite(element['number']);
      element['number'] = number === undefined ? null : number;
    }
  } else {
    for (const key of ['x', 'y']) {
      const value = finite(element[key]);
      if (value === undefined) {
        throw new StoryParseError(`${id}: ${key} must be a number.`);
      }
      element[key] = value;
    }
    for (const key of ['width', 'height']) {
      if (element[key] !== undefined) {
        const value = finite(element[key]);
        if (value === undefined || value <= 0) {
          delete element[key];
        } else {
          element[key] = value;
        }
      }
    }
  }
  return element as StoryElement;
}

function readWaypoint(value: unknown, where: string): { x: number; y: number; original?: { x: number; y: number } } {
  if (!isRecord(value)) {
    throw new StoryParseError(`${where} is not a point.`);
  }
  const x = finite(value['x']);
  const y = finite(value['y']);
  if (x === undefined || y === undefined) {
    throw new StoryParseError(`${where} needs numeric x and y.`);
  }
  const point: { x: number; y: number; original?: { x: number; y: number } } = { x, y };
  const original = value['original'];
  if (isRecord(original)) {
    const ox = finite(original['x']);
    const oy = finite(original['y']);
    if (ox !== undefined && oy !== undefined) {
      point.original = { x: ox, y: oy };
    }
  }
  return point;
}

/** A finite number, also from a numeric string; undefined otherwise. */
function finite(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new StoryParseError(`The ${what} entry is not valid JSON: ${(error as Error).message}`);
  }
}

function hasType(value: Record<string, unknown>): value is Record<string, unknown> & { type: string } {
  return typeof value['type'] === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
