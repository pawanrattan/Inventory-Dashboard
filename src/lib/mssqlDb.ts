/**
 * MSSQL Connection Pool
 * =====================
 * Dedicated MSSQL (SAP B1) connection for inventory queries.
 * Kept separate from the existing MySQL db.ts to avoid modifying existing code.
 */

import sql from "mssql";
import { env } from "@/lib/env";

const mssqlConfig: sql.config = {
  user: env.MSSQL_USER,
  password: env.MSSQL_PASSWORD,
  database: env.MSSQL_DB_NAME,
  server: env.MSSQL_HOST,
  port: parseInt(env.MSSQL_PORT || "1433"),
  requestTimeout: 120000,
  connectionTimeout: 30000,
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  options: { encrypt: false, trustServerCertificate: true },
};

let mssqlPool: sql.ConnectionPool | null = null;

export async function getMssqlPool(): Promise<sql.ConnectionPool> {
  if (!mssqlPool) {
    mssqlPool = await sql.connect(mssqlConfig);
  }
  return mssqlPool;
}

export async function executeMssqlQuery<T = Record<string, unknown>>(
  queryText: string,
  params?: { name: string; value: unknown }[]
): Promise<T[]> {
  const pool = await getMssqlPool();
  const request = pool.request();
  if (params?.length) {
    for (const p of params) {
      request.input(p.name, p.value);
    }
  }
  const result = await request.query(queryText);
  return result.recordset as T[];
}
