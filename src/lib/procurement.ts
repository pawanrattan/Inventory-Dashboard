/**
 * Procurement Calculation Engine
 * ==============================
 * Replicates Excel formulas for the Monthly Procurement workbook.
 * Runs entirely on the client side.
 */

import {
  BomStockRow,
  ProductionPlanRow,
  ProductionPlanGrid,
  ProcurementRecord,
  ProcurementSummary,
} from "@/types/procurement";

// Model → BOM column patterns (FG + Semi-Finished)
const MODEL_TO_BOM_PATTERNS: Record<string, { fg: string[]; semi: string[] }> = {
  "BLAZE X Disc": { fg: ["RV Blaze X"], semi: ["Semi Finished RV Blaze X"] },
  "RV X": {
    fg: ["RV1 Black", "RV1 Cosmic", "RV1 Titan", "RV1 Pro"],
    semi: ["Semi Finished RV1 Black", "Semi Finished RV1 Cosmic", "Semi Finished RV1 Titan", "Semi Finished RV1 Pro"],
  },
  "RV1++": { fg: ["RV1+ "], semi: ["Semi Finished RV1+ "] },
  "RV400 +/ Breeze": { fg: ["RV400BRZ", "RV400 "], semi: ["Semi Finished RV400BRZ", "Semi Finished RV400 "] },
  "RV Z": { fg: ["RV300"], semi: [] },
  "BLAZE X Drum": { fg: [], semi: [] },
  "Blaze X+": { fg: [], semi: [] },
  "Blaze X Pro": { fg: [], semi: [] },
  "Scooter-1": { fg: [], semi: [] },
  "Scooter-2": { fg: [], semi: [] },
};

const METADATA_KEYS = new Set([
  "Part No", "Part Description",
  "Warehouse Qty", "Committed Qty", "On Order Qty", "Available Qty",
  "Inventory Level", "MOQ", "Supplier Name",
]);

const MONTH_KEYS = [
  "Jul-26", "Aug-26", "Sep-26", "Oct-26", "Nov-26",
  "Dec-26", "Jan-27", "Feb-27", "Mar-27",
];

export function buildProductionPlanGrid(productionPlan: ProductionPlanRow[]): ProductionPlanGrid {
  const models = productionPlan.map((p) => p.bike_name).filter(Boolean);
  const months = MONTH_KEYS;
  const values: Record<string, Record<string, number>> = {};
  const totals: Record<string, number> = {};

  months.forEach((m) => { totals[m] = 0; });

  for (const row of productionPlan) {
    const name = row.bike_name?.trim();
    if (!name) continue;
    values[name] = {};
    months.forEach((m) => {
      const val = Number(row[m]) || 0;
      values[name][m] = val;
      totals[m] += val;
    });
  }

  return { models, months, values, totals };
}

function extractBomQtyPerModel(bomRow: BomStockRow, models: string[]): Record<string, number> {
  const result: Record<string, number> = {};
  const allColumns = Object.keys(bomRow).filter((k) => !METADATA_KEYS.has(k));

  for (const model of models) {
    const patterns = MODEL_TO_BOM_PATTERNS[model];
    if (!patterns || (patterns.fg.length === 0 && patterns.semi.length === 0)) {
      result[model] = 0;
      continue;
    }

    const fgCols = allColumns.filter(
      (col) => !col.startsWith("Semi Finished") && patterns.fg.some((p) => col.startsWith(p))
    );
    const semiCols = allColumns.filter(
      (col) => col.startsWith("Semi Finished") && patterns.semi.some((p) => col.startsWith(p))
    );

    let maxPerUnit = 0;
    for (const fgCol of fgCols) {
      const fgVal = Number(bomRow[fgCol]) || 0;
      const colorSuffix = fgCol.replace(/^(RV Blaze X |RV1\+ |RV1 |RV400BRZ |RV400 |RV300 )/, "");
      const matchingSemi = semiCols.find((s) => s.endsWith(colorSuffix));
      const semiVal = matchingSemi ? (Number(bomRow[matchingSemi]) || 0) : 0;
      maxPerUnit = Math.max(maxPerUnit, fgVal + semiVal);
    }
    for (const semiCol of semiCols) {
      maxPerUnit = Math.max(maxPerUnit, Number(bomRow[semiCol]) || 0);
    }

    result[model] = maxPerUnit;
  }

  return result;
}

function calcConsumption(bomQty: Record<string, number>, grid: ProductionPlanGrid, month: string): number {
  let total = 0;
  for (const model of grid.models) {
    total += (bomQty[model] || 0) * (grid.values[model]?.[month] || 0);
  }
  return total;
}

export function calculateProcurementData(bomStock: BomStockRow[], grid: ProductionPlanGrid): ProcurementRecord[] {
  return bomStock.map((row, index) => {
    const partNo = row["Part No"] || "";
    const partDescription = row["Part Description"] || "";
    const supplier = (row as Record<string, unknown>)["Supplier Name"] as string || "";
    const invLevel = Number((row as Record<string, unknown>)["Inventory Level"]) || 0;
    const moq = Number((row as Record<string, unknown>)["MOQ"]) || 0;

    const bomQty = extractBomQtyPerModel(row, grid.models);
    const maxBom = Math.max(...Object.values(bomQty), 0);

    const openingStock = Number(row["Warehouse Qty"]) || 0;
    const nextMonthConsumption = calcConsumption(bomQty, grid, "Aug-26");
    const targetMSL = nextMonthConsumption * invLevel;

    const junClosingStock = openingStock; // simplified: opening = closing for snapshot

    const julOE = calcConsumption(bomQty, grid, "Jul-26");
    const augOE = calcConsumption(bomQty, grid, "Aug-26");
    const sepOE = calcConsumption(bomQty, grid, "Sep-26");
    const julTotalConsumption = julOE;

    const estimatedProcurement = junClosingStock - julTotalConsumption - targetMSL;
    const julClosing = junClosingStock - julTotalConsumption;
    const mslDeviation = targetMSL !== 0 ? (julClosing - targetMSL) / targetMSL : 0;

    const procurementLogic =
      maxBom === 0 || julTotalConsumption === 0
        ? "No Procurement"
        : estimatedProcurement >= 0
        ? "No Procurement"
        : "Regular Procurement";

    const julClosingVehicles = maxBom > 0 ? julClosing / maxBom : 0;

    return {
      sNo: index + 1,
      partNo,
      partDescription,
      supplier,
      bomQty,
      invLevel,
      moq,
      openingStock,
      targetMSL,
      julOE,
      augOE,
      sepOE,
      julTotalConsumption,
      estimatedProcurement,
      julClosing,
      mslDeviation,
      procurementLogic,
      julClosingVehicles,
      maxBomQty: maxBom,
    };
  });
}

export function calculateSummary(records: ProcurementRecord[]): ProcurementSummary {
  let totalRequiredQty = 0;
  let totalProcurementQty = 0;
  let criticalParts = 0;
  let overstockedParts = 0;
  let lowStockParts = 0;
  let regularProcurement = 0;
  let noProcurement = 0;
  let deviationSum = 0;
  let deviationCount = 0;

  for (const r of records) {
    totalRequiredQty += r.julTotalConsumption;
    if (r.estimatedProcurement < 0) totalProcurementQty += Math.abs(r.estimatedProcurement);
    if (r.targetMSL > 0 && r.openingStock < r.targetMSL * 0.5) criticalParts++;
    if (r.targetMSL > 0 && r.mslDeviation > 0.2) overstockedParts++;
    if (r.targetMSL > 0 && r.mslDeviation < -0.2) lowStockParts++;
    if (r.procurementLogic === "Regular Procurement") regularProcurement++;
    else noProcurement++;
    if (r.targetMSL > 0) { deviationSum += r.mslDeviation; deviationCount++; }
  }

  return {
    totalParts: records.length,
    totalRequiredQty,
    totalProcurementQty,
    criticalParts,
    overstockedParts,
    lowStockParts,
    regularProcurement,
    noProcurement,
    avgMSLDeviation: deviationCount > 0 ? deviationSum / deviationCount : 0,
  };
}
