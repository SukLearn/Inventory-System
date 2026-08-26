# Furniture Shop Inventory

## Start on Windows

1. Install Docker Desktop and enable **Start Docker Desktop when you log in**.
2. Copy `.env.example` to `.env`, replace passwords and `JWT_SECRET`.
3. Run `docker compose up -d --build` once. Containers use `restart: unless-stopped`, so they return after Docker Desktop starts.
4. Open `http://localhost:3000` (or `http://<laptop-ip>:3000` on the shop LAN). Keep Windows Firewall's private-network prompt enabled.

Initial development administrator: `admin` / `Admin123!` — change it immediately through Employees.

## Data and backups

Persistent data lives in `data/postgres` and `data/uploads`. To back up: `powershell -ExecutionPolicy Bypass -File .\scripts\backup.ps1`. It creates a dated folder in `data/backups` with a PostgreSQL custom dump and image copy. Restore: stop the stack, restore uploads from that folder, start PostgreSQL, then run `pg_restore -U inventory -d furniture_inventory --clean /backups/database.dump` inside its container. Test restores on a separate copy before replacing live data.

## Architecture

Express owns validation, RBAC and transactional inventory operations; React is only the UI. PostgreSQL migrations are run automatically on a fresh database. API reference is in `backend/API.md`.
