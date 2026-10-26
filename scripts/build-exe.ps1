<#
.SYNOPSIS
    Builds the standalone Windows executable for Symlinked Agent Swarm System (Panopticon).
.DESCRIPTION
    Compiles TypeScript, bundles server and client dependencies with esbuild, generates a
    standalone Windows executable (dist/SymlinkedAgentSwarm.exe), copies it to the project
    root (SymlinkedAgentSwarm.exe), generates SHA256 checksums, and copies static assets.
.PARAMETER Clean
    Removes existing dist/ directory and prior build artifacts before building.
.PARAMETER SkipTests
    Skips executing the Vitest test suite prior to packaging.
.PARAMETER SkipTsc
    Skips standalone tsc typecheck pass.
.PARAMETER Configuration
    Build configuration ('Release' or 'Debug', default 'Release').
#>

[CmdletBinding()]
param(
    [switch]$Clean,
    [switch]$SkipTests,
    [switch]$SkipTsc,
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DistDir = Join-Path $ProjectRoot "dist"
$DistExe = Join-Path $DistDir "SymlinkedAgentSwarm.exe"
$RootExe = Join-Path $ProjectRoot "SymlinkedAgentSwarm.exe"
$Sha256File = Join-Path $DistDir "SymlinkedAgentSwarm.exe.sha256"
$ShaSumsFile = Join-Path $DistDir "SHA256SUMS.txt"
$RootSha256File = Join-Path $ProjectRoot "SymlinkedAgentSwarm.exe.sha256"

Write-Host @"
================================================================================
 [PANOPTICON BUILD SYSTEM] SYMLINKED AGENT SWARM // STANDALONE WIN32 EXE
 Target: dist/SymlinkedAgentSwarm.exe -> SymlinkedAgentSwarm.exe
 Configuration: $Configuration
================================================================================
"@ -ForegroundColor Cyan

# 1. Clean workspace if requested
if ($Clean) {
    Write-Host "[1/7] Cleaning prior build artifacts..." -ForegroundColor Yellow
    if (Test-Path $DistDir) {
        Remove-Item -Recurse -Force $DistDir
    }
    Get-ChildItem -Path $ProjectRoot -Filter "*.old.exe" | Remove-Item -Force -ErrorAction SilentlyContinue
    Get-ChildItem -Path $ProjectRoot -Filter "*.new.exe" | Remove-Item -Force -ErrorAction SilentlyContinue
    if (Test-Path $RootExe) {
        try {
            Remove-Item -Force $RootExe
        } catch {
            Write-Warning "Root executable is locked by running process; renaming to .old.exe..."
            Rename-Item -Path $RootExe -NewName "SymlinkedAgentSwarm.old.exe" -Force
        }
    }
} else {
    Write-Host "[1/7] Workspace clean skipped (use -Clean to purge)." -ForegroundColor DarkGray
}

# 2. Ensure dist directories
New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $DistDir "public") | Out-Null

# 3. Synchronize consular avatar texture assets
Write-Host "[2/7] Synchronizing authentic consular avatar texture sheets..." -ForegroundColor Yellow
$syncScript = Join-Path $ProjectRoot "scripts" "sync-avatar-assets.mjs"
if (Test-Path $syncScript) {
    & node $syncScript
} else {
    Write-Warning "Avatar sync script $syncScript not found; skipping asset sync."
}

# 4. Copy static assets to dist/public
Write-Host "[3/7] Staging static Panopticon assets into dist/public..." -ForegroundColor Yellow
$srcPublic = Join-Path $ProjectRoot "src" "public"
$rootPublic = Join-Path $ProjectRoot "public"

if (Test-Path $rootPublic) {
    Copy-Item -Recurse -Force -Path "$rootPublic\*" -Destination (Join-Path $DistDir "public")
}
if (Test-Path $srcPublic) {
    $distSrcPublic = Join-Path $DistDir "src\public"
    New-Item -ItemType Directory -Force -Path $distSrcPublic | Out-Null
    Copy-Item -Recurse -Force -Path "$srcPublic\*" -Destination $distSrcPublic
}

# 5. Compile TypeScript
if (-not $SkipTsc) {
    Write-Host "[4/7] Verifying TypeScript compilation (tsc --noEmit)..." -ForegroundColor Yellow
    & npx tsc --noEmit
    if ($LASTEXITCODE -ne 0) {
        throw "TypeScript compilation check failed with exit code $LASTEXITCODE"
    }
} else {
    Write-Host "[4/7] TypeScript compilation skipped (-SkipTsc)." -ForegroundColor DarkGray
}

# 6. Execute tests
if (-not $SkipTests) {
    Write-Host "[5/7] Executing test suite..." -ForegroundColor Yellow
    & npx vitest run test/unit
    if ($LASTEXITCODE -ne 0) {
        throw "Unit test suite execution failed with exit code $LASTEXITCODE"
    }
} else {
    Write-Host "[5/7] Test execution skipped (-SkipTests)." -ForegroundColor DarkGray
}

# 7. Bundle with esbuild
Write-Host "[6/7] Bundling application with esbuild..." -ForegroundColor Yellow
$serverEntry = Join-Path $ProjectRoot "src" "server" "index.ts"
$bundleOut = Join-Path $DistDir "server.bundle.cjs"

& npx esbuild $serverEntry `
    --bundle `
    --platform=node `
    --target=node20 `
    --format=cjs `
    --outfile=$bundleOut `
    --external:fsevents `
    --sourcemap=inline

if ($LASTEXITCODE -ne 0 -or -not (Test-Path $bundleOut)) {
    throw "esbuild bundling failed to produce $bundleOut"
}

# 8. Create Standalone Windows Executable (Node SEA + C# PE Wrapper Fallback)
Write-Host "[7/7] Generating standalone Windows executable (dist/SymlinkedAgentSwarm.exe)..." -ForegroundColor Yellow

$seaSuccess = $false
try {
    # Prepare SEA config
    $seaConfigFile = Join-Path $DistDir "sea-config.json"
    $seaPrepBlob = Join-Path $DistDir "sea-prep.blob"
    $seaConfig = @{
        main = $bundleOut
        output = $seaPrepBlob
        disableExperimentalSEAWarning = $true
        useCodeCache = $true
    } | ConvertTo-Json

    Set-Content -Path $seaConfigFile -Value $seaConfig -Encoding utf8
    & node --experimental-sea-config $seaConfigFile

    if (Test-Path $seaPrepBlob) {
        $nodePath = (Get-Command node).Source
        Copy-Item -Path $nodePath -Destination $DistExe -Force

        # Run postject injection
        & npx --yes postject $DistExe NODE_SEA_BLOB $seaPrepBlob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
        if ($LASTEXITCODE -eq 0 -and (Test-Path $DistExe)) {
            $seaSuccess = $true
            Write-Host "Node SEA single-binary injection succeeded." -ForegroundColor Green
        }
    }
} catch {
    Write-Warning "Node SEA injection encountered error: $($_.Exception.Message)"
}

if (-not $seaSuccess) {
    Write-Host "Falling back to native Windows PE executable wrapper compilation..." -ForegroundColor Yellow

    $csharpSource = @"
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;

namespace SymlinkedAgentSwarm
{
    class Program
    {
        static int Main(string[] args)
        {
            try
            {
                string exeDir = AppDomain.CurrentDomain.BaseDirectory;
                string bundlePath = Path.Combine(exeDir, "server.bundle.cjs");
                if (!File.Exists(bundlePath))
                {
                    bundlePath = Path.Combine(exeDir, "dist", "server.bundle.cjs");
                }

                string nodeExe = "node.exe";
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = nodeExe;
                
                string formattedArgs = "\"" + bundlePath + "\"";
                foreach (string arg in args)
                {
                    formattedArgs += " \"" + arg.Replace("\"", "\\\"") + "\"";
                }
                
                psi.Arguments = formattedArgs;
                psi.UseShellExecute = false;
                psi.RedirectStandardOutput = false;
                psi.RedirectStandardError = false;

                using (Process proc = Process.Start(psi))
                {
                    proc.WaitForExit();
                    return proc.ExitCode;
                }
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[PANOPTICON LAUNCH ERROR] " + ex.Message);
                Console.ResetColor();
                return 1;
            }
        }
    }
}
"@

    Add-Type -TypeDefinition $csharpSource -OutputAssembly $DistExe -OutputType ConsoleApplication
    Write-Host "Compiled native Windows PE wrapper executable at dist/SymlinkedAgentSwarm.exe" -ForegroundColor Green
}

# Copy to root executable
Write-Host "Copying dist/SymlinkedAgentSwarm.exe to root SymlinkedAgentSwarm.exe..." -ForegroundColor Cyan
Copy-Item -Path $DistExe -Destination $RootExe -Force

# Generate SHA256 Checksums
$hash = (Get-FileHash -Algorithm SHA256 -Path $DistExe).Hash
Set-Content -Path $Sha256File -Value "$hash  SymlinkedAgentSwarm.exe" -Encoding utf8
Set-Content -Path $RootSha256File -Value "$hash  SymlinkedAgentSwarm.exe" -Encoding utf8
Set-Content -Path $ShaSumsFile -Value "$hash  SymlinkedAgentSwarm.exe" -Encoding utf8

$distSize = (Get-Item $DistExe).Length
$rootSize = (Get-Item $RootExe).Length

Write-Host @"
================================================================================
 [PANOPTICON BUILD COMPLETE]
 - dist/SymlinkedAgentSwarm.exe ($distSize bytes)
 - SymlinkedAgentSwarm.exe ($rootSize bytes)
 - SHA256: $hash
 Checksum written to dist/SymlinkedAgentSwarm.exe.sha256 and dist/SHA256SUMS.txt
================================================================================
"@ -ForegroundColor Green
