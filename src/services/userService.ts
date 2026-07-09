/**
 * User Service
 * ============
 * Contains all business logic for user registration.
 * This layer:
 * - Validates business rules (duplicates, foreign key existence)
 * - Hashes passwords
 * - Manages database transactions
 * - Orchestrates repository calls
 *
 * It does NOT handle HTTP requests/responses — that's the route handler's job.
 */

import bcrypt from "bcryptjs";
import {
  findByEmployeeId,
  findByEmail,
  roleExists,
  departmentExists,
  findModuleByName,
  createUser,
  insertModulePermission,
  getUserById,
  getConnection,
  UserWithDetails,
} from "@/repository/userRepository";

// ─── Input Types ─────────────────────────────────────────────────────────────

export interface PermissionInput {
  module_name: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export interface RegisterUserInput {
  employee_id: string;
  name: string;
  email: string;
  password: string;
  role_id: number;
  department_id: number;
  permissions: PermissionInput[];
}

// ─── Result Type ─────────────────────────────────────────────────────────────

export interface RegisterResult {
  user: UserWithDetails;
}

// ─── Service Function ────────────────────────────────────────────────────────

/**
 * Register a new user
 *
 * Flow:
 * 1. Check if employee_id already exists → 409 conflict
 * 2. Check if email already exists → 409 conflict
 * 3. Verify role_id exists in roles table → 400 bad request
 * 4. Verify department_id exists in departments table → 400 bad request
 * 5. Resolve each module_name to module_id → 400 if any not found
 * 6. Hash the password with bcrypt (10 salt rounds)
 * 7. Begin database transaction
 * 8. Insert user into users table
 * 9. Insert permissions into module_permissions (INSERT IGNORE for duplicates)
 * 10. Commit transaction
 * 11. Fetch and return the created user (without password_hash)
 *
 * If anything fails at steps 8-9, the transaction is rolled back — no partial data.
 */
export async function registerUser(input: RegisterUserInput): Promise<RegisterResult> {
  // ─── Step 1: Check employee_id uniqueness ────────────────────────────────
  const existingEmployee = await findByEmployeeId(input.employee_id);
  if (existingEmployee) {
    throw { message: "Employee ID already exists", status: 409 };
  }

  // ─── Step 2: Check email uniqueness ──────────────────────────────────────
  const existingEmail = await findByEmail(input.email);
  if (existingEmail) {
    throw { message: "Email already exists", status: 409 };
  }

  // ─── Step 3: Verify role_id exists ───────────────────────────────────────
  const roleValid = await roleExists(input.role_id);
  if (!roleValid) {
    throw { message: "Invalid role_id — role does not exist", status: 400 };
  }

  // ─── Step 4: Verify department_id exists ─────────────────────────────────
  const deptValid = await departmentExists(input.department_id);
  if (!deptValid) {
    throw { message: "Invalid department_id — department does not exist", status: 400 };
  }

  // ─── Step 5: Resolve module names to IDs ─────────────────────────────────
  const resolvedPermissions: Array<{
    module_id: number;
    can_view: boolean;
    can_create: boolean;
    can_edit: boolean;
    can_delete: boolean;
  }> = [];

  for (const perm of input.permissions) {
    const moduleRow = await findModuleByName(perm.module_name);
    if (!moduleRow) {
      throw {
        message: `Module '${perm.module_name}' not found in modules table`,
        status: 400,
      };
    }
    resolvedPermissions.push({
      module_id: moduleRow.id,
      can_view: perm.can_view,
      can_create: perm.can_create,
      can_edit: perm.can_edit,
      can_delete: perm.can_delete,
    });
  }

  // ─── Step 6: Hash the password ───────────────────────────────────────────
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(input.password, salt);

  // ─── Step 7-9: Transaction — Insert user + permissions ───────────────────
  const connection = await getConnection();

  try {
    await connection.beginTransaction();

    // Step 8: Insert user
    const userId = await createUser(
      {
        employee_id: input.employee_id,
        name: input.name,
        email: input.email,
        password_hash: passwordHash,
        role_id: input.role_id,
        department_id: input.department_id,
      },
      connection
    );

    // Step 9: Insert permissions (INSERT IGNORE — skips if already exists)
    for (const perm of resolvedPermissions) {
      await insertModulePermission(
        {
          department_id: input.department_id,
          module_id: perm.module_id,
          can_view: perm.can_view,
          can_create: perm.can_create,
          can_edit: perm.can_edit,
          can_delete: perm.can_delete,
        },
        connection
      );
    }

    // Step 10: Commit
    await connection.commit();

    // Step 11: Fetch the created user with joined data
    const createdUser = await getUserById(userId);
    if (!createdUser) {
      throw { message: "User created but could not be retrieved", status: 500 };
    }

    return { user: createdUser };
  } catch (error) {
    // Rollback on any failure
    await connection.rollback();
    throw error;
  } finally {
    // Always release the connection back to the pool
    connection.release();
  }
}
