[CmdletBinding()]
param([switch]$Silent)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'build-common.ps1')

$root = Get-RepositoryRoot -ScriptRoot $PSScriptRoot
$timer = [Diagnostics.Stopwatch]::StartNew()
Write-Output "Installer root: $root"
Write-Output 'Resolving Node.js 22 and npm from the declared project path.'
$tools = Resolve-NodeToolchain -Root $root
Write-Output "Node.js $($tools.Version) ready ($($tools.Source))."
Write-Output 'Building the runnable application before packaging.'
Invoke-ProjectBuild -Root $root -Tools $tools
Write-Output 'Packaging the unsigned Squirrel.Windows installer.'
$result = Invoke-ProjectInstaller -Root $root -Tools $tools
$timer.Stop()
Write-Output "Installer complete in $([Math]::Round($timer.Elapsed.TotalSeconds, 1)) seconds."
Write-Output "Setup.exe: $($result.Setup.FullName) ($($result.Setup.Length) bytes; $((Get-FileHash -LiteralPath $result.Setup.FullName -Algorithm SHA256).Hash.ToLowerInvariant()))"
Write-Output "RELEASES: $($result.Releases.FullName) ($($result.Releases.Length) bytes; $((Get-FileHash -LiteralPath $result.Releases.FullName -Algorithm SHA256).Hash.ToLowerInvariant()))"
Write-Output "Full nupkg: $($result.Nupkg.FullName) ($($result.Nupkg.Length) bytes; $((Get-FileHash -LiteralPath $result.Nupkg.FullName -Algorithm SHA256).Hash.ToLowerInvariant()))"
Write-Output "Manifest: $($result.Manifest)"
if ($result.Identity.Dirty) { Write-Warning 'The installer was built from a dirty checkout; the manifest records that fact.' }
