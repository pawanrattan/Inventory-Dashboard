import { RowDataPacket } from "mysql2/promise";

export interface BikeModel extends RowDataPacket {
  id: number;
  model_name: string;
}

export interface BikeColor extends RowDataPacket {
  id: number;
  color_name: string;
}

export interface MonthlyProductionPlan extends RowDataPacket {
  id: number;
  month: string;
  bike_model_id: number;
  bike_color_id: number;
  day_01: number;
  day_02: number;
  day_03: number;
  day_04: number;
  day_05: number;
  day_06: number;
  day_07: number;
  day_08: number;
  day_09: number;
  day_10: number;
  day_11: number;
  day_12: number;
  day_13: number;
  day_14: number;
  day_15: number;
  day_16: number;
  day_17: number;
  day_18: number;
  day_19: number;
  day_20: number;
  day_21: number;
  day_22: number;
  day_23: number;
  day_24: number;
  day_25: number;
  day_26: number;
  day_27: number;
  day_28: number;
  day_29: number;
  day_30: number;
  day_31: number;
}

export interface ProductionPlanRow extends RowDataPacket {
  id: number;
  month: string;
  bike_model: string;
  bike_color: string;
  bike_model_id: number;
  bike_color_id: number;
  day_01: number;
  day_02: number;
  day_03: number;
  day_04: number;
  day_05: number;
  day_06: number;
  day_07: number;
  day_08: number;
  day_09: number;
  day_10: number;
  day_11: number;
  day_12: number;
  day_13: number;
  day_14: number;
  day_15: number;
  day_16: number;
  day_17: number;
  day_18: number;
  day_19: number;
  day_20: number;
  day_21: number;
  day_22: number;
  day_23: number;
  day_24: number;
  day_25: number;
  day_26: number;
  day_27: number;
  day_28: number;
  day_29: number;
  day_30: number;
  day_31: number;
}

export interface CreateProductionPlanInput {
  month: string;
  bike_model_id: number;
  bike_color_id: number;
  days: number[];
}

export interface UpdateProductionPlanInput {
  days: number[];
}
