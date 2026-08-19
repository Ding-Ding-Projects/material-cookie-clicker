[CmdletBinding()]
param([switch]$Silent)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'build-common.ps1')

function Write-DependencyEvidence {
  param([Parameter(Mandatory = $true)][string]$Root, [Parameter(Mandatory = $true)]$Tools)
  $manifestPath = Join-Path $Root 'scripts\dependency-manifest.json'
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if ($manifest.schemaVersion -ne 1 -or $manifest.node.version -ne '22.14.0' -or $manifest.node.sha256 -notmatch '^[0-9a-f]{64}$') {
    throw 'The committed dependency manifest does not contain the expected pinned Node.js version and SHA-256.'
  }
  $evidencePath = Join-Path $Root 'node_modules\.material-cookie-clicker-dependency-evidence.json'
  $entry = [ordered]@{
    schemaVersion = 'material-cookie-clicker.dependency-evidence.v1'
    generatedAt = [DateTimeOffset]::UtcNow.ToString('o')
    node = [ordered]@{ version = $Tools.Version; source = $Tools.Source; executable = $Tools.Node }
    pinnedManifest = 'scripts/dependency-manifest.json'
    projectDependencies = [ordered]@{ resolvedVia = 'npm ci'; lockfile = 'package-lock.json' }
  }
  $entry | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $evidencePath -Encoding UTF8
  return $evidencePath
}

try {
  $root = Get-RepositoryRoot -ScriptRoot $PSScriptRoot
  $timer = [Diagnostics.Stopwatch]::StartNew()
  Write-Output "Dependency root: $root"

  Write-Output 'Phase 1/3: resolving the Node.js 22 toolchain.'
  $tools = Resolve-NodeToolchain -Root $root
  Write-Output "Node.js $($tools.Version) ready ($($tools.Source))."

  Write-Output 'Phase 2/3: installing the locked project dependencies (npm ci).'
  if (Test-Path -LiteralPath (Join-Path $root 'package-lock.json') -PathType Leaf) {
    Invoke-CheckedTool -Executable $tools.Npm -Arguments @('ci') -Description 'npm ci' -WorkingDirectory $root
  } else {
    Write-Output 'No package-lock.json yet; falling back to npm install to create one.'
    Invoke-CheckedTool -Executable $tools.Npm -Arguments @('install') -Description 'npm install' -WorkingDirectory $root
  }

  Write-Output 'Phase 3/3: verifying the installed dependencies are actually usable.'
  $electronCli = Join-Path $root 'node_modules\electron\cli.js'
  if (-not (Test-Path -LiteralPath $electronCli -PathType Leaf)) {
    throw "Missing dependency: node_modules/electron/cli.js was not created by npm ci/install."
  }
  $viteCli = Join-Path $root 'node_modules\.bin\vite.cmd'
  if (-not (Test-Path -LiteralPath $viteCli -PathType Leaf)) {
    throw "Missing dependency: node_modules/.bin/vite.cmd was not created by npm ci/install."
  }
  Invoke-CheckedTool -Executable $tools.Node -Arguments @((Join-Path $root 'scripts\ensure-electron-binary.mjs')) -Description 'ensure-electron-binary' -WorkingDirectory $root

  $evidencePath = Write-DependencyEvidence -Root $root -Tools $tools
  $timer.Stop()
  Write-Output "All dependencies ready in $([Math]::Round($timer.Elapsed.TotalSeconds, 1)) seconds. Pinned manifest: scripts/dependency-manifest.json. Runtime evidence: $evidencePath"
  exit 0
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
