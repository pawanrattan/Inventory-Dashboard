/**
 * Inventory Repository
 * ====================
 * Database queries for Current Inventory and Monthly Procurement modules.
 */

import { getMssqlPool } from "@/lib/mssqlDb";
import { pool, RowDataPacket } from "@/lib/db";
import { env } from "@/lib/env";
import { WAREHOUSE_WISE_INVENTORY, BOM_PIVOT_RV_BIKES } from "@/lib/queries";

// ─── Current Inventory (MSSQL) ───────────────────────────────────────────────

export async function fetchAllAvailableStock() {
  const mssqlPool = await getMssqlPool();
  const result = await mssqlPool.request().query(WAREHOUSE_WISE_INVENTORY);
  return result.recordset;
}

// ─── BOM Pivot for all RV Bikes (MSSQL) ─────────────────────────────────────

export async function fetchBomPivotRvBikes() {
  const mssqlPool = await getMssqlPool();
  const result = await mssqlPool.request().query(BOM_PIVOT_RV_BIKES);
  return result.recordset;
}

// ─── Production Plan Monthly (MySQL) ─────────────────────────────────────────

export async function fetchProductionPlanMonthly() {
  const db = env.REVOLT_DB_NAME;
  const sql = `
    SELECT
      b.bike_name,
      SUM(CASE WHEN p.plan_year=2026 AND p.plan_month=4 THEN p.planned_quantity ELSE 0 END) AS \`Apr-26\`,
      SUM(CASE WHEN p.plan_year=2026 AND p.plan_month=5 THEN p.planned_quantity ELSE 0 END) AS \`May-26\`,
      SUM(CASE WHEN p.plan_year=2026 AND p.plan_month=6 THEN p.planned_quantity ELSE 0 END) AS \`Jun-26\`,
      SUM(CASE WHEN p.plan_year=2026 AND p.plan_month=7 THEN p.planned_quantity ELSE 0 END) AS \`Jul-26\`,
      SUM(CASE WHEN p.plan_year=2026 AND p.plan_month=8 THEN p.planned_quantity ELSE 0 END) AS \`Aug-26\`,
      SUM(CASE WHEN p.plan_year=2026 AND p.plan_month=9 THEN p.planned_quantity ELSE 0 END) AS \`Sep-26\`,
      SUM(CASE WHEN p.plan_year=2026 AND p.plan_month=10 THEN p.planned_quantity ELSE 0 END) AS \`Oct-26\`,
      SUM(CASE WHEN p.plan_year=2026 AND p.plan_month=11 THEN p.planned_quantity ELSE 0 END) AS \`Nov-26\`,
      SUM(CASE WHEN p.plan_year=2026 AND p.plan_month=12 THEN p.planned_quantity ELSE 0 END) AS \`Dec-26\`,
      SUM(CASE WHEN p.plan_year=2027 AND p.plan_month=1 THEN p.planned_quantity ELSE 0 END) AS \`Jan-27\`,
      SUM(CASE WHEN p.plan_year=2027 AND p.plan_month=2 THEN p.planned_quantity ELSE 0 END) AS \`Feb-27\`,
      SUM(CASE WHEN p.plan_year=2027 AND p.plan_month=3 THEN p.planned_quantity ELSE 0 END) AS \`Mar-27\`,
      SUM(p.planned_quantity) AS Total
    FROM ${db}.bike b
    LEFT JOIN ${db}.production_plan p ON b.bike_id = p.bike_id
    GROUP BY b.bike_id, b.bike_name
    ORDER BY b.bike_id
  `;
  const [rows] = await pool.execute<RowDataPacket[]>(sql);
  return rows;
}

// ─── Warehouse Stock Snapshot (MySQL) ────────────────────────────────────────

export async function getWarehouseSnapshot(snapshotMonth: string, snapshotYear: number) {
  const db = env.REVOLT_DB_NAME;
  const sql = `SELECT stock_data FROM ${db}.warehouse_stock_snapshot WHERE snapshot_month = ? AND snapshot_year = ? LIMIT 1`;
  const [rows] = await pool.execute<RowDataPacket[]>(sql, [snapshotMonth, snapshotYear]);
  if (rows.length > 0) {
    return rows[0].stock_data;
  }
  return null;
}

// ─── BOM Procurement Plan (MySQL) ────────────────────────────────────────────

export async function fetchBomProcurementPlan() {
  const db = env.REVOLT_DB_NAME;
  const sql = `SELECT item_code, inventory_level, moq, supplier_name FROM ${db}.bom_procurement_plan`;
  const [rows] = await pool.execute<RowDataPacket[]>(sql);
  return rows;
}
