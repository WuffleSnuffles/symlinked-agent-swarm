/**
 * src/server/avatar-assets.ts
 *
 * Ensures high-resolution avatar texture sheets are copied into
 * public/assets/avatars/ and src/public/assets/avatars/ from Google Drive brain cache.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface AvatarAssetCopyResult {
  targetDir: string;
  filesCopied: string[];
  alreadyPresent: string[];
  errors: string[];
}

export function ensureAvatarAssets(projectRoot: string): AvatarAssetCopyResult[] {
  const repoRoot = path.resolve(projectRoot);
  const possibleSourceDirs = [
    'H:\\My Drive\\Gemini Antigravity\\brain\\625b0c0a-b332-4982-8f90-d51ac8c9d850',
    'C:\\Users\\green\\.gemini\\antigravity\\brain\\625b0c0a-b332-4982-8f90-d51ac8c9d850',
  ];

  const targetDirs = [
    path.join(repoRoot, 'public', 'assets', 'avatars'),
    path.join(repoRoot, 'src', 'public', 'assets', 'avatars'),
  ];

  const fileMappings = [
    {
      sourceFile: 'consul_nia_nova_lux_cyberpunk_sheet_1792982091396.jpg',
      targetName: 'consul_nia_nova_sheet.jpg',
    },
    {
      sourceFile: 'consul_ferric_lunaux_lucian_cyberpunk_sheet_1792982043540.jpg',
      targetName: 'consul_ferric_lunaux_sheet.jpg',
    },
    {
      sourceFile: 'consuls_wrestling_clash_v2_1792982145487.jpg',
      targetName: 'consuls_wrestling_clash.jpg',
    },
  ];

  // Find valid source directory
  let validSourceDir: string | null = null;
  for (const dir of possibleSourceDirs) {
    if (fs.existsSync(dir)) {
      validSourceDir = dir;
      break;
    }
  }

  const results: AvatarAssetCopyResult[] = [];

  for (const targetDir of targetDirs) {
    const res: AvatarAssetCopyResult = {
      targetDir,
      filesCopied: [],
      alreadyPresent: [],
      errors: [],
    };

    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      for (const mapping of fileMappings) {
        const destPath = path.join(targetDir, mapping.targetName);

        if (fs.existsSync(destPath) && fs.statSync(destPath).size >= 600000) {
          res.alreadyPresent.push(mapping.targetName);
          continue;
        }

        if (validSourceDir) {
          const srcPath = path.join(validSourceDir, mapping.sourceFile);
          if (fs.existsSync(srcPath)) {
            try {
              fs.copyFileSync(srcPath, destPath);
              res.filesCopied.push(mapping.targetName);
              continue;
            } catch (err: any) {
              res.errors.push(`Failed to copy ${mapping.sourceFile} -> ${mapping.targetName}: ${err.message}`);
            }
          }
        }

        // If source not available and destination missing, create a placeholder JPEG header
        if (!fs.existsSync(destPath)) {
          // Minimal valid JPEG bytes
          const placeholderJpg = Buffer.from([
            0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
            0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
            0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
            0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
            0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
            0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
            0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
            0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
            0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00,
            0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
            0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
            0x00, 0xbf, 0x00, 0xff, 0xd9
          ]);
          fs.writeFileSync(destPath, placeholderJpg);
          res.filesCopied.push(`${mapping.targetName} (placeholder fallback)`);
        }
      }
    } catch (err: any) {
      res.errors.push(`Directory processing failed: ${err.message}`);
    }

    results.push(res);
  }

  return results;
}
