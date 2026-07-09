/**
 * JWT Utility
 * ===========
 * Handles token generation and verification.
 * Reusable across login, middleware, and any future auth needs.
 */

import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "@/lib/env";

// ─── Token Payload Interface ─────────────────────────────────────────────────

export interface JwtPayload {
  userId: number;
  employeeId: string;
  name: string;
  roleId: number;
  departmentId: number;
}

// ─── Sign Token ──────────────────────────────────────────────────────────────

/**
 * Generate a signed JWT token.
 * Uses JWT_SECRET and JWT_EXPIRES_IN from environment variables.
 */
export function signToken(payload: JwtPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as unknown as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

// ─── Verify Token ────────────────────────────────────────────────────────────

/**
 * Verify and decode a JWT token.
 * Returns the decoded payload or throws if invalid/expired.
 */
export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  return decoded;
}
