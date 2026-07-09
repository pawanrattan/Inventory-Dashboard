import mysql, { PoolOptions, RowDataPacket, ResultSetHeader,ExecuteValues } from "mysql2/promise";
import { env } from "@/lib/env";

const poolConfig: PoolOptions = {
  host: env.DB_HOST,
  port: Number(env.DB_PORT),
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

const globalForDb = globalThis as unknown as { pool: mysql.Pool };

export const pool = globalForDb.pool || mysql.createPool(poolConfig);

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

export async function query<T = RowDataPacket[]>(
  sql: string,
  params?: ExecuteValues[]
): Promise<T> {
  const [rows] = await pool.execute(sql, params);
  return rows as T;
}

export type { RowDataPacket, ResultSetHeader };
