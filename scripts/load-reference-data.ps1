# Runs the on-demand idempotent reference data loader (never auto-runs with APIs).
# Usage:
#   powershell -File .\scripts\load-reference-data.ps1
# Optional:
#   powershell -File .\scripts\load-reference-data.ps1 -EmployeeCount 20 -ClaimCount 150 -ActionPlanCount 100

param(
    [int]$EmployeeCount = 20,
    [int]$ClaimCount = 150,
    [int]$ActionPlanCount = 100
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "..\Coficab.Auth\Coficab.ReferenceDataLoader\Coficab.ReferenceDataLoader.csproj"
$project = [System.IO.Path]::GetFullPath($project)

Write-Host "Running Coficab.ReferenceDataLoader..."
Write-Host "Project: $project"

dotnet run --project $project -c Release --no-launch-profile -- `
    --ReferenceData:EmployeeCount=$EmployeeCount `
    --ReferenceData:ClaimCount=$ClaimCount `
    --ReferenceData:ActionPlanCount=$ActionPlanCount

if ($LASTEXITCODE -ne 0) {
    Write-Error "Load failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "Done."
