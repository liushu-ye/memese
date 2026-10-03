<#
  Render glyph.html into a transparent-background master PNG using headless Chrome/Edge.

  Usage:
    powershell -ExecutionPolicy Bypass -File tools/icon/render.ps1
    powershell -ExecutionPolicy Bypass -File tools/icon/render.ps1 -Size 432 -Out master.png

  Why a browser: the icon is a single Chinese character. Hand-authoring vector
  paths for it is impractical, so we let the browser rasterise a system font.
  Note: this script is deliberately ASCII-only. Windows PowerShell 5.1 reads
  .ps1 files as ANSI, so non-ASCII comments/strings get mangled.
#>
param(
  [int]$Size = 432,
  [string]$Out = "master.png"
)

$ErrorActionPreference = 'Stop'

$candidates = @(
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)

$browser = $null
foreach ($c in $candidates) {
  if (Test-Path $c) { $browser = $c; break }
}
if (-not $browser) { throw "Chrome or Edge not found." }

$here = $PSScriptRoot
$html = Join-Path $here 'glyph.html'
if (-not (Test-Path $html)) { throw "glyph.html not found at $html" }

$outPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $Out))
$profileDir = Join-Path ([System.IO.Path]::GetTempPath()) ("icon-render-" + [guid]::NewGuid().ToString('N'))
$fileUrl = "file:///" + $html.Replace('\', '/')

Write-Host "browser : $browser"
Write-Host "html    : $html"
Write-Host "output  : $outPath"

$proc = Start-Process -FilePath $browser -ArgumentList @(
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
  '--disable-crash-reporter', '--force-device-scale-factor=1',
  '--virtual-time-budget=3000',
  "--user-data-dir=$profileDir",
  "--screenshot=$outPath",
  "--window-size=$Size,$Size",
  '--hide-scrollbars',
  '--default-background-color=00000000',
  $fileUrl
) -Wait -PassThru -NoNewWindow

Remove-Item $profileDir -Recurse -Force -ErrorAction SilentlyContinue

if (-not (Test-Path $outPath)) { throw "Render produced no file." }

Write-Host ("OK  {0} bytes ({1}x{1})" -f (Get-Item $outPath).Length, $Size)
Write-Host ""
Write-Host "Next - verify BEFORE installing. Check that max ink radius <= 36dp"
Write-Host "and that mean ink colour is pure white (no dark fringing):"
Write-Host "  node tools/icon/inspect.mjs `"$Out`" master"
