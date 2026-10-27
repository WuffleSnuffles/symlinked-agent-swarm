/**
 * src/openrig-port/seat-recap-store.ts
 *
 * Ported directly from OpenRig (`packages/daemon/src/domain/context-packs/seat-recap-store.ts`).
 * Implements OPR.0.5.3.5 mini-req 7 — Durable Seat Handovers (`RECAP.md` + `recap-superseded/` chain)
 * with Markdown addressability hard gate, symlink-escape rejection, and atomic rotation.
 */

import {
  closeSync,
  copyFileSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { parseMarkdownSections, resolveAddress, validateMarkdownAddressability } from './markdown-address.js';

export const RECAP_FILENAME = 'RECAP.md';
const CHAIN_DIRNAME = 'recap-superseded';

export class RecapWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecapWriteError';
  }
}

export interface RecapChainEntry {
  path: string;
  supersededAtMs: number;
  sequence: number;
}

export function writeSeatRecap(opts: { seatDir: string; content: string; now?: () => number }): void {
  const findings = validateMarkdownAddressability(opts.content);
  if (findings.length > 0) {
    throw new RecapWriteError(
      `recap is not addressable and could never compose (seat:${RECAP_FILENAME}#... would fail every ` +
        `handover profile): ${findings
          .map((f) =>
            f.kind === 'unterminated-fence'
              ? `unterminated fence at line ${f.line}`
              : `${f.kind} '${'headerPath' in f ? f.headerPath : ''}'`
          )
          .join('; ')}. Fix the structure (duplicate header paths / unterminated fences); prose shape is never gated.`
    );
  }

  mkdirSync(opts.seatDir, { recursive: true });

  for (const [name, kind] of [
    [RECAP_FILENAME, 'file'],
    [CHAIN_DIRNAME, 'directory'],
  ] as const) {
    let stat: ReturnType<typeof lstatSync>;
    try {
      stat = lstatSync(join(opts.seatDir, name));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
    if (kind === 'file' ? !stat.isFile() : !stat.isDirectory()) {
      throw new RecapWriteError(
        `${join(opts.seatDir, name)} is ${
          stat.isSymbolicLink() ? 'a link' : `not a ${kind}`
        }, so the recap write would follow it out of the seat folder. Nothing was written; replace it with a real ${kind} and retry.`
      );
    }
  }

  const now = opts.now ?? Date.now;
  const current = join(opts.seatDir, RECAP_FILENAME);
  const staged = join(opts.seatDir, `.RECAP-${randomUUID()}.tmp`);
  let stagedOwned = false;
  let archiveStage: string | undefined;
  let archived: string | undefined;
  let published = false;
  try {
    const stagedFd = openSync(staged, 'wx');
    stagedOwned = true;
    closeSync(stagedFd);
    writeFileSync(staged, opts.content, 'utf8');
    if (existsSync(current)) {
      const chainDir = join(opts.seatDir, CHAIN_DIRNAME);
      mkdirSync(chainDir, { recursive: true });
      const candidate = join(chainDir, `.RECAP-${randomUUID()}.tmp`);
      const archiveFd = openSync(candidate, 'wx');
      archiveStage = candidate;
      closeSync(archiveFd);
      copyFileSync(current, archiveStage);
      const stamp = String(now()).padStart(15, '0');
      for (let counter = 1; ; counter++) {
        const suffix = counter === 1 ? '' : `-${counter}`;
        const target = join(chainDir, `RECAP-${stamp}${suffix}.md`);
        try {
          try {
            linkSync(archiveStage, target);
          } catch (err) {
            if (!['EOPNOTSUPP', 'ENOTSUP', 'EPERM', 'EXDEV'].includes((err as NodeJS.ErrnoException).code ?? '')) {
              throw err;
            }
            const fallbackFd = openSync(target, 'wx');
            archived = target;
            closeSync(fallbackFd);
            copyFileSync(archiveStage, target);
          }
          archived = target;
          break;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'EEXIST') continue;
          throw err;
        }
      }
    }
    renameSync(staged, current);
    published = true;
  } finally {
    if (stagedOwned) {
      try {
        unlinkSync(staged);
      } catch {}
    }
    if (archiveStage) {
      try {
        unlinkSync(archiveStage);
      } catch {}
    }
    if (!published && archived) {
      try {
        unlinkSync(archived);
      } catch {}
    }
  }
}

export function readSeatRecap(seatDir: string, sectionAddress?: string): {
  exists: boolean;
  content: string | null;
  sectionText?: string;
  chain: RecapChainEntry[];
  contractFindings: RecapContractFinding[];
} {
  const current = join(seatDir, RECAP_FILENAME);
  const chain = listRecapChain(seatDir);
  if (!existsSync(current)) {
    return { exists: false, content: null, chain, contractFindings: [] };
  }
  const content = readFileSync(current, 'utf8');
  const contractFindings = validateRecapContract(content);
  if (sectionAddress) {
    const headerPath = sectionAddress.replace(/^#/, '').split('/').filter(Boolean);
    const resolved = resolveAddress(content, headerPath);
    return { exists: true, content, sectionText: resolved.text, chain, contractFindings };
  }
  return { exists: true, content, chain, contractFindings };
}

export function listRecapChain(seatDir: string): RecapChainEntry[] {
  const chainDir = join(seatDir, CHAIN_DIRNAME);
  let names: string[];
  try {
    names = readdirSync(chainDir);
  } catch {
    return [];
  }
  return names
    .map((name) => {
      const m = name.match(/^RECAP-(\d+)(?:-(\d+))?\.md$/);
      return m
        ? { path: join(chainDir, name), supersededAtMs: Number(m[1]), sequence: m[2] ? Number(m[2]) : 1 }
        : null;
    })
    .filter((e): e is RecapChainEntry => e !== null)
    .sort((a, b) => a.supersededAtMs - b.supersededAtMs || a.sequence - b.sequence);
}

export type RecapContractFinding =
  | { kind: 'no-decisions-section' }
  | { kind: 'nonstandard-unverified-marker'; line: number };

export function validateRecapContract(content: string): RecapContractFinding[] {
  const findings: RecapContractFinding[] = [];
  const sections = parseMarkdownSections(content);
  const hasDecisions = sections.some((s) => s.headerPath[s.headerPath.length - 1]!.includes('decision'));
  if (!hasDecisions) findings.push({ kind: 'no-decisions-section' });
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/unverified/i.test(line) && !line.includes('UNVERIFIED:')) {
      findings.push({ kind: 'nonstandard-unverified-marker', line: i });
    }
  }
  return findings;
}

export function formatCubicleHandoverRecap(params: {
  cubicleId: string;
  occupantGeneration: string;
  taskId: string;
  taskTitle: string;
  verificationPassed: boolean;
  filesChanged: string[];
  summary: string;
  timestamp?: string;
}): string {
  const ts = params.timestamp ?? new Date().toISOString();
  const verificationLine = params.verificationPassed
    ? `- Verification passed at ${ts}`
    : `- UNVERIFIED: Verification did not complete cleanly at ${ts}`;
  const filesList =
    params.filesChanged.length > 0 ? params.filesChanged.map((f) => `- \`${f}\``).join('\n') : '- None recorded';
  const cleanSummary = (params.summary || 'Completed turn.')
    .replace(/```/g, "'''")
    .replace(/^#{1,6}\s+/gm, '')
    .trim()
    .slice(0, 1200);

  return [
    `# Seat Handover Recap (${params.cubicleId})`,
    ``,
    `## Decisions and Rationale`,
    `- Seat: \`${params.cubicleId}@panopticon\``,
    `- Occupant Generation: \`${params.occupantGeneration}\``,
    `- Task: \`${params.taskId}\` — ${params.taskTitle}`,
    `- Timestamp: \`${ts}\``,
    ``,
    `### Execution Summary`,
    cleanSummary,
    ``,
    `## Verification and Scope`,
    verificationLine,
    ``,
    `### Scoped Files`,
    filesList,
    ``,
  ].join('\n');
}
