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

function Assert-UnsignedSquirrelConfiguration {
  param([Parameter(Mandatory = $true)][string]$Root)
  $package = Get-Content -LiteralPath (Join-Path $Root 'package.json') -Raw | ConvertFrom-Json
  if ($package.build.win.forceCodeSigning -ne $false -or $package.build.win.signExecutable -ne $false -or $package.build.win.PSObject.Properties.Name -contains 'signAndEditExecutable') {
    throw 'The package configuration must disable signing while leaving executable resource editing enabled for branding.'
  }
  $targets = @($package.build.win.target | ForEach-Object { if ($_ -is [string]) { $_ } else { $_.target } })
  if ($targets -notcontains 'squirrel') { throw 'The installer path must use the Squirrel.Windows target.' }
  $iconUrl = [string]$package.build.squirrelWindows.iconUrl
  if ($iconUrl -notmatch '^https://raw\.githubusercontent\.com/Ding-Ding-Projects/material-cookie-clicker/[0-9a-f]{40}/assets/material-cookie-clicker\.ico$') {
    throw 'Squirrel iconUrl must be an immutable full-commit raw URL, never main, latest, or another mutable ref.'
  }
}

function Export-ExecutableIconProof {
  param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [Parameter(Mandatory = $true)][string]$OutputRoot,
    [Parameter(Mandatory = $true)][string]$Label
  )
  if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { throw "Icon source executable does not exist: $Executable" }
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
    [Parameter(Mandatory = $true)][string]$PinnedCommit
  )
  Assert-UnsignedSquirrelConfiguration -Root $Root
  Remove-GeneratedDirectory -Root $Root -Name 'release'
  Invoke-CheckedTool -Executable $Tools.Npx -Arguments @('electron-builder', '--win', 'squirrel', '--publish', 'never') -Description 'electron-builder Squirrel.Windows packaging' -WorkingDirectory $Root
  $releaseRoot = Join-Path $Root 'release'
  $setup = Get-ChildItem -LiteralPath $releaseRoot -Recurse -File -Filter '*Setup.exe' | Select-Object -First 1
  if (-not $setup) { throw 'The installer build did not produce Setup.exe.' }
  $releases = Get-ChildItem -LiteralPath $releaseRoot -Recurse -File -Filter 'RELEASES' | Select-Object -First 1
  $nupkg = Get-ChildItem -LiteralPath $releaseRoot -Recurse -File -Filter '*-full.nupkg' | Select-Object -First 1
  if (-not $releases -or -not $nupkg) { throw 'The installer build did not produce RELEASES and a full .nupkg.' }
  if (-not (Select-String -LiteralPath $releases.FullName -SimpleMatch $nupkg.Name -Quiet)) { throw "RELEASES does not advertise $($nupkg.Name)." }
  $deltaPackages = @(Get-ChildItem -LiteralPath $releaseRoot -Recurse -File -Filter '*-delta.nupkg')
  $appExecutable = Get-ChildItem -LiteralPath $releaseRoot -Recurse -File -Filter '*.exe' |
    Where-Object { $_.FullName -match 'win-unpacked' -and $_.Name -notmatch 'Setup' } |
    Select-Object -First 1
  if (-not $appExecutable) { throw 'The installer build did not produce a packaged application executable under win-unpacked.' }
  $signature = Get-AuthenticodeSignature -LiteralPath $setup.FullName
  if ($signature.Status -ne 'NotSigned') { throw "Code signing is prohibited, but Setup.exe reported $($signature.Status)." }
  $appSignature = Get-AuthenticodeSignature -LiteralPath $appExecutable.FullName
  if ($appSignature.Status -ne 'NotSigned') { throw "Code signing is prohibited, but the packaged application reported $($appSignature.Status)." }
  $identity = Assert-SourceUnchanged -Root $Root -PinnedCommit $PinnedCommit
  $iconProofRoot = Join-Path $releaseRoot 'icon-proof'
  $iconProof = @(
    Export-ExecutableIconProof -Executable $setup.FullName -OutputRoot $iconProofRoot -Label 'setup'
    Export-ExecutableIconProof -Executable $appExecutable.FullName -OutputRoot $iconProofRoot -Label 'app'
  )
  $allArtifacts = @($setup, $releases, $nupkg) + $deltaPackages
  $manifest = [ordered]@{
    schemaVersion = 'material-cookie-clicker.local-installer.v2'
    sourceCommit = $identity.Commit
    sourceClean = $true
    sourcePinned = $true
    signed = $false
    setupSignature = $signature.Status.ToString()
    applicationSignature = $appSignature.Status.ToString()
    squirrel = [ordered]@{
      setup = $setup.Name
      releases = $releases.Name
      fullPackage = $nupkg.Name
      deltaAvailable = $deltaPackages.Count -gt 0
      deltaPackages = @($deltaPackages | ForEach-Object { $_.Name })
      deltaDisclosure = if ($deltaPackages.Count -gt 0) { "$($deltaPackages.Count) delta package(s) were generated." } else { 'No delta package was generated by this build; the full package remains the update asset.' }
    }
    iconProof = $iconProof
    generatedAt = [DateTimeOffset]::UtcNow.ToString('o')
    artifacts = @($allArtifacts | ForEach-Object { Get-ArtifactRecord -File $_ -Root $Root })
  }
  $manifestPath = Join-Path $releaseRoot 'local-installer-manifest.json'
  $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
  return [pscustomobject]@{ Setup = $setup; Releases = $releases; Nupkg = $nupkg; DeltaPackages = $deltaPackages; AppExecutable = $appExecutable; IconProof = $iconProof; Manifest = $manifestPath; Identity = $identity }
}
