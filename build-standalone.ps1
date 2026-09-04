param(
  [switch]$ForceDownload,
  [switch]$SkipSelfExtract,
  [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
Set-StrictMode -Version Latest
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$TemplatePath = Join-Path $Root "src\index.template.html"
$ConfigPath = Join-Path $Root "app.config.json"
$DependenciesPath = Join-Path $Root "dependencies.json"
$LockPath = Join-Path $Root "dependencies.lock.json"
$VerifyPath = Join-Path $Root "scripts\verify-standalone.ps1"
$SelfExtractBuilder = Join-Path $Root "scripts\build-self-extract.ps1"
$DistRoot = Join-Path $Root "dist"
$CacheRoot = Join-Path $Root ".cache"
$OutputPathWasSpecified = -not [string]::IsNullOrWhiteSpace($OutputPath)

function Write-Step([string]$Message) { Write-Host "[Single HTML] $Message" -ForegroundColor Cyan }
function Get-Json([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { throw "Required file not found: $Path" }
  return Get-Content -Raw -Encoding UTF8 -LiteralPath $Path | ConvertFrom-Json
}
function Safe-Json([object]$Value, [int]$Depth = 30) {
  return ($Value | ConvertTo-Json -Compress -Depth $Depth).Replace("<", "\u003c").Replace(">", "\u003e").Replace("&", "\u0026")
}
function Sha256([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { throw "File not found for SHA-256: $Path" }
  $stream = [System.IO.File]::OpenRead($Path)
  $algorithm = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hashBytes = $algorithm.ComputeHash($stream)
    return (($hashBytes | ForEach-Object { $_.ToString("x2") }) -join "")
  } finally {
    $algorithm.Dispose()
    $stream.Dispose()
  }
}

$config = Get-Json $ConfigPath
$dependencies = Get-Json $DependenciesPath
$lock = Get-Json $LockPath
if (-not ($lock.PSObject.Properties.Name -contains "schemaVersion") -or [int]$lock.schemaVersion -ne 1) { throw "dependencies.lock.json must use schemaVersion 1." }
$dependencyItems = @()
if ($null -ne $dependencies.dependencies) { $dependencyItems = @($dependencies.dependencies) }
$lockItems = @()
if ($null -ne $lock.dependencies) { $lockItems = @($lock.dependencies) }
if ($dependencyItems.Count -ne 1 -or $lockItems.Count -ne 1) { throw "v1.0.0 expects exactly one locked build-time dependency: lamejs." }
$dependency = $dependencyItems[0]
$locked = $lockItems[0]
if ([string]$dependency.id -ne "lamejs" -or [string]$locked.id -ne "lamejs") { throw "The locked dependency must be lamejs." }
if ([string]$dependency.version -ne [string]$locked.version -or [string]$dependency.url -ne [string]$locked.url) { throw "dependencies.lock.json does not match dependencies.json." }
if ([string]$locked.assetSha256 -notmatch '^[a-f0-9]{64}$') { throw "lamejs assetSha256 is invalid." }

if (-not $OutputPathWasSpecified) {
  $configuredOutput = [string]$config.build.output
  if ([string]::IsNullOrWhiteSpace($configuredOutput)) { $configuredOutput = "dist/index.html" }
  $OutputPath = Join-Path $Root $configuredOutput
} elseif (-not [System.IO.Path]::IsPathRooted($OutputPath)) {
  $OutputPath = Join-Path $Root $OutputPath
}
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputPath), $DistRoot, $CacheRoot | Out-Null

$dependencyCache = Join-Path $CacheRoot "lamejs-1.2.1"
$encoderPath = Join-Path $dependencyCache "lame.min.js"
if ($ForceDownload -and (Test-Path -LiteralPath $encoderPath)) { Remove-Item -Force -LiteralPath $encoderPath }
if (-not (Test-Path -LiteralPath $encoderPath)) {
  New-Item -ItemType Directory -Force -Path $dependencyCache | Out-Null
  $partialPath = "$encoderPath.part"
  Remove-Item -Force -ErrorAction SilentlyContinue -LiteralPath $partialPath
  Write-Step "Downloading pinned MP3 encoder (lamejs 1.2.1)"
  Invoke-WebRequest -Uri ([string]$dependency.url) -OutFile $partialPath -UseBasicParsing -Headers @{ "User-Agent" = "htmlapps-audio-cutter-joiner/1.0.0" }
  Move-Item -Force -LiteralPath $partialPath -Destination $encoderPath
} else {
  Write-Step "Using cached MP3 encoder"
}
$encoderSha = Sha256 $encoderPath
if ($encoderSha -ne [string]$locked.assetSha256) { throw "lamejs SHA-256 mismatch. Expected $([string]$locked.assetSha256), got $encoderSha. Refusing to build." }
$encoderSource = [System.IO.File]::ReadAllText($encoderPath, [System.Text.Encoding]::UTF8)
if ($encoderSource -notmatch 'lamejs\.Mp3Encoder') { throw "Pinned MP3 encoder does not expose lamejs.Mp3Encoder." }

$manifest = [ordered]@{
  schemaVersion = 2
  builder = "single-html-app-template/1.2.2"
  generatedAtUtc = [DateTime]::UtcNow.ToString("o")
  app = [ordered]@{ name = [string]$config.name; slug = [string]$config.slug; version = [string]$config.version }
  dependencies = @(
    [ordered]@{
      id = [string]$dependency.id
      source = [string]$dependency.source
      version = [string]$dependency.version
      url = [string]$dependency.url
      license = [string]$dependency.license
      homepage = [string]$dependency.homepage
      assets = @([ordered]@{ key = [string]$dependency.asset.key; mime = [string]$dependency.asset.mime; bytes = (Get-Item -LiteralPath $encoderPath).Length; sha256 = $encoderSha; embedded = $true })
    }
  )
}
$assetBundle = [ordered]@{ schemaVersion = 2; dependencies = [ordered]@{} }
$template = [System.IO.File]::ReadAllText($TemplatePath, [System.Text.Encoding]::UTF8)
$replacements = [ordered]@{
  "__APP_CONFIG_JSON__" = Safe-Json $config 20
  "__BUILD_MANIFEST_JSON__" = Safe-Json $manifest 20
  "__EMBEDDED_ASSET_BUNDLE_JSON__" = Safe-Json $assetBundle 10
  "/*__LAMEJS_SOURCE__*/" = $encoderSource
}
foreach ($entry in $replacements.GetEnumerator()) {
  $count = ([regex]::Matches($template, [regex]::Escape($entry.Key))).Count
  if ($count -ne 1) { throw "Template placeholder $($entry.Key) must occur exactly once; found $count." }
  $template = $template.Replace($entry.Key, [string]$entry.Value)
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($OutputPath, $template, $utf8)
[System.IO.File]::WriteAllText((Join-Path $DistRoot "dependency-manifest.json"), ($manifest | ConvertTo-Json -Depth 20), $utf8)
[System.IO.File]::WriteAllText((Join-Path $DistRoot ".nojekyll"), "", $utf8)

& $VerifyPath -Path $OutputPath -RequireNetworkBlock ([bool]$config.build.blockRuntimeNetwork)

$selfExtractPath = ""
if (-not $SkipSelfExtract -and ($config.build.PSObject.Properties.Name -contains "selfExtract") -and [bool]$config.build.selfExtract.enabled) {
  $selfExtractPath = if ($OutputPathWasSpecified) {
    Join-Path (Split-Path -Parent $OutputPath) (([System.IO.Path]::GetFileNameWithoutExtension($OutputPath)) + ".self-extract.html")
  } else {
    Join-Path $Root ([string]$config.build.selfExtract.output)
  }
  & $SelfExtractBuilder -InputPath $OutputPath -OutputPath $selfExtractPath -AppName ([string]$config.name) -AppNameJa ([string]$config.nameJa)
}

if (-not $OutputPathWasSpecified) {
  $rootDistribution = Join-Path $Root "audio-cutter-joiner.html"
  Copy-Item -Force -LiteralPath $OutputPath -Destination $rootDistribution
}

$readableBytes = (Get-Item -LiteralPath $OutputPath).Length
$selfBytes = if (-not [string]::IsNullOrWhiteSpace($selfExtractPath) -and (Test-Path -LiteralPath $selfExtractPath)) { (Get-Item -LiteralPath $selfExtractPath).Length } else { 0 }
$readableWarning = 25.0
$selfWarning = 12.0
if ($config.build.PSObject.Properties.Name -contains "sizeBudget") {
  if ($config.build.sizeBudget.PSObject.Properties.Name -contains "readableWarningMb") { $readableWarning = [double]$config.build.sizeBudget.readableWarningMb }
  if ($config.build.sizeBudget.PSObject.Properties.Name -contains "selfExtractWarningMb") { $selfWarning = [double]$config.build.sizeBudget.selfExtractWarningMb }
}
$sizeReport = [ordered]@{
  schemaVersion = 1
  generatedAtUtc = [DateTime]::UtcNow.ToString("o")
  app = [ordered]@{ slug = [string]$config.slug; version = [string]$config.version }
  readable = [ordered]@{ path = "index.html"; bytes = $readableBytes; megabytes = [Math]::Round($readableBytes / 1MB, 3); warningMb = $readableWarning; exceedsWarning = (($readableBytes / 1MB) -gt $readableWarning) }
  selfExtract = [ordered]@{ path = "index.self-extract.html"; bytes = $selfBytes; megabytes = [Math]::Round($selfBytes / 1MB, 3); warningMb = $selfWarning; exceedsWarning = (($selfBytes / 1MB) -gt $selfWarning) }
}
[System.IO.File]::WriteAllText((Join-Path $DistRoot "build-size-report.json"), ($sizeReport | ConvertTo-Json -Depth 10), $utf8)

Write-Host "[OK] Standalone HTML: $OutputPath" -ForegroundColor Green
Write-Host "[OK] SHA-256: $(Sha256 $OutputPath)"
Write-Host "[OK] lamejs 1.2.1 was pinned, verified, and embedded at build time."
Write-Host "[OK] Runtime network access is blocked by CSP."
if ($selfExtractPath) { Write-Host "[OK] Self-extracting HTML: $selfExtractPath" -ForegroundColor Green }
