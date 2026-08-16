param(
  [string]$ToolsRoot,
  [switch]$FunctionsOnly
)

$ErrorActionPreference = 'Stop'

function Assert-GitHubCliVersion {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Executable,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedVersion
  )

  $reportedLines = @(& $Executable version 2>&1)
  $exitCode = $LASTEXITCODE
  $reportedText = ($reportedLines | ForEach-Object { [string]$_ }) -join "`n"
  $firstLine = if ($reportedLines.Count -gt 0) { [string]$reportedLines[0] } else { '' }
  # Windows runners can preserve a UTF-8 BOM or terminal colour escape on the
  # first native-output line.  Normalize those presentation bytes, not the
  # version text, before applying the exact pinned-version check.
  $firstLine = $firstLine.TrimStart([char]0xFEFF)
  $firstLine = [regex]::Replace($firstLine, "`e\[[0-9;]*m", '').Trim()
  $expectedPattern = "^gh version $([regex]::Escape($ExpectedVersion))(?:\s|$)"
  if ($exitCode -ne 0 -or $reportedLines.Count -lt 1 -or $firstLine -notmatch $expectedPattern) {
    throw "The job-local GitHub CLI did not report pinned version $ExpectedVersion."
  }
  return $reportedText
}

if ($FunctionsOnly) { return }
if (-not $ToolsRoot) { throw 'ToolsRoot is required unless FunctionsOnly is used.' }

$version = '2.97.0'
$archiveName = "gh_${version}_windows_amd64.zip"
$releaseBase = "https://github.com/cli/cli/releases/download/v${version}"
$installRoot = Join-Path $ToolsRoot "gh-$version"
$executable = Join-Path $installRoot "bin\gh.exe"

if (-not (Test-Path -LiteralPath $executable)) {
  New-Item -ItemType Directory -Path $ToolsRoot -Force | Out-Null
  $archivePath = Join-Path $ToolsRoot $archiveName
  $checksumsPath = Join-Path $ToolsRoot "gh_${version}_checksums.txt"
  Invoke-WebRequest -UseBasicParsing -Uri "$releaseBase/$archiveName" -OutFile $archivePath
  Invoke-WebRequest -UseBasicParsing -Uri "$releaseBase/gh_${version}_checksums.txt" -OutFile $checksumsPath
  $checksumLine = Select-String -LiteralPath $checksumsPath -Pattern "^[a-fA-F0-9]{64}\s+$([regex]::Escape($archiveName))$" | Select-Object -First 1
  if (-not $checksumLine) { throw "The pinned GitHub CLI checksum file did not contain $archiveName." }
  $expected = ($checksumLine.Line -split '\s+')[0].ToLowerInvariant()
  $actual = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected) { throw "GitHub CLI archive SHA-256 mismatch: expected $expected, received $actual." }
  $extractRoot = Join-Path $ToolsRoot "gh-$version-extracted"
  Expand-Archive -LiteralPath $archivePath -DestinationPath $extractRoot -Force
  $expectedMember = Join-Path $extractRoot 'bin\gh.exe'
  if (-not (Test-Path -LiteralPath $expectedMember -PathType Leaf)) { throw 'The verified GitHub CLI archive did not contain its exact expected gh.exe member.' }
  $resolvedExtractRoot = (Resolve-Path -LiteralPath $extractRoot).Path.TrimEnd('\') + '\'
  $resolvedSource = (Resolve-Path -LiteralPath $expectedMember).Path
  if (-not $resolvedSource.StartsWith($resolvedExtractRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'The GitHub CLI archive member resolved outside the extraction root.' }
  New-Item -ItemType Directory -Path (Split-Path -Parent $executable) -Force | Out-Null
  Copy-Item -LiteralPath $resolvedSource -Destination $executable
}

$resolvedExecutable = (Resolve-Path -LiteralPath $executable).Path
if ($resolvedExecutable -ne [IO.Path]::GetFullPath($executable)) { throw 'The job-local GitHub CLI resolved to an unexpected executable path.' }
$reported = Assert-GitHubCliVersion -Executable $resolvedExecutable -ExpectedVersion $version

if ($env:GITHUB_PATH) { Split-Path -Parent $resolvedExecutable | Out-File -FilePath $env:GITHUB_PATH -Encoding utf8 -Append }
Write-Output "GitHub CLI $version ready at $resolvedExecutable"
