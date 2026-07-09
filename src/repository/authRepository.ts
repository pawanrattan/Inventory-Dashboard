/**
 * Auth Repository
 * ===============
 * Handles all database queries related to authentication (login).
 * This layer ONLY does SQL — no business logic, no HTTP concerns.
 */

import { query, RowDataPacket, ResultSetHeader } from "@/lib/db";

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface AuthUserRow extends RowDataPacket {
  id: number;
  employee_id: string;
  name: string;
  email: string;
  password_hash: string;
  role_id: number;
  department_id: number;
  is_active: boolean;
  last_login: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface RoleRow extends RowDataPacket {
  id: number;
  role_name: string;
}

export interface DepartmentRow extends RowDataPacket {
  id: number;
  department_name: string;
}

export interface ModulePermissionRow extends RowDataPacket {
  module_name: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

// ─── Repository Functions ────────────────────────────────────────────────────

/**
 * Find a user by employee_id (includes password_hash for comparison)
 */
export async function findUserByEmployeeId(employeeId: string): Promise<AuthUserRow | null> {
  const rows = await query<AuthUserRow[]>(
    "SELECT * FROM users WHERE employee_id = ?",
    [employeeId]
  );
  return rows[0] || null;
}

/**
 * Get role by ID
 */
export async function getRoleById(roleId: number): Promise<RoleRow | null> {
  const rows = await query<RoleRow[]>(
    "SELECT id, role_name FROM roles WHERE id = ?",
    [roleId]
  );
  return rows[0] || null;
}

/**
 * Get department by ID
 */
export async function getDepartmentById(departmentId: number): Promise<DepartmentRow | null> {
  const rows = await query<DepartmentRow[]>(
    "SELECT id, department_name FROM departments WHERE id = ?",
    [departmentId]
  );
  return rows[0] || null;
}

/**
 * Get module permissions for a department (joined with modules table for module_name)
 */
export async function getModulePermissionsByDepartmentId(
  departmentId: number
): Promise<ModulePermissionRow[]> {
  const rows = await query<ModulePermissionRow[]>(
    `SELECT m.module_name, mp.can_view, mp.can_create, mp.can_edit, mp.can_delete
     FROM module_permissions mp
     JOIN modules m ON mp.module_id = m.id
     WHERE mp.department_id = ?`,
    [departmentId]
  );
  return rows;
}

/**
 * Update last_login timestamp for a user
 */
export async function updateLastLogin(userId: number): Promise<void> {
  await query<ResultSetHeader>(
    "UPDATE users SET last_login = NOW() WHERE id = ?",
    [userId]
  );
}
