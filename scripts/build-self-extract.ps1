param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,
  [Parameter(Mandatory = $true)]
  [string]$OutputPath,
  [string]$AppName = "Standalone app",
  [string]$AppNameJa = "Standalone app"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# Keep this script ASCII-only. Windows PowerShell 5.1 may decode BOM-less UTF-8 .ps1 files
# using the active ANSI code page. Japanese wrapper copy is therefore emitted as HTML numeric
# character references or JavaScript Unicode escapes so the generated UTF-8 HTML is stable.

if (-not (Test-Path $InputPath)) { throw "Input HTML was not found: $InputPath" }
if (-not [System.IO.Path]::IsPathRooted($InputPath)) { $InputPath = [System.IO.Path]::GetFullPath($InputPath) }
if (-not [System.IO.Path]::IsPathRooted($OutputPath)) { $OutputPath = [System.IO.Path]::GetFullPath($OutputPath) }

$inputBytes = [System.IO.File]::ReadAllBytes($InputPath)
if ($inputBytes.Length -eq 0) { throw "Input HTML is empty: $InputPath" }
$inputHtml = [System.Text.Encoding]::UTF8.GetString($inputBytes)
$requiresWasmUnsafeEval = $inputHtml -match "script-src[^;]*'wasm-unsafe-eval'"

# Reuse the source document favicon in the lightweight wrapper so the browser tab
# has the same icon before and after the compressed payload is restored.
$faviconHref = ""
$faviconLinkMatch = [regex]::Match(
  $inputHtml,
  '<link\b(?=[^>]*\brel\s*=\s*["''][^"'']*\bicon\b[^"'']*["''])[^>]*>',
  [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
)
if ($faviconLinkMatch.Success) {
  $faviconHrefMatch = [regex]::Match(
    $faviconLinkMatch.Value,
    '\bhref\s*=\s*["''](?<href>[^"'']+)["'']',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
  )
  if ($faviconHrefMatch.Success) {
    $faviconHref = [System.Net.WebUtility]::HtmlDecode($faviconHrefMatch.Groups["href"].Value)
  }
}

$scriptSources = if ($requiresWasmUnsafeEval) {
  "'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:"
} else {
  "'self' 'unsafe-inline' blob:"
}

$compressedBuffer = New-Object System.IO.MemoryStream
try {
  $gzip = New-Object System.IO.Compression.GZipStream -ArgumentList @(
    $compressedBuffer,
    [System.IO.Compression.CompressionMode]::Compress,
    $true
  )
  try {
    $gzip.Write($inputBytes, 0, $inputBytes.Length)
  } finally {
    $gzip.Dispose()
  }
  $compressedBytes = $compressedBuffer.ToArray()
} finally {
  $compressedBuffer.Dispose()
}

function Get-Sha256Hex([byte[]]$Bytes) {
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    return (($algorithm.ComputeHash($Bytes) | ForEach-Object { $_.ToString("x2") }) -join "")
  } finally {
    $algorithm.Dispose()
  }
}

function ConvertTo-HtmlText([string]$Value) {
  $encoded = [System.Net.WebUtility]::HtmlEncode($Value)
  $builder = New-Object System.Text.StringBuilder
  foreach ($character in $encoded.ToCharArray()) {
    $codePoint = [int][char]$character
    if ($codePoint -gt 127) {
      [void]$builder.AppendFormat("&#x{0:X4};", $codePoint)
    } else {
      [void]$builder.Append($character)
    }
  }
  return $builder.ToString()
}

$sourceSha256 = Get-Sha256Hex $inputBytes
$gzipSha256 = Get-Sha256Hex $compressedBytes
$payloadBase64 = [Convert]::ToBase64String($compressedBytes)
$encodedAppName = ConvertTo-HtmlText $AppName
$encodedAppNameJa = ConvertTo-HtmlText $AppNameJa
$encodedFaviconHref = ConvertTo-HtmlText $faviconHref
$faviconLink = if ([string]::IsNullOrWhiteSpace($encodedFaviconHref)) {
  ""
} else {
  "  <link rel=`"icon`" href=`"$encodedFaviconHref`">`n"
}
$sourceBytes = $inputBytes.Length
$gzipBytes = $compressedBytes.Length

$wrapper = @"
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="color-scheme" content="light">
  <meta name="theme-color" content="#f5f5f2">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob:; script-src $scriptSources; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data: blob:; media-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'">
  <meta name="robots" content="noindex,nofollow">
  <meta name="generator" content="single-html-app-template self-extract builder">
  <meta name="self-extract-source-sha256" content="$sourceSha256">
  <meta name="self-extract-gzip-sha256" content="$gzipSha256">
  <meta name="self-extract-source-bytes" content="$sourceBytes">
  <meta name="self-extract-gzip-bytes" content="$gzipBytes">
$faviconLink  <title>$encodedAppNameJa / $encodedAppName</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", "Yu Gothic UI", Meiryo, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: max(20px, env(safe-area-inset-top)) 18px max(20px, env(safe-area-inset-bottom)); color: #20211f; background: #f5f5f2; }
    main { width: min(31rem, 100%); padding: 24px 20px; text-align: center; border: 1px solid #dadbd6; border-radius: 18px; background: #fff; box-shadow: 0 12px 34px rgba(25, 28, 24, .08); }
    .app-mark { display: grid; place-items: center; width: 46px; height: 46px; margin: 0 auto 16px; border-radius: 14px; background: #16624f; color: #fff; }
    .app-mark svg { width: 24px; height: 24px; }
    .spinner { width: 1.7rem; height: 1.7rem; margin: 0 auto 14px; border: .18rem solid #d8dfdc; border-top-color: #16624f; border-radius: 50%; animation: spin .8s linear infinite; }
    h1 { margin: 0 0 7px; font-size: 1rem; line-height: 1.45; }
    p { margin: .3rem 0; font-size: .82rem; line-height: 1.65; color: #666963; }
    .size-note { margin-top: 12px; padding-top: 12px; border-top: 1px solid #ecece8; font-size: .74rem; }
    pre { display: none; margin-top: 1rem; padding: .8rem; max-height: 14rem; overflow: auto; text-align: left; white-space: pre-wrap; border: 1px solid #e1b4b0; border-radius: 10px; background: #fff7f6; color: #9b2c2c; font-size: .75rem; }
    body.failed .spinner { display: none; }
    body.failed pre { display: block; }
    @media (max-width: 520px) {
      body { place-items: end center; padding-inline: 0; padding-bottom: 0; }
      main { width: 100%; padding: 24px 20px calc(env(safe-area-inset-bottom) + 24px); border-width: 1px 0 0; border-radius: 22px 22px 0 0; box-shadow: 0 -10px 30px rgba(25, 28, 24, .08); }
    }
    @media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 1.8s; } }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <main>
    <div class="app-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none"><path d="M2.5 12h2l1.2-4.2 1.9 8.4 1.9-11.4 2 14.4 1.9-11 1.5 6.8 1.6-3h3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="m18.5 6.5-3 3m3 0-3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
    </div>
    <div class="spinner" aria-hidden="true"></div>
    <h1>&#x30A2;&#x30D7;&#x30EA;&#x3092;&#x5C55;&#x958B;&#x3057;&#x3066;&#x3044;&#x307E;&#x3059; / Unpacking the app</h1>
    <p>&#x5727;&#x7E2E;&#x6E08;&#x307F;&#x306E;&#x5358;&#x4E00;HTML&#x3092;&#x3001;&#x3053;&#x306E;&#x7AEF;&#x672B;&#x5185;&#x3060;&#x3051;&#x3067;&#x5FA9;&#x5143;&#x3057;&#x3066;&#x3044;&#x307E;&#x3059;&#x3002;</p>
    <p>The compressed single-file app is being restored locally.</p>
    <p class="size-note">&#x5916;&#x90E8;&#x901A;&#x4FE1;&#x306F;&#x884C;&#x3044;&#x307E;&#x305B;&#x3093; / No network request is made.</p>
    <pre id="error" role="alert"></pre>
  </main>
  <script id="self-extract-payload" type="application/octet-stream">$payloadBase64</script>
  <script>
  (() => {
    "use strict";

    const fail = (error) => {
      document.body.classList.add("failed");
      const detail = error instanceof Error ? error.name + ": " + error.message : String(error);
      document.getElementById("error").textContent =
        "\u5c55\u958b\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002DecompressionStream \u306b\u5bfe\u5fdc\u3057\u305f\u6700\u65b0\u30d6\u30e9\u30a6\u30b6\u30fc\u3067\u958b\u3044\u3066\u304f\u3060\u3055\u3044\u3002\n" +
        "Failed to unpack the application. Open this file in a current browser that supports DecompressionStream.\n\n" + detail;
      console.error(error);
    };

    const decodeBase64 = (base64) => {
      const clean = base64.replace(/\s+/g, "");
      const byteChunks = [];
      const base64ChunkSize = 32768;
      for (let offset = 0; offset < clean.length; offset += base64ChunkSize) {
        const binary = atob(clean.slice(offset, offset + base64ChunkSize));
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        byteChunks.push(bytes);
      }
      return new Blob(byteChunks, { type: "application/gzip" });
    };

    const unpack = async () => {
      if (!("DecompressionStream" in window)) throw new Error("DecompressionStream is not supported by this browser.");
      const payload = document.getElementById("self-extract-payload").textContent;
      const compressedBlob = decodeBase64(payload);
      const decompressedStream = compressedBlob.stream().pipeThrough(new DecompressionStream("gzip"));
      const html = await new Response(decompressedStream).text();
      if (!/^\s*<!doctype html>/i.test(html)) throw new Error("The restored payload is not an HTML document.");
      document.open("text/html", "replace");
      document.write(html);
      document.close();
    };

    unpack().catch(fail);
  })();
  </script>
  <noscript>JavaScript is required to unpack this self-extracting HTML file.</noscript>
</body>
</html>
"@

$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
[System.IO.File]::WriteAllText($OutputPath, $wrapper, (New-Object System.Text.UTF8Encoding($false)))

$manifestPath = Join-Path $outputDirectory "self-extract-manifest.json"
$manifest = [ordered]@{
  schemaVersion = 1
  generatedAtUtc = [DateTime]::UtcNow.ToString("o")
  source = [ordered]@{
    path = [System.IO.Path]::GetFileName($InputPath)
    bytes = $sourceBytes
    sha256 = $sourceSha256
    requiresWasmUnsafeEval = $requiresWasmUnsafeEval
    faviconInherited = -not [string]::IsNullOrWhiteSpace($faviconHref)
  }
  compressedPayload = [ordered]@{
    format = "gzip"
    bytes = $gzipBytes
    sha256 = $gzipSha256
    encoding = "base64"
  }
  output = [ordered]@{
    path = [System.IO.Path]::GetFileName($OutputPath)
    bytes = (Get-Item $OutputPath).Length
    sha256 = (Get-Sha256Hex ([System.IO.File]::ReadAllBytes($OutputPath)))
  }
  runtime = [ordered]@{
    decompressor = "DecompressionStream"
    networkRequired = $false
  }
}
[System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 10), (New-Object System.Text.UTF8Encoding($false)))

& (Join-Path $PSScriptRoot "verify-self-extract.ps1") -Path $OutputPath -ExpectedSourcePath $InputPath

$ratio = if ($sourceBytes -eq 0) { 0 } else { [Math]::Round(((Get-Item $OutputPath).Length / $sourceBytes) * 100, 1) }
Write-Host "[OK] Self-extracting HTML: $OutputPath" -ForegroundColor Green
Write-Host "[OK] Wrapper size is $ratio% of the original HTML size."
