/**
 * POST /api/auth/login
 * ====================
 * Authenticates a user with employee_id and password.
 *
 * This route handler:
 * 1. Parses the JSON request body
 * 2. Validates input using Zod schema
 * 3. Calls the authService to handle business logic
 * 4. Sets JWT as an HTTP-only secure cookie
 * 5. Returns user details, role, department, and permissions
 *
 * No authentication required for this endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { successResponse, errorResponse } from "@/lib/apiResponse";
import { loginUser } from "@/services/authService";
import { env } from "@/lib/env";

// ─── Validation Schema ──────────────────────────────────────────────────────

const loginSchema = z.object({
  employee_id: z.string().min(1, "employee_id is required"),
  password: z.string().min(1, "password is required"),
});

// ─── Helper: Parse JWT_EXPIRES_IN to seconds for cookie maxAge ───────────────

function parseExpiresInToSeconds(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)(h|d|m|s)$/);
  if (!match) return 8 * 60 * 60; // default 8 hours

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "s":
      return value;
    case "m":
      return value * 60;
    case "h":
      return value * 60 * 60;
    case "d":
      return value * 24 * 60 * 60;
    default:
      return 8 * 60 * 60;
  }
}

// ─── Route Handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // Step 1: Parse request body
    const body = await request.json();

    // Step 2: Validate input
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return errorResponse(
        "Validation failed",
        400,
        `${firstIssue.path.join(".")}: ${firstIssue.message}`
      );
    }

    // Step 3: Call service
    const result = await loginUser(parsed.data);

    // Step 4: Build response with cookie
    const { token, ...responseData } = result;
    const maxAge = parseExpiresInToSeconds(env.JWT_EXPIRES_IN);
    const isProduction = env.NODE_ENV === "production";

    const response = successResponse({ ...responseData, token }, "Login successful", 200) as NextResponse;

    // Set JWT as HTTP-only secure cookie
    response.cookies.set("token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      maxAge,
    });

    return response;
  } catch (error: unknown) {
    // Handle known business errors (thrown with status)
    if (error && typeof error === "object" && "status" in error) {
      const err = error as { message: string; status: number };
      return errorResponse(err.message, err.status);
    }

    // Handle unexpected errors
    console.error("Login error:", error);
    return errorResponse("Internal server error", 500);
  }
}
