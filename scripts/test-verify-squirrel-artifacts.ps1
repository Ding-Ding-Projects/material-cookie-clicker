$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

foreach ($manifest in @(
  (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1'),
  (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1')
)) {
  if (Test-Path -LiteralPath $manifest -PathType Leaf) { Import-Module -Name $manifest -Force -ErrorAction Stop }
}

$root = Join-Path ([IO.Path]::GetTempPath()) ('material-cookie-clicker-squirrel-verifier-' + [Guid]::NewGuid().ToString('N'))
$artifacts = Join-Path $root 'artifacts'
$packageRoot = Join-Path $root 'package'
New-Item -ItemType Directory -Path $artifacts,$packageRoot,(Join-Path $packageRoot 'lib/net45/resources') -Force | Out-Null

function Write-Provenance([string]$Path, [bool]$SignAndEdit = $false, [int]$SignerCount = 0) {
  $buildLog = Join-Path $root 'build.log'
  Set-Content -LiteralPath $buildLog -Value 'fixture build completed without signer process' -Encoding utf8
  $observed = @()
  if ($SignerCount -ne 0) { $observed = @([ordered]@{ pid = 5; name = 'signtool.exe' }) }
  $value = [ordered]@{
    version = 1
    sourceCommit = ('a' * 40)
    builtAt = [DateTimeOffset]::UtcNow.ToString('o')
    packagingCommand = 'build-installer.bat /s --version 1.2.3'
    cleanOutput = $true
    package = [ordered]@{ id = 'MaterialCookieClicker'; version = '1.2.3'; architecture = 'x64' }
    buildLog = [ordered]@{ path = 'build.log'; sha256 = (Get-FileHash -LiteralPath $buildLog -Algorithm SHA256).Hash.ToLowerInvariant() }
    signing = [ordered]@{
      inputsCleared = $true
      certificateAutoDiscoveryDisabled = $true
      processAuditComplete = $true
      signerInvocationCount = $SignerCount
      observedSignerInvocations = $observed
      controls = [ordered]@{ forceCodeSigning = $false; signExecutable = $false; signAndEditExecutable = $SignAndEdit }
    }
  }
  $value | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $Path -Encoding utf8
}

function Invoke-Verifier([string]$Provenance, [string]$Output, [string]$Version = '1.2.3') {
  & (Join-Path $PSScriptRoot 'verify-squirrel-artifacts.ps1') `
    -ArtifactDirectory $artifacts `
    -ProvenancePath $Provenance `
    -ExpectedCommit ('a' * 40) `
    -SetupFile 'MaterialCookieClicker-Setup.exe' `
    -ExpectedPackageId 'MaterialCookieClicker' `
    -ExpectedVersion $Version `
    -ExpectedArchitecture x64 `
    -RequiredPackageEntry @('lib/net45/Material Cookie Clicker.exe', 'lib/net45/resources/app.asar') `
    -OutputPath $Output | Out-Null
}

function Expect-Failure([scriptblock]$Action, [string]$Pattern, [string]$Label) {
  $failed = $false
  try { & $Action } catch { $failed = $_.Exception.Message -match $Pattern }
  if (-not $failed) { throw "$Label did not fail with $Pattern" }
}

try {
  $setup = Join-Path $artifacts 'MaterialCookieClicker-Setup.exe'
  Add-Type -TypeDefinition 'public static class Program { public static void Main() {} }' -OutputAssembly $setup
  if ((Get-AuthenticodeSignature -LiteralPath $setup).Status -ne 'NotSigned') { throw 'fixture compiler did not produce an unsigned executable' }
  @'
<?xml version="1.0"?>
<package><metadata><id>MaterialCookieClicker</id><version>1.2.3</version><authors>Test</authors><description>Fixture</description></metadata></package>
'@ | Set-Content -LiteralPath (Join-Path $packageRoot 'MaterialCookieClicker.nuspec') -Encoding utf8
  Set-Content -LiteralPath (Join-Path $packageRoot 'lib/net45/Material Cookie Clicker.exe') -Value 'fixture-executable' -Encoding utf8
  Set-Content -LiteralPath (Join-Path $packageRoot 'lib/net45/resources/app.asar') -Value 'fixture-asar' -Encoding utf8
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $nupkg = Join-Path $artifacts 'MaterialCookieClicker-1.2.3-full.nupkg'
  [IO.Compression.ZipFile]::CreateFromDirectory($packageRoot, $nupkg)
  $sha1 = (Get-FileHash -LiteralPath $nupkg -Algorithm SHA1).Hash.ToLowerInvariant()
  $size = (Get-Item -LiteralPath $nupkg).Length
  $validRelease = "$sha1 MaterialCookieClicker-1.2.3-full.nupkg $size"
  Set-Content -LiteralPath (Join-Path $artifacts 'RELEASES') -Value $validRelease -Encoding ascii
  $provenance = Join-Path $root 'provenance.json'
  Write-Provenance -Path $provenance
  Invoke-Verifier -Provenance $provenance -Output (Join-Path $root 'receipt.json')

  Set-Content -LiteralPath (Join-Path $artifacts 'RELEASES') -Value "$sha1 MaterialCookieClicker-1.2.3-full.nupkg 1" -Encoding ascii
  Expect-Failure { Invoke-Verifier -Provenance $provenance -Output (Join-Path $root 'bad-size.json') } 'size mismatch' 'RELEASES size regression'
  Set-Content -LiteralPath (Join-Path $artifacts 'RELEASES') -Value @($validRelease, $validRelease) -Encoding ascii
  Expect-Failure { Invoke-Verifier -Provenance $provenance -Output (Join-Path $root 'duplicate.json') } 'duplicate package row' 'duplicate RELEASES row regression'
  Set-Content -LiteralPath (Join-Path $artifacts 'RELEASES') -Value $validRelease -Encoding ascii
  Copy-Item -LiteralPath $nupkg -Destination (Join-Path $artifacts 'MaterialCookieClicker-1.2.3-delta.nupkg')
  Expect-Failure { Invoke-Verifier -Provenance $provenance -Output (Join-Path $root 'unindexed.json') } 'not indexed' 'unindexed package regression'
  Remove-Item -LiteralPath (Join-Path $artifacts 'MaterialCookieClicker-1.2.3-delta.nupkg')
  Copy-Item -LiteralPath $setup -Destination (Join-Path $artifacts 'OtherSetup.exe')
  Expect-Failure { Invoke-Verifier -Provenance $provenance -Output (Join-Path $root 'ambiguous.json') } 'exactly the declared setup' 'ambiguous setup regression'
  Remove-Item -LiteralPath (Join-Path $artifacts 'OtherSetup.exe')
  Write-Provenance -Path $provenance -SignAndEdit $true
  Expect-Failure { Invoke-Verifier -Provenance $provenance -Output (Join-Path $root 'sign-control.json') } 'signAndEditExecutable must be false' 'signing control regression'
  Write-Provenance -Path $provenance -SignerCount 1
  Expect-Failure { Invoke-Verifier -Provenance $provenance -Output (Join-Path $root 'signer.json') } 'signer invocation' 'signer process regression'
  Write-Provenance -Path $provenance
  Expect-Failure { Invoke-Verifier -Provenance $provenance -Output (Join-Path $root 'wrong-version.json') -Version '1.2.4' } 'package identity/version/architecture|full package version' 'package version regression'
  Write-Output 'PASS deterministic Squirrel artifact verifier red-green checks'
} finally {
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
