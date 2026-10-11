# Runs the on-demand idempotent test-data seeder (never auto-runs with APIs).
# Usage:
#   powershell -File .\scripts\seed-testdata.ps1
# Optional:
#   powershell -File .\scripts\seed-testdata.ps1 -EmployeeCount 20 -ClaimCount 150 -ActionPlanCount 100

param(
    [int]$EmployeeCount = 20,
    [int]$ClaimCount = 150,
    [int]$ActionPlanCount = 100
)

$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "..\Coficab.Auth\Coficab.TestDataSeeder\Coficab.TestDataSeeder.csproj"
$project = [System.IO.Path]::GetFullPath($project)

Write-Host "Running Coficab.TestDataSeeder..."
Write-Host "Project: $project"

dotnet run --project $project -c Release --no-launch-profile -- `
    --TestData:EmployeeCount=$EmployeeCount `
    --TestData:ClaimCount=$ClaimCount `
    --TestData:ActionPlanCount=$ActionPlanCount

if ($LASTEXITCODE -ne 0) {
    Write-Error "Seed failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host "Done."
