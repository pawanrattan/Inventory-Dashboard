import { z } from "zod";

// In Next.js 16 with Turbopack, process.env vars are available at runtime
// but may not be available at module initialization time for server components.
// We use a lazy getter pattern to defer access.

export const env = {
  get DB_HOST() { return process.env.DB_HOST || ""; },
  get DB_PORT() { return process.env.DB_PORT || "3306"; },
  get DB_USER() { return process.env.DB_USER || ""; },
  get DB_PASSWORD() { return process.env.DB_PASSWORD || ""; },
  get DB_NAME() { return process.env.DB_NAME || ""; },
  get JWT_SECRET() { return process.env.JWT_SECRET || ""; },
  get JWT_EXPIRES_IN() { return process.env.JWT_EXPIRES_IN || "8h"; },
  get NEXT_PUBLIC_API_BASE_URL() { return process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3000/api"; },
  get NODE_ENV() { return process.env.NODE_ENV || "development"; },
  // MSSQL (SAP B1)
  get MSSQL_HOST() { return process.env.MSSQL_HOST || ""; },
  get MSSQL_USER() { return process.env.MSSQL_USER || ""; },
  get MSSQL_PASSWORD() { return process.env.MSSQL_PASSWORD || ""; },
  get MSSQL_DB_NAME() { return process.env.MSSQL_DB_NAME || ""; },
  get MSSQL_PORT() { return process.env.MSSQL_PORT || "1433"; },
  // Revolt Sales DB (procurement/inventory tables)
  get REVOLT_DB_NAME() { return process.env.REVOLT_DB_NAME || "revolt_sales_rawdata"; },
};
