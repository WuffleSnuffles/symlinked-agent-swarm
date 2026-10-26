/**
 * src/server/subswarm-manager.ts
 *
 * Hierarchical Sub-Swarm Lifecycle, Incident Interception, and Consolidation Manager.
 * Handles sub-swarm spawning in .swarm/subswarms/cubicle-XX/, micro-task planning,
 * patch consolidation into the parent worktree, and unauthorized spawn violation interception
 * with structured logging to .swarm/logs/incidents.jsonl and Twin Sauron spotlight alerts.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  CapabilityMatrix,
  CapabilityRestrictionError,
  MaxRecursionDepthError,
} from './capability-matrix.js';
import { ThinkingLevel } from './types/cubicle.js';

export interface SubtaskRecord {
  id: string;
  title: string;
  description: string;
  assigned_worker_id: string; // e.g. "drone-01"
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  patch_file?: string;
  created_at: string;
  completed_at?: string;
}

export interface SubswarmManifest {
  subswarm_id: string;
  cubicle_id: string;
  parent_task_id: string;
  model: string;
  thinking_level: ThinkingLevel;
  depth: number;
  status: 'planning' | 'running' | 'consolidating' | 'completed' | 'failed';
  created_at: string;
  completed_at?: string;
  subtasks: SubtaskRecord[];
  patches_applied: string[];
}

export interface IncidentRecord {
  id: string;
  timestamp: string;
  type: 'CAPABILITY_VIOLATION' | 'MAX_RECURSION_VIOLATION' | 'EXECUTION_ERROR' | 'CONSOLIDATION_FAILED';
  cubicle_id: string;
  model: string;
  thinking_level: string;
  severity: 'WARNING' | 'CRITICAL' | 'BLOCKED';
  message: string;
  details: Record<string, any>;
  twin_sauron_mode: 'CONVERGE_OFFENDING_CUBICLE' | 'AUDIT_SWEEP';
}

export type SubswarmEventCallback = (event: {
  type: 'INCIDENT_ALERT' | 'SUBSWARM_SPAWNED' | 'SUBSWARM_CONSOLIDATED';
  payload: any;
}) => void;

export class SubswarmManager {
  private swarmDir: string;
  private subswarmsBaseDir: string;
  private incidentsLogPath: string;
  private capabilityMatrix: CapabilityMatrix;
  private listeners: Set<SubswarmEventCallback> = new Set();

  constructor(swarmDir: string, capabilityMatrix: CapabilityMatrix = new CapabilityMatrix()) {
    this.swarmDir = path.resolve(swarmDir);
    this.subswarmsBaseDir = path.join(this.swarmDir, 'subswarms');
    this.incidentsLogPath = path.join(this.swarmDir, 'logs', 'incidents.jsonl');
    this.capabilityMatrix = capabilityMatrix;
  }

  /**
   * Initializes sub-swarms and incident directories.
   */
  public async initialize(): Promise<void> {
    await fs.mkdir(this.subswarmsBaseDir, { recursive: true });
    await fs.mkdir(path.dirname(this.incidentsLogPath), { recursive: true });
  }

  /**
   * Registers a listener for sub-swarm alerts (e.g. WebSocket bus).
   */
  public onEvent(callback: SubswarmEventCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emitEvent(type: 'INCIDENT_ALERT' | 'SUBSWARM_SPAWNED' | 'SUBSWARM_CONSOLIDATED', payload: any): void {
    for (const listener of this.listeners) {
      try {
        listener({ type, payload });
      } catch {
        // Safe callback isolation
      }
    }
  }

  /**
   * Spawns a new sub-swarm for a cubicle. Intercepts unauthorized attempts,
   * writes structured incident records to incidents.jsonl, emits INCIDENT_ALERT,
   * and throws CapabilityRestrictionError.
   */
  public async spawnSubswarm(params: {
    cubicleId: string;
    parentTaskId: string;
    model: string;
    thinkingLevel: ThinkingLevel;
    goal: string;
    currentDepth?: number;
    manualOverride?: boolean;
    subtaskCount?: number;
  }): Promise<SubswarmManifest> {
    await this.initialize();
    const currentDepth = params.currentDepth ?? 0;

    // Check capability gate
    try {
      this.capabilityMatrix.assertCanSpawn({
        model: params.model,
        thinkingLevel: params.thinkingLevel,
        currentDepth,
        manualOverride: params.manualOverride,
        cubicleId: params.cubicleId,
      });
    } catch (err: any) {
      // Intercept and record incident
      const incident: IncidentRecord = {
        id: `inc-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        timestamp: new Date().toISOString(),
        type: err instanceof MaxRecursionDepthError ? 'MAX_RECURSION_VIOLATION' : 'CAPABILITY_VIOLATION',
        cubicle_id: params.cubicleId,
        model: params.model,
        thinking_level: params.thinkingLevel,
        severity: 'BLOCKED',
        message: err.message,
        details: {
          parent_task_id: params.parentTaskId,
          goal: params.goal,
          attempted_depth: currentDepth,
        },
        twin_sauron_mode: 'CONVERGE_OFFENDING_CUBICLE',
      };

      await this.logIncident(incident);

      // Emit real-time alert for UI (Twin Eyes of Sauron lock-on)
      this.emitEvent('INCIDENT_ALERT', {
        incident,
        focus_cubicle: params.cubicleId,
        twin_sauron_mode: 'CONVERGE_OFFENDING_CUBICLE',
      });

      throw err;
    }

    // Authorized: create subswarm directory structure
    const subswarmId = `subswarm-${params.cubicleId}-${Date.now().toString(36)}`;
    const cubicleSubswarmDir = path.join(this.subswarmsBaseDir, params.cubicleId);
    const subtasksDir = path.join(cubicleSubswarmDir, 'subtasks');
    const patchesDir = path.join(cubicleSubswarmDir, 'patches');

    await fs.mkdir(cubicleSubswarmDir, { recursive: true });
    await fs.mkdir(subtasksDir, { recursive: true });
    await fs.mkdir(patchesDir, { recursive: true });

    const count = params.subtaskCount || 3;
    const subtasks: SubtaskRecord[] = [];

    for (let i = 1; i <= count; i++) {
      const droneId = `drone-${String(i).padStart(2, '0')}`;
      const subtaskId = `subtask-${i}`;
      const subtask: SubtaskRecord = {
        id: subtaskId,
        title: `Micro-task ${i} for ${params.parentTaskId}`,
        description: `Parallel decomposition segment ${i}: execute sub-step for '${params.goal}'.`,
        assigned_worker_id: droneId,
        status: 'in_progress',
        created_at: new Date().toISOString(),
      };
      subtasks.push(subtask);
      await fs.writeFile(
        path.join(subtasksDir, `${subtaskId}.json`),
        JSON.stringify(subtask, null, 2),
        'utf8'
      );
    }

    const manifest: SubswarmManifest = {
      subswarm_id: subswarmId,
      cubicle_id: params.cubicleId,
      parent_task_id: params.parentTaskId,
      model: params.model,
      thinking_level: params.thinkingLevel,
      depth: currentDepth + 1,
      status: 'running',
      created_at: new Date().toISOString(),
      subtasks,
      patches_applied: [],
    };

    const manifestPath = path.join(cubicleSubswarmDir, 'manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    this.emitEvent('SUBSWARM_SPAWNED', {
      subswarm_id: subswarmId,
      cubicle_id: params.cubicleId,
      drone_count: count,
    });

    return manifest;
  }

  /**
   * Consolidates child worker results and patches into parent cubicle branch.
   */
  public async consolidateResults(
    cubicleId: string,
    patches: Array<{ subtaskId: string; patchContent: string }>
  ): Promise<SubswarmManifest> {
    const cubicleSubswarmDir = path.join(this.subswarmsBaseDir, cubicleId);
    const manifestPath = path.join(cubicleSubswarmDir, 'manifest.json');
    const raw = await fs.readFile(manifestPath, 'utf8');
    const manifest: SubswarmManifest = JSON.parse(raw);

    manifest.status = 'consolidating';
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    const patchesDir = path.join(cubicleSubswarmDir, 'patches');
    for (const p of patches) {
      const patchFileName = `${p.subtaskId}.patch`;
      const patchPath = path.join(patchesDir, patchFileName);
      await fs.writeFile(patchPath, p.patchContent, 'utf8');
      manifest.patches_applied.push(patchFileName);

      const subtask = manifest.subtasks.find((s) => s.id === p.subtaskId);
      if (subtask) {
        subtask.status = 'completed';
        subtask.patch_file = patchFileName;
        subtask.completed_at = new Date().toISOString();
      }
    }

    manifest.status = 'completed';
    manifest.completed_at = new Date().toISOString();
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    this.emitEvent('SUBSWARM_CONSOLIDATED', {
      subswarm_id: manifest.subswarm_id,
      cubicle_id: cubicleId,
      patches_count: manifest.patches_applied.length,
    });

    return manifest;
  }

  /**
   * Reads current subswarm manifest for a cubicle.
   */
  public async getManifest(cubicleId: string): Promise<SubswarmManifest | null> {
    try {
      const manifestPath = path.join(this.subswarmsBaseDir, cubicleId, 'manifest.json');
      const raw = await fs.readFile(manifestPath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Reads all structured incident logs from incidents.jsonl.
   */
  public async readIncidents(limit: number = 100): Promise<IncidentRecord[]> {
    try {
      const raw = await fs.readFile(this.incidentsLogPath, 'utf8');
      const lines = raw.split('\n').filter((line) => line.trim().length > 0);
      const incidents: IncidentRecord[] = [];
      for (const line of lines) {
        try {
          incidents.push(JSON.parse(line));
        } catch {}
      }
      return incidents.slice(-limit).reverse();
    } catch {
      return [];
    }
  }

  /**
   * Appends an incident to .swarm/logs/incidents.jsonl.
   */
  public async logIncident(incident: IncidentRecord): Promise<void> {
    await fs.mkdir(path.dirname(this.incidentsLogPath), { recursive: true });
    const line = JSON.stringify(incident) + '\n';
    await fs.appendFile(this.incidentsLogPath, line, 'utf8');
  }
}
