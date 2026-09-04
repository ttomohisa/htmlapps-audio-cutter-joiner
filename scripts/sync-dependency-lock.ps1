$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$Root = Split-Path -Parent $PSScriptRoot
$dependencies = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $Root "dependencies.json") | ConvertFrom-Json
$items = @()
if ($null -ne $dependencies.dependencies) { $items = @($dependencies.dependencies) }
if ($items.Count -ne 1 -or [string]$items[0].id -ne "lamejs") { throw "v1.0.0 expects exactly one dependency: lamejs." }
Write-Host "The lamejs lock is intentionally pinned to an immutable GitHub commit and reviewed SHA-256." -ForegroundColor Yellow
Write-Host "Do not rewrite dependencies.lock.json automatically. Update the URL and SHA-256 together after reviewing a new upstream version." -ForegroundColor Yellow
