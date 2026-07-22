param(
    [switch]$SkipFullBackendRegression
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $projectRoot 'backend'
$frontendRoot = Join-Path $projectRoot 'frontend'
$employeeProfileTests = @(
    'tests/test_employee_profile_catalog.py',
    'tests/test_employee_profile_chat.py',
    'tests/test_employee_profile_fields_router.py',
    'tests/test_employee_profile_gate.py',
    'tests/test_employee_profile_roster_repository.py',
    'tests/test_employee_profile_schemas.py',
    'tests/test_employee_profile_service.py',
    'tests/test_ai_controlled_actions.py',
    'tests/test_feishu_ai_channel.py'
)

Push-Location $backendRoot
try {
    & python -m pytest @employeeProfileTests -q
    & python -m compileall -q app
    if (-not $SkipFullBackendRegression) {
        & python -m pytest -q
    }
}
finally {
    Pop-Location
}

Push-Location $projectRoot
try {
    & git diff --check
}
finally {
    Pop-Location
}

Push-Location $frontendRoot
try {
    & npm.cmd run test
    & npm.cmd run build
}
finally {
    Pop-Location
}
