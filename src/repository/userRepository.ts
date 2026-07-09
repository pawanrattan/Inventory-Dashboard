/**
 * User Repository
 * ===============
 * Handles all database queries related to user registration.
 * This layer ONLY does SQL — no business logic, no HTTP concerns.
 *
 * Uses:
 * - `query()` for simple read operations (uses pool automatically)
 * - `pool.getConnection()` for transactions (dedicated connection needed)
 */

import { query, pool, RowDataPacket, ResultSetHeader } from "@/lib/db";
import { PoolConnection } from "mysql2/promise";

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface UserRow extends RowDataPacket {
  id: number;
  employee_id: string;
  name: string;
  email: string;
  password_hash: string;
  role_id: number;
  department_id: number | null;
  is_active: boolean;
  last_login: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserWithDetails extends RowDataPacket {
  id: number;
  employee_id: string;
  name: string;
  email: string;
  role_name: string;
  department_name: string | null;
  is_active: boolean;
  created_at: Date;
}

export interface RoleRow extends RowDataPacket {
  id: number;
  role_name: string;
}

export interface DepartmentRow extends RowDataPacket {
  id: number;
  department_name: string;
}

export interface ModuleRow extends RowDataPacket {
  id: number;
  module_name: string;
}

// ─── Data Types for Insert ───────────────────────────────────────────────────

export interface CreateUserData {
  employee_id: string;
  name: string;
  email: string;
  password_hash: string;
  role_id: number;
  department_id: number;
}

export interface CreatePermissionData {
  department_id: number;
  module_id: number;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

// ─── Repository Functions ────────────────────────────────────────────────────

/**
 * Check if an employee_id already exists in the users table
 */
export async function findByEmployeeId(employeeId: string): Promise<UserRow | null> {
  const rows = await query<UserRow[]>(
    "SELECT * FROM users WHERE employee_id = ?",
    [employeeId]
  );
  return rows[0] || null;
}

/**
 * Check if an email already exists in the users table
 */
export async function findByEmail(email: string): Promise<UserRow | null> {
  const rows = await query<UserRow[]>(
    "SELECT * FROM users WHERE email = ?",
    [email]
  );
  return rows[0] || null;
}

/**
 * Verify that a role_id exists in the roles table
 */
export async function roleExists(roleId: number): Promise<boolean> {
  const rows = await query<RoleRow[]>(
    "SELECT id FROM roles WHERE id = ?",
    [roleId]
  );
  return rows.length > 0;
}

/**
 * Verify that a department_id exists in the departments table
 */
export async function departmentExists(departmentId: number): Promise<boolean> {
  const rows = await query<DepartmentRow[]>(
    "SELECT id FROM departments WHERE id = ?",
    [departmentId]
  );
  return rows.length > 0;
}

/**
 * Find a module by its name (case-insensitive match)
 * Returns the module row or null if not found
 */
export async function findModuleByName(moduleName: string): Promise<ModuleRow | null> {
  const rows = await query<ModuleRow[]>(
    "SELECT id, module_name FROM modules WHERE module_name = ?",
    [moduleName]
  );
  return rows[0] || null;
}

/**
 * Insert a new user into the users table
 * Uses a transaction connection (not pool) so it can be rolled back if needed
 */
export async function createUser(
  data: CreateUserData,
  connection: PoolConnection
): Promise<number> {
  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO users (employee_id, name, email, password_hash, role_id, department_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.employee_id, data.name, data.email, data.password_hash, data.role_id, data.department_id]
  );
  return result.insertId;
}

/**
 * Insert a module permission for a department
 * Uses INSERT IGNORE — if this department+module combo already exists, skip it
 * This prevents conflicts when multiple users in the same department are registered
 */
export async function insertModulePermission(
  data: CreatePermissionData,
  connection: PoolConnection
): Promise<void> {
  await connection.execute(
    `INSERT IGNORE INTO module_permissions (department_id, module_id, can_view, can_create, can_edit, can_delete)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.department_id, data.module_id, data.can_view, data.can_create, data.can_edit, data.can_delete]
  );
}

/**
 * Get a user by ID with role and department names joined
 * Used after creation to return the full user response (without password_hash)
 */
export async function getUserById(userId: number): Promise<UserWithDetails | null> {
  const rows = await query<UserWithDetails[]>(
    `SELECT u.id, u.employee_id, u.name, u.email,
            r.role_name, d.department_name,
            u.is_active, u.created_at
     FROM users u
     JOIN roles r ON u.role_id = r.id
     LEFT JOIN departments d ON u.department_id = d.id
     WHERE u.id = ?`,
    [userId]
  );
  return rows[0] || null;
}

/**
 * Get a connection from the pool (for transactions)
 */
export async function getConnection(): Promise<PoolConnection> {
  return pool.getConnection();
}
