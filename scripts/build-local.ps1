[CmdletBinding()]
param([switch]$Silent, [string]$ExpectedSourceCommit = $env:EXPECTED_SOURCE_COMMIT)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'build-common.ps1')

$root = Get-RepositoryRoot -ScriptRoot $PSScriptRoot
$source = Assert-CleanPinnedSource -Root $root -ExpectedCommit $ExpectedSourceCommit
$timer = [Diagnostics.Stopwatch]::StartNew()
Write-Output "Build root: $root"
Write-Output 'Resolving Node.js 22 and npm from the declared project path.'
$tools = Resolve-NodeToolchain -Root $root
Write-Output "Node.js $($tools.Version) ready ($($tools.Source))."
Write-Output 'Installing the locked project dependencies.'
Invoke-ProjectBuild -Root $root -Tools $tools
$manifest = Write-LocalBuildManifest -Root $root -PinnedCommit $source.Commit
$timer.Stop()
Write-Output "Build complete in $([Math]::Round($timer.Elapsed.TotalSeconds, 1)) seconds. Pinned clean source commit: $($source.Commit). Manifest: $manifest"

if (-not $Silent) {
  $answer = Read-Host 'Build succeeded. Run the built app now? [y/N]'
  if ($answer -match '^(?i:y|yes)$') {
    Start-Process -FilePath $tools.Node -ArgumentList @('node_modules/electron/cli.js', '.') -WorkingDirectory $root | Out-Null
  }
}
