/**
 * GET /api/inventory
 * ==================
 * Returns live warehouse stock from SAP B1 (MSSQL).
 */

import { NextResponse } from "next/server";
import { getInventoryStock } from "@/services/inventoryService";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const data = await getInventoryStock();
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    logger.error("API /api/inventory failed:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
