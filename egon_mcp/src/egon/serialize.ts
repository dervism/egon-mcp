import { EGON_FORMAT_VERSION, groupAncestors, isGroup, type StoryDocument, type StoryElement } from './types.js';

/**
 * Egon file layouts:
 * - egon3: `{ domain, dst: [...elements, { info }, { version }] }`, written by
 *   egon.io 3.x (the public app). Title comes from the file name.
 * - egon4: `{ iconSet, domainStory: { businessObjects, title, description, version, scope } }`,
 *   written by Egon 4 (unreleased). Egon 4 also reads egon3 files.
 */
export type EgonFormat = 'egon3' | 'egon4';

export const EGON3_FORMAT_VERSION = '3.2.1';

export interface SerializeOptions {
  format?: EgonFormat;
}

/**
 * Serializes a story as an `.egn` file, matching Egon's own export: business
 * objects sorted by id and the current version of the chosen layout (Egon
 * treats a missing or pre-0.5 version as a legacy file). Groups keep their
 * places but come outer first, because Egon's import puts a group into its
 * `parent` only when it has already read that group.
 */
export function toEgnJson(doc: StoryDocument, options: SerializeOptions = {}): string {
  const elements = [...doc.elements].sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(elements.map((element) => [element.id, element]));
  const depth = (element: StoryElement) => groupAncestors(element, byId).length;
  const outerFirst = elements.filter(isGroup).sort((a, b) => depth(a) - depth(b) || a.id.localeCompare(b.id));
  elements.forEach((element, index) => {
    if (isGroup(element)) {
      elements[index] = outerFirst.shift() as StoryElement;
    }
  });
  if ((options.format ?? 'egon3') === 'egon3') {
    return JSON.stringify(
      { domain: doc.iconSet, dst: [...elements, { info: doc.description }, { version: EGON3_FORMAT_VERSION }] },
      null,
      2,
    );
  }
  const domainStory: Record<string, unknown> = {
    businessObjects: elements,
    title: doc.title,
    description: doc.description,
    version: EGON_FORMAT_VERSION,
  };
  if (doc.scope && Object.keys(doc.scope).length > 0) {
    domainStory['scope'] = doc.scope;
  }
  return JSON.stringify({ iconSet: doc.iconSet, domainStory }, null, 2);
}

/**
 * Appends the story to an SVG image so Egon can import it as `.egn.svg`.
 * Egon 3 reads everything after a literal `<DST>` marker, so the story goes
 * into a comment after `</svg>`, as in Egon 3's SvgService. Characters that
 * would end the comment or that Egon's unsanitizers rewrite (`--`, `<`, `>`,
 * `&`, `%`, en dashes) are written as JSON unicode escapes, which parse back
 * to the same text.
 */
export function embedStoryInSvg(svg: string, doc: StoryDocument, options: SerializeOptions = {}): string {
  const closing = svg.lastIndexOf('</svg>');
  if (closing < 0) {
    throw new Error('The SVG has no closing </svg> tag.');
  }
  const payload = toEgnJson(doc, options)
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('%', '\\u0025')
    .replaceAll('–', '\\u2013')
    .replaceAll('--', '-\\u002d');
  return `${svg.slice(0, closing + '</svg>'.length)}\n<!-- <DST>\n${payload}\n </DST> -->`;
}

/** Egon's sanitizeForDesktop applied to a title, plus the file extension. */
export function fileNameFor(title: string, extension: 'egn' | 'egn.svg' | 'svg' | 'md' | 'html'): string {
  const base = title.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
  return `${base || 'domain-story'}.${extension}`;
}
