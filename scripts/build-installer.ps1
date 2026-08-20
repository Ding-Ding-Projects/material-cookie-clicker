[CmdletBinding()]
param(
  [switch]$Silent,
  [string]$ExpectedSourceCommit = $env:EXPECTED_SOURCE_COMMIT,
  [string]$EffectiveVersion = $env:EFFECTIVE_RELEASE_VERSION
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'build-common.ps1')

$root = Get-RepositoryRoot -ScriptRoot $PSScriptRoot
$source = Assert-CleanPinnedSource -Root $root -ExpectedCommit $ExpectedSourceCommit
$package = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$version = if ([string]::IsNullOrWhiteSpace($EffectiveVersion)) { [string]$package.version } else { $EffectiveVersion }
$version = Assert-StableReleaseVersion -Version $version
$timer = [Diagnostics.Stopwatch]::StartNew()
Write-Output "Installer root: $root"
Write-Output 'Resolving Node.js 22 and npm from the declared project path.'
$tools = Resolve-NodeToolchain -Root $root
Write-Output "Node.js $($tools.Version) ready ($($tools.Source))."
Write-Output 'Building the runnable application before packaging.'
Invoke-ProjectBuild -Root $root -Tools $tools
Write-LocalBuildManifest -Root $root -PinnedCommit $source.Commit | Out-Null
Write-Output 'Packaging the unsigned Squirrel.Windows installer.'
$result = Invoke-ProjectInstaller -Root $root -Tools $tools -PinnedCommit $source.Commit -EffectiveVersion $version
$timer.Stop()
Write-Output "Installer complete in $([Math]::Round($timer.Elapsed.TotalSeconds, 1)) seconds."
Write-Output "Setup.exe: $($result.Setup.FullName) ($($result.Setup.Length) bytes; $((Get-FileHash -LiteralPath $result.Setup.FullName -Algorithm SHA256).Hash.ToLowerInvariant()))"
Write-Output "RELEASES: $($result.Releases.FullName) ($($result.Releases.Length) bytes; $((Get-FileHash -LiteralPath $result.Releases.FullName -Algorithm SHA256).Hash.ToLowerInvariant()))"
Write-Output "Full nupkg: $($result.Nupkg.FullName) ($($result.Nupkg.Length) bytes; $((Get-FileHash -LiteralPath $result.Nupkg.FullName -Algorithm SHA256).Hash.ToLowerInvariant()))"
if ($result.DeltaPackages.Count -gt 0) {
  foreach ($delta in $result.DeltaPackages) { Write-Output "Delta nupkg: $($delta.FullName) ($($delta.Length) bytes; $((Get-FileHash -LiteralPath $delta.FullName -Algorithm SHA256).Hash.ToLowerInvariant()))" }
} else {
  Write-Output 'Delta nupkg: none generated; the full nupkg remains the update asset.'
}
Write-Output "Packaged application: $($result.AppExecutable.FullName)"
Write-Output "Effective version: $($result.Version)"
Write-Output "Icon proof: $($result.IconProof.Count) extracted small/standard PNG records under $((Join-Path (Split-Path -Parent $result.Manifest) 'icon-proof'))"
Write-Output "Build provenance: $($result.Provenance)"
Write-Output "Artifact receipt: $($result.ArtifactReceipt)"
Write-Output "SHA-256 evidence: $($result.Checksums.FullName) ($($result.Checksums.Length) bytes; $((Get-FileHash -LiteralPath $result.Checksums.FullName -Algorithm SHA256).Hash.ToLowerInvariant()))"
Write-Output "Manifest: $($result.Manifest)"
