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
  fetchFullBomAllBikes,
  fetchPartDetails,
  fetchBikes,
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

// ─── Full BOM with Part Details (MSSQL + MySQL) ─────────────────────────────

export async function getFullBomWithPartDetails() {
  const [bomData, partDetails, bikes] = await Promise.all([
    fetchFullBomAllBikes(),
    fetchPartDetails(),
    fetchBikes(),
  ]);

  // Build lookup map from MySQL part details keyed by part_no
  const partMap = new Map<
    string,
    { nature: string; category: string; supplier: string; part_description: string; inventory_level: number; moq: number }
  >();
  for (const part of partDetails) {
    partMap.set(part.part_no, {
      nature: part.nature,
      category: part.category,
      supplier: part.supplier,
      part_description: part.part_description,
      inventory_level: Number(part.inventory_level ?? 0),
      moq: Number(part.moq ?? 0),
    });
  }

  // Build bike lookup from MySQL bike table keyed by bike_code
  const bikeMap = new Map<string, { bike_name: string; bike_type: string }>();
  for (const bike of bikes) {
    bikeMap.set(bike.bike_code, {
      bike_name: bike.bike_name,
      bike_type: bike.bike_type,
    });
  }

  // Group BOM data by Component Code (part-wise)
  const partBomMap = new Map<
    string,
    { description: string; bikes: { bike_code: string; bike_name: string; bom_qty: number }[] }
  >();

  for (const row of bomData as Record<string, unknown>[]) {
    const componentCode = row["Component Code"] as string;
    const fgCode = row["FG Code"] as string;
    const fgDescription = row["FG Description"] as string;
    const bomQty = Number(row["BOM Qty"] ?? 0);
    const componentDescription = row["Component Description"] as string;

    if (!partBomMap.has(componentCode)) {
      partBomMap.set(componentCode, { description: componentDescription, bikes: [] });
    }

    const bikeInfo = bikeMap.get(fgCode);
    partBomMap.get(componentCode)!.bikes.push({
      bike_code: fgCode,
      bike_name: bikeInfo?.bike_name ?? fgDescription,
      bom_qty: bomQty,
    });
  }

  // Build final part-wise response
  const result = Array.from(partBomMap.entries()).map(([partNo, bomInfo]) => {
    const partInfo = partMap.get(partNo);
    return {
      part_no: partNo,
      part_description: partInfo?.part_description ?? bomInfo.description,
      nature: partInfo?.nature ?? null,
      category: partInfo?.category ?? null,
      supplier: partInfo?.supplier ?? null,
      inventory_level: partInfo?.inventory_level ?? null,
      moq: partInfo?.moq ?? null,
      bikes: bomInfo.bikes,
    };
  });

  

  logger.info(`InventoryService: Full BOM part-wise. Total parts: ${result.length}, Bikes in DB: ${bikes.length}`);
  return result;
}
