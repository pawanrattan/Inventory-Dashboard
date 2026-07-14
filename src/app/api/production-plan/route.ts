/**
 * GET /api/production-plan?month=2026-07
 * =======================================
 * Returns the daily production plan for a given month.
 * Data comes from `monthly_production_plan` table in `inventory_dashboard` DB.
 * Each row has a JSON `data` column: { "1": qty, "2": qty, ... "31": qty }
 */

import { NextRequest, NextResponse } from "next/server";
import { productionPlanService } from "@/services/productionPlanService";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month") || getCurrentMonth();

    const [plans, models] = await Promise.all([
      productionPlanService.getByMonth(month),
      productionPlanService.getBikeModels(),
    ]);

    return NextResponse.json({
      success: true,
      data: { month, plans, models },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
