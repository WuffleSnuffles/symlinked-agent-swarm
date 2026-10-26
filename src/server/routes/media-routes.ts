/**
 * src/server/routes/media-routes.ts
 *
 * Rich Multimodal Media Streaming & Byte-Range Endpoint.
 * Serves PDFs, images, videos, audio, and documents with HTTP 206 Partial Content,
 * MIME type resolution, and path traversal protection.
 */

import fs from 'node:fs';
import path from 'node:path';
import { Router, Request, Response } from 'express';

export const MIME_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.ts': 'text/plain',
  '.js': 'application/javascript',
  '.html': 'text/html',
  '.css': 'text/css',
};

export function createMediaRouter(projectRoot: string): Router {
  const router = Router();
  const repoRoot = path.resolve(projectRoot);

  router.get('/media/serve', async (req: Request, res: Response) => {
    try {
      const rawPath = req.query.path as string;
      if (!rawPath || typeof rawPath !== 'string') {
        res.status(400).json({ error: 'Missing required query parameter: path' });
        return;
      }

      let decodedPath = rawPath;
      try {
        decodedPath = decodeURIComponent(rawPath);
      } catch {}

      // Resolve absolute or relative path
      let resolvedPath: string;
      if (path.isAbsolute(decodedPath)) {
        resolvedPath = path.normalize(decodedPath);
      } else {
        resolvedPath = path.resolve(repoRoot, decodedPath);
      }

      // Security check: ensure path does not escape allowed directories or target sensitive system files
      const normalizedTarget = resolvedPath.toLowerCase();
      const normalizedRepo = path.normalize(repoRoot).toLowerCase();
      const isSystemPath = normalizedTarget.includes('windows\\system32') || normalizedTarget.includes('/etc/');
      const isWithinRepo = normalizedTarget.startsWith(normalizedRepo);
      const isWithinDrive = normalizedTarget.includes('gemini antigravity');
      const isTempSandbox = normalizedTarget.includes('temp') || normalizedTarget.includes('tmp');

      if (isSystemPath || (!isWithinRepo && !isWithinDrive && !isTempSandbox)) {
        res.status(403).json({ error: 'FORBIDDEN: Path traversal outside allowed workspace' });
        return;
      }

      if (!fs.existsSync(resolvedPath)) {
        res.status(404).json({ error: `Media file not found: ${decodedPath}` });
        return;
      }

      const stat = await fs.promises.stat(resolvedPath);
      if (stat.isDirectory()) {
        res.status(400).json({ error: 'Requested path is a directory, not a media file' });
        return;
      }

      const ext = path.extname(resolvedPath).toLowerCase();
      const mimeType = MIME_MAP[ext] || 'application/octet-stream';
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        // RFC 7233 Range parser: handles standard (bytes=0-99), open-ended (bytes=500-),
        // and suffix (bytes=-200) ranges, rejecting empty representations and out-of-bounds requests.
        const cleanRange = range.replace(/^bytes=/, '').trim();
        const parts = cleanRange.split('-');

        if (fileSize === 0 || parts.length !== 2) {
          res.status(416).set('Content-Range', `bytes */${fileSize}`).send('Requested Range Not Satisfiable');
          return;
        }

        let start: number;
        let end: number;

        if (parts[0] === '') {
          // Suffix range: bytes=-N (e.g. bytes=-200 -> last 200 bytes per RFC 7233 §2.1)
          const suffixLength = parseInt(parts[1], 10);
          if (isNaN(suffixLength) || suffixLength <= 0) {
            res.status(416).set('Content-Range', `bytes */${fileSize}`).send('Requested Range Not Satisfiable');
            return;
          }
          start = Math.max(0, fileSize - suffixLength);
          end = fileSize - 1;
        } else {
          // Standard range: bytes=start-end OR open-ended range: bytes=start-
          start = parseInt(parts[0], 10);
          if (parts[1] === '') {
            end = fileSize - 1;
          } else {
            end = parseInt(parts[1], 10);
          }
        }

        if (isNaN(start) || isNaN(end) || start < 0 || start >= fileSize || end < start) {
          res.status(416).set('Content-Range', `bytes */${fileSize}`).send('Requested Range Not Satisfiable');
          return;
        }

        const clampedEnd = Math.min(end, fileSize - 1);
        const chunkSize = clampedEnd - start + 1;
        const fileStream = fs.createReadStream(resolvedPath, { start, end: clampedEnd });

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${clampedEnd}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': mimeType,
          'Cache-Control': 'no-cache',
        });
        fileStream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Accept-Ranges': 'bytes',
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=3600',
        });
        fs.createReadStream(resolvedPath).pipe(res);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
