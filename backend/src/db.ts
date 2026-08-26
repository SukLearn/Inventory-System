import { Pool, PoolClient } from 'pg';
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export async function tx<T>(fn:(c:PoolClient)=>Promise<T>) { const c=await pool.connect(); try { await c.query('BEGIN'); const out=await fn(c); await c.query('COMMIT'); return out; } catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); } }
