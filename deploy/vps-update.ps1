[CmdletBinding()]
param(
  [string]$Repository = "AdrianZhaoDev/ai-price",
  [string]$SshAlias = "american-vps",
  [string]$PublicIp = "107.173.87.110",
  [string]$PublicDomain = "lowpriceradar.com",
  [long]$RunId = 0
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

foreach ($commandName in @("git", "gh", "ssh", "scp")) {
  if (-not (Get-Command $commandName -ErrorAction SilentlyContinue)) {
    throw "Required command is unavailable: $commandName"
  }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

if ((git branch --show-current) -ne "main") {
  throw "Production releases must be deployed from the main branch."
}
if (git status --porcelain) {
  throw "The worktree is not clean. Commit or discard changes before deployment."
}

$commit = (git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) {
  throw "Unable to resolve the local Git commit."
}

if ($RunId -eq 0) {
  $runJson = gh run list `
    --repo $Repository `
    --workflow CI `
    --commit $commit `
    --limit 10 `
    --json databaseId,status,conclusion,headSha
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to query GitHub Actions."
  }
  $runs = @($runJson | ConvertFrom-Json)
  $run = $runs | Where-Object { $_.headSha -eq $commit } |
    Select-Object -First 1
  if (-not $run) {
    throw "No CI run exists for commit $commit. Push main and wait for CI first."
  }
  $RunId = [long]$run.databaseId
}

$runState = gh run view $RunId --repo $Repository --json status,conclusion,headSha |
  ConvertFrom-Json
if ($LASTEXITCODE -ne 0) {
  throw "Unable to inspect GitHub Actions run $RunId."
}
if ($runState.headSha -ne $commit) {
  throw "CI run $RunId belongs to $($runState.headSha), not local commit $commit."
}
if ($runState.status -ne "completed") {
  gh run watch $RunId --repo $Repository --exit-status
  if ($LASTEXITCODE -ne 0) {
    throw "CI run $RunId failed."
  }
  $runState = gh run view $RunId --repo $Repository --json status,conclusion,headSha |
    ConvertFrom-Json
}
if ($runState.conclusion -ne "success") {
  throw "CI run $RunId is not successful: $($runState.conclusion)"
}

$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$downloadRoot = Join-Path $tempBase (
  "ai-price-release-" + [Guid]::NewGuid().ToString("N")
)
$resolvedDownloadRoot = [IO.Path]::GetFullPath($downloadRoot)
if (-not $resolvedDownloadRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to create a release directory outside the system temp path."
}

New-Item -ItemType Directory -Path $resolvedDownloadRoot | Out-Null
$startedAt = Get-Date

try {
  gh run download $RunId `
    --repo $Repository `
    --name production-release `
    --dir $resolvedDownloadRoot
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to download the verified production artifact."
  }

  $requiredFiles = @(
    "ai-price.tar.gz",
    "package-lock.json",
    "vps-install.sh",
    "RELEASE_COMMIT",
    "manifest.sha256"
  )
  $expectedManifestFiles = [Collections.Generic.HashSet[string]]::new(
    [StringComparer]::Ordinal
  )
  foreach ($expectedFile in $requiredFiles | Where-Object {
    $_ -ne "manifest.sha256"
  }) {
    [void]$expectedManifestFiles.Add($expectedFile)
  }
  foreach ($requiredFile in $requiredFiles) {
    $requiredPath = Join-Path $resolvedDownloadRoot $requiredFile
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
      throw "Production artifact is missing $requiredFile."
    }
  }

  $artifactCommit = (
    Get-Content -LiteralPath (Join-Path $resolvedDownloadRoot "RELEASE_COMMIT") -Raw
  ).Trim()
  if ($artifactCommit -ne $commit) {
    throw "Artifact commit $artifactCommit does not match local commit $commit."
  }

  $manifestFiles = [Collections.Generic.HashSet[string]]::new(
    [StringComparer]::Ordinal
  )
  foreach ($manifestLine in Get-Content -LiteralPath (
    Join-Path $resolvedDownloadRoot "manifest.sha256"
  )) {
    $parts = $manifestLine.Trim() -split "\s+", 2
    if ($parts.Count -ne 2) {
      throw "Invalid checksum manifest line: $manifestLine"
    }
    $fileName = $parts[1].TrimStart("*")
    if ([IO.Path]::GetFileName($fileName) -ne $fileName) {
      throw "Invalid artifact filename in checksum manifest: $fileName"
    }
    if (-not $expectedManifestFiles.Contains($fileName)) {
      throw "Unexpected file in checksum manifest: $fileName"
    }
    if (-not $manifestFiles.Add($fileName)) {
      throw "Duplicate file in checksum manifest: $fileName"
    }
    $actualHash = (
      Get-FileHash -Algorithm SHA256 -LiteralPath (
        Join-Path $resolvedDownloadRoot $fileName
      )
    ).Hash.ToLowerInvariant()
    if ($actualHash -ne $parts[0].ToLowerInvariant()) {
      throw "Checksum mismatch for $fileName."
    }
  }
  if (-not $manifestFiles.SetEquals($expectedManifestFiles)) {
    throw "Checksum manifest does not cover every required artifact."
  }

  $backupCommand = @'
set -e
install -d -o postgres -g postgres -m 0700 /var/backups/ai-price
BACKUP_FILE="/var/backups/ai-price/ai_price_$(date -u +%Y%m%d%H%M%S%N).dump"
sudo -u postgres pg_dump --format=custom --file="$BACKUP_FILE" ai_price
echo "BACKUP_FILE=$BACKUP_FILE"
'@
  $backupCommand = $backupCommand.Replace("`r", "")
  ssh $SshAlias $backupCommand
  if ($LASTEXITCODE -ne 0) {
    throw "Production database backup failed."
  }

  scp (Join-Path $resolvedDownloadRoot "ai-price.tar.gz") `
    "${SshAlias}:/tmp/ai-price.tar.gz"
  if ($LASTEXITCODE -ne 0) {
    throw "Source artifact upload failed."
  }
  scp (Join-Path $resolvedDownloadRoot "package-lock.json") `
    "${SshAlias}:/tmp/ai-price-package-lock.json"
  if ($LASTEXITCODE -ne 0) {
    throw "Lockfile upload failed."
  }
  scp (Join-Path $resolvedDownloadRoot "vps-install.sh") `
    "${SshAlias}:/tmp/ai-price-vps-install.sh"
  if ($LASTEXITCODE -ne 0) {
    throw "Installer upload failed."
  }

  $deployCommand = @"
set -e
chmod 700 /tmp/ai-price-vps-install.sh
/tmp/ai-price-vps-install.sh \
  $PublicIp \
  /tmp/ai-price.tar.gz \
  /tmp/ai-price-package-lock.json
systemctl is-active \
  ai-price.service nginx postgresql ai-price-collect.timer certbot.timer
install -d -o ai-price -g ai-price -m 0750 /run/ai-price-collect
sudo -u ai-price env HOME=/var/lib/ai-price NODE_ENV=production \
  /usr/bin/flock --exclusive /run/ai-price-collect/collector.lock bash -e -c '
  set -a
  source /etc/ai-price.env
  set +a
  cd /opt/ai-price/current
  npm run collect -- --source=models-dev
  npm run warm:models
'
origin_status=`$(curl -sS --resolve '$PublicDomain`:443:127.0.0.1' \
  -o /dev/null -w '%{http_code}' https://$PublicDomain/)
public_status=`$(curl -sS -o /dev/null -w '%{http_code}' \
  https://$PublicDomain/)
http_status=`$(curl -sS -o /dev/null -w '%{http_code}' \
  http://$PublicDomain/)
admin_status=`$(curl -sS -o /dev/null -w '%{http_code}' \
  http://127.0.0.1:3100/admin/errors)
curl -fsS --resolve '$PublicDomain`:443:127.0.0.1' \
  -H 'Accept-Language: zh-CN' -o /dev/null \
  https://$PublicDomain/methodology
cache_status=`$(curl -fsSI --resolve '$PublicDomain`:443:127.0.0.1' \
  -H 'Accept-Language: zh-CN' https://$PublicDomain/methodology | \
  awk '/^X-Cache-Status:/ { gsub("\r", "", `$2); print `$2 }' | tail -n 1)
printf 'origin-https=%s\n' "`$origin_status"
printf 'public=%s\n' "`$public_status"
printf 'http-redirect=%s\n' "`$http_status"
printf 'admin-errors=%s\n' "`$admin_status"
printf 'origin-cache=%s\n' "`$cache_status"
[[ "`$origin_status" == "200" ]]
[[ "`$public_status" == "200" ]]
[[ "`$http_status" == "301" ]]
[[ "`$admin_status" == "307" ]]
[[ "`$cache_status" == "HIT" ]]
"@
  $deployCommand = $deployCommand.Replace("`r", "")
  ssh $SshAlias $deployCommand
  if ($LASTEXITCODE -ne 0) {
    throw "Production deployment or verification failed."
  }

  $elapsed = [math]::Round(((Get-Date) - $startedAt).TotalSeconds, 1)
  Write-Output "DEPLOYED_COMMIT=$commit"
  Write-Output "GITHUB_RUN_ID=$RunId"
  Write-Output "DEPLOY_SECONDS=$elapsed"
}
finally {
  ssh $SshAlias "rm -f -- /tmp/ai-price.tar.gz /tmp/ai-price-package-lock.json /tmp/ai-price-vps-install.sh" 2>$null |
    Out-Null
  if (
    (Test-Path -LiteralPath $resolvedDownloadRoot) -and
    $resolvedDownloadRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)
  ) {
    Remove-Item -LiteralPath $resolvedDownloadRoot -Recurse -Force
  }
}
