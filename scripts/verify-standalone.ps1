param(
  [Parameter(Mandatory = $true)][string]$Path,
  [bool]$RequireNetworkBlock = $true
)
$ErrorActionPreference = "Stop"
$fullPath = [System.IO.Path]::GetFullPath($Path)
if (-not (Test-Path -LiteralPath $fullPath)) { throw "Standalone HTML not found: $fullPath" }
$content = [System.IO.File]::ReadAllText($fullPath, [System.Text.Encoding]::UTF8)
$errors = New-Object System.Collections.Generic.List[string]
foreach ($placeholder in @("__APP_CONFIG_JSON__", "__BUILD_MANIFEST_JSON__", "__EMBEDDED_ASSET_BUNDLE_JSON__", "/*__LAMEJS_SOURCE__*/")) { if ($content.Contains($placeholder)) { $errors.Add("Unresolved placeholder: $placeholder") } }
if (-not $content.TrimStart().StartsWith("<!doctype html>", [StringComparison]::OrdinalIgnoreCase)) { $errors.Add("HTML doctype is missing.") }
if ($content -notmatch '<meta\s+name=["'']viewport["'']') { $errors.Add("Viewport metadata is missing.") }
if ($content -match '<script[^>]+src\s*=\s*["'']https?://') { $errors.Add("External script URL found.") }
if ($content -match '<link[^>]+href\s*=\s*["'']https?://') { $errors.Add("External stylesheet/resource URL found.") }
if ($content -match '@import\s+(url\()?\s*["'']?https?://') { $errors.Add("External CSS import found.") }
if ($content -match '<iframe\b') { $errors.Add("iframe is not allowed.") }
if ($RequireNetworkBlock -and $content -notmatch "connect-src\s+'none'") { $errors.Add("CSP must include connect-src 'none'.") }
if ($content -match "(?<!wasm-)'unsafe-eval'") { $errors.Add("Broad JavaScript unsafe-eval is not allowed.") }
if ($content -match '\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket\s*\(|new\s+EventSource\s*\(') { $errors.Add("Runtime network API usage found in source.") }
$config = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path (Split-Path -Parent $PSScriptRoot) "app.config.json") | ConvertFrom-Json
$versionBadge = '<span class="version-badge" id="versionBadge">v' + [string]$config.version + '</span>'
if (-not $content.Contains($versionBadge)) { $errors.Add("Visible version badge does not match app.config.json.") }
if ($content -notmatch 'Audio Cutter &amp; Joiner|Audio Cutter & Joiner') { $errors.Add("Application name is missing.") }
if ($errors.Count -gt 0) { $errors | ForEach-Object { Write-Error $_ }; throw "Standalone verification failed with $($errors.Count) error(s)." }
Write-Host "[OK] Standalone verification passed: $fullPath" -ForegroundColor Green
