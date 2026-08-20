$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'build-common.ps1')

$root = Join-Path ([IO.Path]::GetTempPath()) ('material-cookie-clicker-exit-test-' + [Guid]::NewGuid().ToString('N'))
try {
  $toolRoot = Join-Path $root 'toolchain'
  $npxRoot = Join-Path $toolRoot 'node_modules\npm\bin'
  New-Item -ItemType Directory -Path $npxRoot -Force | Out-Null
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  Copy-Item -LiteralPath $node -Destination (Join-Path $toolRoot 'node.exe')
  @'
const requested = Number(process.argv[2]);
process.stdout.write(`packaging probe exit ${requested}\n`);
process.exit(requested);
'@ | Set-Content -LiteralPath (Join-Path $npxRoot 'npx-cli.js') -Encoding UTF8

  $tools = [pscustomobject]@{ Node = (Join-Path $toolRoot 'node.exe') }
  $successLog = Join-Path $root 'success.log'
  $result = Invoke-SquirrelPackagingWithAudit -Root $root -Tools $tools -BuilderArguments @('0') -LogPath $successLog
  if ($result.signerInvocationCount -ne 0 -or (Get-Content -LiteralPath $successLog -Raw) -notmatch 'packaging probe exit 0') {
    throw 'Successful packaging-process probe did not preserve its exit or output evidence.'
  }

  $failureLog = Join-Path $root 'failure.log'
  $failure = $null
  try {
    Invoke-SquirrelPackagingWithAudit -Root $root -Tools $tools -BuilderArguments @('7') -LogPath $failureLog | Out-Null
  } catch {
    $failure = $_
  }
  if ($null -eq $failure -or [string]$failure.Exception.Message -notmatch 'exit code 7') {
    throw 'Failing packaging-process probe did not report the exact child exit code.'
  }
  if ((Get-Content -LiteralPath $failureLog -Raw) -notmatch 'packaging probe exit 7') {
    throw 'Failing packaging-process probe did not preserve its output evidence.'
  }

  Write-Host 'PASS packaging process reports exact success and failure exit codes'
} finally {
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
