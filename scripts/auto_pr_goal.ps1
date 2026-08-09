[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$RepositoryRoot,

  [Parameter(Mandatory = $true)]
  [string]$Title,

  [Parameter(Mandatory = $true)]
  [string]$BodyFile,

  [string]$BaseBranch = 'main'
)

$ErrorActionPreference = 'Stop'

function Invoke-Captured {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter(Mandatory = $true)]
    [string[]]$ArgumentList
  )

  $output = @(& $FilePath @ArgumentList 2>&1)
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath failed: $($output -join [Environment]::NewLine)"
  }
  return $output
}

$root = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$body = (Resolve-Path -LiteralPath $BodyFile).Path
Set-Location -LiteralPath $root

if (Test-Path -LiteralPath (Join-Path $root '.vhk/HARD_STOP')) {
  throw 'Push and PR creation are disabled while .vhk/HARD_STOP exists.'
}

$gitRoot = (@(Invoke-Captured -FilePath 'git' -ArgumentList @('rev-parse', '--show-toplevel'))[0]).Trim()
if (-not $gitRoot) {
  throw 'Unable to resolve the Git repository root.'
}

$status = @(Invoke-Captured -FilePath 'git' -ArgumentList @('status', '--porcelain'))
if ($status.Count -gt 0) {
  throw 'The worktree is dirty; push and PR creation stopped.'
}

$branch = (@(Invoke-Captured -FilePath 'git' -ArgumentList @('branch', '--show-current'))[0]).Trim()
if (-not $branch) {
  throw 'Cannot create a PR from detached HEAD.'
}
if ($branch -eq $BaseBranch -or $branch -eq 'main') {
  throw 'Cannot create a PR from the base branch or main.'
}

Invoke-Captured -FilePath 'git' -ArgumentList @('fetch', 'origin', $BaseBranch) | Out-Null
$behind = [int](@(Invoke-Captured -FilePath 'git' -ArgumentList @('rev-list', '--count', "HEAD..origin/$BaseBranch"))[0])
if ($behind -gt 0) {
  throw "The branch is $behind commit(s) behind origin/$BaseBranch. Update the base first."
}

$ahead = [int](@(Invoke-Captured -FilePath 'git' -ArgumentList @('rev-list', '--count', "origin/$BaseBranch..HEAD"))[0])
if ($ahead -lt 1) {
  throw "No new commits exist relative to origin/$BaseBranch."
}

Invoke-Captured -FilePath 'git' -ArgumentList @(
  'push', '--set-upstream', 'origin', "HEAD:refs/heads/$branch"
) | Out-Null

$existingOutput = @(Invoke-Captured -FilePath 'gh' -ArgumentList @(
  'pr', 'list', '--head', $branch, '--state', 'open', '--json', 'url'
))
$existingJson = ($existingOutput -join [Environment]::NewLine).Trim()
$existingPrs = @()
if ($existingJson) {
  try {
    $existingPrs = @($existingJson | ConvertFrom-Json)
  } catch {
    throw "Unable to parse the existing PR response: $($_.Exception.Message)"
  }
}
if ($existingPrs.Count -gt 0) {
  $existingUrl = ([string]$existingPrs[0].url).Trim()
  if ($existingUrl) {
    Write-Output $existingUrl
    exit 0
  }
}

$created = @(Invoke-Captured -FilePath 'gh' -ArgumentList @(
  'pr', 'create', '--base', $BaseBranch, '--head', $branch, '--title', $Title, '--body-file', $body
))
$createdUrl = ([string]($created | Select-Object -Last 1)).Trim()
if (-not $createdUrl) {
  throw 'Unable to read the created PR URL.'
}
Write-Output $createdUrl
