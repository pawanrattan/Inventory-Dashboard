/**
 * POST /api/auth/register
 * =======================
 * User registration endpoint.
 */

import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/apiResponse";
import { registerUser } from "@/services/userService";
import { z } from "zod";

const registerSchema = z.object({
  employee_id: z.string().min(1, "Employee ID is required"),
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  role_id: z.number().int().positive(),
  department_id: z.number().int().positive(),
  permissions: z.array(z.object({
    module_name: z.string(),
    can_view: z.boolean(),
    can_create: z.boolean(),
    can_edit: z.boolean(),
    can_delete: z.boolean(),
  })).default([]),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return errorResponse("Validation failed", 400, `${firstIssue.path.join(".")}: ${firstIssue.message}`);
    }

    const result = await registerUser(parsed.data);
    return successResponse(result, "User registered successfully", 201);
  } catch (error: unknown) {
    if (error && typeof error === "object" && "status" in error) {
      const err = error as { message: string; status: number };
      return errorResponse(err.message, err.status);
    }
    console.error("Registration error:", error);
    return errorResponse("Internal server error", 500);
  }
}
