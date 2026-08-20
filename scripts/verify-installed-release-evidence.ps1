[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ExpectedCommit,
  [Parameter(Mandatory = $true)][string]$InstallerManifest,
  [Parameter(Mandatory = $true)][string]$CaptureEvidence,
  [Parameter(Mandatory = $true)][string]$RuntimeReceipt,
  [string]$CaptureInventory = (Join-Path $PSScriptRoot 'release-capture-inventory.json'),
  [Parameter(Mandatory = $true)][string]$Output
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'build-common.ps1')

if ($ExpectedCommit -notmatch '^[0-9a-f]{40}$') { throw 'ExpectedCommit must be a full lowercase Git commit SHA.' }
$manifestPath = (Resolve-Path -LiteralPath $InstallerManifest).Path
$capturePath = (Resolve-Path -LiteralPath $CaptureEvidence).Path
$runtimePath = (Resolve-Path -LiteralPath $RuntimeReceipt).Path
$inventoryPath = (Resolve-Path -LiteralPath $CaptureInventory).Path
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.schemaVersion -ne 'material-cookie-clicker.local-installer.v3') { throw 'The installer manifest is not the clean/pinned v3 contract.' }
if ($manifest.sourceCommit -ne $ExpectedCommit -or $manifest.sourceClean -ne $true -or $manifest.sourcePinned -ne $true) {
  throw 'The installer manifest does not prove the requested clean pinned source commit.'
}
if ($manifest.setupSignature -ne 'NotSigned' -or $manifest.applicationSignature -ne 'NotSigned') {
  throw 'The installer evidence must prove both executables are unsigned.'
}
if (@($manifest.iconProof).Count -ne 4) { throw 'The installer manifest must contain 16px and 32px icon extraction proof for Setup.exe and the application.' }

$root = Get-RepositoryRoot -ScriptRoot $PSScriptRoot
$tools = Resolve-NodeToolchain -Root $root
Invoke-CheckedTool -Executable $tools.Node -Arguments @(
  'scripts/validate-squirrel-runtime-receipt.mjs',
  '--input', $runtimePath
) -Description 'installed Squirrel runtime receipt validation' -WorkingDirectory $root
Invoke-CheckedTool -Executable $tools.Node -Arguments @(
  'scripts/validate-release-capture-evidence.mjs',
  '--inventory', $inventoryPath,
  '--evidence', $capturePath,
  '--commit', $ExpectedCommit
) -Description 'installed launch/update capture evidence validation' -WorkingDirectory $root

$runtime = Get-Content -LiteralPath $runtimePath -Raw | ConvertFrom-Json
if ($runtime.sourceCommit -ne $ExpectedCommit) { throw 'The runtime receipt does not prove the requested source commit.' }
if ($runtime.installation.candidateVersion -ne $manifest.packageVersion) { throw 'The runtime receipt candidate version does not match the installer manifest.' }
if ($runtime.artifactReceiptSha256 -ne $manifest.artifactReceipt.sha256) { throw 'The runtime receipt is not bound to the installer manifest artifact receipt.' }
$setupArtifact = @($manifest.artifacts | Where-Object { $_.name -eq $manifest.squirrel.setup })
if ($setupArtifact.Count -ne 1 -or $setupArtifact[0].sha256 -ne $runtime.installerSha256) { throw 'The runtime installer hash does not match the installer manifest.' }
if ($manifest.packagedApplication.sha256 -ne $runtime.installation.installedExecutableSha256) { throw 'The installed executable hash does not match the packaged application executable.' }

$captures = Get-Content -LiteralPath $capturePath -Raw | ConvertFrom-Json
$installedLaunch = @($captures.states | Where-Object { $_.id -eq 'installed-launch' })
$updateReady = @($captures.states | Where-Object { $_.id -eq 'update-ready' })
if ($installedLaunch.Count -ne 1 -or $installedLaunch[0].status -ne 'verified') { throw 'The installed-launch capture must be verified.' }
if ($updateReady.Count -ne 1 -or $updateReady[0].status -ne 'verified') { throw 'The update-ready capture must be verified.' }

$summary = [ordered]@{
  schemaVersion = 'material-cookie-clicker.installed-release-evidence.v1'
  sourceCommit = $ExpectedCommit
  installerManifest = $manifestPath
  captureEvidence = $capturePath
  runtimeReceipt = $runtimePath
  captureMethod = $captures.method
  installedLaunch = $installedLaunch[0]
  updateReady = $updateReady[0]
  iconProof = $manifest.iconProof
  squirrel = $manifest.squirrel
  installerSha256 = $runtime.installerSha256
  installedExecutableSha256 = $runtime.installation.installedExecutableSha256
  candidateVersion = $runtime.installation.candidateVersion
  targetVersion = $runtime.update.targetVersion
  verifiedAt = [DateTimeOffset]::UtcNow.ToString('o')
}
$outputPath = [IO.Path]::GetFullPath($Output)
$outputParent = Split-Path -Parent $outputPath
if ($outputParent) { New-Item -ItemType Directory -Path $outputParent -Force | Out-Null }
$summary | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $outputPath -Encoding UTF8
Write-Output "Installed release evidence verified for $ExpectedCommit. Summary: $outputPath"
