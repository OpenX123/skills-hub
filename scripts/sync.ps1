# 定时同步入口(供 Windows 计划任务调用)
# 手动跑: powershell -ExecutionPolicy Bypass -File scripts\sync.ps1

param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$logDir = Join-Path $root 'data\logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$logFile = Join-Path $logDir "sync_$stamp.log"

"[$(Get-Date -Format s)] sync 开始" | Tee-Object -FilePath $logFile

$nodeArgs = @('src/cli.js', 'sync')
if ($Force) { $nodeArgs += '--force' }

& node @nodeArgs *>&1 | Tee-Object -FilePath $logFile -Append
$code = $LASTEXITCODE

& node 'src/cli.js' 'stats' *>&1 | Tee-Object -FilePath $logFile -Append

"[$(Get-Date -Format s)] sync 结束,退出码 $code" | Tee-Object -FilePath $logFile -Append

# 只保留最近 30 份日志
Get-ChildItem $logDir -Filter 'sync_*.log' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 30 |
  Remove-Item -Force -ErrorAction SilentlyContinue

exit $code
