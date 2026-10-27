/**
 * src/openrig-port/markdown-address.ts
 *
 * Ported directly from OpenRig (`packages/daemon/src/domain/markdown-address.ts`).
 * Implements OPR.0.5.3.5 mini-req 6 — Addressable Markdown resolver core (`name#H2-slug/H3-slug`).
 */

const MIN_LEVEL = 2;
const MAX_LEVEL = 3;

export class AddressResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AddressResolutionError';
  }
}

export function slugifyHeader(title: string): string {
  return title
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface ParsedAddress {
  ref: string;
  headerPath: string[];
}

export function parseAddress(address: string): ParsedAddress {
  const hashCount = (address.match(/#/g) ?? []).length;
  if (hashCount > 1) {
    throw new AddressResolutionError(
      `address '${address}' has ${hashCount} '#' separators — the one form is name#H2-slug/H3-slug (a single '#').`
    );
  }
  const [ref, headerPart] = hashCount === 1 ? (address.split('#') as [string, string]) : [address, undefined];
  if (!ref) {
    throw new AddressResolutionError(
      `address '${address}' has an empty ref before '#' — an address always names its file/ref.`
    );
  }
  if (headerPart === undefined) return { ref, headerPath: [] };
  const headerPath = headerPart.split('/');
  if (headerPath.some((seg) => seg.length === 0)) {
    throw new AddressResolutionError(
      `address '${address}' has an empty header segment — the form is name#H2-slug or name#H2-slug/H3-slug.`
    );
  }
  if (headerPath.length > MAX_LEVEL - MIN_LEVEL + 1) {
    throw new AddressResolutionError(
      `address '${address}' goes ${headerPath.length} levels deep — addresses target H2 and H3 only, so the deepest form is name#H2-slug/H3-slug.`
    );
  }
  return { ref, headerPath };
}

export interface MarkdownSection {
  level: number;
  title: string;
  headerPath: string[];
  headerLine: number;
  text: string;
  ownText: string;
}

interface HeaderHit {
  level: number;
  title: string;
  line: number;
}

interface HeaderScan {
  hits: HeaderHit[];
  unterminatedFenceLine: number | null;
}

function scanHeaders(lines: string[]): HeaderScan {
  const hits: HeaderHit[] = [];
  let fence: { marker: string; length: number; line: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1]![0]!;
      const length = fenceMatch[1]!.length;
      if (!fence) {
        if (marker === '`' && line.slice(fenceMatch[0].length).includes('`')) continue;
        fence = { marker, length, line: i };
      } else if (
        fence.marker === marker &&
        length >= fence.length &&
        /^[ \t\r]*$/.test(line.slice(fenceMatch[0].length))
      ) {
        fence = null;
      }
      continue;
    }
    if (fence) continue;
    const header = atxHeading(line);
    if (header) hits.push({ ...header, line: i });
  }
  return { hits, unterminatedFenceLine: fence?.line ?? null };
}

const LINE_BREAK_IN_TITLE = /[\r\u2028\u2029]/;

function atxHeading(line: string): { level: number; title: string } | null {
  let start = 0;
  while (start < 3 && line[start] === ' ') start++;
  let level = 0;
  while (line[start + level] === '#') level++;
  if (level < 1 || level > 6) return null;
  const rest = line.slice(start + level);
  if (rest !== '' && !/^\s/.test(rest)) return null;
  const title = rest.trim();
  return LINE_BREAK_IN_TITLE.test(title) ? null : { level, title };
}

export function parseMarkdownSections(text: string): MarkdownSection[] {
  const lines = text.split('\n');
  const { hits: headers } = scanHeaders(lines);
  const sections: MarkdownSection[] = [];
  let currentH2: string | null = null;
  for (let idx = 0; idx < headers.length; idx++) {
    const h = headers[idx]!;
    if (h.level < MIN_LEVEL || h.level > MAX_LEVEL) {
      if (h.level < MIN_LEVEL) currentH2 = h.title.length === 0 ? '' : null;
      continue;
    }
    const slug = slugifyHeader(h.title);
    if (h.level === 2) currentH2 = slug;
    const headerPath = h.level === 2 ? [slug] : currentH2 !== null ? [currentH2, slug] : [slug];
    const fullEnd = headers.slice(idx + 1).find((n) => n.level <= h.level)?.line ?? lines.length;
    const ownEnd = headers[idx + 1]?.line ?? lines.length;
    sections.push({
      level: h.level,
      title: h.title,
      headerPath,
      headerLine: h.line,
      text: lines.slice(h.line, fullEnd).join('\n'),
      ownText: lines.slice(h.line, ownEnd).join('\n'),
    });
  }
  return sections;
}

export function resolveAddress(text: string, headerPath: string[]): MarkdownSection {
  if (headerPath.length === 0) {
    throw new AddressResolutionError(
      'resolveAddress needs at least one header slug; a bare ref resolves to the whole file at the caller.'
    );
  }
  const sections = parseMarkdownSections(text);
  const wanted = headerPath.join('/');
  const hits = sections.filter((s) => s.headerPath.join('/') === wanted);
  if (hits.length > 1) {
    throw new AddressResolutionError(
      `address '#${wanted}' is AMBIGUOUS in this file — ${hits.length} sections share the path (header lines ${hits
        .map((h) => h.headerLine)
        .join(', ')}).`
    );
  }
  if (hits.length === 1) return hits[0]!;
  const parentPath = headerPath.slice(0, -1).join('/');
  const candidates = sections
    .filter((s) => s.headerPath.slice(0, -1).join('/') === parentPath)
    .map((s) => s.headerPath.join('/'));
  throw new AddressResolutionError(
    `address '#${wanted}' matches no header in this file. ` +
      (candidates.length > 0
        ? `Addressable sections under '${parentPath || '(top)'}': ${candidates.join(', ')}.`
        : `The file has ${sections.length} addressable section(s): ${
            sections.map((s) => s.headerPath.join('/')).join(', ') || '(none)'
          }.`)
  );
}

export type AddressabilityFinding =
  | { kind: 'duplicate-header-path'; headerPath: string; lines: number[] }
  | { kind: 'unaddressable-header'; headerPath: string; line: number; title: string }
  | { kind: 'unterminated-fence'; line: number };

export function validateMarkdownAddressability(text: string): AddressabilityFinding[] {
  const lines = text.split('\n');
  const { hits: headers, unterminatedFenceLine } = scanHeaders(lines);
  const sections = parseMarkdownSections(text);
  const findings: AddressabilityFinding[] = [];
  if (unterminatedFenceLine !== null) {
    findings.push({ kind: 'unterminated-fence', line: unterminatedFenceLine });
  }
  const seen = new Map<string, number[]>();
  let blankParentScope = false;
  let headerIndex = 0;
  for (const s of sections) {
    while (headerIndex < headers.length && headers[headerIndex]!.line <= s.headerLine) {
      const header = headers[headerIndex++]!;
      if (header.level <= 2) blankParentScope = header.title.length === 0;
    }
    if (s.title.length === 0 || (blankParentScope && s.headerPath.length === 2 && s.headerPath[1]!.length > 0)) {
      continue;
    }
    if (s.headerPath.some((segment) => segment.length === 0)) {
      findings.push({
        kind: 'unaddressable-header',
        headerPath: s.headerPath.join('/'),
        line: s.headerLine,
        title: s.title,
      });
      continue;
    }
    const key = s.headerPath.join('/');
    seen.set(key, [...(seen.get(key) ?? []), s.headerLine]);
  }
  for (const [headerPath, lineNumbers] of seen) {
    if (lineNumbers.length > 1) findings.push({ kind: 'duplicate-header-path', headerPath, lines: lineNumbers });
  }
  return findings;
}
