/**
 * GET /api/bom
 * ============
 * Returns full BOM for all FG bikes (from MSSQL/SAP B1)
 * enriched with part details (nature, category, supplier, inventory_level, moq) from MySQL.
 */

import { NextResponse } from "next/server";
import { getFullBomWithPartDetails } from "@/services/inventoryService";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const data = await getFullBomWithPartDetails();
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    logger.error("API /api/bom failed:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
