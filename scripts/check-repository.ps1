$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
function Get-Sha256Hex([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try { return (($algorithm.ComputeHash($stream) | ForEach-Object { $_.ToString("x2") }) -join "") } finally { $algorithm.Dispose(); $stream.Dispose() }
}
$required = @(
  "AGENTS.md","APP_SPEC.md","README.md","README.ja.md","LICENSE","SECURITY.md","CHANGELOG.md","THIRD_PARTY_NOTICES.md","VERIFY_OFFLINE.md",
  "app.config.json","dependencies.json","dependencies.lock.json","build-standalone.ps1","build-standalone.bat","start-local.bat",
  "assets\favicon.svg","src\index.template.html","scripts\verify-standalone.ps1","scripts\build-self-extract.ps1","scripts\verify-self-extract.ps1"
)
foreach ($relative in $required) { if (-not (Test-Path -LiteralPath (Join-Path $Root $relative))) { throw "Required file missing: $relative" } }
& (Join-Path $Root "scripts\check-source.ps1")
$config = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $Root "app.config.json") | ConvertFrom-Json
if ([string]$config.version -ne "1.0.0") { throw "app.config.json must be v1.0.0." }
if ([string]$config.repository.owner -ne "ttomohisa") { throw "Repository owner must be ttomohisa." }
if ([string]$config.repository.name -ne "htmlapps-audio-cutter-joiner") { throw "Unexpected repository name." }
& (Join-Path $Root "build-standalone.ps1")
$dist = Join-Path $Root "dist\index.html"
$rootHtml = Join-Path $Root "audio-cutter-joiner.html"
if (-not (Test-Path -LiteralPath $rootHtml)) { throw "Root distribution HTML was not generated." }
if ((Get-Sha256Hex $dist) -ne (Get-Sha256Hex $rootHtml)) { throw "Root distribution HTML must match dist/index.html." }
Write-Host "[OK] Repository check passed." -ForegroundColor Green
