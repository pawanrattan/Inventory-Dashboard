/**
 * GET /api/procurement
 * ====================
 * Returns BOM stock data merged with production plan for procurement calculations.
 */

import { NextResponse } from "next/server";
import { getBomStockWithProductionPlan } from "@/services/inventoryService";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const data = await getBomStockWithProductionPlan();
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    logger.error("API /api/procurement failed:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
