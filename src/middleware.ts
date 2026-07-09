/**
 * Next.js Middleware
 * ==================
 * Protects API routes by verifying the JWT cookie.
 *
 * Public routes (no auth required):
 * - POST /api/auth/login
 * - POST /api/auth/register
 * - POST /api/users/register (temporary — until admin-only restriction is added)
 *
 * All other /api/* routes require a valid JWT token in the "token" cookie.
 * Decoded user info is forwarded via request headers for route handlers to consume.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/jwt";

// ─── Public Routes (no auth required) ───────────────────────────────────────

const PUBLIC_ROUTES = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/users/register",
];

// ─── Middleware Function ─────────────────────────────────────────────────────

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip non-API routes (pages, static assets, etc.)
  if (!pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Allow public routes without authentication
  if (PUBLIC_ROUTES.includes(pathname)) {
    return NextResponse.next();
  }

  // Get token from cookie
  const token = request.cookies.get("token")?.value;

  if (!token) {
    return NextResponse.json(
      { sucess: false, message: "Authentication required. Please login." },
      { status: 401 }
    );
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
    return NextResponse.json(
      { sucess: false, message: "Invalid or expired token. Please login again." },
      { status: 401 }
    );
  }
}

// ─── Matcher Config ──────────────────────────────────────────────────────────

export const config = {
  matcher: "/api/:path*",
};
