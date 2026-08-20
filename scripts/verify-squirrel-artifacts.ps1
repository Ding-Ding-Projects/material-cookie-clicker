[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ArtifactDirectory,
  [Parameter(Mandatory = $true)][string]$ProvenancePath,
  [Parameter(Mandatory = $true)][string]$ExpectedCommit,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$SetupFile,
  [Parameter(Mandatory = $true)][string]$ExpectedPackageId,
  [Parameter(Mandatory = $true)][string]$ExpectedVersion,
  [Parameter(Mandatory = $true)][ValidateSet('x64', 'arm64')][string]$ExpectedArchitecture,
  [Parameter(Mandatory = $true)][string[]]$RequiredPackageEntry,
  [switch]$RequireDelta
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

foreach ($manifest in @(
  (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1'),
  (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1')
)) {
  if (Test-Path -LiteralPath $manifest -PathType Leaf) { Import-Module -Name $manifest -Force -ErrorAction Stop }
}

function Fail([string]$Message) { throw "Squirrel artifact verification failed: $Message" }
function Require-Text($Value, [string]$Label) {
  if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { Fail "$Label is required" }
}
function Resolve-EvidencePath([string]$BaseFile, [string]$Value) {
  if ([IO.Path]::IsPathRooted($Value)) { return [IO.Path]::GetFullPath($Value) }
  return [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $BaseFile) $Value))
}

if ($ExpectedCommit -notmatch '^(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})$') { Fail 'ExpectedCommit must be a 40- or 64-character hex digest' }
if ($ExpectedVersion -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') { Fail 'ExpectedVersion must be a stable semantic version' }
Require-Text $ExpectedPackageId 'ExpectedPackageId'
if ($RequiredPackageEntry.Count -eq 0) { Fail 'at least one RequiredPackageEntry is required' }
$artifactRoot = (Resolve-Path -LiteralPath $ArtifactDirectory).Path
$provenanceFile = (Resolve-Path -LiteralPath $ProvenancePath).Path
$outputFile = [IO.Path]::GetFullPath($OutputPath)

try {
  $provenanceRaw = Get-Content -LiteralPath $provenanceFile -Raw
  $provenance = $provenanceRaw | ConvertFrom-Json
} catch { Fail 'provenance is not valid JSON' }
if ($provenance.version -ne 1) { Fail 'provenance version must be 1' }
if ([string]$provenance.sourceCommit -ne $ExpectedCommit) { Fail 'provenance sourceCommit does not match ExpectedCommit' }
$parsedBuiltAt = [DateTimeOffset]::MinValue
if (-not [DateTimeOffset]::TryParse([string]$provenance.builtAt, [ref]$parsedBuiltAt)) { Fail 'builtAt is not a timestamp' }
Require-Text $provenance.packagingCommand 'packagingCommand'
if ($provenance.cleanOutput -ne $true) { Fail 'cleanOutput must be true' }
if ([string]$provenance.package.id -ne $ExpectedPackageId -or [string]$provenance.package.version -ne $ExpectedVersion -or [string]$provenance.package.architecture -ne $ExpectedArchitecture) {
  Fail 'provenance package identity/version/architecture does not match the expected candidate'
}

if ($null -eq $provenance.buildLog) { Fail 'buildLog evidence is required' }
Require-Text $provenance.buildLog.path 'buildLog.path'
if ([string]$provenance.buildLog.sha256 -notmatch '^[0-9a-fA-F]{64}$') { Fail 'buildLog.sha256 is invalid' }
$buildLogPath = Resolve-EvidencePath $provenanceFile ([string]$provenance.buildLog.path)
if (-not (Test-Path -LiteralPath $buildLogPath -PathType Leaf)) { Fail 'build log does not exist' }
$buildLogHash = (Get-FileHash -LiteralPath $buildLogPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($buildLogHash -ne ([string]$provenance.buildLog.sha256).ToLowerInvariant()) { Fail 'build log SHA-256 does not match' }

$signing = $provenance.signing
if ($null -eq $signing) { Fail 'signing evidence is required' }
if ($signing.inputsCleared -ne $true) { Fail 'signing inputs were not proven cleared' }
if ($signing.certificateAutoDiscoveryDisabled -ne $true) { Fail 'certificate auto-discovery was not proven disabled' }
if ($signing.processAuditComplete -ne $true) { Fail 'signer process audit is incomplete' }
if ([int]$signing.signerInvocationCount -ne 0) { Fail 'a signer invocation was observed' }
if ($provenanceRaw -notmatch '"observedSignerInvocations"\s*:\s*\[\s*\]' -or @($signing.observedSignerInvocations).Count -ne 0) { Fail 'observedSignerInvocations must be an empty array' }
foreach ($name in @('forceCodeSigning', 'signExecutable', 'signAndEditExecutable')) {
  if ($null -eq $signing.controls.PSObject.Properties[$name] -or $signing.controls.$name -ne $false) { Fail "signing control $name must be false" }
}

$candidate = Join-Path $artifactRoot $SetupFile
if ([IO.Path]::GetFileName($SetupFile) -ne $SetupFile -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) { Fail 'the explicit setup basename does not exist' }
$setupMatches = @(Get-ChildItem -LiteralPath $artifactRoot -File -Filter '*Setup.exe')
if ($setupMatches.Count -ne 1 -or $setupMatches[0].Name -cne $SetupFile) { Fail 'the artifact directory must contain exactly the declared setup executable' }
$setup = Get-Item -LiteralPath $candidate
$setupBytes = [IO.File]::ReadAllBytes($setup.FullName)
if ($setupBytes.Length -lt 2 -or $setupBytes[0] -ne 0x4d -or $setupBytes[1] -ne 0x5a) { Fail 'setup does not have a PE MZ signature' }
$signature = Get-AuthenticodeSignature -LiteralPath $setup.FullName
if ([string]$signature.Status -ne 'NotSigned') { Fail "setup signature status is '$($signature.Status)', expected NotSigned" }

$releasesPath = Join-Path $artifactRoot 'RELEASES'
if (-not (Test-Path -LiteralPath $releasesPath -PathType Leaf)) { Fail 'RELEASES is missing' }
$lines = @(Get-Content -LiteralPath $releasesPath | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
if ($lines.Count -eq 0) { Fail 'RELEASES contains no package records' }
if ($lines.Count -gt 10000) { Fail 'RELEASES exceeds the 10000-row safety bound' }
if (@($lines | Where-Object { $_.Length -gt 4096 }).Count -gt 0) { Fail 'RELEASES contains an oversized row' }

$records = @()
$indexed = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($line in $lines) {
  if ($line -notmatch '^(?<sha1>[0-9a-fA-F]{40})\s+(?<file>\S+)\s+(?<size>[0-9]+)$') { Fail 'malformed RELEASES row' }
  $fileName = [string]$Matches.file
  if ([IO.Path]::GetFileName($fileName) -ne $fileName) { Fail 'RELEASES contains a non-basename package path' }
  if (-not $indexed.Add($fileName)) { Fail "RELEASES contains a duplicate package row: $fileName" }
  $packagePath = Join-Path $artifactRoot $fileName
  if (-not (Test-Path -LiteralPath $packagePath -PathType Leaf)) { Fail "RELEASES references a missing package: $fileName" }
  $item = Get-Item -LiteralPath $packagePath
  if ($item.Length -ne [long]$Matches.size) { Fail "size mismatch for $fileName" }
  $sha1 = (Get-FileHash -LiteralPath $packagePath -Algorithm SHA1).Hash.ToLowerInvariant()
  if ($sha1 -ne ([string]$Matches.sha1).ToLowerInvariant()) { Fail "SHA-1 mismatch for $fileName" }
  $records += [pscustomobject]@{
    name = $fileName
    size = $item.Length
    sha1 = $sha1
    sha256 = (Get-FileHash -LiteralPath $packagePath -Algorithm SHA256).Hash.ToLowerInvariant()
    kind = if ($fileName -match '-delta\.nupkg$') { 'delta' } elseif ($fileName -match '-full\.nupkg$') { 'full' } else { 'other' }
  }
}

$packages = @(Get-ChildItem -LiteralPath $artifactRoot -Filter '*.nupkg' -File)
foreach ($package in $packages) {
  if (-not $indexed.Contains($package.Name)) { Fail "package is not indexed by RELEASES: $($package.Name)" }
}
$fullCount = @($records | Where-Object kind -eq 'full').Count
$deltaCount = @($records | Where-Object kind -eq 'delta').Count
if ($fullCount -ne 1) { Fail 'a clean candidate must contain exactly one full .nupkg' }
if ($RequireDelta -and $deltaCount -lt 1) { Fail 'a delta .nupkg is required but none was generated' }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$fullPackage = $records | Where-Object kind -eq 'full' | Select-Object -First 1
$archivePath = Join-Path $artifactRoot $fullPackage.name
$archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  $nuspecEntries = @($archive.Entries | Where-Object { $_.FullName -match '[^/]+\.nuspec$' })
  if ($nuspecEntries.Count -ne 1) { Fail 'full package must contain exactly one .nuspec' }
  $reader = [IO.StreamReader]::new($nuspecEntries[0].Open())
  try { [xml]$nuspec = $reader.ReadToEnd() } finally { $reader.Dispose() }
  $idNode = $nuspec.SelectSingleNode('/*[local-name()="package"]/*[local-name()="metadata"]/*[local-name()="id"]')
  $versionNode = $nuspec.SelectSingleNode('/*[local-name()="package"]/*[local-name()="metadata"]/*[local-name()="version"]')
  if ($null -eq $idNode -or $idNode.InnerText -ne $ExpectedPackageId) { Fail 'full package identity does not match' }
  if ($null -eq $versionNode -or $versionNode.InnerText -ne $ExpectedVersion) { Fail 'full package version does not match' }
  $entryNames = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
  foreach ($required in $RequiredPackageEntry) {
    if ([string]::IsNullOrWhiteSpace($required)) { Fail 'RequiredPackageEntry cannot be empty' }
    $normalizedRequired = $required.Replace('\', '/')
    if (@($entryNames | Where-Object { $_ -like $normalizedRequired }).Count -eq 0) { Fail "full package is missing required entry pattern: $required" }
  }
} finally { $archive.Dispose() }

$result = [ordered]@{
  version = 1
  valid = $true
  sourceCommit = $ExpectedCommit
  packageId = $ExpectedPackageId
  packageVersion = $ExpectedVersion
  architecture = $ExpectedArchitecture
  artifactDirectory = $artifactRoot
  setup = [ordered]@{ name = $setup.Name; size = $setup.Length; sha256 = (Get-FileHash -LiteralPath $setup.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); authenticodeStatus = [string]$signature.Status }
  releasesSha256 = (Get-FileHash -LiteralPath $releasesPath -Algorithm SHA256).Hash.ToLowerInvariant()
  fullPackageCount = $fullCount
  deltaPackageCount = $deltaCount
  packages = @($records)
  signerInvocationCount = 0
  buildLogSha256 = $buildLogHash
}

$parent = Split-Path -Parent $outputFile
if (-not $parent -or -not (Test-Path -LiteralPath $parent -PathType Container)) { Fail 'OutputPath parent must already exist' }
if (Test-Path -LiteralPath $outputFile) { Fail 'OutputPath already exists' }
$temporary = Join-Path $parent ('.squirrel-receipt-' + [Guid]::NewGuid().ToString('N') + '.json')
try {
  $result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temporary -Encoding utf8
  Move-Item -LiteralPath $temporary -Destination $outputFile
  $null = Get-Content -LiteralPath $outputFile -Raw | ConvertFrom-Json
} finally {
  if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
}
Write-Output "Verified unsigned Squirrel artifacts for commit $ExpectedCommit"
Write-Output "Receipt: $outputFile"
