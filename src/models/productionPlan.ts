import { RowDataPacket } from "mysql2/promise";

export interface BikeModel extends RowDataPacket {
  id: number;
  model_name: string;
}

/**
 * Raw row from monthly_production_plan table.
 * `data` is a JSON object with day numbers (as strings) mapped to quantities.
 * e.g. { "1": 29, "2": 8, ... "31": 17 }
 */
export interface MonthlyProductionPlanRow extends RowDataPacket {
  id: number;
  bike_model_id: number;
  month: string; // date stored as 'YYYY-MM-DD' (first of month)
  data: Record<string, number>; // { "1": qty, "2": qty, ... }
  created_at: string;
  updated_at: string;
}

/**
 * Shape returned by the API after joining with bike_models.
 */
export interface ProductionPlanRow {
  id: number;
  bike_model_id: number;
  bike_model: string;
  month: string;
  data: Record<string, number>;
}

export interface CreateProductionPlanInput {
  month: string; // 'YYYY-MM-DD' first day of month
  bike_model_id: number;
  data: Record<string, number>;
}

export interface UpdateProductionPlanInput {
  data: Record<string, number>;
}
