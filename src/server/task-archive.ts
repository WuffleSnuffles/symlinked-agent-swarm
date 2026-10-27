import { Router } from 'express';
import { TaskboardManager } from './taskboard-manager.js';

export function createTaskArchiveRouter(manager: TaskboardManager) {
  const router = Router();
  router.get('/tasks/history', async (req, res) => {
    try {
      const query = typeof req.query.q === 'string' ? req.query.q : '';
      res.json({ tasks: await manager.searchArchivedTasks(query) });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  });
  return router;
}

// Existing TASK_* websocket handling refreshes the board, even with no task writes.
// Records stay in done/; this notifier only updates derived views, at most 1s after expiry.
export function startTaskArchiveRefresh(manager: TaskboardManager,
  broadcast: (type: string, payload: unknown) => void): () => void {
  let previous = '';
  let busy = false;
  let stopped = false;
  const tick = async () => {
    if (busy || stopped) return;
    busy = true;
    try {
      const tasks = await manager.searchArchivedTasks();
      const signature = tasks.map(task => task.id).sort().join('\n');
      if (!stopped && signature !== previous) {
        await manager.syncTaskboardMarkdown();
        if (!stopped) {
          broadcast('TASK_ARCHIVED', { count: tasks.length });
          previous = signature;
        }
      }
    } catch (error) { console.error('[TaskArchive] Refresh failed:', error); }
    finally { busy = false; }
  };
  const timer = setInterval(() => { void tick(); }, 1000);
  timer.unref();
  void tick();
  return () => { stopped = true; clearInterval(timer); };
}
