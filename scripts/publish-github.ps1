<#
.SYNOPSIS
    Initializes and publishes the Symlinked Agent Swarm repository to GitHub for holdenliu1.
.DESCRIPTION
    Ensures a clean Git repository, verifies .gitignore hygiene, sets the remote origin to
    https://github.com/holdenliu1/symlinked-agent-swarm.git, creates the initial commit on main,
    tags the release (e.g. v1.0.0), and pushes to GitHub.
.PARAMETER RemoteUrl
    The remote repository URL (default: 'https://github.com/holdenliu1/symlinked-agent-swarm.git').
.PARAMETER Branch
    The branch to publish (default: 'main').
.PARAMETER TagName
    Optional release tag to create and push (e.g. 'v1.0.0').
.PARAMETER CommitMessage
    Commit message for initial or updated commit.
.PARAMETER DryRun
    Performs all local setup and validation without executing remote git push.
.PARAMETER ForceRemote
    Forces updating the origin remote URL if it already exists and differs.
#>

[CmdletBinding()]
param(
    [string]$RemoteUrl = "https://github.com/holdenliu1/symlinked-agent-swarm.git",
    [string]$Branch = "main",
    [string]$TagName = "v1.0.0",
    [string]$CommitMessage = "feat: Symlinked Agent Swarm System & Brutalist Panopticon v1.0.0",
    [switch]$DryRun,
    [switch]$ForceRemote
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Set-Location $ProjectRoot

Write-Host @"
================================================================================
 [GITHUB PUBLISH ENGINE] HOLDENLIU1 // SYMLINKED AGENT SWARM
 Target Remote: $RemoteUrl
 Target Branch: $Branch
 Release Tag:   $TagName
 Dry Run:       $DryRun
================================================================================
"@ -ForegroundColor Cyan

# 1. Verify Git Installation
try {
    $gitVersion = & git --version
    Write-Host "[1/6] Git detected: $gitVersion" -ForegroundColor Green
} catch {
    throw "Git executable not found in PATH. Please install Git for Windows."
}

# 2. Initialize Git if not initialized
$gitDir = Join-Path $ProjectRoot ".git"
if (-not (Test-Path $gitDir)) {
    Write-Host "[2/6] Initializing clean Git repository on branch '$Branch'..." -ForegroundColor Yellow
    & git init -b $Branch
} else {
    Write-Host "[2/6] Existing Git repository detected." -ForegroundColor Green
}

# 3. Ensure Git user identity
$userName = & git config user.name
$userEmail = & git config user.email

if ([string]::IsNullOrWhiteSpace($userName)) {
    Write-Host "Configuring local git user.name: holdenliu1" -ForegroundColor Yellow
    & git config user.name "holdenliu1"
}
if ([string]::IsNullOrWhiteSpace($userEmail)) {
    Write-Host "Configuring local git user.email: holdenliu1@users.noreply.github.com" -ForegroundColor Yellow
    & git config user.email "holdenliu1@users.noreply.github.com"
}

# 4. Configure Remote URL
Write-Host "[3/6] Configuring remote 'origin' -> $RemoteUrl..." -ForegroundColor Yellow
$currentOrigin = & git remote get-url origin 2>$null

if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($currentOrigin)) {
    & git remote add origin $RemoteUrl
    Write-Host "Added remote origin: $RemoteUrl" -ForegroundColor Green
} else {
    if ($currentOrigin -ne $RemoteUrl) {
        if ($ForceRemote) {
            & git remote set-url origin $RemoteUrl
            Write-Host "Updated remote origin from '$currentOrigin' to '$RemoteUrl'" -ForegroundColor Green
        } else {
            Write-Warning "Origin currently points to '$currentOrigin'. Use -ForceRemote to overwrite."
        }
    } else {
        Write-Host "Remote origin already matches $RemoteUrl" -ForegroundColor Green
    }
}

# 5. Stage Files and Commit
Write-Host "[4/6] Staging files according to .gitignore..." -ForegroundColor Yellow
& git add .

$status = & git status --porcelain
if (-not [string]::IsNullOrWhiteSpace($status)) {
    Write-Host "Committing changes with message: '$CommitMessage'..." -ForegroundColor Yellow
    & git commit -m $CommitMessage
} else {
    Write-Host "Working tree clean; no uncommitted changes." -ForegroundColor Green
}

# 6. Create Tag if specified
if (-not [string]::IsNullOrWhiteSpace($TagName)) {
    Write-Host "[5/6] Verifying release tag '$TagName'..." -ForegroundColor Yellow
    $existingTag = & git tag -l $TagName
    if ([string]::IsNullOrWhiteSpace($existingTag)) {
        & git tag -a $TagName -m "Release $TagName: Symlinked Agent Swarm & Brutalist Panopticon"
        Write-Host "Created annotated tag: $TagName" -ForegroundColor Green
    } else {
        Write-Host "Tag $TagName already exists." -ForegroundColor Green
    }
}

# 7. Push to Remote
Write-Host "[6/6] Publishing to GitHub ($RemoteUrl)..." -ForegroundColor Yellow
if ($DryRun) {
    Write-Host "[DRY RUN] Would execute:" -ForegroundColor Cyan
    Write-Host "  git push -u origin $Branch" -ForegroundColor Cyan
    if (-not [string]::IsNullOrWhiteSpace($TagName)) {
        Write-Host "  git push origin $TagName" -ForegroundColor Cyan
    }
    Write-Host "Dry run complete. No network changes made." -ForegroundColor Green
} else {
    try {
        & git push -u origin $Branch
        if (-not [string]::IsNullOrWhiteSpace($TagName)) {
            & git push origin $TagName
        }
        Write-Host "Successfully published to https://github.com/holdenliu1/symlinked-agent-swarm.git" -ForegroundColor Green
    } catch {
        Write-Warning "Git push encountered an error: $($_.Exception.Message)"
        Write-Host @"
[AUTHENTICATION NOTICE]
If GitHub rejected the push due to authentication:
1. Ensure your GitHub Personal Access Token (PAT) with 'repo' scope is configured in Windows Credential Manager:
   git credential-manager set
2. Or login via GitHub CLI:
   gh auth login
3. Then retry:
   git push -u origin $Branch --tags
"@ -ForegroundColor Yellow
    }
}
