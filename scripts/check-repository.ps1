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
if ([string]$config.version -notmatch "^\d+\.\d+\.\d+$") { throw "app.config.json version must use X.Y.Z." }
if ([string]$config.repository.owner -ne "ttomohisa") { throw "Repository owner must be ttomohisa." }
if ([string]$config.repository.name -ne "htmlapps-audio-cutter-joiner") { throw "Unexpected repository name." }
& (Join-Path $Root "build-standalone.ps1")
$dist = Join-Path $Root "dist\index.html"
$rootHtml = Join-Path $Root "audio-cutter-joiner.html"
if (-not (Test-Path -LiteralPath $rootHtml)) { throw "Root distribution HTML was not generated." }
if ((Get-Sha256Hex $dist) -ne (Get-Sha256Hex $rootHtml)) { throw "Root distribution HTML must match dist/index.html." }

# Run the actual application script from every shipped representation with synthetic audio.
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js 18+ is required for audio regression tests." }
$testPaths = @((Join-Path $Root "src\index.template.html"), $rootHtml, $dist)
if ($config.build.selfExtract.enabled) { $testPaths += (Join-Path $Root ([string]$config.build.selfExtract.output)) }
$previousTestPath = $env:AUDIO_APP_HTML
try {
  foreach ($testPath in $testPaths) {
    $env:AUDIO_APP_HTML = $testPath
    Write-Host "[TEST] Audio editing: $testPath"
    & node --test (Join-Path $Root "tests\audio-editing.test.cjs") (Join-Path $Root "tests\header.test.cjs")
    if ($LASTEXITCODE -ne 0) { throw "Audio editing regression tests failed: $testPath" }
  }
} finally { $env:AUDIO_APP_HTML = $previousTestPath }
Write-Host "[OK] Audio editing regression tests passed." -ForegroundColor Green
Write-Host "[OK] Repository check passed." -ForegroundColor Green
