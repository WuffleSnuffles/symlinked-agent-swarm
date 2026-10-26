/**
 * src/server/index.ts
 *
 * Main Server Entry Point for Symlinked Agent Swarm Engine & Panopticon Backend.
 * Serves Express HTTP REST API and WebSocket broadcast server on port 3820 (configurable).
 */

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express, { Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { CubicleManager } from './cubicle-manager.js';
import { CapabilityMatrix } from './capability-matrix.js';
import { SubswarmManager } from './subswarm-manager.js';
import { WorktreeManager } from './worktree-manager.js';
import { TaskboardManager } from './taskboard-manager.js';
import { ConsularEngine } from './consular-engine.js';
import { PreferenceEngine } from './preference-engine.js';
import { SkillMcpManager } from './mcp-generator.js';
import { CourierGateway } from './courier-gateway.js';
import { createCubicleMessageRouter } from './cubicle-messages.js';
import { createGovernanceRouter } from './routes/governance-routes.js';
import { createMediaRouter } from './routes/media-routes.js';
import { createFilesystemRouter } from './routes/filesystem-routes.js';
import { ensureAvatarAssets } from './avatar-assets.js';
import { parseCliArgs, executeCliCommand } from './cli-dispatcher.js';

export interface SwarmServerInstance {
  app: express.Express;
  server: http.Server;
  wss: WebSocketServer;
  cubicleManager: CubicleManager;
  subswarmManager: SubswarmManager;
  worktreeManager: WorktreeManager;
  taskboardManager: TaskboardManager;
  capabilityMatrix: CapabilityMatrix;
  consularEngine: ConsularEngine;
  preferenceEngine: PreferenceEngine;
  skillMcpManager: SkillMcpManager;
  courierGateway: CourierGateway;
  port: number;
  close: () => Promise<void>;
}

export async function createSwarmServer(
  projectRoot: string = process.cwd(),
  port: number = Number(process.env.PORT || process.env.SWARM_PORT || 3820)
): Promise<SwarmServerInstance> {
  const repoRoot = path.resolve(projectRoot);
  const swarmDir = path.join(repoRoot, '.swarm');
  const agentsDir = path.join(repoRoot, '.agents');

  // Initialize managers
  const cubicleManager = new CubicleManager(swarmDir);
  const capabilityMatrix = new CapabilityMatrix();
  const subswarmManager = new SubswarmManager(swarmDir, capabilityMatrix);
  const worktreeManager = new WorktreeManager(repoRoot);
  const taskboardManager = new TaskboardManager(swarmDir);
  const consularEngine = new ConsularEngine(
    swarmDir,
    cubicleManager,
    taskboardManager,
    capabilityMatrix,
    worktreeManager,
    repoRoot
  );
  const preferenceEngine = new PreferenceEngine(swarmDir, agentsDir);
  consularEngine.setPreferenceEngine(preferenceEngine);
  const skillMcpManager = new SkillMcpManager(agentsDir, preferenceEngine);
  const courierGateway = new CourierGateway(
    swarmDir,
    consularEngine,
    taskboardManager,
    agentsDir
  );

  await cubicleManager.initialize();
  await subswarmManager.initialize();
  await taskboardManager.initialize();
  await consularEngine.initialize();
  await preferenceEngine.initialize();
  await skillMcpManager.initialize();
  await courierGateway.initialize();

  // Ensure high-resolution avatar assets exist
  ensureAvatarAssets(repoRoot);

  const app = express();
  app.use(express.json());

  // CORS headers
  app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  const publicDir = path.join(repoRoot, 'src', 'public');
  const rootPublicDir = path.join(repoRoot, 'public');

  // Mount static asset directories
  app.use('/assets', express.static(path.join(publicDir, 'assets')));
  app.use('/assets', express.static(path.join(rootPublicDir, 'assets')));
  app.use(express.static(publicDir));
  app.use(express.static(rootPublicDir));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/events' });

  // Broadcast helper
  const broadcast = (type: string, payload: any) => {
    const message = JSON.stringify({ type, payload, timestamp: new Date().toISOString() });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  };

  // Wire manager events to WebSocket broadcast
  cubicleManager.onStateChange((cubicle, reason) => {
    broadcast('CUBICLE_UPDATED', { cubicle, reason });
  });

  subswarmManager.onEvent((event) => {
    broadcast(event.type, event.payload);
  });

  consularEngine.onEvent((type, payload) => {
    broadcast(type, payload);
  });

  preferenceEngine.onEvent((type, payload) => {
    broadcast(type, payload);
  });

  skillMcpManager.onEvent((type, payload) => {
    broadcast(type, payload);
  });

  courierGateway.onEvent((type, payload) => {
    broadcast(type, payload);
  });

  // Mount Governance, Preference, MCP, Vault, and Courier Router
  app.use('/api', createGovernanceRouter(consularEngine, preferenceEngine, skillMcpManager, courierGateway));
  app.use('/api', createMediaRouter(repoRoot));
  app.use('/api', createFilesystemRouter(repoRoot));
  app.use('/api', createCubicleMessageRouter(path.join(swarmDir, 'messages'), cubicleManager, broadcast));

  // SPA Fallback for Panopticon SPA (including ?panel=cubicles, ?panel=console, ?panel=taskboard)
  app.get('/', (_req: Request, res: Response) => {
    const primaryIndex = path.join(publicDir, 'index.html');
    const fallbackIndex = path.join(rootPublicDir, 'index.html');
    if (fs.existsSync(primaryIndex)) {
      res.sendFile(primaryIndex);
    } else if (fs.existsSync(fallbackIndex)) {
      res.sendFile(fallbackIndex);
    } else {
      res.status(200).send('<!DOCTYPE html><html><head><title>Panopticon</title></head><body><h1>Panopticon Matrix</h1></body></html>');
    }
  });

  // REST Routes

  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    const activeCubicles = cubicleManager.getAllCubicles().filter(
      (c: any) =>
        (c.config?.enabled ?? c.assigned ?? false) &&
        c.status !== 'error' &&
        c.status !== 'vacant' &&
        c.state !== 'Error'
    ).length;

    res.json({
      status: 'ok',
      version: '1.0.0',
      uptime: process.uptime(),
      uptime_seconds: process.uptime(),
      cubicles_active: activeCubicles,
      active_cubicles: activeCubicles,
      governance: {
        mode: 'ROMAN_DUAL_CONSUL',
        consuls: ['Consul I', 'Consul II'],
        named_consuls: ['Consul Nia Nova', 'Consul Ferric Lunaux'],
      },
      timestamp: new Date().toISOString(),
    });
  });

  // Cubicle Routes
  app.get('/api/cubicles', (_req: Request, res: Response) => {
    res.json({ cubicles: cubicleManager.getAllCubicles() });
  });

  app.get('/api/cubicles/:id', (req: Request, res: Response) => {
    try {
      const cubicle = cubicleManager.getCubicle(req.params.id);
      res.json({ cubicle });
    } catch (err: any) {
      res.status(404).json({ error: err.message });
    }
  });

  app.put('/api/cubicles/:id/configure', async (req: Request, res: Response) => {
    try {
      const cubicle = await cubicleManager.configureCubicle(req.params.id, req.body);
      res.json({ cubicle });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/cubicles/:id/recharge', async (req: Request, res: Response) => {
    try {
      const cubicle = await cubicleManager.rechargeQuota(req.params.id, req.body.tokens);
      res.json({ cubicle });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/cubicles/:id/clear', async (req: Request, res: Response) => {
    try {
      const cubicle = await cubicleManager.clearCubicle(req.params.id);
      res.json({ cubicle });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/cubicles/scale', async (req: Request, res: Response) => {
    try {
      const count = Number(req.body?.count ?? req.body?.targetCount ?? 0);
      const reason = req.body?.reason ? String(req.body.reason) : undefined;
      const result = await cubicleManager.scaleCubicles(count, reason);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Taskboard Routes
  app.get('/api/tasks', async (_req: Request, res: Response) => {
    try {
      const tasks = await taskboardManager.listAllTasks();
      const progress = await taskboardManager.calculateOverallProgress();
      res.json({ tasks, progress });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/tasks/progress', async (_req: Request, res: Response) => {
    try {
      const progress = await taskboardManager.calculateOverallProgress();
      res.json({ progress });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/tasks', async (req: Request, res: Response) => {
    try {
      const task = await taskboardManager.createTask(req.body);
      broadcast('TASK_CREATED', { task });
      res.status(201).json({ task });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/tasks/claim', async (req: Request, res: Response) => {
    try {
      const { cubicleId, taskId } = req.body;
      if (!cubicleId) {
        res.status(400).json({ error: 'cubicleId is required to claim a task' });
        return;
      }
      const task = await taskboardManager.claimTask(cubicleId, taskId);
      if (!task) {
        res.status(404).json({ message: 'No available tasks to claim or race lost' });
        return;
      }
      const claimedCubicle = cubicleManager.getCubicle(cubicleId);
      claimedCubicle.current_task_id = task.id;
      await cubicleManager.transitionStatus(
        cubicleId,
        'working',
        `Active [${task.id}]: ${task.title}`
      );
      broadcast('TASK_CLAIMED', { task, cubicleId });
      res.json({ task });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/tasks/dispatch', async (req: Request, res: Response) => {
    try {
      const { taskId, cubicleId } = req.body || {};
      if (!taskId) {
        res.status(400).json({ error: 'taskId is required to dispatch a task to a worker cubicle' });
        return;
      }
      const dispatched = await consularEngine.dispatchTaskToCubicle(
        String(taskId),
        cubicleId ? String(cubicleId) : undefined
      );
      res.json(dispatched);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/tasks/:id/review', async (req: Request, res: Response) => {
    try {
      const task = await taskboardManager.submitForReview(req.params.id, req.body);
      if (task.assigned_cubicle) {
        await cubicleManager.transitionStatus(
          task.assigned_cubicle,
          'under_inspection',
          `Submitted task ${task.id} for Consular review`
        );
      }
      broadcast('TASK_SUBMITTED_REVIEW', { task });
      res.json({ task });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/tasks/:id/complete', async (req: Request, res: Response) => {
    try {
      const task = await taskboardManager.completeTask(req.params.id);
      if (task.assigned_cubicle) {
        await cubicleManager.transitionStatus(
          task.assigned_cubicle,
          'idle',
          `Task ${task.id} completed and approved`
        );
      }
      broadcast('TASK_COMPLETED', { task });
      res.json({ task });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/tasks/:id/veto', async (req: Request, res: Response) => {
    try {
      const task = await taskboardManager.returnToRevision(req.params.id, req.body);
      broadcast('TASK_VETOED', { task, veto: req.body });
      res.json({ task });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Incidents Routes
  app.get('/api/incidents', async (_req: Request, res: Response) => {
    try {
      const incidents = await subswarmManager.readIncidents();
      res.json({ incidents });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Subswarms Routes
  app.post('/api/subswarms/spawn', async (req: Request, res: Response) => {
    try {
      const manifest = await subswarmManager.spawnSubswarm(req.body);
      res.status(201).json({ manifest });
    } catch (err: any) {
      const status = err.statusCode || 400;
      res.status(status).json({
        code: err.code || 'SUBSWARM_SPAWN_ERROR',
        error: err.message,
      });
    }
  });

  app.post('/api/subswarms/consolidate', async (req: Request, res: Response) => {
    try {
      const { cubicleId, patches } = req.body;
      const manifest = await subswarmManager.consolidateResults(cubicleId, patches);
      res.json({ manifest });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 404 handler for unknown /api/* routes (must return JSON, never fall back to HTML)
  app.use('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  // SPA fallback for HTML requests (multi-monitor and deep links)
  app.get('*', (req: Request, res: Response, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/assets/')) {
      return next();
    }
    const htmlPath = path.join(publicDir, 'index.html');
    if (fs.existsSync(htmlPath)) {
      res.sendFile(htmlPath);
    } else {
      next();
    }
  });

  // Close helper
  const close = async (): Promise<void> => {
    return new Promise((resolve) => {
      for (const client of wss.clients) {
        try {
          client.terminate();
        } catch {}
      }
      wss.close(() => {
        if (typeof (server as any).closeAllConnections === 'function') {
          (server as any).closeAllConnections();
        }
        server.close(() => {
          resolve();
        });
      });
    });
  };

  return {
    app,
    server,
    wss,
    cubicleManager,
    subswarmManager,
    worktreeManager,
    taskboardManager,
    capabilityMatrix,
    consularEngine,
    preferenceEngine,
    skillMcpManager,
    courierGateway,
    port,
    close,
  };
}

// Auto-start and CLI Dispatcher if executed directly as main script
const isDirectEntry =
  Boolean(process.argv[1]) &&
  (process.argv[1].endsWith('index.ts') ||
    process.argv[1].endsWith('index.js') ||
    process.argv[1].endsWith('server.bundle.cjs') ||
    process.argv[1].toLowerCase().includes('symlinkedagentswarm'));

if (isDirectEntry) {
  const cliArgs = parseCliArgs(process.argv);
  executeCliCommand(cliArgs).then((result) => {
    if (result.handled) {
      return;
    }
    createSwarmServer(cliArgs.workspace, cliArgs.port).then(({ port, server }) => {
      server.listen(port, () => {
        console.log(`[PANOPTICON] Swarm Server listening on http://localhost:${port}`);
        console.log(`[PANOPTICON] Real-time WebSocket bus at ws://localhost:${port}/events`);
        if (!cliArgs.headless) {
          console.log(`[PANOPTICON] Workspace root: ${cliArgs.workspace}`);
          if (process.platform === 'win32' && !process.env.VITEST) {
            import('node:child_process').then(({ exec }) => {
              exec(`start "" "http://localhost:${port}"`);
            }).catch(() => {});
          }
        }
      });
    });
  });
}
