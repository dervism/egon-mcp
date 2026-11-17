import type { IconMap, IconSet, Scope, StoryDocument, StoryElement } from './types.js';

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

function cleanElement(raw: Record<string, unknown>): StoryElement {
  const element: Record<string, unknown> = { ...raw };
  for (const key of BPMN_BOOKKEEPING) {
    delete element[key];
  }
  if (typeof element['name'] !== 'string') {
    element['name'] = element['name'] === undefined || element['name'] === null ? '' : String(element['name']);
  }
  return element as StoryElement;
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
