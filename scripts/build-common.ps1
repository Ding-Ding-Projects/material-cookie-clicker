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

function Invoke-ProjectBuild {
  param([Parameter(Mandatory = $true)][string]$Root, [Parameter(Mandatory = $true)]$Tools)
  if (-not (Test-Path -LiteralPath (Join-Path $Root 'package-lock.json') -PathType Leaf)) { throw 'package-lock.json is required for a reproducible build.' }
  Remove-GeneratedDirectory -Root $Root -Name 'dist'
  Invoke-CheckedTool -Executable $Tools.Npm -Arguments @('ci') -Description 'npm ci' -WorkingDirectory $Root
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
}

function Invoke-ProjectInstaller {
  param([Parameter(Mandatory = $true)][string]$Root, [Parameter(Mandatory = $true)]$Tools)
  Assert-UnsignedSquirrelConfiguration -Root $Root
  Remove-GeneratedDirectory -Root $Root -Name 'release'
  Invoke-CheckedTool -Executable $Tools.Npx -Arguments @('electron-builder', '--win', 'squirrel', '--publish', 'never') -Description 'electron-builder Squirrel.Windows packaging' -WorkingDirectory $Root
  $releaseRoot = Join-Path $Root 'release'
  $setup = Get-ChildItem -LiteralPath $releaseRoot -Recurse -File -Filter '*Setup.exe' | Select-Object -First 1
  if (-not $setup) { throw 'The installer build did not produce Setup.exe.' }
  $releases = Get-ChildItem -LiteralPath $releaseRoot -Recurse -File -Filter 'RELEASES' | Select-Object -First 1
  $nupkg = Get-ChildItem -LiteralPath $releaseRoot -Recurse -File -Filter '*-full.nupkg' | Select-Object -First 1
  if (-not $releases -or -not $nupkg) { throw 'The installer build did not produce RELEASES and a full .nupkg.' }
  $signature = Get-AuthenticodeSignature -LiteralPath $setup.FullName
  if ($signature.Status -ne 'NotSigned') { throw "Code signing is prohibited, but Setup.exe reported $($signature.Status)." }
  $identity = Get-SourceIdentity -Root $Root
  $rootPrefix = ([IO.Path]::GetFullPath($Root)).TrimEnd('\') + '\'
  $manifest = [ordered]@{
    schemaVersion = 'material-cookie-clicker.local-installer.v1'
    sourceCommit = $identity.Commit
    sourceDirty = $identity.Dirty
    signed = $false
    generatedAt = [DateTimeOffset]::UtcNow.ToString('o')
    artifacts = @($setup, $releases, $nupkg | ForEach-Object {
      $relative = $_.FullName.Substring($rootPrefix.Length).Replace('\', '/')
      [ordered]@{ name = $_.Name; path = $relative; bytes = $_.Length; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    })
  }
  $manifestPath = Join-Path $releaseRoot 'local-installer-manifest.json'
  $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
  return [pscustomobject]@{ Setup = $setup; Releases = $releases; Nupkg = $nupkg; Manifest = $manifestPath; Identity = $identity }
}
