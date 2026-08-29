$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $projectRoot

try {
    docker compose run --rm backup sh /scripts/backup.sh once manual
    if ($LASTEXITCODE -ne 0) {
        throw "Backup failed with exit code $LASTEXITCODE."
    }

    Write-Host "Manual backup completed in data\backups."
}
finally {
    Pop-Location
}
