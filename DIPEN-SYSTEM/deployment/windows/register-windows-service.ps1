# Registers DIPEN SYSTEM ERP to auto-start on Windows 11 boot under LocalSystem / NetworkService
# Run as Administrator in PowerShell.

param(
  [string]$InstallRoot = "C:\DIPEN-SYSTEM"
)

$Action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$InstallRoot\deployment\windows\start-dipen-erp.bat`""
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName "DIPEN-SYSTEM-ERP" `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -User "SYSTEM" `
  -RunLevel Highest `
  -Force

Write-Host "Scheduled startup task 'DIPEN-SYSTEM-ERP' registered." -ForegroundColor Green
