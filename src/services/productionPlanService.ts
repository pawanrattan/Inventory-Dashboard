import { productionPlanRepository } from "@/repository/productionPlanRepository";
import { CreateProductionPlanInput, ProductionPlanRow, BikeModel } from "@/models/productionPlan";

class ProductionPlanService {
  async getByMonth(month: string): Promise<ProductionPlanRow[]> {
    return productionPlanRepository.findByMonth(month);
  }

  async getById(id: number): Promise<ProductionPlanRow> {
    const plan = await productionPlanRepository.findById(id);
    if (!plan) throw new Error("Production plan not found");
    return plan;
  }

  async create(data: CreateProductionPlanInput): Promise<number> {
    // Business rule: no duplicate for same model + month
    const existing = await productionPlanRepository.findExisting(
      data.month,
      data.bike_model_id
    );
    if (existing) {
      throw new Error("Production plan already exists for this model/month");
    }

    const result = await productionPlanRepository.create(data);
    return result.insertId;
  }

  async update(id: number, data: Record<string, number>): Promise<void> {
    await this.getById(id); // throws if not found
    await productionPlanRepository.update(id, data);
  }

  async delete(id: number): Promise<void> {
    await this.getById(id); // throws if not found
    await productionPlanRepository.delete(id);
  }

  async getBikeModels(): Promise<BikeModel[]> {
    return productionPlanRepository.getAllBikeModels();
  }
}

export const productionPlanService = new ProductionPlanService();
