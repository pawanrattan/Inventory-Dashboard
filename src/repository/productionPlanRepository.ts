import { query, RowDataPacket, ResultSetHeader } from "@/lib/db";
import { ProductionPlanRow, BikeModel, CreateProductionPlanInput } from "@/models/productionPlan";

interface RawPlanRow extends RowDataPacket {
  id: number;
  bike_model_id: number;
  month: string;
  data: string; // JSON string from MySQL
  model_name: string;
}

class ProductionPlanRepository {
  /**
   * Find all production plans for a given month.
   * Month param comes as 'YYYY-MM', query matches against 'YYYY-MM-01' stored in the table.
   */
  async findByMonth(month: string): Promise<ProductionPlanRow[]> {
    const monthDate = `${month}-01`; // convert 'YYYY-MM' to 'YYYY-MM-01'
    const rows = await query<RawPlanRow[]>(
      `SELECT 
        mpp.id,
        mpp.bike_model_id,
        mpp.month,
        mpp.data,
        b.bike_name AS model_name
      FROM monthly_production_plan mpp
      JOIN bike b ON mpp.bike_model_id = b.id
      WHERE mpp.month = ?
      ORDER BY b.bike_name`,
      [monthDate]
    );

    return rows.map((row) => ({
      id: row.id,
      bike_model_id: row.bike_model_id,
      bike_model: row.model_name,
      month: row.month,
      data: typeof row.data === "string" ? JSON.parse(row.data) : row.data,
    }));
  }

  async findById(id: number): Promise<ProductionPlanRow | null> {
    const rows = await query<RawPlanRow[]>(
      `SELECT 
        mpp.id,
        mpp.bike_model_id,
        mpp.month,
        mpp.data,
        b.bike_name AS model_name
      FROM monthly_production_plan mpp
      JOIN bike b ON mpp.bike_model_id = b.id
      WHERE mpp.id = ?`,
      [id]
    );
    if (!rows[0]) return null;
    const row = rows[0];
    return {
      id: row.id,
      bike_model_id: row.bike_model_id,
      bike_model: row.model_name,
      month: row.month,
      data: typeof row.data === "string" ? JSON.parse(row.data) : row.data,
    };
  }

  async findExisting(month: string, bikeModelId: number): Promise<ProductionPlanRow | null> {
    const monthDate = `${month}-01`;
    const rows = await query<RawPlanRow[]>(
      `SELECT 
        mpp.id,
        mpp.bike_model_id,
        mpp.month,
        mpp.data,
        b.bike_name AS model_name
      FROM monthly_production_plan mpp
      JOIN bike b ON mpp.bike_model_id = b.id
      WHERE mpp.month = ? AND mpp.bike_model_id = ?`,
      [monthDate, bikeModelId]
    );
    if (!rows[0]) return null;
    const row = rows[0];
    return {
      id: row.id,
      bike_model_id: row.bike_model_id,
      bike_model: row.model_name,
      month: row.month,
      data: typeof row.data === "string" ? JSON.parse(row.data) : row.data,
    };
  }

  async create(input: CreateProductionPlanInput): Promise<ResultSetHeader> {
    return query<ResultSetHeader>(
      `INSERT INTO monthly_production_plan (bike_model_id, month, data)
       VALUES (?, ?, ?)`,
      [input.bike_model_id, input.month, JSON.stringify(input.data)]
    );
  }

  async update(id: number, data: Record<string, number>): Promise<ResultSetHeader> {
    return query<ResultSetHeader>(
      `UPDATE monthly_production_plan SET data = ? WHERE id = ?`,
      [JSON.stringify(data), id]
    );
  }

  async delete(id: number): Promise<ResultSetHeader> {
    return query<ResultSetHeader>("DELETE FROM monthly_production_plan WHERE id = ?", [id]);
  }

  async getAllBikeModels(): Promise<BikeModel[]> {
    return query<BikeModel[]>("SELECT id, bike_name AS model_name FROM bike ORDER BY bike_name");
  }
}

export const productionPlanRepository = new ProductionPlanRepository();
