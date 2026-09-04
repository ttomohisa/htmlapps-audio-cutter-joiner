param(
  [Parameter(Mandatory = $true)]
  [string]$Path,
  [string]$ExpectedSourcePath = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path $Path)) { throw "Self-extracting HTML was not found: $Path" }
$selfExtractBytes = [System.IO.File]::ReadAllBytes($Path)
foreach ($byte in $selfExtractBytes) {
  if ($byte -gt 127) {
    throw "The self-extracting wrapper must remain ASCII-only to avoid Windows PowerShell encoding corruption."
  }
}
$html = [System.Text.Encoding]::ASCII.GetString($selfExtractBytes)

$checks = @(
  @{ Message = "HTML document marker is missing"; Failed = -not $html.TrimStart().StartsWith("<!doctype html>", [StringComparison]::OrdinalIgnoreCase) },
  @{ Message = "Viewport metadata is missing"; Failed = $html -notmatch '<meta\s+name=["'']viewport["'']' },
  @{ Message = "The self-extract payload is missing"; Failed = $html -notmatch '<script\s+id=["'']self-extract-payload["'']\s+type=["'']application/octet-stream["'']>' },
  @{ Message = "The gzip decompressor is missing"; Failed = $html -notmatch 'new\s+DecompressionStream\(["'']gzip["'']\)' },
  @{ Message = "connect-src 'none' is missing"; Failed = $html -notmatch "connect-src\s+'none'" },
  @{ Message = "An external script URL remains"; Failed = $html -match '<script[^>]+src\s*=\s*["'']https?://' },
  @{ Message = "An external stylesheet URL remains"; Failed = $html -match '<link[^>]+href\s*=\s*["'']https?://' },
  @{ Message = "An external frame URL remains"; Failed = $html -match '<(?:iframe|frame)[^>]+src\s*=\s*["'']https?://' },
  @{ Message = "Broad JavaScript unsafe-eval must not be enabled"; Failed = $html -match "(?<!wasm-)'unsafe-eval'" }
)

foreach ($check in $checks) {
  if ($check.Failed) { throw $check.Message }
}

$payloadMatch = [regex]::Match(
  $html,
  '<script\s+id=["'']self-extract-payload["'']\s+type=["'']application/octet-stream["'']>(?<payload>[A-Za-z0-9+/=\r\n]+)</script>',
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)
if (-not $payloadMatch.Success) { throw "The embedded Base64 payload could not be parsed." }

try {
  $compressedBytes = [Convert]::FromBase64String(($payloadMatch.Groups["payload"].Value -replace '\s+', ''))
} catch {
  throw "The embedded payload is not valid Base64: $($_.Exception.Message)"
}

$input = New-Object System.IO.MemoryStream -ArgumentList (, $compressedBytes)
$output = New-Object System.IO.MemoryStream
try {
  $gzip = New-Object System.IO.Compression.GZipStream -ArgumentList $input, ([System.IO.Compression.CompressionMode]::Decompress)
  try {
    $gzip.CopyTo($output)
  } finally {
    $gzip.Dispose()
  }
  $restoredBytes = $output.ToArray()
} finally {
  $output.Dispose()
  $input.Dispose()
}

$restoredHtml = [System.Text.Encoding]::UTF8.GetString($restoredBytes)
if (-not $restoredHtml.TrimStart().StartsWith("<!doctype html>", [StringComparison]::OrdinalIgnoreCase)) {
  throw "The restored payload is not an HTML document."
}

if (-not [string]::IsNullOrWhiteSpace($ExpectedSourcePath)) {
  if (-not (Test-Path $ExpectedSourcePath)) { throw "Expected source HTML was not found: $ExpectedSourcePath" }
  $expectedBytes = [System.IO.File]::ReadAllBytes($ExpectedSourcePath)
  if ($expectedBytes.Length -ne $restoredBytes.Length) { throw "Restored payload length does not match the source HTML." }
  for ($index = 0; $index -lt $expectedBytes.Length; $index += 1) {
    if ($expectedBytes[$index] -ne $restoredBytes[$index]) { throw "Restored payload differs from the source HTML at byte $index." }
  }

  $expectedHtml = [System.Text.Encoding]::UTF8.GetString($expectedBytes)
  if ($expectedHtml -match "script-src[^;]*'wasm-unsafe-eval'" -and $html -notmatch "script-src[^;]*'wasm-unsafe-eval'") {
    throw "The source requires 'wasm-unsafe-eval', but the self-extract wrapper CSP does not allow it."
  }

  $sourceIconLink = [regex]::Match(
    $expectedHtml,
    '<link\b(?=[^>]*\brel\s*=\s*["''][^"'']*\bicon\b[^"'']*["''])[^>]*>',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
  )
  if ($sourceIconLink.Success) {
    $sourceIconHref = [regex]::Match($sourceIconLink.Value, '\bhref\s*=\s*["''](?<href>[^"'']+)["'']', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    $wrapperIconLink = [regex]::Match($html, '<link\b(?=[^>]*\brel\s*=\s*["''][^"'']*\bicon\b[^"'']*["''])[^>]*>', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if (-not $wrapperIconLink.Success) { throw "The source favicon was not inherited by the self-extract wrapper." }
    $wrapperIconHref = [regex]::Match($wrapperIconLink.Value, '\bhref\s*=\s*["''](?<href>[^"'']+)["'']', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if (-not $sourceIconHref.Success -or -not $wrapperIconHref.Success) { throw "The favicon href could not be parsed." }
    $sourceHref = [System.Net.WebUtility]::HtmlDecode($sourceIconHref.Groups["href"].Value)
    $wrapperHref = [System.Net.WebUtility]::HtmlDecode($wrapperIconHref.Groups["href"].Value)
    if ($sourceHref -ne $wrapperHref) { throw "The self-extract wrapper favicon does not match the source HTML favicon." }
  }
}

Write-Host "[OK] Self-extract verification passed: $Path" -ForegroundColor Green
