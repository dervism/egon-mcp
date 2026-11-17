import type { StoryDocument } from './types.js';

/**
 * Serializes a story as an `.egn` file, matching ExportService.downloadEGN:
 * `{ iconSet, domainStory }` with business objects sorted by id.
 */
export function toEgnJson(doc: StoryDocument): string {
  const domainStory: Record<string, unknown> = {
    businessObjects: [...doc.elements].sort((a, b) => a.id.localeCompare(b.id)),
    title: doc.title,
    description: doc.description,
    version: doc.version,
  };
  if (doc.scope && Object.keys(doc.scope).length > 0) {
    domainStory['scope'] = doc.scope;
  }
  return JSON.stringify({ iconSet: doc.iconSet, domainStory }, null, 2);
}

/**
 * Appends the story to an SVG image the way Egon's SvgService does, so that
 * Egon can import the resulting `.egn.svg`. The JSON payload escapes `<`, `>`,
 * `&` and `--` as JSON unicode escapes, which keeps the SVG well-formed XML
 * and still parses as the same JSON in Egon.
 */
export function embedStoryInSvg(svg: string, doc: StoryDocument): string {
  const closing = svg.lastIndexOf('</svg>');
  if (closing < 0) {
    throw new Error('The SVG has no closing </svg> tag.');
  }
  const payload = toEgnJson(doc)
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('--', '-\\u002d');
  const hidden =
    "\n<text class='hiddenDomainStory' style='font-size: 0'>\n\n" +
    `%3CDST%3E${payload}%3C/DST%3E` +
    '\n\n</text>\n';
  return svg.slice(0, closing) + hidden + svg.slice(closing);
}

/** Egon's sanitizeForDesktop applied to a title, plus the file extension. */
export function fileNameFor(title: string, extension: 'egn' | 'egn.svg' | 'svg' | 'md' | 'html'): string {
  const base = title.replace(/[/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim();
  return `${base || 'domain-story'}.${extension}`;
}
