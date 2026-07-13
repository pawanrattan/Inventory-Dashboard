/**
 * Inventory Service
 * =================
 * Business logic for Current Inventory and Monthly Procurement.
 */

import {
  fetchAllAvailableStock,
  fetchBomPivotRvBikes,
  fetchProductionPlanMonthly,
  getWarehouseSnapshot,
  fetchBomProcurementPlan,
} from "@/repository/inventoryRepository";
import { logger } from "@/lib/logger";

// ─── Current Inventory ───────────────────────────────────────────────────────

export async function getInventoryStock() {
  return fetchAllAvailableStock();
}

// ─── Production Plan ─────────────────────────────────────────────────────────

export async function getProductionPlanData() {
  const data = await fetchProductionPlanMonthly();
  logger.info(`InventoryService: Production plan fetched. Rows: ${data.length}`);
  return data;
}

// ─── BOM with Warehouse Stock + Procurement Plan ─────────────────────────────

export async function getBomWithWarehouseStock() {
  const now = new Date();
  const currentMonth = now.toLocaleString("en-US", { month: "long" });
  const currentYear = now.getFullYear();

  const [bomPivotData, warehouseSnapshot, procurementPlan] = await Promise.all([
    fetchBomPivotRvBikes(),
    getWarehouseSnapshot(currentMonth, currentYear),
    fetchBomProcurementPlan(),
  ]);

  // Parse warehouse snapshot
  let warehouseData: Record<string, unknown>[] = [];
  if (warehouseSnapshot) {
    warehouseData =
      typeof warehouseSnapshot === "string"
        ? JSON.parse(warehouseSnapshot)
        : warehouseSnapshot;
  }

  // Aggregate warehouse stock per item code
  const warehouseMap = new Map<
    string,
    { warehouseQty: number; committedQty: number; onOrderQty: number; availableQty: number }
  >();
  for (const row of warehouseData) {
    const itemCode = row["ItemCode"] as string;
    const existing = warehouseMap.get(itemCode);
    if (existing) {
      existing.warehouseQty += Number(row["Warehouse Qty"] ?? 0);
      existing.committedQty += Number(row["Committed Qty"] ?? 0);
      existing.onOrderQty += Number(row["On Order Qty"] ?? 0);
      existing.availableQty += Number(row["Available Qty"] ?? 0);
    } else {
      warehouseMap.set(itemCode, {
        warehouseQty: Number(row["Warehouse Qty"] ?? 0),
        committedQty: Number(row["Committed Qty"] ?? 0),
        onOrderQty: Number(row["On Order Qty"] ?? 0),
        availableQty: Number(row["Available Qty"] ?? 0),
      });
    }
  }

  // Build procurement plan lookup
  const procurementMap = new Map<
    string,
    { inventoryLevel: number; moq: number; supplierName: string }
  >();
  for (const row of procurementPlan) {
    procurementMap.set(row.item_code, {
      inventoryLevel: Number(row.inventory_level ?? 0),
      moq: Number(row.moq ?? 0),
      supplierName: row.supplier_name ?? "",
    });
  }

  // Merge BOM pivot with stock + procurement data
  const result = bomPivotData.map((bomRow: Record<string, unknown>) => {
    const partNo = bomRow["Part No"] as string;
    const stock = warehouseMap.get(partNo);
    const procurement = procurementMap.get(partNo);
    return {
      ...bomRow,
      "Warehouse Qty": stock?.warehouseQty ?? 0,
      "Committed Qty": stock?.committedQty ?? 0,
      "On Order Qty": stock?.onOrderQty ?? 0,
      "Available Qty": stock?.availableQty ?? 0,
      "Inventory Level": procurement?.inventoryLevel ?? 0,
      MOQ: procurement?.moq ?? 0,
      "Supplier Name": procurement?.supplierName ?? "",
    };
  });

  logger.info(`InventoryService: BOM pivot mapped. Total parts: ${result.length}`);
  return result;
}

// ─── Combined: BOM Stock + Production Plan ───────────────────────────────────

export async function getBomStockWithProductionPlan() {
  const [bomStock, productionPlan] = await Promise.all([
    getBomWithWarehouseStock(),
    getProductionPlanData(),
  ]);
  return { bomStock, productionPlan };
}
