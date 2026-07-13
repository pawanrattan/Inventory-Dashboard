/**
 * Procurement Types
 * =================
 * TypeScript interfaces for Monthly Procurement module.
 */

export interface ProductionPlanRow {
  bike_name: string;
  [key: string]: string | number | undefined;
}

export interface BomStockRow {
  "Part No": string;
  "Part Description": string;
  "Warehouse Qty": number;
  "Committed Qty": number;
  "On Order Qty": number;
  "Available Qty": number;
  "Inventory Level"?: number;
  MOQ?: number;
  "Supplier Name"?: string;
  [bikeName: string]: string | number | undefined;
}

export interface ProductionPlanGrid {
  models: string[];
  months: string[];
  values: Record<string, Record<string, number>>;
  totals: Record<string, number>;
}

export interface ProcurementRecord {
  sNo: number;
  partNo: string;
  partDescription: string;
  supplier: string;
  bomQty: Record<string, number>;
  invLevel: number;
  moq: number;
  openingStock: number;
  targetMSL: number;
  julOE: number;
  augOE: number;
  sepOE: number;
  julTotalConsumption: number;
  estimatedProcurement: number;
  julClosing: number;
  mslDeviation: number;
  procurementLogic: string;
  julClosingVehicles: number;
  maxBomQty: number;
}

export interface ProcurementSummary {
  totalParts: number;
  totalRequiredQty: number;
  totalProcurementQty: number;
  criticalParts: number;
  overstockedParts: number;
  lowStockParts: number;
  regularProcurement: number;
  noProcurement: number;
  avgMSLDeviation: number;
}

export interface StockRecord {
  ItemCode: string;
  Description: string;
  "Item Group": string;
  "Warehouse Code": string;
  "Warehouse Name": string;
  "Warehouse Qty": number;
  "Committed Qty": number;
  "On Order Qty": number;
  "Available Qty": number;
}

export interface AggregatedStock {
  itemCode: string;
  description: string;
  itemGroup: string;
  warehouseQty: number;
  committedQty: number;
  onOrderQty: number;
  availableQty: number;
  warehouses: { code: string; name: string; qty: number }[];
  healthStatus: "Healthy" | "Low" | "Critical" | "Zero";
}
