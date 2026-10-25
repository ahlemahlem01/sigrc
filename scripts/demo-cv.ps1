# Demonstration mode of the image proposal on the claim form: no image service needed.
#   powershell -File .\scripts\demo-cv.ps1 on    # any photo gets a fixed example proposal (flagged "demo" on screen)
#   powershell -File .\scripts\demo-cv.ps1 off   # back to normal (no proposal until an image service is configured)
# In demo mode: a file whose name contains "copper", "cuivre" or "bloom" gets COPPER_BLOOMING at 58 % (unsure: shows the warning and
# the correction); any other photo gets CUT_INSULATION at 93 %.
param([Parameter(Mandatory = $true)][ValidateSet('on', 'off')][string]$State)

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$env:CV_MODE = if ($State -eq 'on') { 'demo' } else { '' }
# only the Action Plan API is re-created (it shares the network of the Auth API, which must stay up)
docker compose up -d --no-deps --force-recreate actionplan-api
if ($LASTEXITCODE -ne 0) { Write-Error 'docker compose failed'; exit $LASTEXITCODE }
Write-Host ("Image proposal demo mode: " + $State)
