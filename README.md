# Furniture Shop Inventory

## Start on Windows

1. Install Docker Desktop and enable **Start Docker Desktop when you log in**.
2. Copy `.env.example` to `.env`, replace passwords and `JWT_SECRET`.
3. Run `docker compose up -d --build` once. Containers use `restart: unless-stopped`, so they return after Docker Desktop starts.
4. Open `http://localhost:3000` (or `http://<laptop-ip>:3000` on the shop LAN). Keep Windows Firewall's private-network prompt enabled.

Initial administrator: `maiko_root` / `AmciA2d@345*Sc.` — change it immediately through Settings.

## Data and backups

Persistent data lives in `data/postgres` and `data/uploads`. The `backup` container starts with the application and stores completed backups in `data/backups`:

- Weekly on Wednesday.
- Monthly on the first day of the month.
- Yearly on December 31.
- At startup when the last successful backup is more than seven days old or no backup exists.
- Hourly stale checks create a catch-up backup if a scheduled run was missed.

Each atomic backup directory contains `database.dump`, `uploads.tar.gz`, `SHA256SUMS`, and `manifest.txt`. Incomplete `.part` directories are never considered successful backups. Backup history is retained until an administrator removes it.

Run a manual backup with `powershell -ExecutionPolicy Bypass -File .\scripts\backup.ps1`.

To restore, stop the application services, extract `uploads.tar.gz` into `data/uploads`, start PostgreSQL, copy or mount `database.dump` into the PostgreSQL container, and run `pg_restore -U inventory -d furniture_inventory --clean database.dump`. Always test restoration on a separate copy before replacing live data.

## Architecture

Express owns validation, RBAC and transactional inventory operations; React is only the UI. Versioned PostgreSQL migrations run automatically at backend startup for both new and existing databases. API reference is in `backend/API.md`.
