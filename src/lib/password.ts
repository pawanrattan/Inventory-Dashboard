/**
 * Password Utility
 * ================
 * Handles password comparison using bcryptjs.
 * Separated from service layer for reusability and testability.
 */

import bcrypt from "bcryptjs";

/**
 * Compare a plain-text password against a bcrypt hash.
 * Returns true if they match, false otherwise.
 */
export function comparePassword(plainPassword: string, hash: string): boolean {
  return bcrypt.compareSync(plainPassword, hash);
}
