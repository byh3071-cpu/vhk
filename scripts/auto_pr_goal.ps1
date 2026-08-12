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

function Invoke-Quiet {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,

    [Parameter(Mandatory = $true)]
    [string[]]$ArgumentList
  )

  # PS 5.1: ErrorActionPreference=Stop 이면 native stderr 의 2>&1 리다이렉트가
  # NativeCommandError 로 승격돼 스크립트 전체가 죽는다. 실패를 값으로 받는 함수라
  # 이 스코프에서만 Continue 로 낮춘다.
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = @(& $FilePath @ArgumentList 2>&1 | ForEach-Object { "$_" })
    return @{ Ok = ($LASTEXITCODE -eq 0); Output = $output }
  } finally {
    $ErrorActionPreference = $prev
  }
}

# Goal 111-T5: autonomous 라벨 멱등 부착 — cohort 보조 신호 (1차 신호는 종결 SHA↔headRefOid 조인).
# 라벨 생성은 이미 존재하면 실패하는 게 정상이라 조용히 넘어가고, 부착은 gh 가 멱등이다.
# 부착 실패는 PR 자체를 죽이지 않는다 — 판정 쪽에서 SHA 단독 신호 = unknown 으로 격리되므로
# interactive 로 위장되지 않는다. 다만 경고를 크게 남긴다.
function Set-AutonomousLabel {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PrRef
  )

  Invoke-Quiet -FilePath 'gh' -ArgumentList @(
    'label', 'create', 'autonomous',
    '--description', 'vhk autonomous run PR (Goal 111 cohort signal)',
    '--color', '5319E7'
  ) | Out-Null

  $add = Invoke-Quiet -FilePath 'gh' -ArgumentList @('pr', 'edit', $PrRef, '--add-label', 'autonomous')
  if (-not $add.Ok) {
    # stdout 은 PR URL 전용 계약 — 경고는 stderr 로만 낸다 (Write-Warning 은 헤드리스에서 stdout 에 섞임).
    [Console]::Error.WriteLine("WARN: autonomous label attach failed - cohort will stay 'unknown': $($add.Output -join ' ')")
  }
}

$root = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$body = (Resolve-Path -LiteralPath $BodyFile).Path
Set-Location -LiteralPath $root

$gitRoot = (@(Invoke-Captured -FilePath 'git' -ArgumentList @('rev-parse', '--show-toplevel'))[0]).Trim()
if (-not $gitRoot) {
  throw 'Unable to resolve the Git repository root.'
}
$gitRoot = (Resolve-Path -LiteralPath $gitRoot).Path
if (-not [string]::Equals($gitRoot, $root, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'RepositoryRoot must be the Git repository root.'
}
if (Test-Path -LiteralPath (Join-Path $gitRoot '.vhk/HARD_STOP')) {
  throw 'Push and PR creation are disabled while .vhk/HARD_STOP exists.'
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
  'pr', 'list', '--head', $branch, '--base', $BaseBranch, '--state', 'open', '--json', 'url'
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
    # 기존 PR 재사용 경로에서도 라벨을 보장한다 — 신규 생성만 라벨하면 재사용 PR 이 빠진다.
    Set-AutonomousLabel -PrRef $existingUrl
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
Set-AutonomousLabel -PrRef $createdUrl
Write-Output $createdUrl
