$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Source = Join-Path $Root "src\index.template.html"
if (-not (Test-Path -LiteralPath $Source)) { throw "Missing src/index.template.html" }
$html = Get-Content -Raw -Encoding UTF8 -LiteralPath $Source
foreach ($token in @("__APP_CONFIG_JSON__", "__BUILD_MANIFEST_JSON__", "__EMBEDDED_ASSET_BUNDLE_JSON__", "/*__LAMEJS_SOURCE__*/")) {
  if (([regex]::Matches($html, [regex]::Escape($token))).Count -ne 1) { throw "Source must contain exactly one $token placeholder." }
}
if ($html -notmatch "connect-src\s+'none'") { throw "Source CSP must block runtime connections." }
if ($html -match '<script[^>]+src\s*=\s*["'']https?://|<link[^>]+href\s*=\s*["'']https?://') { throw "Runtime external resource found in source." }
if ($html -match '\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket\s*\(|new\s+EventSource\s*\(') { throw "Runtime network API found in source." }
if ($html -match '[📁🗑⚙️▶️⏸️]') { throw "Do not use emoji as UI icons." }
Write-Host "[OK] Source checks passed." -ForegroundColor Green
