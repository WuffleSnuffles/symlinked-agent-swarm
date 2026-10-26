import { promises as fs, existsSync } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export interface CubicleConfig {
  id: string; // e.g. 'cubicle-01'
  assigned: boolean;
  provider: 'Gemini' | 'GPT' | 'Claude' | 'DeepSeek' | 'Custom' | 'unassigned';
  model: string;
  thinking_tier: 'Low' | 'Medium' | 'High' | 'Very High' | 'Ultra';
  can_spawn_subswarm: boolean;
  token_quota: number;
  tokens_used: number;
  fatigue_percent: number; // 0 (fresh) to 100 (exhausted)
  state: 'Working' | 'Relaxed/Idle' | 'Under Inspection' | 'Error';
  surface_thought: string;
}

export interface ConsularVote {
  consul: 'Consul I' | 'Consul II';
  decision: 'APPROVE' | 'VETO';
  rationale: string;
  timestamp: string;
}

export interface ConsularConsensusResult {
  unanimous_approved: boolean; // true ONLY if both vote APPROVE (2/2)
  votes: [ConsularVote, ConsularVote];
  action_taken: 'MERGED_TO_MAIN' | 'VETO_BLOCKED_AND_REVISED';
  reason?: string;
}

export interface PreferenceEntry {
  id: string;
  category: 'coding_style' | 'workflow' | 'testing' | 'safety' | 'architecture';
  key: string;
  rule: string;
  trigger_patterns: string[];
  confidence: number;
  source_message_id?: string;
  created_at: string;
  updated_at: string;
  hit_count: number;
  enabled: boolean;
  applies_to: string;
}

export interface PreferencesDatabase {
  version: string;
  last_updated: string;
  total_preferences: number;
  preferences: PreferenceEntry[];
}

export interface TaskRecord {
  id: string;
  title: string;
  description?: string;
  assigned_cubicle?: string;
  branch?: string;
  progress_percent: number;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  subtasks?: Array<{ id: string; title: string; completed: boolean }>;
  created_at: string;
  updated_at: string;
}

/**
 * Creates an NTFS Directory Junction on Windows, or directory symlink on POSIX.
 */
export async function createJunction(target: string, link: string): Promise<void> {
  const isWindows = process.platform === 'win32';
  try {
    // If link already exists, remove it first
    try {
      const stat = await fs.lstat(link);
      if (stat.isSymbolicLink() || (stat.isDirectory() && isWindows)) {
        await fs.unlink(link).catch(() => fs.rmdir(link));
      }
    } catch {
      // Ignored if does not exist
    }

    await fs.mkdir(path.dirname(link), { recursive: true });
    await fs.symlink(target, link, isWindows ? 'junction' : 'dir');
  } catch (err: any) {
    throw new Error(`Failed to create junction from ${target} to ${link}: ${err.message}`);
  }
}

/**
 * Checks whether a path is an NTFS Reparse Point (Junction / Symlink).
 */
export async function isReparsePoint(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(targetPath);
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Verifies zero-copy instant file visibility across a junction.
 */
export async function verifyZeroCopyVisibility(sourceDir: string, junctionDir: string): Promise<boolean> {
  const probeId = `probe_${crypto.randomBytes(6).toString('hex')}.tmp`;
  const probePayload = `PROBE_VERIFICATION_${Date.now()}`;
  const sourceFile = path.join(sourceDir, probeId);
  const targetFile = path.join(junctionDir, probeId);

  try {
    await fs.writeFile(sourceFile, probePayload, 'utf8');
    const existsInJunction = existsSync(targetFile);
    if (!existsInJunction) return false;

    const content = await fs.readFile(targetFile, 'utf8');
    return content === probePayload;
  } finally {
    await fs.unlink(sourceFile).catch(() => {});
  }
}

/**
 * Performs atomic lock-free task claim via filesystem rename.
 */
export async function atomicTaskClaim(
  sourcePath: string,
  destPath: string
): Promise<{ success: boolean; error?: string }> {
  const claimGate = `${destPath}.claim`;
  try {
    const fh = await fs.open(claimGate, 'wx');
    await fh.close();
  } catch (err: any) {
    return { success: false, error: err.code || err.message };
  }
  try {
    await fs.rename(sourcePath, destPath);
    return { success: true };
  } catch (err: any) {
    await fs.unlink(claimGate).catch(() => {});
    return { success: false, error: err.code || err.message };
  }
}

/**
 * Simulates high-concurrency race condition on atomic task claim.
 */
export async function simulateConcurrentClaims(
  todoFile: string,
  inProgressDir: string,
  workerCount: number = 50
): Promise<{ successes: number; collisions: number; winningWorker?: string }> {
  let successes = 0;
  let collisions = 0;
  let winningWorker: string | undefined;

  const workers = Array.from({ length: workerCount }, (_, i) => `cubicle-${String(i + 1).padStart(2, '0')}`);

  await Promise.allSettled(
    workers.map(async (workerId) => {
      const dest = path.join(inProgressDir, path.basename(todoFile));
      const claimGate = `${dest}.claim`;
      try {
        const fh = await fs.open(claimGate, 'wx');
        await fh.close();
        await fs.rename(todoFile, dest);
        successes++;
        winningWorker = workerId;
        return { workerId, success: true };
      } catch (err: any) {
        if (err.code === 'EEXIST' || err.code === 'ENOENT' || err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'EBUSY') {
          collisions++;
          return { workerId, success: false, reason: 'Collision/AlreadyClaimed' };
        }
        throw err;
      }
    })
  );

  return { successes, collisions, winningWorker };
}

/**
 * Evaluates thinking-tier sub-swarm capability gating rule.
 */
export function evaluateSubswarmGating(model: string, thinkingTier: string): { canSpawn: boolean; reason?: string } {
  const normModel = model.toLowerCase().trim();
  const normTier = thinkingTier.toLowerCase().trim();

  // Explicit contract rules from PROJECT.md and ORIGINAL_REQUEST.md:
  // - Gemini 4 Argon (High): true
  // - GPT Astra (Very High): false (Restricted!)
  // - GPT Astra (Ultra): true
  if (normModel.includes('gemini 4 argon') && normTier === 'high') {
    return { canSpawn: true };
  }
  if (normModel.includes('gpt astra') && normTier === 'very high') {
    return {
      canSpawn: false,
      reason: 'CAPABILITY_RESTRICTION_ERROR: GPT Astra (Very High) is restricted from spawning sub-swarms.'
    };
  }
  if (normModel.includes('gpt astra') && normTier === 'ultra') {
    return { canSpawn: true };
  }
  if (normTier === 'ultra') {
    return { canSpawn: true };
  }
  if (normTier === 'low' || normTier === 'medium') {
    return {
      canSpawn: false,
      reason: `CAPABILITY_RESTRICTION_ERROR: Thinking tier '${thinkingTier}' is below multi-swarm threshold.`
    };
  }

  // Default fallback rule
  return { canSpawn: false, reason: 'CAPABILITY_RESTRICTION_ERROR: Default capability policy restricts sub-swarms.' };
}

/**
 * Evaluates Dual-Consul unanimous consensus and veto governance.
 */
export function evaluateConsularConsensus(
  vote1: ConsularVote,
  vote2: ConsularVote
): ConsularConsensusResult {
  const norm1 = (vote1.consul || '').toLowerCase();
  const norm2 = (vote2.consul || '').toLowerCase();
  const c1 = norm1.includes('consul ii') || norm1.includes('ferric') ? 'consul-2' : norm1.includes('consul i') || norm1.includes('nia') ? 'consul-1' : norm1;
  const c2 = norm2.includes('consul ii') || norm2.includes('ferric') ? 'consul-2' : norm2.includes('consul i') || norm2.includes('nia') ? 'consul-1' : norm2;
  const isDistinct = c1 !== c2;
  const unanimous = isDistinct && vote1.decision === 'APPROVE' && vote2.decision === 'APPROVE';
  return {
    unanimous_approved: unanimous,
    votes: [vote1, vote2],
    action_taken: unanimous ? 'MERGED_TO_MAIN' : 'VETO_BLOCKED_AND_REVISED',
    reason: !isDistinct ? 'Consular consensus requires votes from two distinct Consuls' : undefined
  };
}

/**
 * Compiles preferences database into canonical USER_PREFERENCES.md markdown.
 */
export function compileUserPreferencesMarkdown(prefsDb: PreferencesDatabase): string {
  const header = `<!-- AUTO-GENERATED BY OVERSEER PREFERENCE ENGINE - DO NOT EDIT MANUALLY -->\n<!-- Last Updated: ${prefsDb.last_updated} | Total Active Rules: ${prefsDb.preferences.filter(p => p.enabled).length} -->\n\n# User Preferences & Project Constraints ("Never Explain Twice")\n\n> [!IMPORTANT]\n> The following rules were extracted directly from user directives. All worker agents\n> operating in this repository must strictly adhere to these rules without exception.\n\n`;

  const categories: Record<string, PreferenceEntry[]> = {};
  for (const pref of prefsDb.preferences) {
    if (!pref.enabled) continue;
    if (!categories[pref.category]) categories[pref.category] = [];
    categories[pref.category].push(pref);
  }

  let body = '';
  let idx = 1;
  const titles: Record<string, string> = {
    coding_style: 'Coding Style & Quality',
    testing: 'Testing & Verification',
    workflow: 'Workflow & Git Operations',
    safety: 'Architectural & Safety Constraints',
    architecture: 'Architecture & System Design'
  };

  for (const [cat, entries] of Object.entries(categories)) {
    body += `## ${idx++}. ${titles[cat] || cat.toUpperCase()}\n`;
    for (const e of entries) {
      const patterns = e.trigger_patterns.length > 0 ? ` *(Pattern: \`${e.trigger_patterns.join('`, `')}\`)*` : '';
      body += `- **[${e.key}]**: ${e.rule}${patterns}\n`;
    }
    body += '\n';
  }

  return header + body;
}

/**
 * Provisions a physical, self-contained test sandbox on disk with real directory structures.
 */
export async function createTestSandbox(prefix: string = 'swarm_e2e'): Promise<{
  sandboxDir: string;
  swarmDir: string;
  agentsDir: string;
  worktreesDir: string;
  cleanup: () => Promise<void>;
}> {
  const rand = crypto.randomBytes(4).toString('hex');
  const sandboxDir = path.join(os.tmpdir(), `${prefix}_${Date.now()}_${rand}`);

  const swarmDir = path.join(sandboxDir, '.swarm');
  const agentsDir = path.join(sandboxDir, '.agents');
  const worktreesDir = path.join(sandboxDir, 'worktrees');

  // Create standard subdirectories
  await fs.mkdir(path.join(swarmDir, 'tasks', 'todo'), { recursive: true });
  await fs.mkdir(path.join(swarmDir, 'tasks', 'in_progress'), { recursive: true });
  await fs.mkdir(path.join(swarmDir, 'tasks', 'review'), { recursive: true });
  await fs.mkdir(path.join(swarmDir, 'tasks', 'done'), { recursive: true });
  await fs.mkdir(path.join(swarmDir, 'subswarms'), { recursive: true });
  await fs.mkdir(path.join(swarmDir, 'status'), { recursive: true });
  await fs.mkdir(path.join(swarmDir, 'memory'), { recursive: true });
  await fs.mkdir(path.join(swarmDir, 'logs'), { recursive: true });

  await fs.mkdir(path.join(agentsDir, 'rules'), { recursive: true });
  await fs.mkdir(path.join(agentsDir, 'skills'), { recursive: true });
  await fs.mkdir(path.join(agentsDir, 'mcp'), { recursive: true });
  await fs.mkdir(worktreesDir, { recursive: true });

  const cleanup = async () => {
    try {
      await fs.rm(sandboxDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  };

  return { sandboxDir, swarmDir, agentsDir, worktreesDir, cleanup };
}

/**
 * Creates an authentic in-memory Win32 Portable Executable (PE) binary buffer for testing.
 * Strictly adheres to PE/COFF specification:
 * - DOS Header: 'MZ' (0x4D, 0x5A) at bytes 0..1
 * - PE Header Pointer: e_lfanew at offset 0x3C
 * - NT PE Signature: 'PE\0\0' (0x50, 0x45, 0x00, 0x00) at peOffset
 * - Optional embedded ASCII identifier payload in section memory
 *
 * @param identifier ASCII string or version label to embed in the binary
 * @param size Total buffer size in bytes (minimum 128 bytes, default 1024 bytes)
 * @param peOffset Offset where PE signature begins (default 0x80 = 128)
 */
export function createPeTestBuffer(
  identifier: string = 'SWARM_PE_V1',
  size: number = 1024,
  peOffset: number = 0x80
): Buffer {
  const minSize = Math.max(size, peOffset + 64);
  const buf = Buffer.alloc(minSize);

  // 1. DOS Header: Magic 'MZ' (0x4D, 0x5A)
  buf[0] = 0x4d; // 'M'
  buf[1] = 0x5a; // 'Z'

  // Standard DOS stub header fields
  buf.writeUInt16LE(0x90, 0x02); // e_cblp: bytes on last page
  buf.writeUInt16LE(0x03, 0x04); // e_cp: pages in file
  buf.writeUInt16LE(0x04, 0x08); // e_cparhdr: size of header in paragraphs
  buf.writeUInt16LE(0xffff, 0x0c); // e_maxalloc

  // 2. PE Header pointer e_lfanew at 0x3C
  buf.writeUInt32LE(peOffset, 0x3c);

  // 3. PE Signature 'PE\0\0' (0x50, 0x45, 0x00, 0x00) at peOffset
  buf[peOffset] = 0x50;     // 'P'
  buf[peOffset + 1] = 0x45; // 'E'
  buf[peOffset + 2] = 0x00;
  buf[peOffset + 3] = 0x00;

  // 4. COFF File Header fields
  buf.writeUInt16LE(0x8664, peOffset + 4); // Machine: IMAGE_FILE_MACHINE_AMD64 (x64)
  buf.writeUInt16LE(1, peOffset + 6);      // NumberOfSections: 1
  buf.writeUInt32LE(Math.floor(Date.now() / 1000), peOffset + 8); // TimeDateStamp

  // 5. Embed identifier payload in text/data section after PE header
  if (identifier) {
    const payloadOffset = peOffset + 24;
    const maxPayloadLen = minSize - payloadOffset - 1;
    const payloadBytes = Buffer.from(identifier, 'utf8');
    payloadBytes.copy(buf, payloadOffset, 0, Math.min(payloadBytes.length, maxPayloadLen));
  }

  return buf;
}
