# Project Conventions & Module Usage Guide

## Overview

This document defines the standard patterns for building features in this Next.js Inventory Dashboard. Follow these conventions to keep the codebase consistent and maintainable.

---

## Authentication & Access Control

### Database Schema

5 tables power the auth system:

```
roles            → Admin, Manager, User
departments      → Planning, Purchase, Inventory, Sales, Finance, Administration
modules          → Planning, Purchase, Inventory, Production, Sales, Finance, Dashboard
users            → employee_id, name, email, password_hash, role_id, department_id
module_permissions → department_id + module_id + can_view/create/edit/delete
```

### Access Control Logic

- **Admin** (role_name = "Admin", department = "Administration"): Full access to all modules. Permission checks are **bypassed** in code.
- **Manager/User**: Access determined by their `department_id` → lookup `module_permissions` for that department.
- Permissions are CRUD-level: `can_view`, `can_create`, `can_edit`, `can_delete`.
- Every user belongs to a department (including Admin → "Administration").

### User Registration Flow (Frontend UI Order)

```
Step 1: Select Department  → Planning / Purchase / Sales / etc.
Step 2: Select Role        → Manager / User (if dept = Administration → role = Admin)
Step 3: Set Permissions    → Module checkboxes (auto-suggest based on department)
         (If role = Admin → skip this step, full access is granted via code)
Step 4: Fill Details       → employee_id, name, email, password
```

### Login Flow

```
User enters Employee ID + Password (only 2 fields)
  ↓
System finds user → checks password → gets role + department + permissions
  ↓
Returns JWT with: userId, employeeId, role, department, permissions
```

### Seeding the First Admin

Since registration requires an existing Admin to be logged in, the first Admin must be seeded via SQL:

```bash
node scripts/hashPassword.js    # Generates bcrypt hash
# Then run the printed SQL in MySQL client
```

---

## Frontend

### State Management — Zustand

All client-side state is managed with Zustand stores located in `src/store/`.

```tsx
"use client";

import { useAuthStore } from "@/store/useAuthStore";

export default function Navbar() {
  const { user, logout, hasPermission } = useAuthStore();

  return (
    <nav>
      <span>{user?.name}</span>
      {hasPermission("Inventory", "can_edit") && <EditButton />}
      <button onClick={logout}>Logout</button>
    </nav>
  );
}
```

**Rules:**
- One store per domain (`useAuthStore`, `useInventoryStore`, `useOrderStore`)
- Always mark components using stores with `"use client"`
- Access store outside React (interceptors, utilities) via `useAuthStore.getState()`
- Use `hasPermission(moduleName, action)` for conditional UI rendering

---

### API Calls — apiClient

All HTTP requests go through the shared Axios instance at `src/lib/apiClient.ts`.

```ts
import apiClient from "@/lib/apiClient";

const { data } = await apiClient.get("/departments");
const { data } = await apiClient.post("/users/register", payload);
```

**Rules:**
- Never use raw `fetch()` or `axios` directly — always use `apiClient`
- Token is auto-attached via request interceptor
- 401 responses auto-trigger logout via response interceptor
- Base URL: `NEXT_PUBLIC_API_BASE_URL` env var

---

## Backend

### Architecture Layers

```
Route Handler (src/app/api/) → Service (src/services/) → Repository (src/repository/)
```

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Route Handler | `src/app/api/` | Parse request, validate input (Zod), call service, return apiResponse |
| Service | `src/services/` | Business logic, orchestration, transactions, throw errors |
| Repository | `src/repository/` | Database queries using `query()` or `connection.execute()` only |

**Rules:**
- SQL only in repository
- Business logic only in service
- HTTP concerns only in route handler
- Never skip a layer (route → service → repository)

---

### Database Queries — query function

```ts
import { query, pool, RowDataPacket, ResultSetHeader } from "@/lib/db";

// Simple read (uses pool automatically)
const rows = await query<RowDataPacket[]>("SELECT * FROM users WHERE id = ?", [id]);

// Insert/Update/Delete
const result = await query<ResultSetHeader>("INSERT INTO ...", [...]);
```

**Rules:**
- Always use `?` parameterized placeholders — never interpolate values
- Use `RowDataPacket[]` for SELECT, `ResultSetHeader` for INSERT/UPDATE/DELETE
- For transactions, use `pool.getConnection()` (see Transaction Pattern below)

---

### API Responses — apiResponse

```ts
import { successResponse, errorResponse } from "@/lib/apiResponse";

return successResponse(data, "Message", 201);
return errorResponse("Error message", 400, "Optional detail");
```

**Response shape:**
```json
{ "sucess": true, "message": "...", "data": {...} }
{ "sucess": false, "message": "...", "error": "..." }
```

---

### Environment Variables

Uses lazy getter pattern in `src/lib/env.ts` for Next.js 16 Turbopack compatibility.
Server-side env vars are explicitly passed via `next.config.ts` `env` property.

```ts
import { env } from "@/lib/env";

const host = env.DB_HOST;
const secret = env.JWT_SECRET;
```

**Required `.env` variables:**
```
DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
JWT_SECRET, JWT_EXPIRES_IN
NEXT_PUBLIC_API_BASE_URL
```

---

### Input Validation — Zod v4

This project uses **Zod v4** (`zod@^4.4.3`). Key differences from v3:

```ts
import { z } from "zod";

// Email (v4 — standalone, not z.string().email())
email: z.email("Invalid email format")

// Error access (v4 — .issues, not .errors)
if (!parsed.success) {
  const firstIssue = parsed.error.issues[0];
}
```

---

## Transaction Pattern

When multiple inserts need to succeed or fail together:

```ts
import { pool } from "@/lib/db";

const connection = await pool.getConnection();
try {
  await connection.beginTransaction();
  await connection.execute("INSERT INTO ...", [...]);
  await connection.execute("INSERT INTO ...", [...]);
  await connection.commit();
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
}
```

---

## Implemented APIs

### POST /api/users/register

**Purpose:** Register a new user with role, department, and module permissions.

**Authentication:** Will be Admin-only (after login API is built). Currently open for testing.

**Request Body:**
```json
{
  "employee_id": "EMP002",
  "name": "Rahul Pawa",
  "email": "rahul@rattanindia.com",
  "password": "Rahul@2026",
  "role_id": 2,
  "department_id": 5,
  "permissions": [
    {
      "module_name": "Sales",
      "can_view": true,
      "can_create": true,
      "can_edit": true,
      "can_delete": true
    },
    {
      "module_name": "Dashboard",
      "can_view": true,
      "can_create": false,
      "can_edit": false,
      "can_delete": false
    }
  ]
}
```

**Success Response (201):**
```json
{
  "sucess": true,
  "message": "User registered successfully",
  "data": {
    "id": 2,
    "employee_id": "EMP002",
    "name": "Rahul Pawa",
    "email": "rahul@rattanindia.com",
    "role_name": "Manager",
    "department_name": "Sales",
    "is_active": true,
    "created_at": "2026-07-09T..."
  }
}
```

**Error Responses:**
| Status | When |
|--------|------|
| 400 | Validation failed, module not found, invalid role/dept |
| 409 | Employee ID or email already exists |
| 500 | Unexpected server error |

**Internal Flow:**
```
Route (Zod validate) → Service → Repository → MySQL
                         │
                         ├── Check employee_id unique
                         ├── Check email unique
                         ├── Verify role_id exists in roles table
                         ├── Verify department_id exists in departments table
                         ├── Resolve module_name → module_id from modules table
                         ├── Hash password (bcrypt, 10 rounds)
                         ├── BEGIN TRANSACTION
                         │     ├── INSERT INTO users
                         │     └── INSERT IGNORE INTO module_permissions
                         ├── COMMIT
                         └── Return user (no password_hash)
```

---

## Database Tables

### Schema

```sql
roles (id, role_name, description, created_at)
departments (id, department_name, description, created_at)
modules (id, module_name, description, created_at)
users (id, employee_id, name, email, password_hash, role_id, department_id, is_active, last_login, created_at, updated_at)
module_permissions (id, department_id, module_id, can_view, can_create, can_edit, can_delete, created_at)
```

### Relationships

```
users.role_id        → roles.id
users.department_id  → departments.id
module_permissions.department_id → departments.id
module_permissions.module_id    → modules.id
UNIQUE(department_id, module_id) on module_permissions
```

### Seed Data

```
Roles: Admin, Manager, User
Departments: Planning, Purchase, Inventory, Production, Sales, Finance, Administration
Modules: Planning, Purchase, Inventory, Production, Sales, Finance, Dashboard
```

### Key Design Decisions

- Permissions are **department-level** (not user-level). All users in a department share permissions.
- `INSERT IGNORE` prevents conflicts when registering multiple users in the same department.
- Admin gets full access via **role check in code** — not via module_permissions rows.
- Every user has a department (Admin → "Administration").
- `modules` table exists separately from `departments` to avoid typos and enable renaming.

---

## File Structure

```
src/
├── app/
│   └── api/
│       └── users/
│           └── register/
│               └── route.ts        ← API route handler
├── lib/
│   ├── apiClient.ts                ← Axios instance (frontend)
│   ├── apiResponse.ts              ← successResponse / errorResponse helpers
│   ├── db.ts                       ← MySQL pool + query() helper
│   └── env.ts                      ← Environment variable access (lazy getters)
├── repository/
│   └── userRepository.ts           ← SQL queries for user operations
├── services/
│   └── userService.ts              ← Business logic for registration
├── store/
│   └── useAuthStore.ts             ← Zustand auth state + hasPermission()
scripts/
└── hashPassword.js                 ← One-time bcrypt hash generator for seeding
.env                                ← Environment variables (not committed)
next.config.ts                      ← Exposes server env vars for Next.js 16
```

---

## Quick Reference

| Task | Use | Import From |
|------|-----|-------------|
| Frontend state | Zustand store | `@/store/useXxxStore` |
| Frontend API calls | `apiClient` | `@/lib/apiClient` |
| Database queries | `query()` | `@/lib/db` |
| Transactions | `pool.getConnection()` | `@/lib/db` |
| API responses | `successResponse` / `errorResponse` | `@/lib/apiResponse` |
| Env variables | `env` | `@/lib/env` |
| Input validation | Zod v4 schemas | `zod` |
| Password hashing | `bcrypt.hashSync(password, 10)` | `bcryptjs` |
| JWT signing | `jwt.sign(payload, secret, options)` | `jsonwebtoken` |
