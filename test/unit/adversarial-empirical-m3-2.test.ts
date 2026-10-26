/**
 * test/unit/adversarial-empirical-m3-2.test.ts
 *
 * Empirical Challenge & Adversarial Stress Suite for Milestone 3:
 * 1. Multimodal Media Streaming HTTP 206 Byte Ranges & Out-of-Bounds Range Handling.
 * 2. MIME Resolution for Multimodal Document, Image, Video, and Audio Formats.
 * 3. Adversarial Path Traversal Probes & Unauthorized File Excursion Rejection.
 * 4. Safe Server-Backed Filesystem Browsing (/api/filesystem/browse).
 * 5. Static Asset Serving & Multi-Monitor SPA Fallback Routing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createSwarmServer, SwarmServerInstance } from '../../src/server/index.js';
import { createTestSandbox } from '../e2e/helpers.js';
import { MIME_MAP } from '../../src/server/routes/media-routes.js';

describe('Adversarial Challenge M3-2: Media Streaming 206, Traversal Defense, Filesystem & SPA Routing', () => {
  let sandbox: Awaited<ReturnType<typeof createTestSandbox>>;
  let serverInstance: SwarmServerInstance;
  let baseUrl: string;
  let testPort: number;
  let mediaDir: string;
  let sample1000Path: string;
  let samplePdfPath: string;
  let samplePngPath: string;
  let sampleJpgPath: string;
  let sampleMp4Path: string;
  let sampleJsonPath: string;
  let sampleMdPath: string;
  let sampleUnknownPath: string;

  beforeAll(async () => {
    sandbox = await createTestSandbox('adversarial_m3_2');
    mediaDir = path.join(sandbox.sandboxDir, 'media_sandbox');
    await fs.mkdir(mediaDir, { recursive: true });

    // 1. Binary stream buffer (exactly 1000 bytes with known sequential content 0..255)
    const buf1000 = Buffer.alloc(1000);
    for (let i = 0; i < 1000; i++) {
      buf1000[i] = i % 256;
    }
    sample1000Path = path.join(mediaDir, 'stream_1000.mp4');
    await fs.writeFile(sample1000Path, buf1000);

    // 2. MIME samples
    samplePdfPath = path.join(mediaDir, 'contract.pdf');
    await fs.writeFile(samplePdfPath, Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF', 'utf8'));

    samplePngPath = path.join(mediaDir, 'icon.png');
    await fs.writeFile(samplePngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

    sampleJpgPath = path.join(mediaDir, 'portrait.jpg');
    await fs.writeFile(sampleJpgPath, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]));

    sampleMp4Path = path.join(mediaDir, 'clip.mp4');
    await fs.writeFile(sampleMp4Path, Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]));

    sampleJsonPath = path.join(mediaDir, 'manifest.json');
    await fs.writeFile(sampleJsonPath, JSON.stringify({ mission: 'Panopticon', version: '3.0.0' }));

    sampleMdPath = path.join(mediaDir, 'specification.md');
    await fs.writeFile(sampleMdPath, '# Panopticon Architecture\n\nAdversarial verification in progress.');

    sampleUnknownPath = path.join(mediaDir, 'blob.customext');
    await fs.writeFile(sampleUnknownPath, Buffer.from('raw binary payload data', 'utf8'));

    // Start server instance
    testPort = 4310 + Math.floor(Math.random() * 200);
    const currentDir = typeof __dirname !== 'undefined'
      ? __dirname
      : path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
    const projectRoot = path.resolve(currentDir, '../../');
    serverInstance = await createSwarmServer(projectRoot, testPort);

    await new Promise<void>((resolve) => {
      serverInstance.server.listen(testPort, () => {
        baseUrl = `http://127.0.0.1:${testPort}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (serverInstance) {
      await serverInstance.close();
    }
    if (sandbox) {
      await sandbox.cleanup();
    }
  });

  // =========================================================================
  // Challenge 1: HTTP 206 Partial Content Byte Ranges & Boundary Violations
  // =========================================================================
  describe('Challenge 1: HTTP 206 Byte Ranges & Range Bounds (/api/media/serve)', () => {
    it('1.1 satisfies standard prefix range bytes=0-99 (status 206, Content-Range, Content-Length, byte slice)', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(sample1000Path)}`, {
        headers: { Range: 'bytes=0-99' },
      });

      expect(res.status).toBe(206);
      expect(res.headers.get('content-range')).toBe('bytes 0-99/1000');
      expect(res.headers.get('content-length')).toBe('100');
      expect(res.headers.get('accept-ranges')).toBe('bytes');
      expect(res.headers.get('content-type')).toBe('video/mp4');

      const arrayBuffer = await res.arrayBuffer();
      expect(arrayBuffer.byteLength).toBe(100);
      const buf = Buffer.from(arrayBuffer);
      expect(buf[0]).toBe(0 % 256);
      expect(buf[99]).toBe(99 % 256);
    });

    it('1.2 satisfies open-ended range bytes=500- through end of file (status 206, Content-Range, Content-Length)', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(sample1000Path)}`, {
        headers: { Range: 'bytes=500-' },
      });

      expect(res.status).toBe(206);
      expect(res.headers.get('content-range')).toBe('bytes 500-999/1000');
      expect(res.headers.get('content-length')).toBe('500');
      expect(res.headers.get('content-type')).toBe('video/mp4');

      const arrayBuffer = await res.arrayBuffer();
      expect(arrayBuffer.byteLength).toBe(500);
      const buf = Buffer.from(arrayBuffer);
      expect(buf[0]).toBe(500 % 256);
      expect(buf[499]).toBe(999 % 256);
    });

    it('1.3 evaluates suffix byte range bytes=-200 for the last 200 bytes per RFC 7233', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(sample1000Path)}`, {
        headers: { Range: 'bytes=-200' },
      });

      expect(res.status).toBe(206);
      expect(res.headers.get('content-range')).toBe('bytes 800-999/1000');
      expect(res.headers.get('content-length')).toBe('200');
      expect(res.headers.get('accept-ranges')).toBe('bytes');
      expect(res.headers.get('content-type')).toBe('video/mp4');
      const buf = Buffer.from(await res.arrayBuffer());
      expect(buf.length).toBe(200);
      expect(buf[0]).toBe(800 % 256);
      expect(buf[199]).toBe(999 % 256);
    });

    it('1.4 satisfies single-byte boundary range bytes=0-0 (first byte only)', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(sample1000Path)}`, {
        headers: { Range: 'bytes=0-0' },
      });

      expect(res.status).toBe(206);
      expect(res.headers.get('content-range')).toBe('bytes 0-0/1000');
      expect(res.headers.get('content-length')).toBe('1');
      const buf = Buffer.from(await res.arrayBuffer());
      expect(buf.length).toBe(1);
      expect(buf[0]).toBe(0);
    });

    it('1.5 satisfies single-byte boundary range bytes=999-999 (last byte only)', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(sample1000Path)}`, {
        headers: { Range: 'bytes=999-999' },
      });

      expect(res.status).toBe(206);
      expect(res.headers.get('content-range')).toBe('bytes 999-999/1000');
      expect(res.headers.get('content-length')).toBe('1');
      const buf = Buffer.from(await res.arrayBuffer());
      expect(buf.length).toBe(1);
      expect(buf[0]).toBe(999 % 256);
    });

    it('1.6 clamps upper range bounds to fileSize - 1 when end exceeds file size', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(sample1000Path)}`, {
        headers: { Range: 'bytes=900-5000' },
      });

      expect(res.status).toBe(206);
      expect(res.headers.get('content-range')).toBe('bytes 900-999/1000');
      expect(res.headers.get('content-length')).toBe('100');
    });

    it('1.7 asserts status 416 Range Not Satisfiable for out-of-bounds range bytes=999999-1000000', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(sample1000Path)}`, {
        headers: { Range: 'bytes=999999-1000000' },
      });

      expect(res.status).toBe(416);
      expect(res.headers.get('content-range')).toBe('bytes */1000');
      const text = await res.text();
      expect(text).toContain('Requested Range Not Satisfiable');
    });

    it('1.8 asserts status 416 Range Not Satisfiable when start offset equals file size (bytes=1000-1000)', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(sample1000Path)}`, {
        headers: { Range: 'bytes=1000-1000' },
      });

      expect(res.status).toBe(416);
      expect(res.headers.get('content-range')).toBe('bytes */1000');
    });

    it('1.9 asserts status 416 Range Not Satisfiable when range is inverted (bytes=500-100)', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(sample1000Path)}`, {
        headers: { Range: 'bytes=500-100' },
      });

      expect(res.status).toBe(416);
      expect(res.headers.get('content-range')).toBe('bytes */1000');
    });

    it('1.10 asserts status 416 Range Not Satisfiable for malformed non-numeric range (bytes=abc-def)', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(sample1000Path)}`, {
        headers: { Range: 'bytes=abc-def' },
      });

      expect(res.status).toBe(416);
      expect(res.headers.get('content-range')).toBe('bytes */1000');
    });
  });

  // =========================================================================
  // Challenge 2: MIME Resolution for Multimodal Documents and Media
  // =========================================================================
  describe('Challenge 2: MIME Resolution Across Multimodal Formats', () => {
    it('2.1 resolves .pdf to application/pdf', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(samplePdfPath)}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/pdf');
    });

    it('2.2 resolves .png to image/png', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(samplePngPath)}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
    });

    it('2.3 resolves .jpg to image/jpeg', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(sampleJpgPath)}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/jpeg');
    });

    it('2.4 resolves .mp4 to video/mp4', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(sampleMp4Path)}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('video/mp4');
    });

    it('2.5 resolves .json to application/json', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(sampleJsonPath)}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/json');
    });

    it('2.6 resolves .md to text/markdown', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(sampleMdPath)}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('text/markdown');
    });

    it('2.7 defaults unknown file extension to application/octet-stream', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(sampleUnknownPath)}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('application/octet-stream');
    });

    it('2.8 verifies MIME_MAP covers 20+ multimodal audio, video, image, and text extensions', () => {
      const expectedKeys = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.mp4', '.webm', '.mov', '.mp3', '.wav', '.ogg', '.m4a', '.json', '.md', '.txt', '.ts', '.js', '.html', '.css'];
      for (const ext of expectedKeys) {
        expect(MIME_MAP).toHaveProperty(ext);
        expect(typeof MIME_MAP[ext]).toBe('string');
      }
    });
  });

  // =========================================================================
  // Challenge 3: Adversarial Path Traversal Attacks & Directory Boundary Defense
  // =========================================================================
  describe('Challenge 3: Adversarial Path Traversal Probes (/api/media/serve)', () => {
    it('3.1 securely rejects relative traversal to Windows System32 (../../../../Windows/System32/cmd.exe) with 403 or 404', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve?path=../../../../Windows/System32/cmd.exe`);
      expect([403, 404]).toContain(res.status);
      if (res.status === 403) {
        const body = await res.json();
        expect(body.error).toContain('FORBIDDEN');
      }
    });

    it('3.2 securely rejects URL-encoded relative traversal (..%2f..%2f..%2fWindows%2fSystem32%2fcmd.exe)', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve?path=..%2f..%2f..%2fWindows%2fSystem32%2fcmd.exe`);
      expect([403, 404]).toContain(res.status);
    });

    it('3.3 securely rejects double URL-encoded traversal (..%252f..%252fWindows%252fSystem32%252fcmd.exe)', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve?path=..%252f..%252fWindows%252fSystem32%252fcmd.exe`);
      expect([403, 404]).toContain(res.status);
    });

    it('3.4 securely rejects absolute path to Windows System32 with 403', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent('C:\\Windows\\System32\\cmd.exe')}`);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain('FORBIDDEN');
    });

    it('3.5 securely rejects absolute path outside allowed workspace with 403', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent('C:\\autoexec.bat')}`);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toContain('FORBIDDEN');
    });

    it('3.6 returns 400 when path parameter is omitted completely', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve`);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('Missing required query parameter: path');
    });

    it('3.7 returns 400 when requested path is a directory instead of a media file', async () => {
      const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(mediaDir)}`);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('directory, not a media file');
    });

    it('3.8 returns 404 when requested media file does not exist within workspace', async () => {
      const nonExistent = path.join(mediaDir, 'ghost_file_1984.mp4');
      const res = await fetch(`${baseUrl}/api/media/serve?path=${encodeURIComponent(nonExistent)}`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('Media file not found');
    });
  });

  // =========================================================================
  // Challenge 4: Safe Server-Backed Filesystem Browsing (/api/filesystem/browse)
  // =========================================================================
  describe('Challenge 4: Filesystem Browsing Endpoint (/api/filesystem/browse)', () => {
    it('4.1 browses project repository root when path query parameter is omitted', async () => {
      const res = await fetch(`${baseUrl}/api/filesystem/browse`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toHaveProperty('currentPath');
      expect(body).toHaveProperty('directories');
      expect(body).toHaveProperty('files');

      // Directories must not contain filtered directories (node_modules or .git)
      const dirNames = body.directories.map((d: any) => d.name);
      expect(dirNames).not.toContain('node_modules');
      expect(dirNames).not.toContain('.git');
      expect(dirNames).toContain('src');
      expect(dirNames).toContain('test');
    });

    it('4.2 browses existing project directory and returns file metadata (size, extension, modifiedAt)', async () => {
      const res = await fetch(`${baseUrl}/api/filesystem/browse?path=${encodeURIComponent(mediaDir)}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.currentPath).toBe(path.normalize(mediaDir));
      expect(Array.isArray(body.files)).toBe(true);

      const streamFile = body.files.find((f: any) => f.name === 'stream_1000.mp4');
      expect(streamFile).toBeDefined();
      expect(streamFile.size).toBe(1000);
      expect(streamFile.extension).toBe('.mp4');
      expect(streamFile.modifiedAt).toBeDefined();

      const pdfFile = body.files.find((f: any) => f.name === 'contract.pdf');
      expect(pdfFile).toBeDefined();
      expect(pdfFile.extension).toBe('.pdf');
    });

    it('4.3 asserts status 404 when browsing non-existent directory', async () => {
      const res = await fetch(`${baseUrl}/api/filesystem/browse?path=${encodeURIComponent('C:/nonexistent_random_dir_998877')}`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('Directory not found');
    });

    it('4.4 asserts status 400 when browsing target path is a file rather than a directory', async () => {
      const res = await fetch(`${baseUrl}/api/filesystem/browse?path=${encodeURIComponent(sample1000Path)}`);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('Path is not a directory');
    });

    it('4.5 verifies that directories and files are sorted alphabetically', async () => {
      const res = await fetch(`${baseUrl}/api/filesystem/browse?path=${encodeURIComponent(mediaDir)}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      const fileNames = body.files.map((f: any) => f.name);
      const sortedNames = [...fileNames].sort((a, b) => a.localeCompare(b));
      expect(fileNames).toEqual(sortedNames);
    });
  });

  // =========================================================================
  // Challenge 5: Static Asset Serving & Multi-Monitor SPA Routing
  // =========================================================================
  describe('Challenge 5: Static Asset Serving & SPA Fallback Routing', () => {
    it('5.1 serves Panopticon SPA index.html on root GET / with status 200', async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');

      const html = await res.text();
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('PANOPTICON SURVEILLANCE MATRIX');
      expect(html).toContain('panopticon-main-container');
    });

    it('5.2 serves SPA index.html on GET /?panel=cubicles with status 200', async () => {
      const res = await fetch(`${baseUrl}/?panel=cubicles`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');

      const html = await res.text();
      expect(html).toContain('panopticon-main-container');
    });

    it('5.3 serves SPA index.html on GET /?panel=console with status 200', async () => {
      const res = await fetch(`${baseUrl}/?panel=console`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');

      const html = await res.text();
      expect(html).toContain('panopticon-main-container');
    });

    it('5.4 serves SPA index.html on GET /?panel=taskboard with status 200', async () => {
      const res = await fetch(`${baseUrl}/?panel=taskboard`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');

      const html = await res.text();
      expect(html).toContain('panopticon-main-container');
    });

    it('5.5 serves brutalist theme CSS (/css/brutalist-theme.css) with status 200 and Content-Type text/css', async () => {
      const res = await fetch(`${baseUrl}/css/brutalist-theme.css`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/css');

      const css = await res.text();
      expect(css).toContain('--bg-primary');
      expect(css).toContain('--border-sharp');
    });

    it('5.6 serves master client JS module (/js/app.js) with status 200 and Content-Type application/javascript', async () => {
      const res = await fetch(`${baseUrl}/js/app.js`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toMatch(/javascript/);

      const js = await res.text();
      expect(js).toContain('panopticon_swarm_sync');
    });

    it('5.7 serves avatar asset (/assets/avatars/consul_nia_nova_sheet.jpg) with status 200 and image/jpeg', async () => {
      const res = await fetch(`${baseUrl}/assets/avatars/consul_nia_nova_sheet.jpg`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('image/jpeg');

      const arrayBuffer = await res.arrayBuffer();
      expect(arrayBuffer.byteLength).toBeGreaterThan(0);
    });
  });
});
