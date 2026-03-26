# Register GPC-Watchdog as a Windows Scheduled Task (run as Administrator)

# Remove existing task if present
Unregister-ScheduledTask -TaskName "GPC-Watchdog" -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File C:\gpc-cres-backend\scripts\watchdog.ps1"

$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Seconds 60) `
    -RepetitionDuration (New-TimeSpan -Days 9999)

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
$settings.DisallowStartIfOnBatteries = $false
$settings.StopIfGoingOnBatteries = $false

$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest

Register-ScheduledTask -TaskName "GPC-Watchdog" `
    -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description "GPC Backend Watchdog - auto-restarts sshd, Tailscale, Docker, containers every 60s"

Get-ScheduledTask -TaskName "GPC-Watchdog" | Select-Object TaskName, State
