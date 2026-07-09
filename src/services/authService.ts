/**
 * Auth Service
 * ============
 * Contains all business logic for user login/authentication.
 * This layer:
 * - Validates user existence and active status
 * - Compares passwords
 * - Fetches role, department, and permissions
 * - Updates last_login
 * - Generates JWT token
 *
 * It does NOT handle HTTP requests/responses — that's the route handler's job.
 */

import { comparePassword } from "@/lib/password";
import { signToken } from "@/lib/jwt";
import {
  findUserByEmployeeId,
  getRoleById,
  getDepartmentById,
  getModulePermissionsByDepartmentId,
  updateLastLogin,
  ModulePermissionRow,
} from "@/repository/authRepository";

// ─── Input Type ──────────────────────────────────────────────────────────────

export interface LoginInput {
  employee_id: string;
  password: string;
}

// ─── Result Type ─────────────────────────────────────────────────────────────

export interface LoginResult {
  user: {
    id: number;
    employee_id: string;
    name: string;
    email: string;
    is_active: boolean;
    last_login: Date | null;
    created_at: Date;
  };
  role: {
    id: number;
    role_name: string;
  };
  department: {
    id: number;
    department_name: string;
  };
  permissions: ModulePermissionRow[];
  token: string;
}

// ─── Service Function ────────────────────────────────────────────────────────

/**
 * Authenticate a user via employee_id and password.
 *
 * Flow:
 * 1. Find user by employee_id → 401 if not found
 * 2. Check if account is active → 401 if inactive
 * 3. Compare password with stored hash → 401 if mismatch
 * 4. Fetch role from roles table
 * 5. Fetch department from departments table
 * 6. Fetch module permissions for the user's department
 * 7. Update last_login in users table
 * 8. Generate JWT token
 * 9. Return user details, role, department, permissions, and token
 */
export async function loginUser(input: LoginInput): Promise<LoginResult> {
  // ─── Step 1: Find user by employee_id ────────────────────────────────────
  const user = await findUserByEmployeeId(input.employee_id);
  if (!user) {
    throw { message: "Invalid employee ID or password", status: 401 };
  }

  // ─── Step 2: Check if account is active ──────────────────────────────────
  if (!user.is_active) {
    throw { message: "Account is deactivated. Contact administrator.", status: 401 };
  }

  // ─── Step 3: Compare password ────────────────────────────────────────────
  const isPasswordValid = comparePassword(input.password, user.password_hash);
  if (!isPasswordValid) {
    throw { message: "Invalid employee ID or password", status: 401 };
  }

  // ─── Step 4: Fetch role ──────────────────────────────────────────────────
  const role = await getRoleById(user.role_id);
  if (!role) {
    throw { message: "User role not found", status: 500 };
  }

  // ─── Step 5: Fetch department ────────────────────────────────────────────
  const department = await getDepartmentById(user.department_id);
  if (!department) {
    throw { message: "User department not found", status: 500 };
  }

  // ─── Step 6: Fetch module permissions ────────────────────────────────────
  const permissions = await getModulePermissionsByDepartmentId(user.department_id);

  // ─── Step 7: Update last_login ───────────────────────────────────────────
  await updateLastLogin(user.id);

  // ─── Step 8: Generate JWT token ──────────────────────────────────────────
  const token = signToken({
    userId: user.id,
    employeeId: user.employee_id,
    name: user.name,
    roleId: user.role_id,
    departmentId: user.department_id,
  });

  // ─── Step 9: Return result ───────────────────────────────────────────────
  return {
    user: {
      id: user.id,
      employee_id: user.employee_id,
      name: user.name,
      email: user.email,
      is_active: user.is_active,
      last_login: user.last_login,
      created_at: user.created_at,
    },
    role: {
      id: role.id,
      role_name: role.role_name,
    },
    department: {
      id: department.id,
      department_name: department.department_name,
    },
    permissions,
    token,
  };
}
