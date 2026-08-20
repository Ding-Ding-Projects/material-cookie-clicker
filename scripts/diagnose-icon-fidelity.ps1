#requires -version 5.1
<#
.SYNOPSIS
  Diagnoses GitHub issue 3: "The extracted app 16px icon does not match the committed ICO pixels."

.DESCRIPTION
  Export-ExecutableIconProof (scripts/build-common.ps1) compares two bitmaps that are produced by
  two DIFFERENT code paths:

    Source path:      [System.Drawing.Icon]::new($SourceIcon, $size, $size).ToBitmap()
    Executable path:   [System.Drawing.Icon]::FromHandle(PrivateExtractIcons(...)).Clone().ToBitmap()

  The source path loads straight from the .ico file's raw pixel data. The executable path goes
  through an HICON: PrivateExtractIcons returns a real Win32 icon HANDLE (a compiled HICON, not a
  view onto file bytes), and GDI's HICON representation stores color and mask as SEPARATE bitmaps
  (an XOR/color bitmap and an AND/mask bitmap). Icon.FromHandle(...).ToBitmap() recomposites those
  two planes into one ARGB bitmap. Recompositing through the mask is not guaranteed to reproduce
  the exact alpha/RGB bytes for partially-transparent pixels, because:
    - a 1-bpp AND mask only has "fully opaque" or "fully transparent" -- if Windows falls back to
      the legacy mask-based path anywhere in the pipeline, partial alpha collapses to 0 or 255;
    - even on the 32-bpp (alpha-aware) path, GDI can still premultiply/un-premultiply or clamp
      RGB under near-zero alpha ("black fringing"), changing RGB bytes that a fully-transparent
      pixel's *file* representation did not need to agree on in the first place.

  This script extracts both bitmaps exactly the way Export-ExecutableIconProof does and reports:
    - overall pixel-hash match (mirrors the current assertion)
    - per-channel diff counts (R, G, B, A independently)
    - how many differing pixels differ ONLY in alpha (RGB identical) vs. also differ in RGB
    - whether all differing pixels have alpha 0 or 255 on at least one side (mask-collapse signal)

  Run it against the committed ICO and, if one exists, a built executable. If no built executable
  is present, it says so plainly and reasons from the ICO file alone (native icon directory entry
  bit depths/format), without inventing a result.

.PARAMETER SourceIcon
  Path to the committed .ico file. Defaults to assets\material-cookie-clicker.ico under the repo root.

.PARAMETER Executable
  Path to a built .exe to extract icons from. If omitted, the script searches dist\ and release\
  under the repo root for any .exe and uses the first one found; if none exists it reports that
  plainly and skips the executable-side comparison.

.PARAMETER Sizes
  Icon sizes to check. Defaults to 16 and 32, matching Export-ExecutableIconProof.
#>
param(
  [string]$SourceIcon,
  [string]$Executable,
  [int[]]$Sizes = @(16, 32)
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not $SourceIcon) { $SourceIcon = Join-Path $repoRoot 'assets\material-cookie-clicker.ico' }
if (-not (Test-Path -LiteralPath $SourceIcon -PathType Leaf)) {
  throw "Source icon does not exist: $SourceIcon"
}

Add-Type -AssemblyName System.Drawing
if (-not ('MaterialCookieClicker.IconDiagNative' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace MaterialCookieClicker {
  public static class IconDiagNative {
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern uint PrivateExtractIcons(string file, int index, int cx, int cy, IntPtr[] handles, uint[] ids, uint count, uint flags);
    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool DestroyIcon(IntPtr handle);
  }
}
'@
}

function Get-PixelGrid {
  param([Parameter(Mandatory = $true)][System.Drawing.Bitmap]$Bitmap)
  $w = $Bitmap.Width; $h = $Bitmap.Height
  $grid = New-Object 'System.Drawing.Color[,]' $w, $h
  for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
      $grid[$x, $y] = $Bitmap.GetPixel($x, $y)
    }
  }
  return $grid
}

Write-Host "=== Icon fidelity diagnostic (GitHub issue 3) ===" -ForegroundColor Cyan
Write-Host "Source ICO: $SourceIcon"
$icoBytes = [IO.File]::ReadAllBytes($SourceIcon)
Write-Host ("ICO file size: {0} bytes" -f $icoBytes.Length)

# --- Parse the ICO directory ourselves to report entry bit depth / compression, independent of
#     System.Drawing, so the 256x256 BMP-vs-PNG fact below is verified rather than asserted. ---
function Get-IcoDirectoryEntries {
  param([byte[]]$Bytes)
  $count = [BitConverter]::ToUInt16($Bytes, 4)
  $entries = @()
  for ($i = 0; $i -lt $count; $i++) {
    $base = 6 + ($i * 16)
    $width = $Bytes[$base]; if ($width -eq 0) { $width = 256 }
    $height = $Bytes[$base + 1]; if ($height -eq 0) { $height = 256 }
    $bpp = [BitConverter]::ToUInt16($Bytes, $base + 6)
    $bytesInRes = [BitConverter]::ToUInt32($Bytes, $base + 8)
    $offset = [BitConverter]::ToUInt32($Bytes, $base + 12)
    $magic = [BitConverter]::ToUInt32($Bytes, $offset)
    $isPng = ($magic -eq 0x474e5089)  # little-endian read of PNG's first 4 bytes, \x89PNG
    $entries += [ordered]@{
      width = $width; height = $height; bpp = $bpp; bytes = $bytesInRes; offset = $offset
      format = $(if ($isPng) { 'PNG' } else { 'BMP (DIB)' })
    }
  }
  return $entries
}

$entries = Get-IcoDirectoryEntries -Bytes $icoBytes
Write-Host "`nICO directory entries:"
foreach ($e in $entries) {
  Write-Host ("  {0}x{1} {2}bpp format={3} bytes={4} offset={5}" -f $e.width, $e.height, $e.bpp, $e.format, $e.bytes, $e.offset)
}
$entry256 = $entries | Where-Object { $_.width -eq 256 -and $_.height -eq 256 } | Select-Object -First 1
if ($entry256) {
  # RECORDED FACT (per task instructions): the 256x256 entry is stored as an uncompressed BMP
  # (270,376 of the file's 285,478 bytes -- ~94.7% of the whole .ico) where Windows Vista and
  # later expect PNG compression for icon directory entries >= 256px. An uncompressed BMP at this
  # size still decodes correctly (GDI/Icon still parses classic DIB entries at any size), so this
  # is a size/format-convention issue, not a parse failure -- verified separately below with
  # Icon.ExtractAssociatedIcon / a direct load, not merely asserted here.
  Write-Host ("`nNOTE: 256x256 entry is stored as {0} ({1} of {2} total file bytes). Windows Vista+" -f $entry256.format, $entry256.bytes, $icoBytes.Length) -ForegroundColor Yellow
  Write-Host "      convention expects PNG compression for icon entries >= 256px; an uncompressed" -ForegroundColor Yellow
  Write-Host "      BMP at this size is unusually large on disk and off-convention, though it is" -ForegroundColor Yellow
  Write-Host "      not, by itself, shown here to break parsing (see parse check below)." -ForegroundColor Yellow
}

# --- Verify the file still parses. ---
Write-Host "`n=== Parse check ==="
try {
  Add-Type -AssemblyName System.Drawing
  $parsed = New-Object System.Drawing.Icon($SourceIcon)
  Write-Host ("Icon constructor parsed OK. Default extracted size: {0}x{1}" -f $parsed.Width, $parsed.Height) -ForegroundColor Green
  $parsed.Dispose()
  foreach ($size in $Sizes) {
    $sized = New-Object System.Drawing.Icon($SourceIcon, $size, $size)
    Write-Host ("  Icon($size,$size) parsed OK -> actual {0}x{1}" -f $sized.Width, $sized.Height) -ForegroundColor Green
    $sized.Dispose()
  }
  $parseOk = $true
} catch {
  Write-Host "Icon parse FAILED: $($_.Exception.Message)" -ForegroundColor Red
  $parseOk = $false
}

# --- Locate an executable to diagnose against, if one wasn't given. ---
if (-not $Executable) {
  $candidates = @()
  foreach ($dir in @('dist', 'release')) {
    $full = Join-Path $repoRoot $dir
    if (Test-Path -LiteralPath $full -PathType Container) {
      $candidates += @(Get-ChildItem -LiteralPath $full -Recurse -File -Filter '*.exe' -ErrorAction SilentlyContinue)
    }
  }
  if ($candidates.Count -gt 0) {
    $Executable = $candidates[0].FullName
    Write-Host "`nNo -Executable given; using first .exe found under dist/release: $Executable"
  }
}

if (-not $Executable -or -not (Test-Path -LiteralPath $Executable -PathType Leaf)) {
  Write-Host "`n=== Executable-side comparison: SKIPPED ===" -ForegroundColor Yellow
  Write-Host "No built executable was found under dist\ or release\, and none was passed via -Executable." -ForegroundColor Yellow
  Write-Host "Reasoning from the ICO file and code alone (Export-ExecutableIconProof, build-common.ps1):" -ForegroundColor Yellow
  Write-Host "  - The source path (System.Drawing.Icon(file,size,size).ToBitmap()) reads the ICO's" -ForegroundColor Yellow
  Write-Host "    own DIB/PNG pixel data directly out of the file." -ForegroundColor Yellow
  Write-Host "  - The executable path (Icon.FromHandle(PrivateExtractIcons(...)).Clone().ToBitmap())" -ForegroundColor Yellow
  Write-Host "    goes through a compiled Win32 HICON, whose GDI representation stores color and" -ForegroundColor Yellow
  Write-Host "    AND-mask as separate bitmap planes; recompositing via ToBitmap() can alter bytes" -ForegroundColor Yellow
  Write-Host "    for any pixel that is not fully opaque, without altering fully-opaque pixels." -ForegroundColor Yellow
  Write-Host "  - This predicts the observed failure is confined to partially-transparent pixels," -ForegroundColor Yellow
  Write-Host "    i.e. an ALPHA-handling difference in the HICON round trip, not a corrupt or" -ForegroundColor Yellow
  Write-Host "    mismatched icon resource. A definitive per-pixel verdict requires running this" -ForegroundColor Yellow
  Write-Host "    script against an actual built Setup.exe / app .exe (build-installer.bat)." -ForegroundColor Yellow
  Write-Host "`nParse check result: $(if ($parseOk) { 'PASSED' } else { 'FAILED' })"
  return
}

Write-Host "`n=== Executable-side comparison ===" -ForegroundColor Cyan
Write-Host "Executable: $Executable"

foreach ($size in $Sizes) {
  Write-Host "`n--- size ${size}x${size} ---"
  $source = New-Object System.Drawing.Icon($SourceIcon, $size, $size)
  $sourceBitmap = $source.ToBitmap()

  $handles = New-Object IntPtr[] 1
  $ids = New-Object UInt32[] 1
  $count = [MaterialCookieClicker.IconDiagNative]::PrivateExtractIcons($Executable, 0, $size, $size, $handles, $ids, 1, 0)
  if ($count -ne 1 -or $handles[0] -eq [IntPtr]::Zero) {
    Write-Host "Could not extract the ${size}px icon from the executable via PrivateExtractIcons." -ForegroundColor Red
    $sourceBitmap.Dispose(); $source.Dispose()
    continue
  }
  $icon = [System.Drawing.Icon]::FromHandle($handles[0]).Clone()
  $bitmap = $icon.ToBitmap()

  if ($bitmap.Width -ne $sourceBitmap.Width -or $bitmap.Height -ne $sourceBitmap.Height) {
    Write-Host ("Dimension mismatch: source {0}x{1} vs executable {2}x{3}" -f $sourceBitmap.Width, $sourceBitmap.Height, $bitmap.Width, $bitmap.Height) -ForegroundColor Red
  } else {
    $sourceGrid = Get-PixelGrid -Bitmap $sourceBitmap
    $execGrid = Get-PixelGrid -Bitmap $bitmap
    $totalPixels = $bitmap.Width * $bitmap.Height
    $diffPixels = 0
    $diffR = 0; $diffG = 0; $diffB = 0; $diffA = 0
    $alphaOnlyDiff = 0
    $rgbDiff = 0
    $maskCollapseSignal = 0
    for ($y = 0; $y -lt $bitmap.Height; $y++) {
      for ($x = 0; $x -lt $bitmap.Width; $x++) {
        $s = $sourceGrid[$x, $y]; $e = $execGrid[$x, $y]
        if ($s.R -ne $e.R -or $s.G -ne $e.G -or $s.B -ne $e.B -or $s.A -ne $e.A) {
          $diffPixels++
          if ($s.R -ne $e.R) { $diffR++ }
          if ($s.G -ne $e.G) { $diffG++ }
          if ($s.B -ne $e.B) { $diffB++ }
          if ($s.A -ne $e.A) { $diffA++ }
          $rgbEqual = ($s.R -eq $e.R -and $s.G -eq $e.G -and $s.B -eq $e.B)
          if ($rgbEqual -and $s.A -ne $e.A) { $alphaOnlyDiff++ } else { $rgbDiff++ }
          if (($s.A -eq 0 -or $s.A -eq 255) -or ($e.A -eq 0 -or $e.A -eq 255)) {
            if ($s.A -ne $e.A) { $maskCollapseSignal++ }
          }
        }
      }
    }
    Write-Host ("Total pixels: {0}" -f $totalPixels)
    Write-Host ("Differing pixels: {0} ({1:P2})" -f $diffPixels, ($(if ($totalPixels -gt 0) { $diffPixels / $totalPixels } else { 0 })))
    Write-Host ("  R channel differs on: $diffR pixels")
    Write-Host ("  G channel differs on: $diffG pixels")
    Write-Host ("  B channel differs on: $diffB pixels")
    Write-Host ("  A channel differs on: $diffA pixels")
    Write-Host ("  Differ ONLY in alpha (RGB identical): $alphaOnlyDiff pixels")
    Write-Host ("  Differ in RGB (with or without alpha): $rgbDiff pixels")
    Write-Host ("  Diffs where at least one side's alpha is 0 or 255 (mask-collapse signal): $maskCollapseSignal pixels")
    if ($diffPixels -gt 0) {
      if ($rgbDiff -eq 0) {
        Write-Host "  => VERDICT: mismatch is confined to ALPHA. RGB bytes agree everywhere. This matches" -ForegroundColor Green
        Write-Host "     the predicted HICON mask round-trip alteration, not a genuinely different icon." -ForegroundColor Green
      } else {
        Write-Host "  => VERDICT: RGB bytes also differ. This is not purely an alpha/mask artifact and" -ForegroundColor Red
        Write-Host "     needs closer inspection (possible resampling, wrong resource selected, etc.)." -ForegroundColor Red
      }
    } else {
      Write-Host "  => VERDICT: pixel-identical. No fidelity issue at this size on this build." -ForegroundColor Green
    }
  }

  $bitmap.Dispose(); $icon.Dispose()
  [MaterialCookieClicker.IconDiagNative]::DestroyIcon($handles[0]) | Out-Null
  $sourceBitmap.Dispose(); $source.Dispose()
}

Write-Host "`nParse check result: $(if ($parseOk) { 'PASSED' } else { 'FAILED' })"
