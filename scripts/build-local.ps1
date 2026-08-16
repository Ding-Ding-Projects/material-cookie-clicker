[CmdletBinding()]
param([switch]$Silent)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'build-common.ps1')

$root = Get-RepositoryRoot -ScriptRoot $PSScriptRoot
$timer = [Diagnostics.Stopwatch]::StartNew()
Write-Output "Build root: $root"
Write-Output 'Resolving Node.js 22 and npm from the declared project path.'
$tools = Resolve-NodeToolchain -Root $root
Write-Output "Node.js $($tools.Version) ready ($($tools.Source))."
Write-Output 'Installing the locked project dependencies.'
Invoke-ProjectBuild -Root $root -Tools $tools
$timer.Stop()
$identity = Get-SourceIdentity -Root $root
$commitText = if ($identity.Commit) { $identity.Commit } else { 'unavailable' }
Write-Output "Build complete in $([Math]::Round($timer.Elapsed.TotalSeconds, 1)) seconds. Source commit: $commitText; dirty checkout: $($identity.Dirty)."

if (-not $Silent) {
  $answer = Read-Host 'Build succeeded. Run the built app now? [y/N]'
  if ($answer -match '^(?i:y|yes)$') {
    Start-Process -FilePath $tools.Node -ArgumentList @('node_modules/electron/cli.js', '.') -WorkingDirectory $root | Out-Null
  }
}
