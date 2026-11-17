import { embedStoryInSvg, type EgonFormat } from '../egon/serialize.js';
import {
  iconNameOf,
  isActivity,
  isActor,
  isConnection,
  isGroup,
  isTextAnnotation,
  isWorkObject,
  type EdgeElement,
  type Point,
  type ShapeElement,
  type StoryDocument,
} from '../egon/types.js';
import { IconCatalog } from '../icons/catalog.js';
import { boundsOf, type Bounds } from '../story/geometry.js';

export interface RenderOptions {
  /** Draw the title and description above the story, like Egon's "with title" export. */
  title?: boolean;
  /** Append the story so Egon can import the image as `.egn.svg`. */
  embedStory?: boolean;
  /** Paint a white background instead of a transparent one. */
  whiteBackground?: boolean;
  /** File layout of the embedded story (default egon3). */
  format?: EgonFormat;
}

const FONT = 'Arial, sans-serif';
const PADDING = 30;
const LINE_HEIGHT = 14;
const LABEL_CHARS_PER_LINE = 14;

/**
 * Draws a story as a standalone SVG, following the look of Egon's renderer
 * (domainStoryRenderer.js): icons, labels below shapes, numbered activities
 * with arrowheads, groups as boxes and annotations with a bracket.
 */
export function renderStorySvg(
  doc: StoryDocument,
  options: RenderOptions = {},
  catalog: IconCatalog = IconCatalog.builtIn(),
): string {
  const byId = new Map(doc.elements.map((element) => [element.id, element]));
  const groups = doc.elements.filter(isGroup);
  const nodes = doc.elements.filter((element) => isActor(element) || isWorkObject(element)) as ShapeElement[];
  const annotations = doc.elements.filter(isTextAnnotation);
  const activities = doc.elements.filter(isActivity).filter((edge) => hasEnds(edge, byId));
  const links = doc.elements.filter(isConnection).filter((edge) => hasEnds(edge, byId));

  const body: string[] = [];
  const markerColors = new Set<string>();

  for (const group of groups) {
    const box = boundsOf(group);
    const color = safeColor(group.pickedColor) ?? '#000000';
    body.push(
      `<g data-element-id="${attr(group.id)}"><rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="none" stroke="${color}" stroke-width="2"/>` +
        textLines(wrap(group.name, Math.max(10, Math.floor(box.width / 7))), box.x + 8, box.y + 19, { size: 12, anchor: 'start' }) +
        '</g>',
    );
  }

  for (const link of links) {
    const color = safeColor(link.pickedColor) ?? 'black';
    body.push(
      `<polyline data-element-id="${attr(link.id)}" points="${points(link)}" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="5, 5"/>`,
    );
  }

  for (const activity of activities) {
    const color = safeColor(activity.pickedColor) ?? 'black';
    markerColors.add(color);
    const parts = [
      `<polyline points="${points(activity)}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" marker-end="url(#${markerId(color)})"/>`,
    ];
    const [start, next] = activity.waypoints as [Point, Point];
    if (activity.name.trim()) {
      const [labelStart, labelEnd] = labelSegment(activity.waypoints);
      parts.push(activityLabel(activity.name, labelStart, labelEnd));
    }
    if (typeof activity.number === 'number' && activity.number > 0) {
      parts.push(numberBadge(activity.number, start, next));
    }
    body.push(`<g data-element-id="${attr(activity.id)}">${parts.join('')}</g>`);
  }

  for (const node of nodes) {
    body.push(drawNode(node, doc, catalog));
  }

  for (const annotation of annotations) {
    const box = boundsOf(annotation);
    const color = safeColor(annotation.pickedColor) ?? 'black';
    const text = annotation.text ?? '';
    body.push(
      `<g data-element-id="${attr(annotation.id)}"><path d="M ${box.x + 10} ${box.y} l -10 0 l 0 ${box.height} l 10 0" fill="none" stroke="${color}" stroke-width="2"/>` +
        textLines(wrap(text, Math.max(10, Math.floor(box.width / 6.5))), box.x + 5, box.y + 17, { size: 12, anchor: 'start', fill: color }) +
        '</g>',
    );
  }

  const content = contentBounds(doc, nodes, [...activities, ...links]);
  let header = '';
  let top = content.y;
  if (options.title) {
    const descriptionLines = doc.description ? doc.description.split(/\r?\n|<br>/) : [];
    const headerHeight = 45 + descriptionLines.length * 16;
    top = content.y - headerHeight;
    header =
      textLines([doc.title], content.x, top + 32, { size: 30, anchor: 'start' }) +
      textLines(descriptionLines, content.x, top + 52, { size: 12, anchor: 'start', lineHeight: 16 });
  }
  const width = Math.max(300, Math.ceil(content.width));
  const height = Math.ceil(content.y + content.height - top);
  const viewBox = `${Math.floor(content.x)} ${Math.floor(top)} ${width} ${height}`;
  const background = options.whiteBackground
    ? `<rect x="${Math.floor(content.x)}" y="${Math.floor(top)}" width="${width}" height="${height}" fill="white"/>`
    : '';
  const defs = [...markerColors]
    .map(
      (color) =>
        `<marker id="${markerId(color)}" viewBox="0 0 20 20" refX="11" refY="10" markerWidth="10" markerHeight="10" orient="auto"><path d="M 1 5 L 11 10 L 1 15 Z" fill="${color}" stroke="${color}" stroke-width="1"/></marker>`,
    )
    .join('');

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}" font-family="${FONT}">` +
    `<title>${text(doc.title)}</title>` +
    (defs ? `<defs>${defs}</defs>` : '') +
    background +
    header +
    body.join('\n') +
    '</svg>';
  return options.embedStory ? embedStoryInSvg(svg, doc, options.format ? { format: options.format } : {}) : svg;
}

function drawNode(node: ShapeElement, doc: StoryDocument, catalog: IconCatalog): string {
  const box = boundsOf(node);
  const actor = isActor(node);
  const iconBox = actor
    ? box
    : { x: box.x + box.width / 2 - 25, y: box.y + box.height / 2 - 25, width: box.width * 0.65, height: box.height * 0.65 };
  const icon = iconSvg(iconNameOf(node.type), doc, catalog, safeColor(node.pickedColor), iconBox);
  const baseline = actor ? box.y + box.height : box.y + box.height * 0.65 + 26;
  return (
    `<g data-element-id="${attr(node.id)}">${icon}` +
    textLines(wrap(node.name, LABEL_CHARS_PER_LINE), box.x + box.width / 2, baseline, { size: 12, anchor: 'middle' }) +
    '</g>'
  );
}

/**
 * Returns the icon as an <image> with a data URL. Browsers do not run scripts
 * or load external resources from SVG images, so icons from untrusted files
 * cannot inject anything into the rendered story.
 */
function iconSvg(name: string, doc: StoryDocument, catalog: IconCatalog, color: string | undefined, box: Bounds): string {
  // Egon prefers a built-in icon over a same-named entry in the file.
  let source = catalog.get(name)?.svg ?? doc.iconSet.actors[name] ?? doc.iconSet.workObjects[name] ?? '';
  const place = `x="${round(box.x)}" y="${round(box.y)}" width="${round(box.width)}" height="${round(box.height)}"`;
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(source)) {
    return `<image ${place} href="${attr(source)}"/>`;
  }
  if (source.startsWith('data:image/svg+xml')) {
    source = decodeDataUrl(source);
  }
  if (!/^\s*<svg[\s>]/i.test(source)) {
    return `<rect ${place} fill="none" stroke="${color ?? 'black'}" stroke-dasharray="3, 3"/>`;
  }
  let svg = source.trim();
  if (!/\sxmlns\s*=/.test(svg.slice(0, svg.indexOf('>')))) {
    svg = svg.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (color) {
    svg = recolor(svg, color);
  }
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
  return `<image ${place} href="${dataUrl}" preserveAspectRatio="xMidYMid meet"/>`;
}

/** Egon's applyColorToIcon: replace every fill, or add one when the icon has none. */
function recolor(svg: string, color: string): string {
  let changed = false;
  let result = svg.replace(/fill="(?!none")[^"]*"/g, () => {
    changed = true;
    return `fill="${color}"`;
  });
  result = result.replace(/fill:\s*#[0-9a-fA-F]{3,8}/g, () => {
    changed = true;
    return `fill:${color}`;
  });
  return changed ? result : result.replace(/^<svg\b/i, `<svg fill="${color}"`);
}

function decodeDataUrl(url: string): string {
  const comma = url.indexOf(',');
  const meta = url.slice(0, comma);
  const data = url.slice(comma + 1);
  try {
    return meta.endsWith(';base64') ? Buffer.from(data, 'base64').toString('utf8') : decodeURIComponent(data);
  } catch {
    return '';
  }
}

/** Egon's rule (dsLabelUtil): the last horizontal segment longer than 49px, else the first segment. */
function labelSegment(waypoints: Point[]): [Point, Point] {
  if (waypoints.length > 2) {
    for (let index = waypoints.length - 2; index >= 0; index -= 1) {
      const a = waypoints[index] as Point;
      const b = waypoints[index + 1] as Point;
      if (a.y === b.y && Math.abs(b.x - a.x) > 49) {
        return [a, b];
      }
    }
  }
  return [waypoints[0] as Point, waypoints[1] as Point];
}

function activityLabel(label: string, start: Point, next: Point): string {
  const midX = (start.x + next.x) / 2;
  const midY = (start.y + next.y) / 2;
  const horizontal = Math.abs(next.x - start.x) >= Math.abs(next.y - start.y);
  const x = horizontal ? midX : midX + 8;
  const y = horizontal ? midY + 15 : midY;
  return textLines(wrap(label, 22), x, y, {
    size: 11,
    anchor: horizontal ? 'middle' : 'start',
    halo: true,
  });
}

/** The step number in a circle, 20px from the start of the activity. */
function numberBadge(number: number, start: Point, next: Point): string {
  const length = Math.hypot(next.x - start.x, next.y - start.y) || 1;
  const cx = round(start.x + ((next.x - start.x) / length) * 20);
  const cy = round(start.y + ((next.y - start.y) / length) * 20);
  return (
    `<circle cx="${cx}" cy="${cy}" r="11" fill="white" stroke="black" stroke-width="1.5"/>` +
    `<text x="${cx}" y="${cy + 4}" font-size="11" text-anchor="middle">${number}</text>`
  );
}

function textLines(
  lines: string[],
  x: number,
  y: number,
  style: { size: number; anchor: 'start' | 'middle'; fill?: string; lineHeight?: number; halo?: boolean },
): string {
  if (lines.length === 0) {
    return '';
  }
  const lineHeight = style.lineHeight ?? LINE_HEIGHT;
  const halo = style.halo ? ' stroke="white" stroke-width="3" paint-order="stroke"' : '';
  const spans = lines
    .map((line, index) => `<tspan x="${round(x)}" y="${round(y + index * lineHeight)}">${text(line)}</tspan>`)
    .join('');
  return `<text font-size="${style.size}" text-anchor="${style.anchor}" fill="${style.fill ?? 'black'}"${halo}>${spans}</text>`;
}

/** Breaks text into lines of at most `width` characters, keeping words together. */
export function wrap(value: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && line.length + 1 + word.length > width) {
        lines.push(line);
        line = word;
      } else {
        line = line ? `${line} ${word}` : word;
      }
    }
    if (line) {
      lines.push(line);
    }
  }
  return lines;
}

function contentBounds(doc: StoryDocument, nodes: ShapeElement[], edges: EdgeElement[]): Bounds {
  const boxes: Bounds[] = [];
  for (const element of doc.elements) {
    if (isGroup(element) || isTextAnnotation(element)) {
      boxes.push(boundsOf(element));
    }
  }
  for (const node of nodes) {
    const box = boundsOf(node);
    const labelLines = Math.max(1, wrap(node.name, LABEL_CHARS_PER_LINE).length);
    boxes.push({ x: box.x - 15, y: box.y, width: box.width + 30, height: box.height + labelLines * LINE_HEIGHT + 6 });
  }
  for (const edge of edges) {
    for (const point of edge.waypoints) {
      boxes.push({ x: point.x - 20, y: point.y - 20, width: 40, height: 40 });
    }
  }
  if (boxes.length === 0) {
    return { x: 0, y: 0, width: 300, height: 100 };
  }
  const minX = Math.min(...boxes.map((box) => box.x)) - PADDING;
  const minY = Math.min(...boxes.map((box) => box.y)) - PADDING;
  const maxX = Math.max(...boxes.map((box) => box.x + box.width)) + PADDING;
  const maxY = Math.max(...boxes.map((box) => box.y + box.height)) + PADDING;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function hasEnds(edge: EdgeElement, byId: Map<string, unknown>): boolean {
  return byId.has(edge.source) && byId.has(edge.target) && Array.isArray(edge.waypoints) && edge.waypoints.length >= 2;
}

function points(edge: EdgeElement): string {
  return edge.waypoints.map((point) => `${round(point.x)},${round(point.y)}`).join(' ');
}

function markerId(color: string): string {
  return `arrow-${color.replace(/[^a-zA-Z0-9]/g, '')}`;
}

/** Accepts only plain color values so a file cannot inject markup through pickedColor. */
function safeColor(color: unknown): string | undefined {
  return typeof color === 'string' && /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20})$/.test(color.trim()) ? color.trim() : undefined;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function text(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function attr(value: string): string {
  return text(value).replace(/"/g, '&quot;');
}
