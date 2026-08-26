$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$target = Join-Path $PSScriptRoot "..\data\backups\$stamp"
New-Item -ItemType Directory -Force -Path $target | Out-Null
docker compose exec -T postgres pg_dump -U inventory -Fc furniture_inventory > (Join-Path $target 'database.dump')
Copy-Item (Join-Path $PSScriptRoot '..\data\uploads') (Join-Path $target 'uploads') -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Backup created: $target"
