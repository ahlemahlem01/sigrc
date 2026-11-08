# Automatic retraining of the image model: a scheduled task that runs ml-service\retrain_if_due.py.
#   powershell -File .\scripts\schedule-retrain.ps1 on      # every Sunday at 02:00 (needs Python with ultralytics, see ml-service)
#   powershell -File .\scripts\schedule-retrain.ps1 off     # removes the task
#   powershell -File .\scripts\schedule-retrain.ps1 status  # shows the task and the last decisions
# Most runs only check and do nothing: a retraining starts when enough new photos were validated by the quality engineer
# (at least 20 new ones and 7 days since the last run). The new model only replaces the old one if it is proven better.
param([Parameter(Mandatory = $true)][ValidateSet('on', 'off', 'status')][string]$State)

$root = Split-Path -Parent $PSScriptRoot
$ml = Join-Path $root 'ml-service'
$name = 'SIGRC-retrain'

switch ($State) {
    'on' {
        $python = (Get-Command python -ErrorAction Stop).Source
        $action = New-ScheduledTaskAction -Execute $python -Argument 'retrain_if_due.py' -WorkingDirectory $ml
        $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 2:00
        $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 10)
        Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
        Write-Host "Task $name registered: every Sunday at 02:00 ($python retrain_if_due.py in $ml)"
    }
    'off' {
        Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
        Write-Host "Task $name removed"
    }
    'status' {
        Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue | Format-List TaskName, State
        $log = Join-Path $ml 'logs\retrain_history.log'
        if (Test-Path $log) { Get-Content $log -Tail 5 }
    }
}
