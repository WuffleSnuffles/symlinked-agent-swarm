import path from 'node:path';

/** Missing scope reserves the whole repository; directories include descendants. */
export function normalizeFileScope(scope: string[] | undefined): string[] {
  if (scope !== undefined && (!Array.isArray(scope) || scope.length === 0)) {
    throw new Error('Gate 1 requires a non-empty file_scope.');
  }
  return [...new Set((scope ?? ['.']).map(raw => {
    if (typeof raw !== 'string' || !raw.trim()) throw new Error('Invalid file scope');
    const input = raw.replace(/\\/g, '/');
    if (path.posix.isAbsolute(input) || /^[a-z]:/i.test(input) || /[*?\[\]]/.test(input)) {
      throw new Error('File scopes must be repository-relative literal paths.');
    }
    const normalized = path.posix.normalize(input).replace(/\/$/, '').toLowerCase();
    if (normalized === '..' || normalized.startsWith('../')) throw new Error('File scope escapes repository');
    return normalized || '.';
  }))];
}

export function scopesOverlap(a: string[], b: string[]): boolean {
  return a.some(left => b.some(right => left === '.' || right === '.' || left === right ||
    left.startsWith(`${right}/`) || right.startsWith(`${left}/`)));
}
