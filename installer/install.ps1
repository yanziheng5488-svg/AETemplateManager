param(
  [switch]$EnableUnsignedExtensions,
  [string]$RuntimeVersion = ''
)

$ErrorActionPreference = 'Stop'
$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$extensionSource = Join-Path $packageRoot 'extension'
$manifestPath = Join-Path $extensionSource 'CSXS\manifest.xml'

if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw "扩展文件不完整，找不到 manifest：$manifestPath"
}

[xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw
$extensionId = [string]$manifest.ExtensionManifest.ExtensionBundleId
$runtimeEntries = @($manifest.ExtensionManifest.ExecutionEnvironment.RequiredRuntimeList.RequiredRuntime |
  Where-Object { $_.Name -eq 'CSXS' } |
  ForEach-Object { $_ })

if (-not $extensionId -or $runtimeEntries.Count -ne 1) {
  throw 'manifest.xml 缺少扩展 ID 或必须包含且只包含一条 CSXS runtime 声明。'
}
$runtime = $runtimeEntries[0]

$appDataPath = [Environment]::GetFolderPath('ApplicationData')
$extensionsRoot = Join-Path $appDataPath 'Adobe\CEP\extensions'
$installPath = Join-Path $extensionsRoot $extensionId

function Get-CepLogRuntimeVersions {
  $tempPath = [IO.Path]::GetTempPath()
  if (-not (Test-Path -LiteralPath $tempPath)) { return @() }

  $versions = foreach ($logFile in (Get-ChildItem -LiteralPath $tempPath -Filter 'CEP*-AEFT.log' -File -ErrorAction SilentlyContinue)) {
    $content = Get-Content -LiteralPath $logFile.FullName -Raw -ErrorAction SilentlyContinue
    foreach ($match in [regex]::Matches($content, 'PlugPlug version\s*:\s*(?<version>\d+)(?:\.\d+)*')) {
      $match.Groups['version'].Value
    }
  }

  @($versions | Sort-Object -Unique)
}

function Get-InstalledAeRuntimeVersions {
  $adobeRoots = @(
    (Join-Path $env:ProgramFiles 'Adobe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Adobe')
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

  $versions = foreach ($adobeRoot in $adobeRoots) {
    Get-ChildItem -LiteralPath $adobeRoot -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like 'Adobe After Effects *' } |
      ForEach-Object {
        $afterFxPath = Join-Path $_.FullName 'Support Files\AfterFX.exe'
        if (Test-Path -LiteralPath $afterFxPath) {
          $hostMajorVersion = (Get-Item -LiteralPath $afterFxPath).VersionInfo.FileMajorPart
          if ($hostMajorVersion -eq 24) { '11' }
          elseif ($hostMajorVersion -in @(25, 26)) { '12' }
        }
      }
  }

  @($versions | Sort-Object -Unique)
}

$logRuntimeVersions = Get-CepLogRuntimeVersions
$installedRuntimeVersions = Get-InstalledAeRuntimeVersions
$detectedRuntimeVersions = @($logRuntimeVersions + $installedRuntimeVersions) | Sort-Object -Unique
$targetRuntimeVersions = @()
if ($RuntimeVersion) {
  if ($RuntimeVersion -notmatch '^\d+(\.\d+)?$') {
    throw "无效的 CSXS runtime 版本：$RuntimeVersion"
  }
  $targetRuntimeVersions = @($RuntimeVersion)
} else {
  $targetRuntimeVersions = $detectedRuntimeVersions
}

if ($EnableUnsignedExtensions) {
  if (-not $targetRuntimeVersions.Count) {
    throw '未能自动检测 AE/CSXS runtime。请指定目标版本，例如 AE 2025 使用：-RuntimeVersion 12'
  }
  foreach ($targetRuntimeVersion in $targetRuntimeVersions) {
    $debugRegistryPath = "HKCU:\Software\Adobe\CSXS.$targetRuntimeVersion"
    New-Item -Path $debugRegistryPath -Force | Out-Null
    # Adobe CEP expects PlayerDebugMode to be a string value, not a DWORD.
    New-ItemProperty -Path $debugRegistryPath -Name PlayerDebugMode -PropertyType String -Value '1' -Force | Out-Null
  }
  Write-Warning "已为当前 Windows 用户开启 CSXS $($targetRuntimeVersions -join ', ') 调试模式。它允许这些 runtime 加载未签名扩展，也会降低同 runtime 下其他 CEP 扩展的签名校验。"
}

New-Item -ItemType Directory -Path $extensionsRoot -Force | Out-Null
New-Item -ItemType Directory -Path $installPath -Force | Out-Null
Get-ChildItem -LiteralPath $extensionSource -Force | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $installPath -Recurse -Force
}

$requiredFiles = @(
  (Join-Path $installPath 'CSXS\manifest.xml'),
  (Join-Path $installPath 'src\panel\index.html'),
  (Join-Path $installPath 'src\panel\app.js'),
  (Join-Path $installPath 'src\host\main.jsx')
)
$missing = $requiredFiles | Where-Object { -not (Test-Path -LiteralPath $_) }
if ($missing) {
  throw "安装后校验失败：$($missing -join ', ')"
}

Write-Host "AE 模板管理已安装到：$installPath"
if (-not $targetRuntimeVersions.Count) {
  Write-Warning '未检测到 AE/CEP runtime。此 ZIP 包含未签名扩展；请在目标机启动 AE 一次后重新运行，或手动指定：.\install.ps1 -RuntimeVersion 12。'
} else {
  $disabledRuntimeVersions = foreach ($targetRuntimeVersion in $targetRuntimeVersions) {
    $debugRegistryPath = "HKCU:\Software\Adobe\CSXS.$targetRuntimeVersion"
    $debugMode = Get-ItemPropertyValue -Path $debugRegistryPath -Name PlayerDebugMode -ErrorAction SilentlyContinue
    if ($debugMode -ne 1) { $targetRuntimeVersion }
  }
  if ($disabledRuntimeVersions) {
    Write-Warning "未开启 CSXS $($disabledRuntimeVersions -join ', ') 调试模式。此 ZIP 包含未签名扩展，AE 可能不会加载它。若接受安全影响，可运行：.\install.ps1 -EnableUnsignedExtensions"
  } else {
    Write-Host "CSXS $($targetRuntimeVersions -join ', ') 调试模式已开启。请关闭并重新打开 AE 后再打开扩展面板。"
  }
}
