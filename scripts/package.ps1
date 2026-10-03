param(
  [string]$OutputPath = "",
  [string]$ZXPSignCmd = "",
  [string]$Certificate = "",
  [string]$Password = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$stageRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("ae-fn-template-manager-" + [guid]::NewGuid().ToString("N"))
$packageRoot = Join-Path $stageRoot "AE-FN-TemplateManager-Windows"
$extensionRoot = Join-Path $packageRoot "extension"
$defaultOutput = Join-Path $projectRoot "dist\AE-FN-TemplateManager-Windows.zip"
if (-not $OutputPath) { $OutputPath = $defaultOutput }

New-Item -ItemType Directory -Path $extensionRoot -Force | Out-Null
New-Item -ItemType Directory -Path (Split-Path -Parent $OutputPath) -Force | Out-Null
try {
  foreach ($name in @('CSXS', 'lib', 'src')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $name) -Destination $extensionRoot -Recurse -Force
  }
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\installer\install.ps1') -Destination $packageRoot
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\installer\INSTALL.txt') -Destination $packageRoot

  $zipPath = [System.IO.Path]::GetFullPath($OutputPath)
  if ([System.IO.Path]::GetExtension($zipPath) -ne '.zip') {
    throw "OutputPath 必须使用 .zip 扩展名：$zipPath"
  }
  if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
  Compress-Archive -Path (Join-Path $packageRoot '*') -DestinationPath $zipPath -Force
  Write-Host "已生成 Windows 安装包：$zipPath"

  if ($ZXPSignCmd -and $Certificate) {
    $zxpPath = [System.IO.Path]::ChangeExtension($zipPath, '.zxp')
    & $ZXPSignCmd -sign $extensionRoot $zxpPath $Certificate $Password
    if ($LASTEXITCODE -ne 0) { throw "ZXPSignCmd 签名失败，退出码 $LASTEXITCODE" }
    Write-Host "已生成签名扩展包：$zxpPath"
  } elseif ([bool]$ZXPSignCmd -xor [bool]$Certificate) {
    throw "签名需要同时提供 -ZXPSignCmd 和 -Certificate。"
  }
} finally {
  if (Test-Path $stageRoot) { Remove-Item -LiteralPath $stageRoot -Recurse -Force }
}
