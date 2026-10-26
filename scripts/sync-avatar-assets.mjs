#!/usr/bin/env node
/**
 * scripts/sync-avatar-assets.mjs
 *
 * Physically synchronizes authentic high-resolution consular texture sheets
 * from Google Drive brain cache into both public/assets/avatars/ and src/public/assets/avatars/.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const possibleSourceDirs = [
  'H:\\My Drive\\Gemini Antigravity\\brain\\625b0c0a-b332-4982-8f90-d51ac8c9d850',
  'C:\\Users\\green\\.gemini\\antigravity\\brain\\625b0c0a-b332-4982-8f90-d51ac8c9d850',
];

const targetDirs = [
  path.join(projectRoot, 'public', 'assets', 'avatars'),
  path.join(projectRoot, 'src', 'public', 'assets', 'avatars'),
];

const fileMappings = [
  {
    sourceFile: 'consul_nia_nova_lux_cyberpunk_sheet_1792982091396.jpg',
    targetName: 'consul_nia_nova_sheet.jpg',
    minExpectedSize: 600000,
  },
  {
    sourceFile: 'consul_ferric_lunaux_lucian_cyberpunk_sheet_1792982043540.jpg',
    targetName: 'consul_ferric_lunaux_sheet.jpg',
    minExpectedSize: 600000,
  },
  {
    sourceFile: 'consuls_wrestling_clash_v2_1792982145487.jpg',
    targetName: 'consuls_wrestling_clash.jpg',
    minExpectedSize: 600000,
  },
];

export function syncAvatarAssets() {
  let validSourceDir = null;
  for (const dir of possibleSourceDirs) {
    if (fs.existsSync(dir)) {
      validSourceDir = dir;
      break;
    }
  }

  if (!validSourceDir) {
    console.warn('[sync-avatar-assets] Warning: No valid brain source cache directory found in search paths.');
  }

  const results = [];

  for (const targetDir of targetDirs) {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const report = {
      targetDir,
      copied: [],
      alreadyValid: [],
      errors: [],
    };

    for (const mapping of fileMappings) {
      const destPath = path.join(targetDir, mapping.targetName);

      if (fs.existsSync(destPath)) {
        const size = fs.statSync(destPath).size;
        if (size >= mapping.minExpectedSize) {
          report.alreadyValid.push({ file: mapping.targetName, size });
          continue;
        }
      }

      if (validSourceDir) {
        const srcPath = path.join(validSourceDir, mapping.sourceFile);
        if (fs.existsSync(srcPath)) {
          try {
            fs.copyFileSync(srcPath, destPath);
            const copiedSize = fs.statSync(destPath).size;
            report.copied.push({ file: mapping.targetName, size: copiedSize });
            continue;
          } catch (err) {
            report.errors.push(`Failed copying ${mapping.sourceFile} -> ${mapping.targetName}: ${err.message}`);
          }
        } else {
          report.errors.push(`Source file missing: ${srcPath}`);
        }
      } else {
        report.errors.push(`Cannot populate ${mapping.targetName}: source directory unavailable.`);
      }
    }

    results.push(report);
  }

  return results;
}

// Stage executables and SHA256 checksums if stage-binaries exists
try {
  const stageScript = path.join(projectRoot, 'scripts', 'stage-binaries.mjs');
  if (fs.existsSync(stageScript)) {
    await import('./stage-binaries.mjs');
  }
} catch (stageErr) {
  console.warn('[sync-avatar-assets] Binary staging notice:', stageErr.message);
}

// Execute when run as script
const summary = syncAvatarAssets();
console.log('[sync-avatar-assets] Synchronization completed:\n' + JSON.stringify(summary, null, 2));
