import { Pool, PoolClient } from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
const databaseTimeZone = process.env.APP_TIMEZONE || "Asia/Tbilisi";
if (!/^[A-Za-z0-9_+\-/]+$/.test(databaseTimeZone))
  throw new Error("APP_TIMEZONE contains unsupported characters");

export const pool = new Pool({
  ...(connectionString ? { connectionString } : {}),
  options: `-c timezone=${databaseTimeZone}`,
  max: Number(process.env.DB_POOL_SIZE || 10),
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (error) => {
  console.error("Unexpected idle PostgreSQL client error", error);
});

export async function tx<T>(fn: (c: PoolClient) => Promise<T>) {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
