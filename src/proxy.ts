
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/jwt";
import { errorResponse } from "@/lib/apiResponse";

// ─── Public Routes (no auth required) ───────────────────────────────────────

const PUBLIC_ROUTES = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/users/register",
];

// ─── Proxy Function ─────────────────────────────────────────────────────────

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip non-API routes (pages, static assets, etc.)
  if (!pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Allow public routes without authentication
  if (PUBLIC_ROUTES.includes(pathname)) {
    return NextResponse.next();
  }

  // Get token from Authorization header
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return errorResponse("Authentication required. Please login.", 401);
  }

  // Verify the token
  try {
    const decoded = verifyToken(token);

    // Forward decoded user info to route handlers via headers
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", String(decoded.userId));
    requestHeaders.set("x-employee-id", decoded.employeeId);
    requestHeaders.set("x-user-name", decoded.name);
    requestHeaders.set("x-role-id", String(decoded.roleId));
    requestHeaders.set("x-department-id", String(decoded.departmentId));

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch {
    return errorResponse("Invalid or expired token. Please login again.", 401);
  }
}

// ─── Matcher Config ──────────────────────────────────────────────────────────
// Filters Proxy to run only on API routes

export const config = {
  matcher: "/api/:path*",
};
