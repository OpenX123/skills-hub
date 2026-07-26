# 注册/查看/移除 Windows 计划任务,让抓取每天自动跑。
#
#   注册(默认每天 03:00): powershell -ExecutionPolicy Bypass -File scripts\schedule-windows.ps1 -Register
#   自定义时间:            ... -Register -At 06:30
#   查看状态:              ... -Status
#   立即跑一次:            ... -RunNow
#   移除:                  ... -Unregister
#
# 注册普通用户级任务无需管理员权限。

param(
  [switch]$Register,
  [switch]$Unregister,
  [switch]$Status,
  [switch]$RunNow,
  [string]$At = '03:00',
  [string]$TaskName = 'skills-hub-sync'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$syncScript = Join-Path $root 'scripts\sync.ps1'

function Get-Task {
  try { Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop } catch { $null }
}

if ($Register) {
  if (-not (Test-Path $syncScript)) { throw "找不到 $syncScript" }

  $action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$syncScript`"" `
    -WorkingDirectory $root

  $trigger = New-ScheduledTaskTrigger -Daily -At $At

  # 便携机常态:错过触发时间就补跑;断电/电池下也允许执行
  $settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopIfGoingOnBatteries `
    -AllowStartIfOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 3) `
    -MultipleInstances IgnoreNew

  if (Get-Task) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "已移除同名旧任务"
  }

  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description 'skills-hub: 每日抓取并重建 Agent 资源注册表' | Out-Null

  Write-Host "已注册计划任务 '$TaskName',每天 $At 执行"
  Write-Host "日志目录: $(Join-Path $root 'data\logs')"
  exit 0
}

if ($Unregister) {
  if (Get-Task) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "已移除 '$TaskName'"
  } else {
    Write-Host "任务 '$TaskName' 不存在"
  }
  exit 0
}

if ($RunNow) {
  if (-not (Get-Task)) { throw "任务 '$TaskName' 未注册,先加 -Register" }
  Start-ScheduledTask -TaskName $TaskName
  Write-Host "已触发 '$TaskName'"
  exit 0
}

if ($Status -or $true) {
  $t = Get-Task
  if (-not $t) { Write-Host "任务 '$TaskName' 未注册。用 -Register 注册。"; exit 0 }
  $info = Get-ScheduledTaskInfo -TaskName $TaskName
  [PSCustomObject]@{
    名称     = $t.TaskName
    状态     = $t.State
    上次运行 = $info.LastRunTime
    上次结果 = $info.LastTaskResult
    下次运行 = $info.NextRunTime
  } | Format-List
}
