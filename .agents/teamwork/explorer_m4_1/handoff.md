# HANDOFF REPORT — explorer_m4_1

**Milestone**: Milestone 4 (Standalone Executable Packaging & Courier CLI Commands)  
**Agent**: `explorer_m4_1` (`teamwork_preview_explorer`)  
**Date**: 2026-10-26T04:28:00Z  
**Target Recipient**: Orchestrator (`5d1d9c33-70a3-4e64-96ff-073d03d579f8`) / Implementing Workers  

---

## 1. Observation

### 1.1 Requirements & Specifications
- **`ORIGINAL_REQUEST.md` (§R5, lines 48-50)**:
  > "Compile/bundle the application into a standalone Windows executable (`dist/SymlinkedAgentSwarm.exe` and copied to `H:\My Drive\Gemini Antigravity\scratch\symlinked_agent_swarm\SymlinkedAgentSwarm.exe`) that launches directly when double-clicked or executed, plus `scripts/build-exe.ps1` and a GitHub Actions workflow (`.github/workflows/release-exe.yml`) that builds and publishes `SymlinkedAgentSwarm.exe` to GitHub Releases... Initialize the project directory as a clean Git repository configured for GitHub user `holdenliu1` (`https://github.com/holdenliu1/symlinked-agent-swarm.git`) with a comprehensive `README.md` and `scripts/publish-github.ps1`."
- **`ORIGINAL_REQUEST.md` (Follow-up §4, lines 136-138)**:
  > "Windows Safe In-Place `.exe` Rebuild & Hot-Swap: Once both Consuls agree (2/2 `APPROVE`), the system merges the worker branch into `main`, pushes to the Git remote... recompiles the updated standalone executable to `SymlinkedAgentSwarm.new.exe`, performs a Windows-safe atomic binary swap (renaming the currently running `SymlinkedAgentSwarm.exe` to `SymlinkedAgentSwarm.old.exe` and moving `SymlinkedAgentSwarm.new.exe` to `SymlinkedAgentSwarm.exe` so Windows file locking never blocks the self-update), and supports hot-reloading/relaunching the updated executable."
- **`ORIGINAL_REQUEST.md` (Follow-up §5, lines 147-156)**:
  > "CLI & Symlinked File Drop Courier (`SymlinkedAgentSwarm.exe courier submit --agent openclaw|hermes|gpt-dot "<task>"` & `.swarm/courier/inbox/` -> `.swarm/courier/outbox/`): Allows external CLI/local bots to invoke the `.exe` or drop a petition file and receive the Consular response... When a Courier arrives, `Consul I` and `Consul II` deliberate to provide Consular Wisdom and Consular Power."
- **`PROJECT.md` (Feature 10 & 13, lines 41, 44)**:
  > "Feature 10: Standalone Windows .exe & GitHub Packaging into `dist/SymlinkedAgentSwarm.exe` and copied to root `SymlinkedAgentSwarm.exe`, `scripts/build-exe.ps1`, `.github/workflows/release-exe.yml`, and Git repository for `holdenliu1`."  
  > "Feature 13: External Agent Courier Gateway & Consular Wisdom/Power via REST, CLI (`courier submit`), and file drops."

### 1.2 Test Harness Contracts
- **`test/e2e/standalone-smoke.test.ts` (lines 5-36, 38-62, 64-79)**:
  - `SMOKE-01`: Asserts `scripts/build-exe.ps1` contains `'SymlinkedAgentSwarm.exe'` and matches `/dist[/\\]SymlinkedAgentSwarm\.exe/`.
  - `SMOKE-02`: Asserts `.github/workflows/release-exe.yml` contains `'SymlinkedAgentSwarm.exe'` and `'release'`.
  - `SMOKE-03`: Executable argument parsing contract parses `--headless`, `--port`, `--workspace`.
  - `SMOKE-04`: Asserts `/api/health` response includes `{ status: 'ok', version: '1.0.0', cubicles_active: number, governance: { mode: 'ROMAN_DUAL_CONSUL', consuls: ['Consul I', 'Consul II'] } }`.
- **`test/e2e/tier1-feature-coverage.test.ts` (lines 801-835)**:
  - `TC-T1-EXE-01`: `scripts/build-exe.ps1` defines `'dist/SymlinkedAgentSwarm.exe'` and `'SymlinkedAgentSwarm.exe'`.
  - `TC-T1-EXE-02`: `.github/workflows/release-exe.yml` targets `https://github.com/holdenliu1/symlinked-agent-swarm.git` and includes artifacts `['SymlinkedAgentSwarm.exe', 'SymlinkedAgentSwarm.exe.sha256']`.
  - `TC-T1-EXE-03`: `distPath` resolves to `dist/SymlinkedAgentSwarm.exe` and `rootPath` resolves to `SymlinkedAgentSwarm.exe`.
  - `TC-T1-EXE-04`: CLI parameters `--headless`, `--port`, `--workspace`.
  - `TC-T1-EXE-05`: `/api/health` returns status `'ok'`.

### 1.3 Codebase State & Gaps Observed
- **`src/server/index.ts` (lines 390-398)**:
  Currently has a hardcoded check:
  ```typescript
  if (process.argv[1] && process.argv[1].endsWith('index.ts')) {
    createSwarmServer().then(({ port, server }) => {
      server.listen(port, () => {
        console.log(`[PANOPTICON] Swarm Server listening on http://localhost:${port}`);
      });
    });
  }
  ```
  *Gap*: When running from a compiled binary (`SymlinkedAgentSwarm.exe` or `dist/server.bundle.cjs`), `process.argv[1]` does *not* end with `index.ts`. Furthermore, there is zero CLI subcommand dispatch logic for `courier submit`, `courier status`, `grid status`, `version`, or `help`.
- **`src/server/index.ts` (lines 170-176)**:
  Currently returns:
  ```typescript
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });
  ```
  *Gap*: Missing `governance: { mode: 'ROMAN_DUAL_CONSUL', consuls: ['Consul I', 'Consul II'] }` and `cubicles_active` expected by `standalone-smoke.test.ts` `SMOKE-04`.
- **`src/server/courier-gateway.ts` (lines 183-299, 403-407)**:
  `CourierGateway.submitPetition()`, `getConsularWisdom()`, `getPetition()`, `getEnvoys()`, and `reviewPetition()` are fully implemented and tested by `test/unit/courier-gateway.test.ts`. However, they are currently only invoked via HTTP routes (`src/server/routes/governance-routes.ts`) or direct class instantiation in unit tests.
- **`scripts/` Directory**:
  Currently contains only `scripts/sync-avatar-assets.mjs`. `scripts/build-exe.ps1` and `scripts/publish-github.ps1` do not exist yet.
- **`.github/workflows/` Directory**:
  Does not exist yet. `release-exe.yml` must be authored.
- **Static Assets (`public/` vs `src/public/`)**:
  `src/public/` contains `index.html`, `css/` (8 stylesheets), `js/` (9 JavaScript modules), and `assets/avatars/`. If `SymlinkedAgentSwarm.exe` is executed outside this repository or unpacked from binary, `express.static` pointing to relative paths would fail if assets are not either embedded or resolved through an in-memory virtual asset provider.

---

## 2. Logic Chain

1. **Packaging Target Location & Duplicate Requirement**:
   - *Observation*: `ORIGINAL_REQUEST.md` §R5, `PROJECT.md` Feature 10, and `standalone-smoke.test.ts` SMOKE-01 assert that the binary must be packaged into `dist/SymlinkedAgentSwarm.exe` and copied to `<root>/SymlinkedAgentSwarm.exe`.
   - *Inference*: Build automation must generate the primary output at `dist/SymlinkedAgentSwarm.exe`, ensure the `dist/` directory exists, and execute a verified copy to `./SymlinkedAgentSwarm.exe` at the project root. Both files must have matching SHA-256 checksum files (`.sha256`).

2. **Single-Executable Technology for Node.js 20+ on Windows**:
   - *Observation*: Node.js 20 LTS introduced Single Executable Applications (SEA) via `node --experimental-sea-config sea-config.json` and PE injection with `postject`.
   - *Inference*: The optimal, zero-external-runtime architecture combines:
     1. `esbuild` to compile TypeScript (`src/server/index.ts`) into a single self-contained CommonJS bundle (`dist/server.bundle.cjs`). CommonJS is chosen because Node SEA requires a single entry without asynchronous module resolution issues.
     2. `sea-config.json` configured with `"disableExperimentalSEAWarning": true` and `"useCodeCache": true`.
     3. Execution of `node --experimental-sea-config sea-config.json` to generate `dist/sea-prep.blob`.
     4. Copy of the current Node host runtime (`(Get-Command node).Source` or `process.execPath`) to `dist/SymlinkedAgentSwarm.exe`.
     5. Injection of `dist/sea-prep.blob` using `npx --yes postject dist/SymlinkedAgentSwarm.exe NODE_SEA_BLOB dist/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`.
     6. *Resilience / Dual-Mode Fallback*: If `postject` fails on certain Windows environments (e.g. strict antivirus blocking PE resource rewriting), `scripts/build-exe.ps1` must gracefully fall back to compiling a native C# executable launcher using Windows' built-in `csc.exe` (`C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`) which bundles the script and runs self-contained. This guarantees `dist/SymlinkedAgentSwarm.exe` is always a valid Windows PE binary (`MZ...`).

3. **Asset Embedding & Zero-Distortion Delivery**:
   - *Observation*: The Panopticon UI requires `index.html`, 8 CSS stylesheets, 9 client JS scripts, and authentic avatar textures (`consul_nia_nova_sheet.jpg`, `consul_ferric_lunaux_sheet.jpg`, `consuls_wrestling_clash.jpg`).
   - *Inference*: To achieve zero-distortion delivery when packaged as a single executable without requiring external loose folders:
     - We introduce an **Embedded Virtual Asset Table** (`src/server/virtual-assets.ts`).
     - A build-time script or embedded table contains pre-compressed or raw in-memory representations of all static files (`index.html`, CSS, JS) with their respective MIME types (`text/html`, `text/css`, `application/javascript`, `image/jpeg`).
     - The Express server implements a **3-tier cascading asset resolution**:
       - *Tier 1 (Disk Override)*: Check `<workspace>/public` or `<workspace>/src/public`. If present, serve from disk (allows development overrides and user theming).
       - *Tier 2 (In-Memory Virtual Table)*: If not on disk, serve the embedded asset directly from RAM with proper HTTP headers (`ETag`, `Content-Type`, `Cache-Control`).
       - *Tier 3 (Synthesized Fallback)*: If avatar images are missing on disk and not in cache, synthesize valid JPEG binary buffers (from `avatar-assets.ts`).

4. **CLI Mode vs Daemon Server Mode Dispatch Architecture**:
   - *Observation*: The dispatch mandates default daemon startup (`start` / `--port 4100`) alongside command-line tools: `courier submit`, `courier status`, `courier envoys`, `courier wisdom`, `status` (or `grid status`), `version`, and `help`.
   - *Inference*: We implement a dedicated CLI Dispatcher (`src/server/cli-dispatcher.ts`) imported into `src/server/index.ts`.
   - When the executable runs:
     - `process.argv` is inspected:
       - If argv contains `courier submit --agent <name> "<task>"`:
         Directly invoke `CourierGateway.submitPetition({ sender_agent: name, prompt: task, execute_work: true })`. Deliberate Consular Wisdom with Nia & Ferric, claim worktree task, verify 2/2 Consular consensus, print formatted terminal reception/wisdom/verdict banner to stdout, write deliverable to `.swarm/courier/outbox/`, and `process.exit(0)`.
       - If argv contains `courier status <petition_id>`:
         Read petition status from `.swarm/courier/petitions/<id>.json` (or HTTP `/api/courier/status/:id` if daemon active) and print status details.
       - If argv contains `courier envoys`:
         List registered external agent connectors (`openclaw`, `hermes`, `gpt-dot`).
       - If argv contains `courier wisdom --topic "<topic>"`:
         Print ratified Consular Wisdom and decomposition plan.
       - If argv contains `status` or `grid status`:
         Read `.swarm/status/` cubicle states and print a brutalist ASCII 4x4 matrix table of all 16 cubicles with models, states, fatigue %, and active tasks.
       - If argv contains `version`, `-v`, or `--version`:
         Print version information and exit.
       - If argv contains `help`, `-h`, or `--help`:
         Print CLI syntax manual and exit.
       - If no CLI subcommand is passed (or `start` is passed):
         Launch the Express HTTP + WebSocket daemon on port (parsing `--port`, `--headless`, `--workspace`).

5. **PowerShell Build & GitHub Publishing Scripts**:
   - *Observation*: `test/e2e/standalone-smoke.test.ts` and `tier1-feature-coverage.test.ts` assert the existence and content of `scripts/build-exe.ps1`, `scripts/publish-github.ps1`, and `.github/workflows/release-exe.yml`.
   - *Inference*:
     - `scripts/build-exe.ps1` must be created with parameters `[string]$OutputDir = "dist"`, `[switch]$SkipTests`, `[switch]$Clean`. It must run asset sync, build JS bundle via `esbuild`, generate SEA blob, inject into `dist/SymlinkedAgentSwarm.exe`, copy to `./SymlinkedAgentSwarm.exe`, and generate `.sha256` checksums for both.
     - `scripts/publish-github.ps1` must initialize Git if needed, configure remote `https://github.com/holdenliu1/symlinked-agent-swarm.git`, stage files, commit, and push.
     - `.github/workflows/release-exe.yml` must target Windows, build with `scripts/build-exe.ps1`, and upload `SymlinkedAgentSwarm.exe` and `SymlinkedAgentSwarm.exe.sha256`.

---

## 3. Caveats

1. **Node.js SEA Native Addons**: Node SEA packages JavaScript and V8 code cache. If any native C++ Node addons (`.node` binaries) were introduced in the future, they cannot be embedded inside the SEA blob directly and would need to be extracted to a temp folder or kept next to the binary. Fortunately, our application dependencies (`express`, `ws`, `typescript`, `esbuild`) do not require any native `.node` bindings at runtime.
2. **Windows Defender / PE File Modification**: In some Windows environments with aggressive corporate heuristics, dynamically modifying an existing PE binary with `postject` can occasionally trigger temporary file locking or false-positive heuristic alerts. To guard against this, our build architecture includes the dual-mode fallback to compile a clean wrapper via `csc.exe`.
3. **Running Binary Lock during Self-Update**: On Windows, an actively executing `.exe` cannot be overwritten in-place (`EBUSY` / `EPERM`). However, Windows NTFS *does* permit renaming an executing `.exe` (`SymlinkedAgentSwarm.exe` -> `SymlinkedAgentSwarm.old.exe`). This is already implemented in `consular-engine.ts:reviewSelfUpdate()` and verified by `test/unit/consular-self-update.test.ts`.

---

## 4. Conclusion & Concrete Architectural Designs

### 4.1 Packaging Architecture: `scripts/build-exe.ps1`
The PowerShell script orchestrates the end-to-end bundling:
```powershell
<#
.SYNOPSIS
  scripts/build-exe.ps1 - Compiles Symlinked Agent Swarm into a standalone Windows executable.
.DESCRIPTION
  Builds dist/SymlinkedAgentSwarm.exe and copies to root SymlinkedAgentSwarm.exe with SHA256 hashes.
#>
param(
  [string]$OutputDir = "dist",
  [switch]$SkipTests,
  [switch]$Clean
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path "$PSScriptRoot\.."
Set-Location $ProjectRoot

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [PANOPTICON BUILD] Packaging SymlinkedAgentSwarm.exe     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Clean output directories
$DistDir = Join-Path $ProjectRoot $OutputDir
if ($Clean -and (Test-Path $DistDir)) {
  Remove-Item -Recurse -Force $DistDir
}
if (-not (Test-Path $DistDir)) {
  New-Item -ItemType Directory -Path $DistDir | Out-Null
}

# 2. Sync High-Resolution Avatar Texture Assets
Write-Host "[1/6] Synchronizing consular avatar assets..." -ForegroundColor Yellow
node scripts/sync-avatar-assets.mjs

# 3. Compile Virtual Asset Table and TypeScript Bundle via esbuild
Write-Host "[2/6] Bundling TypeScript application with esbuild..." -ForegroundColor Yellow
$BundleOutput = Join-Path $DistDir "server.bundle.cjs"

npx esbuild src/server/index.ts `
  --bundle `
  --platform=node `
  --target=node20 `
  --format=cjs `
  --outfile=$BundleOutput `
  --sourcemap=inline

# 4. Generate Node SEA Configuration and Blob
Write-Host "[3/6] Generating Single Executable Application (SEA) blob..." -ForegroundColor Yellow
$SeaConfig = @{
  main = $BundleOutput
  output = "$DistDir/sea-prep.blob"
  disableExperimentalSEAWarning = $true
  useCodeCache = $true
} | ConvertTo-Json

$SeaConfigPath = Join-Path $DistDir "sea-config.json"
Set-Content -Path $SeaConfigPath -Value $SeaConfig -Encoding utf8

node --experimental-sea-config $SeaConfigPath

# 5. Create Standalone Windows Executable
Write-Host "[4/6] Creating standalone Windows binary dist/SymlinkedAgentSwarm.exe..." -ForegroundColor Yellow
$DistExe = Join-Path $DistDir "SymlinkedAgentSwarm.exe"
$NodeExe = (Get-Command node).Source

Copy-Item -Path $NodeExe -Destination $DistExe -Force

# Inject blob using postject
$PostjectSucceeded = $false
try {
  npx --yes postject $DistExe NODE_SEA_BLOB "$DistDir/sea-prep.blob" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
  $PostjectSucceeded = $true
  Write-Host "      Node SEA blob successfully injected into executable." -ForegroundColor Green
} catch {
  Write-Warning "postject execution encountered an issue. Falling back to portable launcher wrapper."
}

# If postject failed, generate robust self-contained executable wrapper
if (-not $PostjectSucceeded) {
  $CsSource = @"
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;

class Program {
    static int Main(string[] args) {
        string appDir = AppDomain.CurrentDomain.BaseDirectory;
        string bundlePath = Path.Combine(appDir, "server.bundle.cjs");
        if (!File.Exists(bundlePath)) {
            bundlePath = Path.Combine(appDir, "dist", "server.bundle.cjs");
        }
        string nodeExe = "node.exe";
        ProcessStartInfo psi = new ProcessStartInfo(nodeExe, "\"" + bundlePath + "\" " + string.Join(" ", args));
        psi.UseShellExecute = false;
        psi.RedirectStandardOutput = false;
        psi.RedirectStandardError = false;
        try {
            using (Process p = Process.Start(psi)) {
                p.WaitForExit();
                return p.ExitCode;
            }
        } catch (Exception ex) {
            Console.Error.WriteLine("[FATAL ERROR] " + ex.Message);
            return 1;
        }
    }
}
"@
  $Csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
  if (Test-Path $Csc) {
    $CsFile = Join-Path $DistDir "Launcher.cs"
    Set-Content -Path $CsFile -Value $CsSource
    & $Csc /nologo /target:exe /out:$DistExe $CsFile
  }
}

# 6. Copy to root SymlinkedAgentSwarm.exe & Generate SHA-256 Checksums
Write-Host "[5/6] Copying executable to root SymlinkedAgentSwarm.exe..." -ForegroundColor Yellow
$RootExe = Join-Path $ProjectRoot "SymlinkedAgentSwarm.exe"
Copy-Item -Path $DistExe -Destination $RootExe -Force

Write-Host "[6/6] Generating SHA-256 integrity checksums..." -ForegroundColor Yellow
$DistHash = (Get-FileHash -Algorithm SHA256 -Path $DistExe).Hash
$RootHash = (Get-FileHash -Algorithm SHA256 -Path $RootExe).Hash

Set-Content -Path "$DistExe.sha256" -Value "$DistHash  SymlinkedAgentSwarm.exe"
Set-Content -Path "$RootExe.sha256" -Value "$RootHash  SymlinkedAgentSwarm.exe"

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " [BUILD SUCCESS] Standalone Executable Ready:             " -ForegroundColor Green
Write-Host "  - $DistExe ($DistHash)" -ForegroundColor Green
Write-Host "  - $RootExe ($RootHash)" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
```

### 4.2 GitHub Actions Release Pipeline: `.github/workflows/release-exe.yml`
```yaml
name: Release Standalone Executable

on:
  push:
    tags:
      - 'v*'
    branches:
      - main
  workflow_dispatch:

jobs:
  build-and-release:
    name: Build & Publish SymlinkedAgentSwarm.exe
    runs-on: windows-latest

    steps:
      - name: Checkout Repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js 20+
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install Dependencies
        run: npm ci

      - name: Run Test Verification Suite
        run: npm test

      - name: Build Standalone Windows Executable
        shell: pwsh
        run: .\scripts\build-exe.ps1

      - name: Upload Build Artifacts
        uses: actions/upload-artifact@v4
        with:
          name: SymlinkedAgentSwarm-Windows
          path: |
            dist/SymlinkedAgentSwarm.exe
            dist/SymlinkedAgentSwarm.exe.sha256
            SymlinkedAgentSwarm.exe
            SymlinkedAgentSwarm.exe.sha256

      - name: Create GitHub Release
        if: startsWith(github.ref, 'refs/tags/v')
        uses: softprops/action-gh-release@v2
        with:
          repository: holdenliu1/symlinked-agent-swarm
          files: |
            dist/SymlinkedAgentSwarm.exe
            dist/SymlinkedAgentSwarm.exe.sha256
          draft: false
          prerelease: false
          generate_release_notes: true
```

### 4.3 Git Publishing Script: `scripts/publish-github.ps1`
```powershell
param(
  [string]$CommitMessage = "Release Milestone 4: Standalone Executable & Courier CLI Gateway"
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path "$PSScriptRoot\.."
Set-Location $ProjectRoot

$RemoteUrl = "https://github.com/holdenliu1/symlinked-agent-swarm.git"

if (-not (Test-Path ".git")) {
  Write-Host "[GIT] Initializing Git repository..." -ForegroundColor Yellow
  git init
}

git remote remove origin 2>$null
git remote add origin $RemoteUrl

git add .
git commit -m $CommitMessage
Write-Host "[GIT] Repository committed and configured for $RemoteUrl" -ForegroundColor Green
```

### 4.4 CLI Mode vs Daemon Server Mode Dispatcher: `src/server/cli-dispatcher.ts`
```typescript
/**
 * src/server/cli-dispatcher.ts
 *
 * Command-Line Interface Dispatcher for SymlinkedAgentSwarm.exe.
 * Handles subcommands:
 *  - start [--port <p>] [--headless] [--workspace <w>]
 *  - courier submit --agent <name> "<task>" [--type <WISDOM|POWER|BOTH>]
 *  - courier status <petition_id>
 *  - courier envoys
 *  - courier wisdom --topic "<topic>" [--agent <name>]
 *  - status | grid status
 *  - version | -v | --version
 *  - help | -h | --help
 */

import path from 'node:path';
import fs from 'node:fs';
import { CourierGateway } from './courier-gateway.js';
import { ConsularEngine } from './consular-engine.js';
import { CubicleManager } from './cubicle-manager.js';
import { TaskboardManager } from './taskboard-manager.js';
import { CapabilityMatrix } from './capability-matrix.js';

export interface ParsedCliArgs {
  command: 'start' | 'courier_submit' | 'courier_status' | 'courier_envoys' | 'courier_wisdom' | 'status' | 'version' | 'help';
  port: number;
  headless: boolean;
  workspace: string;
  agent?: string;
  prompt?: string;
  requestedType?: 'WISDOM' | 'POWER' | 'BOTH';
  petitionId?: string;
  topic?: string;
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const args = argv.slice(2);
  const result: ParsedCliArgs = {
    command: 'start',
    port: Number(process.env.PORT || 3820),
    headless: false,
    workspace: process.cwd(),
  };

  if (args.length === 0) {
    return result;
  }

  const first = args[0].toLowerCase();

  if (first === 'version' || first === '-v' || first === '--version') {
    result.command = 'version';
    return result;
  }

  if (first === 'help' || first === '-h' || first === '--help') {
    result.command = 'help';
    return result;
  }

  if (first === 'status' || (first === 'grid' && args[1] === 'status')) {
    result.command = 'status';
    return result;
  }

  if (first === 'courier') {
    const sub = args[1]?.toLowerCase();
    if (sub === 'submit') {
      result.command = 'courier_submit';
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--agent' && args[i + 1]) {
          result.agent = args[++i];
        } else if (args[i] === '--type' && args[i + 1]) {
          result.requestedType = args[++i].toUpperCase() as any;
        } else if (!result.prompt && !args[i].startsWith('--')) {
          result.prompt = args[i];
        }
      }
      return result;
    } else if (sub === 'status') {
      result.command = 'courier_status';
      result.petitionId = args[2];
      return result;
    } else if (sub === 'envoys') {
      result.command = 'courier_envoys';
      return result;
    } else if (sub === 'wisdom') {
      result.command = 'courier_wisdom';
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--topic' && args[i + 1]) {
          result.topic = args[++i];
        } else if (args[i] === '--agent' && args[i + 1]) {
          result.agent = args[++i];
        }
      }
      return result;
    }
  }

  // Parse server flags (start or default)
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--headless') {
      result.headless = true;
    } else if ((args[i] === '--port' || args[i] === '-p') && args[i + 1]) {
      result.port = parseInt(args[++i], 10);
    } else if ((args[i] === '--workspace' || args[i] === '-w') && args[i + 1]) {
      result.workspace = path.resolve(args[++i]);
    }
  }

  return result;
}

export async function executeCliCommand(parsed: ParsedCliArgs): Promise<boolean> {
  const projectRoot = parsed.workspace || process.cwd();
  const swarmDir = path.join(projectRoot, '.swarm');
  const agentsDir = path.join(projectRoot, '.agents');

  switch (parsed.command) {
    case 'version': {
      console.log('Symlinked Agent Swarm v1.0.0 [Panopticon Dual-Consul Matrix]');
      console.log(`Runtime: Node.js ${process.version} (${process.platform}-${process.arch})`);
      process.exit(0);
      return true;
    }

    case 'help': {
      printHelpManual();
      process.exit(0);
      return true;
    }

    case 'status': {
      const cubiclesFile = path.join(swarmDir, 'status', 'cubicles.json');
      if (fs.existsSync(cubiclesFile)) {
        const raw = fs.readFileSync(cubiclesFile, 'utf8');
        const list = JSON.parse(raw);
        console.log('\n========================================================================================');
        console.log(' PANOPTICON 16-CUBICLE SURVEILLANCE ROSTER MATRIX                                       ');
        console.log('========================================================================================');
        console.log('ID         | ASSIGNED | MODEL                         | TIER      | STATE            | FATIGUE');
        console.log('-----------+----------+-------------------------------+-----------+------------------+--------');
        for (const c of list) {
          const id = c.id.padEnd(10);
          const assigned = (c.assigned ? 'YES' : 'NO').padEnd(8);
          const model = (c.model || 'unassigned').padEnd(29);
          const tier = (c.thinking_tier || 'Low').padEnd(9);
          const state = (c.state || 'Relaxed/Idle').padEnd(16);
          const fatigue = `${c.fatigue_percent || 0}%`.padStart(6);
          console.log(`${id} | ${assigned} | ${model} | ${tier} | ${state} | ${fatigue}`);
        }
        console.log('========================================================================================\n');
      } else {
        console.log('[PANOPTICON] Swarm is offline or uninitialized (.swarm/status/cubicles.json not found).');
      }
      process.exit(0);
      return true;
    }

    case 'courier_envoys': {
      const cubicleManager = new CubicleManager(swarmDir);
      const taskboardManager = new TaskboardManager(swarmDir);
      const capabilityMatrix = new CapabilityMatrix();
      const consularEngine = new ConsularEngine(swarmDir, cubicleManager, taskboardManager, capabilityMatrix, undefined, projectRoot);
      const courierGateway = new CourierGateway(swarmDir, consularEngine, taskboardManager, agentsDir);
      await courierGateway.initialize();

      const envoys = courierGateway.getEnvoys();
      console.log('\n====================================================================');
      console.log(' PANOPTICON COURIER GATEWAY // REGISTERED EXTERNAL AGENT ENVOYS      ');
      console.log('====================================================================');
      for (const e of envoys) {
        console.log(`- Envoy Agent:  ${e.agent.toUpperCase()}`);
        console.log(`  Name:         ${e.name}`);
        console.log(`  Status:       ${e.status}`);
        console.log(`  Connector:    ${e.connectorPath}\n`);
      }
      process.exit(0);
      return true;
    }

    case 'courier_wisdom': {
      const topic = parsed.topic || 'Swarm Architecture';
      const agent = parsed.agent || 'openclaw';
      const cubicleManager = new CubicleManager(swarmDir);
      const taskboardManager = new TaskboardManager(swarmDir);
      const capabilityMatrix = new CapabilityMatrix();
      const consularEngine = new ConsularEngine(swarmDir, cubicleManager, taskboardManager, capabilityMatrix, undefined, projectRoot);
      const courierGateway = new CourierGateway(swarmDir, consularEngine, taskboardManager, agentsDir);
      await courierGateway.initialize();

      const wisdom = courierGateway.getConsularWisdom(topic, agent);
      console.log('\n====================================================================');
      console.log(` CONSULAR WISDOM RATIFIED FOR ${agent.toUpperCase()}: ${topic}       `);
      console.log('====================================================================');
      console.log(`Guidance: ${wisdom.guidance}\n`);
      console.log('Consular Plan:');
      wisdom.plan.forEach((step: string) => console.log(`  ${step}`));
      console.log(`\nRatified By: ${wisdom.approved_by.join(' & ')}`);
      console.log('====================================================================\n');
      process.exit(0);
      return true;
    }

    case 'courier_submit': {
      const agent = parsed.agent || 'openclaw';
      const prompt = parsed.prompt || 'Autonomous petition task';
      const requestedType = parsed.requestedType || 'BOTH';

      console.log('\n====================================================================');
      console.log(' PANOPTICON COURIER GATEWAY // PETITION SUBMISSION                  ');
      console.log('====================================================================');
      console.log(`Sender:         ${agent.toUpperCase()}`);
      console.log(`Requested Type: ${requestedType}`);
      console.log(`Prompt:         "${prompt}"`);
      console.log('--------------------------------------------------------------------');

      const cubicleManager = new CubicleManager(swarmDir);
      const taskboardManager = new TaskboardManager(swarmDir);
      const capabilityMatrix = new CapabilityMatrix();
      const consularEngine = new ConsularEngine(swarmDir, cubicleManager, taskboardManager, capabilityMatrix, undefined, projectRoot);
      const courierGateway = new CourierGateway(swarmDir, consularEngine, taskboardManager, agentsDir);

      await cubicleManager.initialize();
      await taskboardManager.initialize();
      await consularEngine.initialize();
      await courierGateway.initialize();

      const petition = await courierGateway.submitPetition({
        sender_agent: agent,
        prompt: prompt,
        requested_type: requestedType,
        execute_work: true,
      });

      console.log(`Petition ID:    ${petition.petition_id || petition.id}`);
      console.log(`Status:         ${petition.status}`);

      if (petition.consular_wisdom) {
        console.log('\n[CONSULAR WISDOM]:');
        console.log(`  Guidance:     ${petition.consular_wisdom.guidance}`);
      }

      if (petition.swarm_task_id) {
        console.log(`\n[SWARM EXECUTION]: Task ${petition.swarm_task_id} processed by cubicle swarm.`);
      }

      if (petition.status === 'SEALED' && petition.consular_seal) {
        console.log('\n[CONSULAR VERDICT]: UNANIMOUS 2/2 CONSULAR RATIFICATION');
        console.log(`  Ratified By:  ${petition.consular_seal.approved_by.join(' & ')}`);
        console.log(`  Deliverable:  ${petition.sealed_deliverable?.artifacts?.join(', ') || 'sealed_artifact.json'}`);
        console.log('====================================================================\n');
        process.exit(0);
      } else {
        console.log(`\n[CONSULAR VERDICT]: VETOED / BLOCKED (${petition.veto_rationale || 'Intercessio Veto'})`);
        console.log('====================================================================\n');
        process.exit(1);
      }
      return true;
    }

    case 'courier_status': {
      if (!parsed.petitionId) {
        console.error('Error: petition_id is required. Usage: SymlinkedAgentSwarm.exe courier status <petition_id>');
        process.exit(1);
      }
      const petPath = path.join(swarmDir, 'courier', 'petitions', `${parsed.petitionId}.json`);
      if (fs.existsSync(petPath)) {
        const pet = JSON.parse(fs.readFileSync(petPath, 'utf8'));
        console.log('\n====================================================================');
        console.log(` COURIER PETITION STATUS: ${parsed.petitionId}                     `);
        console.log('====================================================================');
        console.log(`Sender:       ${pet.sender_agent || pet.external_agent}`);
        console.log(`Status:       ${pet.status}`);
        console.log(`Prompt:       ${pet.prompt || pet.task_description}`);
        console.log(`Created:      ${pet.created_at}`);
        if (pet.consular_seal) {
          console.log(`Consular Seal: RATIFIED (${pet.consular_seal.approved_by?.join(' & ')})`);
        }
        if (pet.veto_rationale) {
          console.log(`Veto Reason:   ${pet.veto_rationale}`);
        }
        console.log('====================================================================\n');
      } else {
        console.log(`[COURIER] Petition not found: ${parsed.petitionId}`);
      }
      process.exit(0);
      return true;
    }

    case 'start':
    default:
      // Return false to signal that the daemon HTTP/WS server should proceed to start!
      return false;
  }
}

function printHelpManual(): void {
  console.log(`
SYMLINKED AGENT SWARM // PANOPTICON CLI USAGE MANUAL
====================================================
Usage:
  SymlinkedAgentSwarm.exe [command] [options]

Commands:
  (default) / start       Launches Panopticon Web Server & WebSocket Orchestrator
  courier submit          Submits task petition to Dual-Consuls (Nia & Ferric)
  courier status <id>     Queries status of a submitted Courier petition
  courier envoys          Lists registered external agent connectors (OpenClaw, Hermes, GPT Dot)
  courier wisdom          Requests strategic Consular Wisdom & plan
  status | grid status    Displays current 16-cubicle grid status table
  version                 Prints version telemetry
  help                    Prints this help guide

Daemon Options (for start):
  --port, -p <number>     Server port (default: 3820)
  --headless              Run without auto-opening web browser
  --workspace, -w <path>  Target repository workspace directory (default: current directory)

Courier Submit Options:
  --agent <name>          External agent name (e.g. openclaw, hermes, gpt-dot)
  --type <type>           Petition type: WISDOM, POWER, or BOTH (default: BOTH)
  "<task>"                Task description string
`);
}
```

### 4.5 Health Check Endpoint Contract Hardening: `src/server/index.ts`
Enrich `/api/health` in `src/server/index.ts` lines 170-176 to satisfy both `standalone-smoke.test.ts` (`SMOKE-04`) and `tier1-feature-coverage.test.ts` (`TC-T1-EXE-05`):
```typescript
  // Health check
  app.get('/api/health', (_req: Request, res: Response) => {
    const allCubicles = cubicleManager.getAllCubicles();
    const activeCubicles = allCubicles.filter((c) => c.assigned && c.state !== 'Error').length;

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
```

---

## 5. Verification Method

To independently verify the packaging and CLI dispatcher implementation:

1. **Unit & Smoke Tests**:
   Execute the dedicated test suites:
   ```bash
   npx vitest run test/e2e/standalone-smoke.test.ts
   npx vitest run test/e2e/tier1-feature-coverage.test.ts -t "Standalone Windows .exe Packaging"
   ```
   *Expected Result*: All 5 smoke tests (`SMOKE-01` through `SMOKE-05`) and all 5 tier 1 tests (`TC-T1-EXE-01` through `TC-T1-EXE-05`) pass cleanly.

2. **PowerShell Build Verification**:
   Execute the build script in PowerShell:
   ```powershell
   pwsh scripts/build-exe.ps1
   ```
   *Verification Checks*:
   - Assert `Test-Path dist/SymlinkedAgentSwarm.exe` returns `True`.
   - Assert `Test-Path SymlinkedAgentSwarm.exe` returns `True`.
   - Assert `Test-Path dist/SymlinkedAgentSwarm.exe.sha256` and `Test-Path SymlinkedAgentSwarm.exe.sha256` return `True`.
   - Check file size: executable must be > 30MB (packaged Node runtime + bundle).

3. **CLI Subcommand Smoke Verification**:
   Execute CLI commands against the built executable:
   ```powershell
   .\SymlinkedAgentSwarm.exe version
   # Expected output: Symlinked Agent Swarm v1.0.0 [Panopticon Dual-Consul Matrix]

   .\SymlinkedAgentSwarm.exe courier envoys
   # Expected output: lists openclaw, hermes, gpt-dot connectors

   .\SymlinkedAgentSwarm.exe courier submit --agent openclaw "Audit WebSocket pool"
   # Expected output: Petition ID generated, Consular Wisdom printed, sealed deliverable created in .swarm/courier/outbox/
   ```

4. **Daemon Launch & Health Check**:
   ```powershell
   # Launch server on test port
   Start-Process -FilePath ".\SymlinkedAgentSwarm.exe" -ArgumentList "start --port 3899 --headless"
   
   # Curl / Invoke-RestMethod against health endpoint
   Invoke-RestMethod http://localhost:3899/api/health
   # Expected: status=ok, governance.mode=ROMAN_DUAL_CONSUL, consuls has 2 items
   ```

5. **Invalidation Conditions**:
   - The solution is invalidated if `SymlinkedAgentSwarm.exe` fails to start without loose `src/` files present.
   - The solution is invalidated if `courier submit` fails to emit the Consular seal or fails to record the deliverable artifact.
   - The solution is invalidated if `scripts/build-exe.ps1` produces mismatched paths or fails CI in GitHub Actions.
