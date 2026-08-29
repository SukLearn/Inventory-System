import fs from "fs";
import path from "path";
import { pool } from "./db";

const migrationLock = 732_019_441;

export async function runMigrations() {
  const directory = path.resolve(process.env.MIGRATIONS_DIR || "migrations");
  const files = fs
    .readdirSync(directory)
    .filter((file) => /^\d+.*\.sql$/i.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [migrationLock]);
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         filename text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );

    for (const filename of files) {
      const applied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE filename=$1",
        [filename],
      );
      if (applied.rowCount) continue;

      await client.query("BEGIN");
      try {
        const isInitialMigration = filename.startsWith("001_");
        const schemaAlreadyExists = isInitialMigration
          ? Boolean(
              (
                await client.query(
                  "SELECT to_regclass('public.users') IS NOT NULL AS exists",
                )
              ).rows[0].exists,
            )
          : false;
        if (!schemaAlreadyExists) {
          const sql = fs.readFileSync(path.join(directory, filename), "utf8");
          await client.query(sql);
        }
        await client.query(
          "INSERT INTO schema_migrations(filename) VALUES($1)",
          [filename],
        );
        await client.query("COMMIT");
        console.log(`Applied database migration ${filename}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [migrationLock]).catch(
      () => undefined,
    );
    client.release();
  }
}
