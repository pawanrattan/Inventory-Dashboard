import { z } from "zod";

export const createProductionPlanSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "Format must be YYYY-MM"),
  bike_model_id: z.number().int().positive(),
  bike_color_id: z.number().int().positive(),
  days: z.array(z.number().int().min(0)).length(31),
});

export const updateProductionPlanSchema = z.object({
  days: z.array(z.number().int().min(0)).length(31),
});
