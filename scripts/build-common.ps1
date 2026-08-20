$ErrorActionPreference = 'Stop'

# Windows PowerShell 5.1 (the "powershell.exe" this script always runs under)
# can inherit a PSModulePath from a pwsh (7+) ancestor process — e.g. a pwsh
# session running `& .\build.bat`, which shells out to cmd.exe, which
# launches powershell.exe -File. pwsh lists its own Core-edition module
# directory ahead of the real System32 WindowsPowerShell modules directory,
# so an unqualified `Import-Module Microsoft.PowerShell.Utility` silently
# resolves the incompatible Core-edition manifest (version 7.0.0.0) instead
# of the real one (version 3.1.0.0), and every cmdlet that module normally
# autoloads — including Get-FileHash — fails with a bare "term ... is not
# recognized" error. Force-import the real module by its exact System32 path
# so this holds regardless of how PSModulePath was inherited.
$systemUtilityModule = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1'
if (Test-Path -LiteralPath $systemUtilityModule -PathType Leaf) {
  Import-Module -Name $systemUtilityModule -Force -ErrorAction SilentlyContinue
}

# Import the Windows PowerShell Security module from its System32 manifest too.
# The installer is deliberately launched by powershell.exe, but a pwsh parent
# can still prepend Core-edition module paths to PSModulePath.  In that state
# Get-AuthenticodeSignature is discoverable by name while its auto-import can
# resolve an incompatible module and fail.  Pinning the inbox manifest keeps
# the unsigned-artifact check reliable without invoking any signing capability.
$systemSecurityModule = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1'
if (Test-Path -LiteralPath $systemSecurityModule -PathType Leaf) {
  Import-Module -Name $systemSecurityModule -Force -ErrorAction SilentlyContinue
}

function Get-RepositoryRoot {
  param([Parameter(Mandatory = $true)][string]$ScriptRoot)
  $root = (Resolve-Path -LiteralPath (Join-Path $ScriptRoot '..')).Path
  if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json') -PathType Leaf)) {
    throw "The repository root does not contain package.json: $root"
  }
  return $root
}

function Refresh-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = (($machinePath, $userPath, $env:Path) | Where-Object { $_ } | Select-Object -Unique) -join [IO.Path]::PathSeparator
}

function Get-NodeVersion {
  param([Parameter(Mandatory = $true)][string]$Executable)
  $output = @(& $Executable '--version' 2>&1)
  $exitCode = $LASTEXITCODE
  $line = if ($output.Count -gt 0) { ([string]$output[0]).Trim() } else { '' }
  if ($exitCode -ne 0 -or $line -notmatch '^v(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)') {
    throw "The Node executable did not report a usable semantic version: $line"
  }
  return [pscustomobject]@{ Text = $line; Major = [int]$Matches.major; Minor = [int]$Matches.minor; Patch = [int]$Matches.patch }
}

function Find-UsableNode {
  Refresh-ProcessPath
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $command) { return $null }
  $version = Get-NodeVersion -Executable $command.Source
  if ($version.Major -ne 22) { return $null }
  $npm = Join-Path (Split-Path -Parent $command.Source) 'npm.cmd'
  $npx = Join-Path (Split-Path -Parent $command.Source) 'npx.cmd'
  if (-not (Test-Path -LiteralPath $npm -PathType Leaf) -or -not (Test-Path -LiteralPath $npx -PathType Leaf)) { return $null }
  return [pscustomobject]@{ Node = $command.Source; Npm = $npm; Npx = $npx; Version = $version.Text; Source = 'existing' }
}

function Resolve-NodeToolchain {
  param([Parameter(Mandatory = $true)][string]$Root)
  $existing = Find-UsableNode
  if ($existing) { return $existing }

  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if ($winget) {
    Write-Output 'Node.js 22 was not ready; trying a user-scoped winget installation.'
    & $winget.Source install --id OpenJS.NodeJS.LTS --exact --scope user --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -eq 0) {
      $installed = Find-UsableNode
      if ($installed) { return $installed }
    }
    Write-Output 'The user-scoped winget route did not expose Node.js 22; using the verified portable route.'
  }

  $version = '22.14.0'
  $toolRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'MaterialCookieClicker\toolchain'
  $portableRoot = Join-Path $toolRoot "node-v$version-win-x64"
  $node = Join-Path $portableRoot 'node.exe'
  $npm = Join-Path $portableRoot 'npm.cmd'
  $npx = Join-Path $portableRoot 'npx.cmd'
  if (-not (Test-Path -LiteralPath $node -PathType Leaf)) {
    New-Item -ItemType Directory -Path $toolRoot -Force | Out-Null
    $archive = Join-Path $toolRoot "node-v$version-win-x64.zip"
    $checksums = Join-Path $toolRoot "node-v$version-SHASUMS256.txt"
    $base = "https://nodejs.org/dist/v$version"
    Invoke-WebRequest -UseBasicParsing -Uri "$base/node-v$version-win-x64.zip" -OutFile $archive
    Invoke-WebRequest -UseBasicParsing -Uri "$base/SHASUMS256.txt" -OutFile $checksums
    $line = Select-String -LiteralPath $checksums -Pattern "node-v$version-win-x64\.zip\s*$" | Select-Object -First 1
    if (-not $line) { throw 'Node.js SHA-256 manifest did not contain the pinned Windows archive.' }
    $expected = (($line.Line -split '\s+')[0]).ToLowerInvariant()
    $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { throw "Node.js archive SHA-256 mismatch: expected $expected, received $actual." }
    $extractRoot = Join-Path $toolRoot 'extract'
    if (Test-Path -LiteralPath $extractRoot) { Remove-Item -LiteralPath $extractRoot -Recurse -Force }
    Expand-Archive -LiteralPath $archive -DestinationPath $extractRoot -Force
    $extracted = Join-Path $extractRoot "node-v$version-win-x64"
    if (-not (Test-Path -LiteralPath (Join-Path $extracted 'node.exe') -PathType Leaf)) { throw 'The verified Node.js archive did not contain its expected node.exe.' }
    if (Test-Path -LiteralPath $portableRoot) { Remove-Item -LiteralPath $portableRoot -Recurse -Force }
    Move-Item -LiteralPath $extracted -Destination $portableRoot
    Remove-Item -LiteralPath $extractRoot -Recurse -Force
    Remove-Item -LiteralPath $archive, $checksums -Force
  }
  if (-not (Test-Path -LiteralPath $npm -PathType Leaf) -or -not (Test-Path -LiteralPath $npx -PathType Leaf)) {
    throw "The portable Node.js toolchain is incomplete at $portableRoot."
  }
  $env:Path = "$portableRoot$([IO.Path]::PathSeparator)$env:Path"
  $resolved = Get-NodeVersion -Executable $node
  if ($resolved.Major -ne 22) { throw "The portable Node.js toolchain reported an unexpected version: $($resolved.Text)" }
  return [pscustomobject]@{ Node = $node; Npm = $npm; Npx = $npx; Version = $resolved.Text; Source = 'portable' }
}

function Invoke-CheckedTool {
  param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$Description,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory
  )
  & $Executable @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Description failed with exit code $LASTEXITCODE." }
}

function Remove-GeneratedDirectory {
  param([Parameter(Mandatory = $true)][string]$Root, [Parameter(Mandatory = $true)][string]$Name)
  $rootFull = ([IO.Path]::GetFullPath($Root)).TrimEnd('\') + '\'
  $target = [IO.Path]::GetFullPath((Join-Path $Root $Name))
  if (-not $target.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) { throw "Refusing to remove a generated path outside the checkout: $target" }
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
}

function Get-SourceIdentity {
  param([Parameter(Mandatory = $true)][string]$Root)
  $commitOutput = @(& git -C $Root rev-parse HEAD 2>$null)
  $commitExitCode = $LASTEXITCODE
  $commit = if ($commitOutput.Count -gt 0) { ([string]$commitOutput[0]).Trim() } else { '' }
  if ($commitExitCode -ne 0 -or $commit -notmatch '^[0-9a-f]{40}$') { $commit = $null }
  $statusOutput = @(& git -C $Root status --porcelain 2>$null)
  $dirty = [bool](($statusOutput -join "`n").Trim())
  return [pscustomobject]@{ Commit = $commit; Dirty = $dirty }
}

function Assert-CleanPinnedSource {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [string]$ExpectedCommit
  )
  $identity = Get-SourceIdentity -Root $Root
  if (-not $identity.Commit) { throw 'The build source is not a readable Git commit.' }
  if ($identity.Dirty) { throw 'The build source is dirty. Commit or preserve every intended change before building release evidence.' }
  if ($ExpectedCommit) {
    $normalized = $ExpectedCommit.Trim().ToLowerInvariant()
    if ($normalized -notmatch '^[0-9a-f]{40}$') { throw 'EXPECTED_SOURCE_COMMIT must be a full lowercase Git commit SHA.' }
    if ($identity.Commit -ne $normalized) { throw "The build source is $($identity.Commit), expected pinned commit $normalized." }
  }
  return [pscustomobject]@{ Commit = $identity.Commit; Dirty = $false }
}

function Assert-SourceUnchanged {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$PinnedCommit
  )
  $identity = Get-SourceIdentity -Root $Root
  if ($identity.Dirty) { throw 'The checkout became dirty while the pinned build was running.' }
  if ($identity.Commit -ne $PinnedCommit) { throw "The checkout moved from pinned commit $PinnedCommit to $($identity.Commit) while the build was running." }
  return $identity
}

function Get-ArtifactRecord {
  param(
    [Parameter(Mandatory = $true)][IO.FileInfo]$File,
    [Parameter(Mandatory = $true)][string]$Root
  )
  $rootPrefix = ([IO.Path]::GetFullPath($Root)).TrimEnd('\') + '\'
  if (-not $File.FullName.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Artifact escaped the checkout: $($File.FullName)" }
  $relative = $File.FullName.Substring($rootPrefix.Length).Replace('\', '/')
  return [ordered]@{
    name = $File.Name
    path = $relative
    bytes = $File.Length
    sha256 = (Get-FileHash -LiteralPath $File.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  }
}

function Write-LocalBuildManifest {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$PinnedCommit
  )
  Assert-SourceUnchanged -Root $Root -PinnedCommit $PinnedCommit | Out-Null
  $files = @(
    Get-Item -LiteralPath (Join-Path $Root 'dist\renderer\index.html')
    Get-Item -LiteralPath (Join-Path $Root 'dist\main\main.js')
    Get-Item -LiteralPath (Join-Path $Root 'dist\preload\index.cjs')
  )
  $manifest = [ordered]@{
    schemaVersion = 'material-cookie-clicker.local-build.v2'
    sourceCommit = $PinnedCommit
    sourceClean = $true
    sourcePinned = $true
    generatedAt = [DateTimeOffset]::UtcNow.ToString('o')
    artifacts = @($files | ForEach-Object { Get-ArtifactRecord -File $_ -Root $Root })
  }
  $manifestPath = Join-Path $Root 'dist\local-build-manifest.json'
  $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
  return $manifestPath
}

function Invoke-ProjectBuild {
  param([Parameter(Mandatory = $true)][string]$Root, [Parameter(Mandatory = $true)]$Tools)
  if (-not (Test-Path -LiteralPath (Join-Path $Root 'package-lock.json') -PathType Leaf)) { throw 'package-lock.json is required for a reproducible build.' }
  Remove-GeneratedDirectory -Root $Root -Name 'dist'
  Invoke-CheckedTool -Executable $Tools.Npm -Arguments @('ci') -Description 'npm ci' -WorkingDirectory $Root
  Invoke-CheckedTool -Executable $Tools.Node -Arguments @('scripts/generate-app-icon.mjs', '--check') -Description 'brand derivative verification' -WorkingDirectory $Root
  Invoke-CheckedTool -Executable $Tools.Npm -Arguments @('run', 'build') -Description 'npm run build' -WorkingDirectory $Root
  foreach ($relative in @('dist/renderer/index.html', 'dist/main/main.js', 'dist/preload/index.cjs')) {
    if (-not (Test-Path -LiteralPath (Join-Path $Root $relative) -PathType Leaf)) { throw "The build did not produce $relative." }
  }
}

function Assert-StableReleaseVersion {
  param([Parameter(Mandatory = $true)][string]$Version)
  if ($Version -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$') {
    throw "Release version must be a stable semantic version, received '$Version'."
  }
  return $Version
}

function Get-ElectronBuilderArguments {
  param([Parameter(Mandatory = $true)][string]$EffectiveVersion)
  $version = Assert-StableReleaseVersion -Version $EffectiveVersion
  return @('electron-builder', '--win', 'squirrel', '--publish', 'never', "--config.extraMetadata.version=$version")
}

function Test-ProcessDescendsFrom {
  param([Parameter(Mandatory = $true)]$ProcessRecord, [Parameter(Mandatory = $true)][hashtable]$ByPid, [Parameter(Mandatory = $true)][int]$RootPid)
  $cursor = [int]$ProcessRecord.ProcessId
  $seen = [Collections.Generic.HashSet[int]]::new()
  for ($depth = 0; $depth -lt 64; $depth += 1) {
    if ($cursor -eq $RootPid) { return $true }
    if (-not $seen.Add($cursor) -or -not $ByPid.ContainsKey($cursor)) { return $false }
    $cursor = [int]$ByPid[$cursor].ParentProcessId
    if ($cursor -le 0) { return $false }
  }
  return $false
}

function Invoke-SquirrelPackagingWithAudit {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)]$Tools,
    [Parameter(Mandatory = $true)][string[]]$BuilderArguments,
    [Parameter(Mandatory = $true)][string]$LogPath
  )
  $signingInputs = @('CSC_LINK', 'CSC_KEY_PASSWORD', 'WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD', 'CSC_NAME')
  $saved = @{}
  foreach ($name in $signingInputs + @('CSC_IDENTITY_AUTO_DISCOVERY')) {
    $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
  }
  foreach ($name in $signingInputs) { Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue }
  $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'

  $temporaryRoot = Join-Path ([IO.Path]::GetTempPath()) ('material-cookie-clicker-packaging-' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $temporaryRoot -Force | Out-Null
  $stdoutPath = Join-Path $temporaryRoot 'stdout.log'
  $stderrPath = Join-Path $temporaryRoot 'stderr.log'
  $observedSigners = [Collections.Generic.List[object]]::new()
  $observedSignerPids = [Collections.Generic.HashSet[int]]::new()
  $processAuditComplete = $false
  $exitCode = $null
  try {
    $npxCli = Join-Path (Split-Path -Parent $Tools.Node) 'node_modules\npm\bin\npx-cli.js'
    if (-not (Test-Path -LiteralPath $npxCli -PathType Leaf)) { throw "The Node toolchain does not contain npx-cli.js: $npxCli" }
    $nodeArguments = @($npxCli) + $BuilderArguments
    if (@($nodeArguments | Where-Object { $_ -match '"' }).Count -gt 0) { throw 'Packaging arguments may not contain quotation marks.' }
    $argumentLine = (($nodeArguments | ForEach-Object { '"' + $_ + '"' }) -join ' ')
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $Tools.Node
    $startInfo.Arguments = $argumentLine
    $startInfo.WorkingDirectory = $Root
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (-not $process.Start()) { throw 'electron-builder packaging process did not start.' }
    $stdoutTask = $process.StandardOutput.ReadToEndAsync()
    $stderrTask = $process.StandardError.ReadToEndAsync()
    do {
      $process.Refresh()
      $snapshot = @(Get-CimInstance Win32_Process -ErrorAction Stop)
      $byPid = @{}
      foreach ($item in $snapshot) { $byPid[[int]$item.ProcessId] = $item }
      foreach ($item in $snapshot) {
        $name = [string]$item.Name
        $commandLine = [string]$item.CommandLine
        $looksLikeSigner = $name -match '^(?i:signtool|osslsigncode|azuresigntool|codesign)(\.exe)?$' -or $commandLine -match '(?i)(^|[\\/\s])(signtool|osslsigncode|azuresigntool|codesign)(\.exe)?([\s"'']|$)'
        if ($looksLikeSigner -and (Test-ProcessDescendsFrom -ProcessRecord $item -ByPid $byPid -RootPid $process.Id) -and $observedSignerPids.Add([int]$item.ProcessId)) {
          $observedSigners.Add([ordered]@{ pid = [int]$item.ProcessId; parentPid = [int]$item.ParentProcessId; name = $name })
        }
      }
      if (-not $process.HasExited) { Start-Sleep -Milliseconds 50 }
    } while (-not $process.HasExited)
    $process.WaitForExit()
    $stdoutTask.GetAwaiter().GetResult() | Set-Content -LiteralPath $stdoutPath -Encoding UTF8
    $stderrTask.GetAwaiter().GetResult() | Set-Content -LiteralPath $stderrPath -Encoding UTF8
    $exitCode = [int]$process.ExitCode
    $processAuditComplete = $true
  } finally {
    $logParent = Split-Path -Parent $LogPath
    if ($logParent) { New-Item -ItemType Directory -Path $logParent -Force | Out-Null }
    $logParts = @('=== stdout ===')
    if (Test-Path -LiteralPath $stdoutPath) { $logParts += Get-Content -LiteralPath $stdoutPath }
    $logParts += '=== stderr ==='
    if (Test-Path -LiteralPath $stderrPath) { $logParts += Get-Content -LiteralPath $stderrPath }
    $logParts | Set-Content -LiteralPath $LogPath -Encoding UTF8
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
    foreach ($name in $saved.Keys) {
      if ($null -eq $saved[$name]) { Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue }
      else { [Environment]::SetEnvironmentVariable($name, [string]$saved[$name], 'Process') }
    }
  }
  if (-not $processAuditComplete) { throw 'The signer-process audit did not complete.' }
  if ($observedSigners.Count -gt 0) { throw "Code signing is prohibited, but $($observedSigners.Count) signer process invocation(s) were observed." }
  if ($exitCode -ne 0) { throw "electron-builder Squirrel.Windows packaging failed with exit code $exitCode. Build log: $LogPath" }
  return [ordered]@{
    inputsCleared = $true
    certificateAutoDiscoveryDisabled = $true
    processAuditComplete = $true
    signerInvocationCount = 0
    observedSignerInvocations = @()
  }
}

function Write-InstallerChecksumFile {
  param([Parameter(Mandatory = $true)][IO.FileInfo[]]$Files, [Parameter(Mandatory = $true)][string]$OutputPath)
  $names = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  $lines = foreach ($file in ($Files | Sort-Object Name)) {
    if (-not $names.Add($file.Name)) { throw "Checksum evidence contains a duplicate basename: $($file.Name)" }
    "$(($file | Get-FileHash -Algorithm SHA256).Hash.ToLowerInvariant())  $($file.Name)"
  }
  $lines | Set-Content -LiteralPath $OutputPath -Encoding ASCII
  return Get-Item -LiteralPath $OutputPath
}

function Assert-UnsignedSquirrelConfiguration {
  param([Parameter(Mandatory = $true)][string]$Root)
  $package = Get-Content -LiteralPath (Join-Path $Root 'package.json') -Raw | ConvertFrom-Json
  foreach ($control in @('forceCodeSigning', 'signExecutable', 'signAndEditExecutable')) {
    if ($null -eq $package.build.win.PSObject.Properties[$control] -or $package.build.win.$control -ne $false) {
      throw "The package configuration must set build.win.$control explicitly to false."
    }
  }
  $targets = @($package.build.win.target | ForEach-Object { if ($_ -is [string]) { $_ } else { $_.target } })
  if ($targets -notcontains 'squirrel') { throw 'The installer path must use the Squirrel.Windows target.' }
  $iconUrl = [string]$package.build.squirrelWindows.iconUrl
  if ($iconUrl -notmatch '^https://raw\.githubusercontent\.com/Ding-Ding-Projects/material-cookie-clicker/(?<commit>[0-9a-f]{40})/assets/material-cookie-clicker\.ico$') {
    throw 'Squirrel iconUrl must be an immutable full-commit raw URL, never main, latest, or another mutable ref.'
  }
  $anchorCommit = $Matches.commit
  $currentBlob = @(& git -C $Root rev-parse 'HEAD:assets/material-cookie-clicker.ico' 2>$null)
  $anchorBlob = @(& git -C $Root rev-parse "$anchorCommit`:assets/material-cookie-clicker.ico" 2>$null)
  if ($currentBlob.Count -ne 1 -or $anchorBlob.Count -ne 1 -or ([string]$currentBlob[0]).Trim() -ne ([string]$anchorBlob[0]).Trim()) {
    throw 'Squirrel iconUrl does not resolve to the exact committed ICO bytes used by this candidate.'
  }
  return [ordered]@{
    package = $package
    iconAnchorCommit = $anchorCommit
    iconBlob = ([string]$currentBlob[0]).Trim()
  }
}

function Get-BitmapPixelHash {
  param([Parameter(Mandatory = $true)][System.Drawing.Bitmap]$Bitmap)
  $bytes = New-Object byte[] ($Bitmap.Width * $Bitmap.Height * 4)
  $index = 0
  for ($y = 0; $y -lt $Bitmap.Height; $y += 1) {
    for ($x = 0; $x -lt $Bitmap.Width; $x += 1) {
      $pixel = $Bitmap.GetPixel($x, $y)
      $bytes[$index] = $pixel.R; $index += 1
      $bytes[$index] = $pixel.G; $index += 1
      $bytes[$index] = $pixel.B; $index += 1
      $bytes[$index] = $pixel.A; $index += 1
    }
  }
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose() }
}

function Export-ExecutableIconProof {
  param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [Parameter(Mandatory = $true)][string]$SourceIcon,
    [Parameter(Mandatory = $true)][string]$OutputRoot,
    [Parameter(Mandatory = $true)][string]$Label
  )
  # GitHub issue 3 diagnostic note (scripts/diagnose-icon-fidelity.ps1 confirms this against the
  # committed ICO): assets\material-cookie-clicker.ico stores its 256x256 directory entry as an
  # uncompressed BMP/DIB (270,376 of the file's 285,478 bytes -- ~94.7% of the whole file), where
  # Windows Vista and later expect PNG compression for icon directory entries >= 256px. All four
  # entries (16/32/48/256) are otherwise real 32bpp entries with an alpha channel, so
  # Icon::new($SourceIcon,16,16) below genuinely selects a real 16px resource rather than
  # rescaling anything -- the parse itself is unaffected (verified: Icon constructor and
  # Icon(file,16,16)/Icon(file,32,32) all parse this file without error). The mismatch this
  # function throws on is believed to originate on the OTHER side of the comparison: the
  # executable path below extracts a compiled Win32 HICON via PrivateExtractIcons and
  # recomposites it through Icon.FromHandle(...).Clone().ToBitmap(), which can alter bytes for
  # partially-transparent pixels during the HICON mask round-trip even when the source .ico bytes
  # for that resource are untouched. That theory could not be confirmed empirically in this pass
  # because no built Setup.exe/app executable exists locally to extract from; run
  # scripts/diagnose-icon-fidelity.ps1 -Executable <path> against a real build to get a
  # per-pixel, per-channel verdict before changing the assertion below.
  if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { throw "Icon source executable does not exist: $Executable" }
  if (-not (Test-Path -LiteralPath $SourceIcon -PathType Leaf)) { throw "Committed icon source does not exist: $SourceIcon" }
  if ($Label -notmatch '^[a-z0-9-]+$') { throw 'Icon proof labels may contain only lowercase letters, digits, and hyphens.' }
  Add-Type -AssemblyName System.Drawing
  if (-not ('MaterialCookieClicker.IconNative' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace MaterialCookieClicker {
  public static class IconNative {
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern uint PrivateExtractIcons(string file, int index, int cx, int cy, IntPtr[] handles, uint[] ids, uint count, uint flags);
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool DestroyIcon(IntPtr handle);
  }
}
'@
  }
  New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
  $records = @()
  foreach ($size in @(16, 32)) {
    $source = [System.Drawing.Icon]::new($SourceIcon, $size, $size)
    try {
      $sourceBitmap = $source.ToBitmap()
      try { $sourcePixelHash = Get-BitmapPixelHash -Bitmap $sourceBitmap }
      finally { $sourceBitmap.Dispose() }
    } finally { $source.Dispose() }
    $handles = New-Object IntPtr[] 1
    $ids = New-Object UInt32[] 1
    $count = [MaterialCookieClicker.IconNative]::PrivateExtractIcons($Executable, 0, $size, $size, $handles, $ids, 1, 0)
    if ($count -ne 1 -or $handles[0] -eq [IntPtr]::Zero) { throw "Could not extract the ${size}px icon from $Executable." }
    try {
      $icon = [System.Drawing.Icon]::FromHandle($handles[0]).Clone()
      try {
        $bitmap = $icon.ToBitmap()
        try {
          if ($bitmap.Width -ne $size -or $bitmap.Height -ne $size) { throw "The extracted $Label icon is $($bitmap.Width)x$($bitmap.Height), expected ${size}x${size}." }
          $colors = New-Object 'System.Collections.Generic.HashSet[string]'
          for ($y = 0; $y -lt $bitmap.Height; $y += [Math]::Max(1, [Math]::Floor($bitmap.Height / 8))) {
            for ($x = 0; $x -lt $bitmap.Width; $x += [Math]::Max(1, [Math]::Floor($bitmap.Width / 8))) {
              $pixel = $bitmap.GetPixel($x, $y)
              if ($pixel.A -gt 0) { $colors.Add("$($pixel.R),$($pixel.G),$($pixel.B)") | Out-Null }
            }
          }
          if ($colors.Count -lt 3) { throw "The extracted $Label ${size}px icon is blank or monochrome." }
          $pixelHash = Get-BitmapPixelHash -Bitmap $bitmap
          if ($pixelHash -ne $sourcePixelHash) { throw "The extracted $Label ${size}px icon does not match the committed ICO pixels." }
          $output = Join-Path $OutputRoot "$Label-$size.png"
          $bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
          $file = Get-Item -LiteralPath $output
          $records += [ordered]@{
            executable = [IO.Path]::GetFileName($Executable)
            label = $Label
            size = $size
            path = $file.Name
            bytes = $file.Length
            sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
            pixelSha256 = $pixelHash
            sourcePixelSha256 = $sourcePixelHash
            sourceIcoSha256 = (Get-FileHash -LiteralPath $SourceIcon -Algorithm SHA256).Hash.ToLowerInvariant()
          }
        } finally { $bitmap.Dispose() }
      } finally { $icon.Dispose() }
    } finally { [MaterialCookieClicker.IconNative]::DestroyIcon($handles[0]) | Out-Null }
  }
  return $records
}

function Invoke-ProjectInstaller {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)]$Tools,
    [Parameter(Mandatory = $true)][string]$PinnedCommit,
    [Parameter(Mandatory = $true)][string]$EffectiveVersion
  )
  $version = Assert-StableReleaseVersion -Version $EffectiveVersion
  $configuration = Assert-UnsignedSquirrelConfiguration -Root $Root
  Remove-GeneratedDirectory -Root $Root -Name 'release'
  $releaseRoot = Join-Path $Root 'release'
  $packagingLog = Join-Path $releaseRoot 'packaging.log'
  $audit = Invoke-SquirrelPackagingWithAudit -Root $Root -Tools $Tools -BuilderArguments @(Get-ElectronBuilderArguments -EffectiveVersion $version) -LogPath $packagingLog

  $squirrelRoot = Join-Path $releaseRoot 'squirrel-windows'
  if (-not (Test-Path -LiteralPath $squirrelRoot -PathType Container)) { throw "The installer build did not produce the expected Squirrel directory: $squirrelRoot" }
  $expectedSetupName = 'MaterialCookieClicker-Setup.exe'
  $setupMatches = @(Get-ChildItem -LiteralPath $squirrelRoot -File -Filter '*Setup.exe')
  if ($setupMatches.Count -ne 1 -or $setupMatches[0].Name -cne $expectedSetupName) { throw "The Squirrel directory must contain exactly $expectedSetupName." }
  $setup = Get-Item -LiteralPath (Join-Path $squirrelRoot $expectedSetupName)
  $releases = Get-Item -LiteralPath (Join-Path $squirrelRoot 'RELEASES')
  $expectedPackageName = "MaterialCookieClicker-$version-full.nupkg"
  $nupkg = Get-Item -LiteralPath (Join-Path $squirrelRoot $expectedPackageName)
  $deltaPackages = @(Get-ChildItem -LiteralPath $squirrelRoot -File -Filter '*-delta.nupkg')

  $unpackedRoot = Join-Path $releaseRoot 'win-unpacked'
  $expectedApplicationName = 'Material Cookie Clicker.exe'
  $appMatches = @(Get-ChildItem -LiteralPath $unpackedRoot -File -Filter $expectedApplicationName)
  if ($appMatches.Count -ne 1 -or $appMatches[0].Name -cne $expectedApplicationName) { throw "The packaged application directory must contain exactly $expectedApplicationName." }
  $appExecutable = Get-Item -LiteralPath (Join-Path $unpackedRoot $expectedApplicationName)
  $signature = Get-AuthenticodeSignature -LiteralPath $setup.FullName
  if ($signature.Status -ne 'NotSigned') { throw "Code signing is prohibited, but Setup.exe reported $($signature.Status)." }
  $appSignature = Get-AuthenticodeSignature -LiteralPath $appExecutable.FullName
  if ($appSignature.Status -ne 'NotSigned') { throw "Code signing is prohibited, but the packaged application reported $($appSignature.Status)." }
  $identity = Assert-SourceUnchanged -Root $Root -PinnedCommit $PinnedCommit
  $iconProofRoot = Join-Path $releaseRoot 'icon-proof'
  $sourceIcon = Join-Path $Root 'assets\material-cookie-clicker.ico'
  $iconProof = @(
    Export-ExecutableIconProof -Executable $setup.FullName -SourceIcon $sourceIcon -OutputRoot $iconProofRoot -Label 'setup'
    Export-ExecutableIconProof -Executable $appExecutable.FullName -SourceIcon $sourceIcon -OutputRoot $iconProofRoot -Label 'app'
  )

  $provenance = [ordered]@{
    version = 1
    sourceCommit = $identity.Commit
    builtAt = [DateTimeOffset]::UtcNow.ToString('o')
    packagingCommand = "build-installer.bat /s --version $version"
    cleanOutput = $true
    package = [ordered]@{ id = 'MaterialCookieClicker'; version = $version; architecture = 'x64' }
    buildLog = [ordered]@{ path = 'packaging.log'; sha256 = (Get-FileHash -LiteralPath $packagingLog -Algorithm SHA256).Hash.ToLowerInvariant() }
    signing = [ordered]@{
      inputsCleared = $audit.inputsCleared
      certificateAutoDiscoveryDisabled = $audit.certificateAutoDiscoveryDisabled
      processAuditComplete = $audit.processAuditComplete
      signerInvocationCount = $audit.signerInvocationCount
      observedSignerInvocations = @($audit.observedSignerInvocations)
      controls = [ordered]@{ forceCodeSigning = $false; signExecutable = $false; signAndEditExecutable = $false }
    }
  }
  $provenancePath = Join-Path $releaseRoot 'build-provenance.json'
  $provenance | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $provenancePath -Encoding UTF8

  $artifactReceipt = Join-Path $releaseRoot 'squirrel-artifact-receipt.json'
  & (Join-Path $PSScriptRoot 'verify-squirrel-artifacts.ps1') `
    -ArtifactDirectory $squirrelRoot `
    -ProvenancePath $provenancePath `
    -ExpectedCommit $identity.Commit `
    -SetupFile $expectedSetupName `
    -ExpectedPackageId 'MaterialCookieClicker' `
    -ExpectedVersion $version `
    -ExpectedArchitecture x64 `
    -RequiredPackageEntry @('lib/net45/Material Cookie Clicker.exe', 'lib/net45/resources/app.asar') `
    -OutputPath $artifactReceipt | Out-Null

  $releaseAssets = @($setup, $releases, $nupkg) + $deltaPackages
  $checksumFile = Write-InstallerChecksumFile -Files $releaseAssets -OutputPath (Join-Path $releaseRoot 'SHA256SUMS')
  $allArtifacts = $releaseAssets + @($appExecutable, (Get-Item -LiteralPath $artifactReceipt), $checksumFile, (Get-Item -LiteralPath $provenancePath), (Get-Item -LiteralPath $packagingLog))
  $manifest = [ordered]@{
    schemaVersion = 'material-cookie-clicker.local-installer.v3'
    sourceCommit = $identity.Commit
    sourceClean = $true
    sourcePinned = $true
    packageVersion = $version
    architecture = 'x64'
    signed = $false
    setupSignature = $signature.Status.ToString()
    applicationSignature = $appSignature.Status.ToString()
    iconAnchorCommit = $configuration.iconAnchorCommit
    iconBlob = $configuration.iconBlob
    squirrel = [ordered]@{
      setup = $setup.Name
      releases = $releases.Name
      fullPackage = $nupkg.Name
      deltaAvailable = $deltaPackages.Count -gt 0
      deltaPackages = @($deltaPackages | ForEach-Object { $_.Name })
      deltaDisclosure = if ($deltaPackages.Count -gt 0) { "$($deltaPackages.Count) delta package(s) were generated." } else { 'No delta package was generated by this build; the full package remains the update asset.' }
    }
    iconProof = $iconProof
    provenance = Get-ArtifactRecord -File (Get-Item -LiteralPath $provenancePath) -Root $Root
    artifactReceipt = Get-ArtifactRecord -File (Get-Item -LiteralPath $artifactReceipt) -Root $Root
    checksums = Get-ArtifactRecord -File $checksumFile -Root $Root
    packagedApplication = Get-ArtifactRecord -File $appExecutable -Root $Root
    generatedAt = [DateTimeOffset]::UtcNow.ToString('o')
    artifacts = @($allArtifacts | ForEach-Object { Get-ArtifactRecord -File $_ -Root $Root })
  }
  $manifestPath = Join-Path $releaseRoot 'local-installer-manifest.json'
  $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
  return [pscustomobject]@{ Setup = $setup; Releases = $releases; Nupkg = $nupkg; DeltaPackages = $deltaPackages; AppExecutable = $appExecutable; IconProof = $iconProof; Manifest = $manifestPath; Identity = $identity; Provenance = $provenancePath; ArtifactReceipt = $artifactReceipt; Checksums = $checksumFile; Version = $version }
}
