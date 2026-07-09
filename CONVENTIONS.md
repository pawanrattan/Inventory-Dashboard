# Project Conventions & Module Usage Guide

## Overview

This document defines the standard patterns for building features in this Next.js Inventory Dashboard. Follow these conventions to keep the codebase consistent and maintainable.

---

## Frontend

### State Management — Zustand

All client-side state is managed with Zustand stores located in `src/store/`.

```tsx
"use client";

import { useAuthStore } from "@/store/useAuthStore";

export default function Navbar() {
  const { user, logout } = useAuthStore();

  return (
    <nav>
      <span>{user?.name}</span>
      <button onClick={logout}>Logout</button>
    </nav>
  );
}
```

**Rules:**
- One store per domain (`useAuthStore`, `useInventoryStore`, `useOrderStore`)
- Always mark components using stores with `"use client"`
- Access store outside React (interceptors, utilities) via `useAuthStore.getState()`

---

### API Calls — apiClient

All HTTP requests to external or internal APIs go through the shared Axios instance at `src/lib/apiClient.ts`.

```ts
import apiClient from "@/lib/apiClient";

// GET
const { data } = await apiClient.get("/api/products");

// POST
const { data } = await apiClient.post("/api/products", { name: "Widget", sku: "WDG-001" });

// PUT
const { data } = await apiClient.put("/api/products/1", { quantity: 50 });

// DELETE
await apiClient.delete("/api/products/1");
```

**Rules:**
- Never use raw `fetch()` or `axios` directly — always use `apiClient`
- Token is auto-attached via request interceptor
- 401 responses auto-trigger logout via response interceptor
- Base URL is configured from `NEXT_PUBLIC_API_BASE_URL` env var

---

## Backend

### Database Queries — query function

All database access uses the `query` function from `src/lib/db.ts`. Never create your own connections.

```ts
import { query, RowDataPacket, ResultSetHeader } from "@/lib/db";

// SELECT (returns rows)
const users = await query<RowDataPacket[]>("SELECT * FROM users WHERE active = ?", [true]);

// SELECT single row
const [user] = await query<RowDataPacket[]>("SELECT * FROM users WHERE id = ?", [id]);

// INSERT (returns insertId)
const result = await query<ResultSetHeader>(
  "INSERT INTO products (name, sku, quantity, price) VALUES (?, ?, ?, ?)",
  ["Widget", "WDG-001", 100, 9.99]
);
console.log(result.insertId);

// UPDATE (returns affectedRows)
const result = await query<ResultSetHeader>(
  "UPDATE products SET quantity = ? WHERE id = ?",
  [50, 1]
);
console.log(result.affectedRows);

// DELETE
await query<ResultSetHeader>("DELETE FROM products WHERE id = ?", [id]);
```

**Rules:**
- Always use `?` parameterized placeholders — never interpolate values into SQL strings
- Use `RowDataPacket[]` as the generic for SELECT queries
- Use `ResultSetHeader` as the generic for INSERT/UPDATE/DELETE
- Database queries only live in the repository layer (`src/repositories/`)

---

### API Responses — apiResponse

All route handlers return responses using the helpers from `src/lib/apiResponse.ts`. Never use raw `NextResponse.json()` directly.

```ts
import { successResponse, errorResponse } from "@/lib/apiResponse";

// Success with data
return successResponse(products, "Products fetched");

// Success with custom status
return successResponse(newProduct, "Product created", 201);

// Error with message
return errorResponse("Product not found", 404);

// Error with detail
return errorResponse("Validation failed", 400, "Name field is required");
```

**Response shape (consistent across all endpoints):**

```json
// Success
{ "success": true, "message": "Products fetched", "data": [...] }

// Error
{ "success": false, "message": "Product not found", "error": "optional detail" }
```

**Rules:**
- Every route handler must return either `successResponse()` or `errorResponse()`
- Always wrap route handler logic in try/catch
- Use appropriate HTTP status codes (200, 201, 400, 401, 404, 500)

---

## Backend Architecture Layers

```
Route Handler (src/app/api/) → Service (src/services/) → Repository (src/repositories/)
```

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Route Handler | `src/app/api/` | Parse request, validate input, call service, return apiResponse |
| Service | `src/services/` | Business logic, orchestration, throw errors |
| Repository | `src/repositories/` | Database queries using `query()` function only |
| Models | `src/models/` | TypeScript interfaces shared across layers |
| Validators | `src/lib/validators/` | Zod schemas for input validation |

---

## Environment Variables

All env vars are validated at startup via `src/lib/env.ts`. Import `env` instead of using `process.env` directly.

```ts
import { env } from "@/lib/env";

// Correct
const secret = env.JWT_SECRET;

// Wrong — no type safety, no validation
const secret = process.env.JWT_SECRET;
```

---

## Repository Layer — `src/repositories/`

Repositories handle **only** database access. No business logic, no HTTP concerns.

```ts
// src/repositories/productRepository.ts
import { query, RowDataPacket, ResultSetHeader } from "@/lib/db";
import { Product, CreateProductInput } from "@/models/product";

interface ProductRow extends RowDataPacket {
  id: number;
  name: string;
  sku: string;
  quantity: number;
  price: number;
  created_at: Date;
  updated_at: Date;
}

class ProductRepository {
  async findAll(): Promise<Product[]> {
    return query<ProductRow[]>("SELECT * FROM products");
  }

  async findById(id: number): Promise<Product | null> {
    const rows = await query<ProductRow[]>("SELECT * FROM products WHERE id = ?", [id]);
    return rows[0] || null;
  }

  async findBySku(sku: string): Promise<Product | null> {
    const rows = await query<ProductRow[]>("SELECT * FROM products WHERE sku = ?", [sku]);
    return rows[0] || null;
  }

  async create(data: CreateProductInput): Promise<ResultSetHeader> {
    return query<ResultSetHeader>(
      "INSERT INTO products (name, sku, quantity, price) VALUES (?, ?, ?, ?)",
      [data.name, data.sku, data.quantity, data.price]
    );
  }

  async update(id: number, data: Partial<CreateProductInput>): Promise<ResultSetHeader> {
    const fields: string[] = [];
    const values: (string | number)[] = [];

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    });

    values.push(id);
    return query<ResultSetHeader>(`UPDATE products SET ${fields.join(", ")} WHERE id = ?`, values);
  }

  async delete(id: number): Promise<ResultSetHeader> {
    return query<ResultSetHeader>("DELETE FROM products WHERE id = ?", [id]);
  }
}

export const productRepository = new ProductRepository();
```

**Rules:**
- One repository per database table/entity
- Only use the `query()` function from `@/lib/db`
- Return raw data — no formatting, no HTTP responses
- Keep methods focused: one query per method
- Never import services or route handlers

---

## Service Layer — `src/services/`

Services contain **business logic**. They orchestrate repositories, enforce rules, and throw meaningful errors.

```ts
// src/services/productService.ts
import { productRepository } from "@/repositories/productRepository";
import { CreateProductInput, Product } from "@/models/product";

class ProductService {
  async getAll(): Promise<Product[]> {
    return productRepository.findAll();
  }

  async getById(id: number): Promise<Product> {
    const product = await productRepository.findById(id);
    if (!product) {
      throw new Error("Product not found");
    }
    return product;
  }

  async create(data: CreateProductInput): Promise<number> {
    // Business rule: SKU must be unique
    const existing = await productRepository.findBySku(data.sku);
    if (existing) {
      throw new Error("A product with this SKU already exists");
    }

    // Business rule: quantity cannot be negative
    if (data.quantity < 0) {
      throw new Error("Quantity cannot be negative");
    }

    const result = await productRepository.create(data);
    return result.insertId;
  }

  async update(id: number, data: Partial<CreateProductInput>): Promise<void> {
    // Ensure product exists
    await this.getById(id);

    // Business rule: if updating SKU, check it's not taken
    if (data.sku) {
      const existing = await productRepository.findBySku(data.sku);
      if (existing && existing.id !== id) {
        throw new Error("SKU already in use by another product");
      }
    }

    await productRepository.update(id, data);
  }

  async delete(id: number): Promise<void> {
    await this.getById(id); // ensure exists
    await productRepository.delete(id);
  }
}

export const productService = new ProductService();
```

**Rules:**
- One service per domain (not per table — a service can use multiple repositories)
- All business rules and validations live here
- Throw errors with descriptive messages — the route handler catches them
- Never import `NextResponse`, `NextRequest`, or anything HTTP-related
- Never call `query()` directly — always go through a repository

---

## Route Handler — Putting It All Together

```ts
// src/app/api/products/route.ts
import { NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/lib/apiResponse";
import { productService } from "@/services/productService";
import { createProductSchema } from "@/lib/validators/productSchema";

export async function GET() {
  try {
    const products = await productService.getAll();
    return successResponse(products, "Products fetched");
  } catch (error: any) {
    return errorResponse(error.message || "Failed to fetch products", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input with Zod
    const parsed = createProductSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse("Validation failed", 400, parsed.error.message);
    }

    // Call service — business logic happens there
    const insertId = await productService.create(parsed.data);
    return successResponse({ id: insertId }, "Product created", 201);
  } catch (error: any) {
    // Service threw a business error (e.g., "SKU already exists")
    if (error.message.includes("already exists")) {
      return errorResponse(error.message, 409);
    }
    return errorResponse(error.message || "Failed to create product", 500);
  }
}
```

**Rules:**
- Route handlers are thin controllers — they only handle HTTP concerns
- Parse and validate input → call service → return apiResponse
- Never write SQL or business logic in route handlers
- Always wrap in try/catch and return appropriate error responses

---

## Data Flow Summary

```
Frontend Component
  → useAuthStore / useInventoryStore (state)
  → apiClient.get/post/put/delete (HTTP call)
    → Route Handler (parse request, validate)
      → Service (business logic, rules)
        → Repository (SQL query via query())
          → MySQL Database
        ← raw data
      ← processed data or thrown error
    ← successResponse / errorResponse
  ← response.data.data / response.data.message
```

---

## Quick Reference

| Task | Use | Import From |
|------|-----|-------------|
| Frontend state | Zustand store | `@/store/useXxxStore` |
| Frontend API calls | `apiClient` | `@/lib/apiClient` |
| Database queries | `query()` | `@/lib/db` |
| API responses | `successResponse` / `errorResponse` | `@/lib/apiResponse` |
| Env variables | `env` | `@/lib/env` |
| Input validation | Zod schemas | `@/lib/validators/xxxSchema` |
