/**
 * src/server/routes/filesystem-routes.ts
 *
 * Safe Server-Backed Filesystem Browser Endpoint.
 * Powers the prompt attachment disk browser modal for local directory navigation.
 */

import fs from 'node:fs';
import path from 'node:path';
import { Router, Request, Response } from 'express';

export function createFilesystemRouter(projectRoot: string): Router {
  const router = Router();
  const repoRoot = path.resolve(projectRoot);

  router.get('/filesystem/browse', async (req: Request, res: Response) => {
    try {
      const rawPath = (req.query.path as string) || repoRoot;
      let decodedPath = rawPath;
      try {
        decodedPath = decodeURIComponent(rawPath);
      } catch {}

      let resolvedPath: string;
      if (path.isAbsolute(decodedPath)) {
        resolvedPath = path.normalize(decodedPath);
      } else {
        resolvedPath = path.resolve(repoRoot, decodedPath);
      }

      if (!fs.existsSync(resolvedPath)) {
        res.status(404).json({ error: `Directory not found: ${decodedPath}` });
        return;
      }

      const stat = await fs.promises.stat(resolvedPath);
      if (!stat.isDirectory()) {
        res.status(400).json({ error: 'Path is not a directory' });
        return;
      }

      const entries = await fs.promises.readdir(resolvedPath, { withFileTypes: true });
      const directories: Array<{ name: string; path: string; modifiedAt: string }> = [];
      const files: Array<{ name: string; path: string; size: number; extension: string; modifiedAt: string }> = [];

      for (const entry of entries) {
        // Skip hidden node_modules or .git internal deep directories if needed, but allow seeing .swarm and .agents
        if (entry.name === 'node_modules' || entry.name === '.git') {
          continue;
        }

        const fullPath = path.join(resolvedPath, entry.name);
        try {
          const s = await fs.promises.stat(fullPath);
          if (entry.isDirectory()) {
            directories.push({
              name: entry.name,
              path: fullPath,
              modifiedAt: s.mtime.toISOString(),
            });
          } else if (entry.isFile()) {
            files.push({
              name: entry.name,
              path: fullPath,
              size: s.size,
              extension: path.extname(entry.name),
              modifiedAt: s.mtime.toISOString(),
            });
          }
        } catch {
          // Skip inaccessible permission-locked files
        }
      }

      // Sort alphabetically: dirs first, then files
      directories.sort((a, b) => a.name.localeCompare(b.name));
      files.sort((a, b) => a.name.localeCompare(b.name));

      const parent = path.dirname(resolvedPath);
      const parentPath = parent !== resolvedPath ? parent : null;

      res.json({
        currentPath: resolvedPath,
        parentPath,
        directories,
        files,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
