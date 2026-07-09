import { query, RowDataPacket, ResultSetHeader } from "@/lib/db";
import { ProductionPlanRow, BikeModel, BikeColor, CreateProductionPlanInput } from "@/models/productionPlan";

class ProductionPlanRepository {
  async findByMonth(month: string): Promise<ProductionPlanRow[]> {
    return query<ProductionPlanRow[]>(
      `SELECT 
        mpp.id, mpp.month,
        bm.model_name AS bike_model,
        bc.color_name AS bike_color,
        mpp.bike_model_id, mpp.bike_color_id,
        mpp.day_01, mpp.day_02, mpp.day_03, mpp.day_04, mpp.day_05,
        mpp.day_06, mpp.day_07, mpp.day_08, mpp.day_09, mpp.day_10,
        mpp.day_11, mpp.day_12, mpp.day_13, mpp.day_14, mpp.day_15,
        mpp.day_16, mpp.day_17, mpp.day_18, mpp.day_19, mpp.day_20,
        mpp.day_21, mpp.day_22, mpp.day_23, mpp.day_24, mpp.day_25,
        mpp.day_26, mpp.day_27, mpp.day_28, mpp.day_29, mpp.day_30, mpp.day_31
      FROM monthly_production_plan mpp
      JOIN bike_models bm ON mpp.bike_model_id = bm.id
      JOIN bike_colors bc ON mpp.bike_color_id = bc.id
      WHERE mpp.month = ?
      ORDER BY bm.model_name, bc.color_name`,
      [month]
    );
  }

  async findById(id: number): Promise<ProductionPlanRow | null> {
    const rows = await query<ProductionPlanRow[]>(
      `SELECT 
        mpp.id, mpp.month,
        bm.model_name AS bike_model,
        bc.color_name AS bike_color,
        mpp.bike_model_id, mpp.bike_color_id,
        mpp.day_01, mpp.day_02, mpp.day_03, mpp.day_04, mpp.day_05,
        mpp.day_06, mpp.day_07, mpp.day_08, mpp.day_09, mpp.day_10,
        mpp.day_11, mpp.day_12, mpp.day_13, mpp.day_14, mpp.day_15,
        mpp.day_16, mpp.day_17, mpp.day_18, mpp.day_19, mpp.day_20,
        mpp.day_21, mpp.day_22, mpp.day_23, mpp.day_24, mpp.day_25,
        mpp.day_26, mpp.day_27, mpp.day_28, mpp.day_29, mpp.day_30, mpp.day_31
      FROM monthly_production_plan mpp
      JOIN bike_models bm ON mpp.bike_model_id = bm.id
      JOIN bike_colors bc ON mpp.bike_color_id = bc.id
      WHERE mpp.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  async findExisting(month: string, bikeModelId: number, bikeColorId: number): Promise<ProductionPlanRow | null> {
    const rows = await query<ProductionPlanRow[]>(
      `SELECT * FROM monthly_production_plan 
       WHERE month = ? AND bike_model_id = ? AND bike_color_id = ?`,
      [month, bikeModelId, bikeColorId]
    );
    return rows[0] || null;
  }

  async create(data: CreateProductionPlanInput): Promise<ResultSetHeader> {
    return query<ResultSetHeader>(
      `INSERT INTO monthly_production_plan 
        (month, bike_model_id, bike_color_id,
         day_01, day_02, day_03, day_04, day_05, day_06, day_07,
         day_08, day_09, day_10, day_11, day_12, day_13, day_14,
         day_15, day_16, day_17, day_18, day_19, day_20, day_21,
         day_22, day_23, day_24, day_25, day_26, day_27, day_28,
         day_29, day_30, day_31)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.month, data.bike_model_id, data.bike_color_id, ...data.days]
    );
  }

  async update(id: number, days: number[]): Promise<ResultSetHeader> {
    return query<ResultSetHeader>(
      `UPDATE monthly_production_plan SET
        day_01=?, day_02=?, day_03=?, day_04=?, day_05=?, day_06=?, day_07=?,
        day_08=?, day_09=?, day_10=?, day_11=?, day_12=?, day_13=?, day_14=?,
        day_15=?, day_16=?, day_17=?, day_18=?, day_19=?, day_20=?, day_21=?,
        day_22=?, day_23=?, day_24=?, day_25=?, day_26=?, day_27=?, day_28=?,
        day_29=?, day_30=?, day_31=?
       WHERE id = ?`,
      [...days, id]
    );
  }

  async delete(id: number): Promise<ResultSetHeader> {
    return query<ResultSetHeader>("DELETE FROM monthly_production_plan WHERE id = ?", [id]);
  }

  async getAllBikeModels(): Promise<BikeModel[]> {
    return query<BikeModel[]>("SELECT id, model_name FROM bike_models ORDER BY model_name");
  }

  async getAllBikeColors(): Promise<BikeColor[]> {
    return query<BikeColor[]>("SELECT id, color_name FROM bike_colors ORDER BY color_name");
  }
}

export const productionPlanRepository = new ProductionPlanRepository();
