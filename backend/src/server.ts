import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { z } from "zod";
import { pool, tx } from "./db";
import { runMigrations } from "./migrate";
import { PoolClient } from "pg";
import {
  businessDate,
  isValidInvoiceCode,
  isValidDateOnly,
  shouldReserveSoldProduct,
} from "./business";

type User = {
  id: string;
  name: string;
  username: string;
  role: "ADMIN" | "EMPLOYEE";
};
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
const app = express(),
  secret = process.env.JWT_SECRET || "development-only-change-me";
app.set("trust proxy", 1);
const uploadDir = process.env.UPLOAD_DIR || path.resolve("uploads");
fs.mkdirSync(path.join(uploadDir, "products"), { recursive: true });
app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || "").split(",").filter(Boolean).length
      ? (process.env.CORS_ORIGIN || "").split(",")
      : true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(uploadDir));
const asyncRoute =
  (fn: (r: Request, s: Response, n: NextFunction) => Promise<unknown>) =>
  (r: Request, s: Response, n: NextFunction) =>
    Promise.resolve(fn(r, s, n)).catch(n);
const error = (code: string, message: string, status = 400) =>
  Object.assign(new Error(message), { code, status });
const auth =
  (roles?: User["role"][]) =>
  asyncRoute(async (req: Request, _: Response, next: NextFunction) => {
    let tokenUser: User;
    try {
      const token = req.headers.authorization?.replace(/^Bearer\s+/, "");
      if (!token) throw error("UNAUTHORIZED", "Login required", 401);
      tokenUser = jwt.verify(token, secret) as User;
    } catch (e) {
      throw (e as any).code
        ? e
        : error("UNAUTHORIZED", "Invalid or expired login", 401);
    }

    const current = await pool.query(
      "SELECT id,name,username,role,is_active FROM users WHERE id=$1",
      [tokenUser.id],
    );
    if (!current.rowCount || !current.rows[0].is_active)
      throw error("UNAUTHORIZED", "This account is no longer active", 401);

    const user = {
      id: current.rows[0].id,
      name: current.rows[0].name,
      username: current.rows[0].username,
      role: current.rows[0].role,
    } as User;
    if (roles && !roles.includes(user.role))
      throw error("FORBIDDEN", "You do not have access to this action", 403);
    req.user = user;
    next();
  });
const audit = async (
  c: PoolClient,
  user: User,
  action: string,
  type: string,
  id?: string,
  details = {},
) =>
  c.query(
    "INSERT INTO audit_logs(user_id,action,entity_type,entity_id,details) VALUES($1,$2,$3,$4,$5)",
    [user.id, action, type, id || null, details],
  );
const changedValues = (
  before: Record<string, any>,
  after: Record<string, any>,
  fields: string[],
) =>
  Object.fromEntries(
    fields
      .filter((field) => before[field] !== after[field])
      .map((field) => [
        field,
        { oldValue: before[field] ?? null, newValue: after[field] ?? null },
      ]),
  );
const productEvent = async (
  c: PoolClient,
  user: User,
  productId: string | undefined,
  action: string,
  notes?: string,
  change?: { fieldName: string; oldValue: string; newValue: string },
  knownProductName?: string,
) => {
  const productName =
    knownProductName ??
    (productId
      ? (await c.query("SELECT name FROM products WHERE id=$1", [productId]))
          .rows[0]?.name
      : null);
  return c.query(
    "INSERT INTO product_events(product_id,product_name,action,field_name,old_value,new_value,user_id,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      productId || null,
      productName || null,
      action,
      change?.fieldName || null,
      change?.oldValue ?? null,
      change?.newValue ?? null,
      user.id,
      notes || null,
    ],
  );
};
const id = z.string().uuid();
const numericValue = z.union([
  z.number().finite(),
  z
    .string()
    .regex(/^(?:\d+(?:\.\d+)?|\.\d+)$/, "Enter a valid numeric value")
    .transform(Number),
]);
const positiveInteger = numericValue
  .refine(Number.isInteger, "Enter a whole number")
  .refine((value) => value > 0, "Enter a number greater than zero");
const qty = positiveInteger;
const invoiceCodeSchema = z
  .string()
  .max(100)
  .refine(isValidInvoiceCode, "Invoice code must contain digits only");
const dateOnly = z
  .string()
  .refine(isValidDateOnly, "Choose a valid calendar date");
const databaseDate = (value: unknown) => {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}/.test(text)
    ? text.slice(0, 10)
    : businessDate(new Date(text));
};
const productSchema = z.object({
  name: z.string().min(1),
  categoryId: id,
  supplierId: id,
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});
const inventoryProductResponse = (product: Record<string, any>) => {
  const visibleProduct = { ...product };
  delete visibleProduct.purchase_price;
  delete visibleProduct.selling_price;
  delete visibleProduct.width;
  delete visibleProduct.height;
  delete visibleProduct.depth;
  delete visibleProduct.material;
  delete visibleProduct.color;
  return visibleProduct;
};
app.get(
  "/health",
  asyncRoute(async (_q, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  }),
);
app.post(
  "/api/auth/login",
  rateLimit({
    windowMs: 60000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  asyncRoute(async (req, res) => {
    const { username, password } = z
      .object({ username: z.string().min(1), password: z.string().min(1) })
      .parse(req.body);
    const r = await pool.query("SELECT * FROM users WHERE username=$1", [
      username,
    ]);
    const u = r.rows[0];
    if (
      !u ||
      !u.is_active ||
      !(await bcrypt.compare(password, u.password_hash))
    )
      throw error("INVALID_LOGIN", "Invalid username or password", 401);
    const user = {
      id: u.id,
      name: u.name,
      username: u.username,
      role: u.role,
    } as User;
    await pool.query("UPDATE users SET last_login=now() WHERE id=$1", [u.id]);
    await pool.query(
      "INSERT INTO audit_logs(user_id,action,entity_type,entity_id) VALUES($1,'LOGIN','USER',$1)",
      [u.id],
    );
    res.json({ token: jwt.sign(user, secret, { expiresIn: "12h" }), user });
  }),
);
app.get("/api/auth/me", auth(), (req, res) => res.json(req.user));
app.put(
  "/api/auth/password",
  auth(),
  asyncRoute(async (req, res) => {
    const x = z
      .object({
        oldPassword: z.string().min(1),
        newPassword: z.string().min(8),
        confirmPassword: z.string().min(8),
      })
      .parse(req.body);
    if (x.newPassword !== x.confirmPassword)
      throw error(
        "PASSWORD_MISMATCH",
        "New password and confirmation must match",
      );
    if (x.oldPassword === x.newPassword)
      throw error(
        "PASSWORD_REUSE",
        "New password must be different from the old password",
      );
    await tx(async (c) => {
      const user = await c.query(
        "SELECT password_hash FROM users WHERE id=$1 FOR UPDATE",
        [req.user!.id],
      );
      if (
        !user.rowCount ||
        !(await bcrypt.compare(x.oldPassword, user.rows[0].password_hash))
      )
        throw error("INVALID_PASSWORD", "Current password is incorrect");
      await c.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
        await bcrypt.hash(x.newPassword, 12),
        req.user!.id,
      ]);
      await audit(c, req.user!, "CHANGE_PASSWORD", "USER", req.user!.id);
    });
    res.json({ ok: true });
  }),
);

const supplierSchema = z.object({
  name: z.string().trim().min(1),
  notes: z.string().optional().nullable(),
});
app.get(
  "/api/suppliers",
  auth(),
  asyncRoute(async (_req, res) => {
    const result = await pool.query(
      `WITH available AS (
         SELECT product.supplier_id,
           COALESCE(sum(product.current_quantity),0)::integer available_products
         FROM products product
         WHERE product.is_active AND product.supplier_id IS NOT NULL
         GROUP BY product.supplier_id
       ), registered AS (
         SELECT history.supplier_id,count(*)::integer unique_products_registered
         FROM (
           SELECT product.supplier_id,product.id product_id
           FROM products product
           WHERE product.supplier_id IS NOT NULL
           UNION
           SELECT movement.supplier_id,movement.product_id
           FROM stock_movements movement
           WHERE movement.supplier_id IS NOT NULL
         ) history
         GROUP BY history.supplier_id
       )
       SELECT supplier.id,supplier.name,supplier.notes,supplier.created_at,supplier.updated_at,
         COALESCE(available.available_products,0) available_products,
         COALESCE(registered.unique_products_registered,0) unique_products_registered
       FROM suppliers supplier
       LEFT JOIN available ON available.supplier_id=supplier.id
       LEFT JOIN registered ON registered.supplier_id=supplier.id
       ORDER BY supplier.name`,
    );
    res.json(result.rows);
  }),
);
app.post(
  "/api/suppliers",
  auth(["ADMIN"]),
  asyncRoute(async (req, res) => {
    const values = supplierSchema.parse(req.body);
    const created = await tx(async (client) => {
      const result = await client.query(
        "INSERT INTO suppliers(name,notes) VALUES($1,$2) RETURNING id,name,notes,created_at,updated_at",
        [values.name, values.notes || null],
      );
      await audit(client, req.user!, "CREATE", "SUPPLIER", result.rows[0].id, {
        name: result.rows[0].name,
        notes: result.rows[0].notes,
      });
      return result.rows[0];
    });
    res.status(201).json(created);
  }),
);
app.patch(
  "/api/suppliers/:id",
  auth(["ADMIN"]),
  asyncRoute(async (req, res) => {
    const values = supplierSchema.partial().parse(req.body);
    if (!Object.keys(values).length)
      throw error("VALIDATION", "No changes supplied");
    const supplierId = id.parse(req.params.id);
    const updated = await tx(async (client) => {
      const before = await client.query(
        "SELECT id,name,notes FROM suppliers WHERE id=$1 FOR UPDATE",
        [supplierId],
      );
      if (!before.rowCount)
        throw error("NOT_FOUND", "Supplier not found", 404);
      const result = await client.query(
        "UPDATE suppliers SET name=COALESCE($1,name),notes=$2,updated_at=now() WHERE id=$3 RETURNING id,name,notes,created_at,updated_at",
        [values.name, values.notes === undefined ? before.rows[0].notes : values.notes || null, supplierId],
      );
      const changes = changedValues(before.rows[0], result.rows[0], [
        "name",
        "notes",
      ]);
      if (Object.keys(changes).length)
        await audit(client, req.user!, "UPDATE", "SUPPLIER", supplierId, {
          name: result.rows[0].name,
          changes,
        });
      return result.rows[0];
    });
    res.json(updated);
  }),
);
app.get(
  "/api/suppliers/:id/inventory",
  auth(),
  asyncRoute(async (req, res) => {
    const supplierId = id.parse(req.params.id);
    const supplier = await pool.query(
      "SELECT id,name,notes FROM suppliers WHERE id=$1",
      [supplierId],
    );
    if (!supplier.rowCount)
      throw error("NOT_FOUND", "Supplier not found", 404);
    const [products, movements] = await Promise.all([
      pool.query(
        `WITH supplier_products AS (
           SELECT product.id
           FROM products product
           WHERE product.supplier_id=$1
           UNION
           SELECT movement.product_id
           FROM stock_movements movement
           WHERE movement.supplier_id=$1
         )
         SELECT product.id,product.name,
           product.current_quantity quantity,
           COALESCE(json_object_agg(warehouse.slug,COALESCE(stock.quantity,0))
             FILTER (WHERE warehouse.id IS NOT NULL),json_build_object()) location_quantities
         FROM supplier_products related
         JOIN products product ON product.id=related.id
         CROSS JOIN warehouses warehouse
         LEFT JOIN product_location_stock stock
           ON stock.product_id=product.id AND stock.warehouse_id=warehouse.id
         GROUP BY product.id
         ORDER BY product.name`,
        [supplierId],
      ),
      pool.query(
        `WITH supplier_products AS (
           SELECT product.id
           FROM products product
           WHERE product.supplier_id=$1
           UNION
           SELECT movement.product_id
           FROM stock_movements movement
           WHERE movement.supplier_id=$1
         )
         SELECT movement.id,movement.product_id,movement.type,movement.quantity,
           movement.business_date,movement.invoice_code,movement.created_at,movement.notes,
           movement.deleted_at,product.name product_name,
           actor.name employee_name,
           CASE WHEN destination.name IS NULL THEN warehouse.name
             ELSE warehouse.name || ' → ' || destination.name END warehouse_name,
           CASE
             WHEN movement.type='REVERSED' THEN NULL
             WHEN movement.deleted_at IS NOT NULL THEN 'REVERSED'
             ELSE 'ACTIVE'
           END status
         FROM stock_movements movement
         JOIN supplier_products related ON related.id=movement.product_id
         JOIN products product ON product.id=movement.product_id
         JOIN users actor ON actor.id=movement.user_id
         LEFT JOIN warehouses warehouse ON warehouse.id=movement.warehouse_id
         LEFT JOIN warehouses destination
           ON destination.id=movement.destination_warehouse_id
         WHERE movement.type IN ('IMPORT','SUPPLIER_RETURN','SOLD','CORRECTION','TRANSPORT','REVERSED')
         ORDER BY COALESCE(movement.business_date,movement.created_at::date) DESC,
           movement.created_at DESC
         LIMIT 500`,
        [supplierId],
      ),
    ]);
    res.json({ supplier: supplier.rows[0], products: products.rows, actions: movements.rows });
  }),
);
app.get(
  "/api/warehouses",
  auth(),
  asyncRoute(async (_req, res) => {
    const result = await pool.query(
      "SELECT id,name,slug,kind FROM warehouses ORDER BY CASE kind WHEN 'SHOWROOM' THEN 0 ELSE 1 END,name",
    );
    res.json(result.rows);
  }),
);

app.get(
  "/api/invoices",
  auth(),
  asyncRoute(async (_req, res) => {
    const result = await pool.query(
      `SELECT invoice.id,invoice.code,
         count(DISTINCT batch.product_id)::integer product_count,
         COALESCE(sum(batch.imported_quantity),0)::integer imported_quantity,
         COALESCE(sum((
           SELECT sum(location.quantity)
           FROM inventory_batch_locations location
           WHERE location.batch_id=batch.id
         )),0)::integer remaining_quantity,
         max(batch.import_date) last_import_date
       FROM invoice_codes invoice
       LEFT JOIN inventory_batches batch ON batch.invoice_code=invoice.code
       GROUP BY invoice.id,invoice.code
       ORDER BY invoice.code`,
    );
    res.json(result.rows);
  }),
);

app.post(
  "/api/invoices",
  auth(["ADMIN"]),
  asyncRoute(async (req, res) => {
    const code = invoiceCodeSchema.parse(req.body?.code);
    const created = await tx(async (c) => {
      const result = await c.query(
        `INSERT INTO invoice_codes(code,created_by)
         VALUES($1,$2)
         RETURNING id,code,created_at`,
        [code, req.user!.id],
      );
      await audit(c, req.user!, "CREATE", "INVOICE_CODE", result.rows[0].id, {
        code,
      });
      return result.rows[0];
    });
    res.status(201).json(created);
  }),
);

app.patch(
  "/api/invoices/:code",
  auth(["ADMIN"]),
  asyncRoute(async (req, res) => {
    const currentCode = invoiceCodeSchema.parse(req.params.code);
    const newCode = invoiceCodeSchema.parse(req.body?.code);
    const updated = await tx(async (c) => {
      const current = await c.query(
        "SELECT id,code FROM invoice_codes WHERE code=$1 FOR UPDATE",
        [currentCode],
      );
      if (!current.rowCount) throw error("NOT_FOUND", "Invoice not found", 404);
      const result = await c.query(
        `UPDATE invoice_codes SET code=$1,updated_at=now()
         WHERE id=$2 RETURNING id,code,created_at,updated_at`,
        [newCode, current.rows[0].id],
      );
      if (currentCode !== newCode)
        await audit(c, req.user!, "UPDATE", "INVOICE_CODE", current.rows[0].id, {
          code: newCode,
          oldCode: currentCode,
          newCode,
        });
      return result.rows[0];
    });
    res.json(updated);
  }),
);

app.delete(
  "/api/invoices/:code",
  auth(["ADMIN"]),
  asyncRoute(async (req, res) => {
    const code = invoiceCodeSchema.parse(req.params.code);
    await tx(async (c) => {
      const current = await c.query(
        "SELECT id,code FROM invoice_codes WHERE code=$1 FOR UPDATE",
        [code],
      );
      if (!current.rowCount) throw error("NOT_FOUND", "Invoice not found", 404);
      const usage = await c.query(
        `SELECT EXISTS(
           SELECT 1 FROM inventory_batches WHERE invoice_code=$1
           UNION ALL
           SELECT 1 FROM stock_movements WHERE invoice_code=$1
         ) used`,
        [code],
      );
      if (usage.rows[0].used)
        throw error(
          "INVOICE_HAS_PRODUCTS",
          "Invoice Contains Products, It can't be DELETED",
          409,
        );
      await c.query("DELETE FROM invoice_codes WHERE id=$1", [current.rows[0].id]);
      await audit(c, req.user!, "DELETE", "INVOICE_CODE", current.rows[0].id, {
        code,
      });
    });
    res.json({ deleted: true });
  }),
);

app.get(
  "/api/invoices/:code",
  auth(),
  asyncRoute(async (req, res) => {
    const code = invoiceCodeSchema.parse(req.params.code);
    const invoice = await pool.query(
      "SELECT id FROM invoice_codes WHERE code=$1",
      [code],
    );
    if (!invoice.rowCount) throw error("NOT_FOUND", "Invoice not found", 404);
    const dates = await pool.query(
      `SELECT DISTINCT import_date
       FROM inventory_batches
       WHERE invoice_code=$1
       ORDER BY import_date DESC`,
      [code],
    );
    if (!dates.rowCount) {
      res.json({ code, selected_date: null, dates: [], products: [] });
      return;
    }
    const selectedDate = req.query.importDate
      ? dateOnly.parse(String(req.query.importDate))
      : databaseDate(dates.rows[0].import_date);
    if (
      !dates.rows.some(
        (row) => databaseDate(row.import_date) === selectedDate,
      )
    )
      throw error("NOT_FOUND", "This invoice has no imports on that date", 404);
    const products = await pool.query(
      `SELECT product.id product_id,product.name product_name,
         supplier.name supplier_name,
         sum(batch.imported_quantity)::integer imported_quantity,
         COALESCE(sum((
           SELECT sum(location.quantity)
           FROM inventory_batch_locations location
           WHERE location.batch_id=batch.id
         )),0)::integer remaining_quantity,
         COALESCE((
           SELECT json_agg(warehouse_stock ORDER BY warehouse_stock.warehouse_name)
           FROM (
             SELECT warehouse.name warehouse_name,
               sum(location.quantity)::integer quantity
             FROM inventory_batches warehouse_batch
             JOIN inventory_batch_locations location
               ON location.batch_id=warehouse_batch.id
             JOIN warehouses warehouse ON warehouse.id=location.warehouse_id
             WHERE warehouse_batch.invoice_code=$1
               AND warehouse_batch.import_date=$2::date
               AND warehouse_batch.product_id=product.id
               AND warehouse_batch.supplier_id IS NOT DISTINCT FROM supplier.id
               AND location.quantity>0
             GROUP BY warehouse.id,warehouse.name
           ) warehouse_stock
         ),'[]'::json) warehouse_stock
       FROM inventory_batches batch
       JOIN products product ON product.id=batch.product_id
       LEFT JOIN suppliers supplier ON supplier.id=batch.supplier_id
       WHERE batch.invoice_code=$1 AND batch.import_date=$2::date
       GROUP BY product.id,product.name,supplier.id,supplier.name
       ORDER BY product.name,supplier.name`,
      [code, selectedDate],
    );
    res.json({
      code,
      selected_date: selectedDate,
      dates: dates.rows.map((row) => databaseDate(row.import_date)),
      products: products.rows,
    });
  }),
);

app.get(
  "/api/categories",
  auth(),
  asyncRoute(async (req, res) => {
    const q = String(req.query.q || "");
    const result = await pool.query(
      `SELECT c.*,count(p.id)::integer product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id=c.id
       ${q ? "WHERE c.name ILIKE $1" : ""}
       GROUP BY c.id
       ORDER BY c.name`,
      q ? [`%${q}%`] : [],
    );
    res.json(result.rows);
  }),
);
app.post(
  "/api/categories",
  auth(["ADMIN"]),
  asyncRoute(async (req, res) => {
    const x = z.object({ name: z.string().min(1) }).parse(req.body);
    const created = await tx(async (c) => {
      const r = await c.query(
        "INSERT INTO categories(name) VALUES($1) RETURNING *",
        [x.name],
      );
      await audit(c, req.user!, "CREATE", "CATEGORY", r.rows[0].id, {
        name: r.rows[0].name,
      });
      return r.rows[0];
    });
    res.status(201).json(created);
  }),
);
app.patch(
  "/api/categories/:id",
  auth(["ADMIN"]),
  asyncRoute(async (req, res) => {
    const x = z
      .object({
        name: z.string().min(1).optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);
    const categoryId = id.parse(req.params.id);
    const updated = await tx(async (c) => {
      const before = await c.query(
        "SELECT * FROM categories WHERE id=$1 FOR UPDATE",
        [categoryId],
      );
      if (!before.rowCount)
        throw error("NOT_FOUND", "Category not found", 404);
      const r = await c.query(
        "UPDATE categories SET name=COALESCE($1,name),is_active=COALESCE($2,is_active) WHERE id=$3 RETURNING *",
        [x.name, x.isActive, categoryId],
      );
      const changes = changedValues(before.rows[0], r.rows[0], [
        "name",
        "is_active",
      ]);
      if (Object.keys(changes).length)
        await audit(c, req.user!, "UPDATE", "CATEGORY", categoryId, {
          name: r.rows[0].name,
          changes,
        });
      return r.rows[0];
    });
    res.json(updated);
  }),
);
app.delete(
  "/api/categories/:id",
  auth(["ADMIN"]),
  asyncRoute(async (req, res) => {
    const categoryId = id.parse(req.params.id);
    const result = await tx(async (c) => {
      const category = await c.query(
        "SELECT id,name,is_active FROM categories WHERE id=$1 FOR UPDATE",
        [categoryId],
      );
      if (!category.rowCount)
        throw error("NOT_FOUND", "Category not found", 404);
      const products = await c.query(
        "SELECT count(*)::integer count FROM products WHERE category_id=$1",
        [categoryId],
      );
      const referencedProducts = +products.rows[0].count;
      if (referencedProducts > 0) {
        await c.query("UPDATE categories SET is_active=false WHERE id=$1", [
          categoryId,
        ]);
        await audit(c, req.user!, "ARCHIVE", "CATEGORY", categoryId, {
          referencedProducts,
        });
        return { archived: true, referencedProducts };
      }
      await c.query("DELETE FROM categories WHERE id=$1", [categoryId]);
      await audit(c, req.user!, "DELETE", "CATEGORY", categoryId, {
        name: category.rows[0].name,
      });
      return { deleted: true, referencedProducts: 0 };
    });
    res.json(result);
  }),
);

app.get(
  "/api/products",
  auth(),
  asyncRoute(async (req, res) => {
    const q = String(req.query.q || ""),
      status = String(req.query.status || "active"),
      out = req.query.out === "true";
    const where: string[] = [];
    const p: any[] = [];
    let warehouseJoin = "";
    let warehouseQuantity = "NULL::integer warehouse_quantity";
    let invoiceWarehouseCondition = "";
    let invoiceCodeCondition = "";
    if (q) {
      p.push(`%${q}%`);
      where.push(`p.name ILIKE $${p.length}`);
    }
    if (status !== "all") {
      p.push(status === "active");
      where.push(`p.is_active=$${p.length}`);
    }
    if (req.query.categoryId) {
      p.push(id.parse(String(req.query.categoryId)));
      where.push(`p.category_id=$${p.length}`);
    }
    if (req.query.supplierId) {
      p.push(id.parse(String(req.query.supplierId)));
      where.push(`p.supplier_id=$${p.length}`);
    }
    if (req.query.warehouseId) {
      p.push(id.parse(String(req.query.warehouseId)));
      const warehousePlaceholder = `$${p.length}`;
      warehouseJoin = `LEFT JOIN product_location_stock filtered_stock
        ON filtered_stock.product_id=p.id
       AND filtered_stock.warehouse_id=${warehousePlaceholder}`;
      warehouseQuantity =
        "COALESCE(filtered_stock.quantity,0)::integer warehouse_quantity";
      invoiceWarehouseCondition =
        `AND batch_location.warehouse_id=${warehousePlaceholder}`;
      if (req.query.includeEmpty !== "true")
        where.push("COALESCE(filtered_stock.quantity,0)>0");
    }
    if (req.query.invoiceCode) {
      const invoiceCode = invoiceCodeSchema.parse(
        String(req.query.invoiceCode),
      );
      p.push(invoiceCode);
      invoiceCodeCondition = `AND batch.invoice_code=$${p.length}`;
      where.push(
        `EXISTS(
           SELECT 1 FROM inventory_batches invoice_batch
           WHERE invoice_batch.product_id=p.id
             AND invoice_batch.invoice_code=$${p.length}
         )`,
      );
    }
    if (out) where.push("p.current_quantity=0");
    const r = await pool.query(
      `SELECT
         p.id,p.name,p.category_id,p.supplier_id,p.description,
         p.current_quantity,p.reserved_quantity,
         ${warehouseQuantity},
         p.is_active,p.created_at,p.updated_at,
         c.name category_name,s.name supplier_name,
         ARRAY(
           SELECT DISTINCT invoice_batch.invoice_code
           FROM inventory_batches invoice_batch
           WHERE invoice_batch.product_id=p.id
           ORDER BY invoice_batch.invoice_code
         ) invoice_codes,
         COALESCE((
           SELECT json_agg(invoice ORDER BY invoice.code)
           FROM (
             SELECT batch.invoice_code code,
               COALESCE(sum(batch_location.quantity),0)::integer remaining_quantity
             FROM inventory_batches batch
             LEFT JOIN inventory_batch_locations batch_location
               ON batch_location.batch_id=batch.id
             WHERE batch.product_id=p.id
               ${invoiceWarehouseCondition}
               ${invoiceCodeCondition}
             GROUP BY batch.invoice_code
           ) invoice
         ),'[]'::json) invoice_stock,
         ARRAY(
           SELECT warehouse.name
           FROM product_location_stock location_stock
           JOIN warehouses warehouse ON warehouse.id=location_stock.warehouse_id
           WHERE location_stock.product_id=p.id
             AND location_stock.quantity>0
           ORDER BY CASE warehouse.kind WHEN 'SHOWROOM' THEN 0 ELSE 1 END,
             warehouse.name
         ) warehouse_names,
         (p.current_quantity-p.reserved_quantity) available_quantity,
         (EXISTS(SELECT 1 FROM sale_items WHERE product_id=p.id)
           OR EXISTS(SELECT 1 FROM stock_movements WHERE product_id=p.id)
           OR EXISTS(SELECT 1 FROM reservations WHERE product_id=p.id)
           OR EXISTS(SELECT 1 FROM inventory_reservations WHERE product_id=p.id)) has_history,
         (SELECT storage_path FROM product_images i WHERE i.product_id=p.id ORDER BY i.is_primary DESC,i.created_at LIMIT 1) primary_image
       FROM products p
       ${warehouseJoin}
       LEFT JOIN categories c ON c.id=p.category_id
       LEFT JOIN suppliers s ON s.id=p.supplier_id
       ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY p.name`,
      p,
    );
    res.json(r.rows);
  }),
);
app.get(
  "/api/products/:id",
  auth(),
  asyncRoute(async (req, res) => {
    const r = await pool.query(
      `SELECT
         p.id,p.name,p.category_id,p.supplier_id,p.description,
         p.current_quantity,p.reserved_quantity,
         p.is_active,p.created_at,p.updated_at,
         (p.current_quantity-p.reserved_quantity) available_quantity,
         (EXISTS(SELECT 1 FROM sale_items WHERE product_id=p.id)
           OR EXISTS(SELECT 1 FROM stock_movements WHERE product_id=p.id)
           OR EXISTS(SELECT 1 FROM reservations WHERE product_id=p.id)
           OR EXISTS(SELECT 1 FROM inventory_reservations WHERE product_id=p.id)) has_history,
         c.name category_name,
         s.name supplier_name,
         ARRAY(
           SELECT DISTINCT invoice_batch.invoice_code
           FROM inventory_batches invoice_batch
           WHERE invoice_batch.product_id=p.id
           ORDER BY invoice_batch.invoice_code
         ) invoice_codes,
         COALESCE((
           SELECT json_agg(invoice ORDER BY invoice.code)
           FROM (
             SELECT batch.invoice_code code,
               sum(location.quantity)::integer remaining_quantity
             FROM inventory_batches batch
             LEFT JOIN inventory_batch_locations location
               ON location.batch_id=batch.id
             WHERE batch.product_id=p.id
             GROUP BY batch.invoice_code
           ) invoice
         ),'[]'::json) invoice_stock,
         (SELECT max(batch.import_date) FROM inventory_batches batch WHERE batch.product_id=p.id) last_import_date
       FROM products p
       LEFT JOIN categories c ON c.id=p.category_id
       LEFT JOIN suppliers s ON s.id=p.supplier_id
       WHERE p.id=$1`,
      [id.parse(req.params.id)],
    );
    if (!r.rowCount) throw error("NOT_FOUND", "Product not found", 404);
    const images = await pool.query(
      "SELECT * FROM product_images WHERE product_id=$1 ORDER BY is_primary DESC,created_at",
      [r.rows[0].id],
    );
    res.json({ ...r.rows[0], images: images.rows });
  }),
);
type NewProduct = Pick<
  z.infer<typeof productSchema>,
  "name" | "categoryId" | "supplierId" | "description"
>;
async function createProductRecord(
  c: PoolClient,
  user: User,
  values: NewProduct,
) {
  const result = await c.query(
    "INSERT INTO products(name,category_id,supplier_id,description) VALUES($1,$2,$3,$4) RETURNING *",
    [
      values.name,
      values.categoryId,
      values.supplierId,
      values.description || null,
    ],
  );
  const product = result.rows[0];
  await c.query(
    "INSERT INTO product_location_stock(product_id,warehouse_id,quantity) SELECT $1,id,0 FROM warehouses ON CONFLICT DO NOTHING",
    [product.id],
  );
  await productEvent(
    c,
    user,
    product.id,
    "PRODUCT_CREATED",
    undefined,
    undefined,
    product.name,
  );
  await audit(c, user, "CREATE", "PRODUCT", product.id, {
    name: product.name,
  });
  return product;
}
app.post(
  "/api/products",
  auth(["ADMIN"]),
  asyncRoute(async (req, res) => {
    const x = productSchema.parse(req.body);
    const product = await tx(async (c) => {
      return createProductRecord(c, req.user!, x);
    });
    res.status(201).json(inventoryProductResponse(product));
  }),
);
app.patch(
  "/api/products/:id",
  auth(["ADMIN"]),
  asyncRoute(async (req, res) => {
    const x = productSchema.partial().parse(req.body),
      columnByField: Record<string, string> = {
        categoryId: "category_id",
        supplierId: "supplier_id",
        isActive: "is_active",
      },
      activityByField: Record<string, [string, string]> = {
        name: ["NAME_CHANGED", "NAME"],
        categoryId: ["CATEGORY_CHANGED", "CATEGORY"],
        supplierId: ["SUPPLIER_CHANGED", "SUPPLIER"],
        description: ["NOTES_CHANGED", "NOTES"],
        isActive: ["STATUS_CHANGED", "STATUS"],
      };
    const keys = Object.keys(x);
    if (!keys.length) throw error("VALIDATION", "No changes supplied");
    const product = await tx(async (c) => {
      const productId = id.parse(req.params.id);
      const beforeResult = await c.query(
        `SELECT p.*,category.name category_name,supplier.name supplier_name,
           (EXISTS(SELECT 1 FROM sale_items WHERE product_id=p.id)
             OR EXISTS(SELECT 1 FROM stock_movements WHERE product_id=p.id)
             OR EXISTS(SELECT 1 FROM reservations WHERE product_id=p.id)
             OR EXISTS(SELECT 1 FROM inventory_reservations WHERE product_id=p.id)) has_history
         FROM products p
         LEFT JOIN categories category ON category.id=p.category_id
         LEFT JOIN suppliers supplier ON supplier.id=p.supplier_id
         WHERE p.id=$1
         FOR UPDATE OF p`,
        [productId],
      );
      if (!beforeResult.rowCount)
        throw error("NOT_FOUND", "Product not found", 404);
      const before = beforeResult.rows[0];
      if (x.isActive === false && before.is_active) {
        const pendingReservations = await c.query(
          `SELECT 1 FROM inventory_reservations
           WHERE product_id=$1 AND status='PENDING' LIMIT 1`,
          [productId],
        );
        if (pendingReservations.rowCount)
          throw error(
            "PENDING_RESERVED_SALES",
            "Complete the product's pending reserved sales before archiving it",
            409,
          );
      }
      if (x.isActive === true && !before.is_active && before.has_history)
        throw error(
          "ARCHIVED_PRODUCT",
          "Products with history must remain archived",
        );
      const numericFields = new Set<string>();
      const comparable = (field: string, value: any) =>
        numericFields.has(field) && value != null
          ? Number(value)
          : value === undefined
            ? null
            : value;
      const changedKeys = keys.filter(
        (field) =>
          comparable(field, before[columnByField[field] || field]) !==
          comparable(field, (x as any)[field]),
      );
      if (!changedKeys.length) return before;
      const values = changedKeys.map((field) => (x as any)[field]);
      await c.query(
        `UPDATE products SET ${changedKeys.map((field, index) => `${columnByField[field] || field}=$${index + 1}`).join(",")},updated_at=now() WHERE id=$${changedKeys.length + 1}`,
        [...values, productId],
      );
      const afterResult = await c.query(
        `SELECT p.*,category.name category_name,supplier.name supplier_name
         FROM products p
         LEFT JOIN categories category ON category.id=p.category_id
         LEFT JOIN suppliers supplier ON supplier.id=p.supplier_id
         WHERE p.id=$1`,
        [productId],
      );
      const after = afterResult.rows[0];
      const displayValue = (record: any, field: string) => {
        const value =
          field === "categoryId"
            ? record.category_name
            : field === "supplierId"
              ? record.supplier_name
              : record[columnByField[field] || field];
        if (value === null || value === undefined || value === "") return "—";
        if (typeof value === "boolean") return value ? "Active" : "Inactive";
        return String(value);
      };
      for (const field of changedKeys) {
        const [action, fieldName] = activityByField[field];
        const oldValue = displayValue(before, field);
        const newValue = displayValue(after, field);
        await productEvent(
          c,
          req.user!,
          productId,
          action,
          `Old: ${oldValue}\nNew: ${newValue}\nUser: ${req.user!.name}`,
          { fieldName, oldValue, newValue },
          after.name,
        );
      }
      await audit(c, req.user!, "UPDATE", "PRODUCT", productId, {
        fields: changedKeys,
      });
      return after;
    });
    res.json(inventoryProductResponse(product));
  }),
);
app.delete(
  "/api/products/:id",
  auth(["ADMIN"]),
  asyncRoute(async (req, res) => {
    const productId = id.parse(req.params.id);
    const result = await tx(async (c) => {
      const product = await c.query(
        "SELECT id,name,is_active FROM products WHERE id=$1 FOR UPDATE",
        [productId],
      );
      if (!product.rowCount) throw error("NOT_FOUND", "Product not found", 404);
      const pendingReservations = await c.query(
        `SELECT 1 FROM inventory_reservations
         WHERE product_id=$1 AND status='PENDING' LIMIT 1`,
        [productId],
      );
      if (pendingReservations.rowCount)
        throw error(
          "PENDING_RESERVED_SALES",
          "Complete the product's pending reserved sales before archiving it",
          409,
        );
      const history = await c.query(
        "SELECT EXISTS(SELECT 1 FROM sale_items WHERE product_id=$1) OR EXISTS(SELECT 1 FROM stock_movements WHERE product_id=$1) OR EXISTS(SELECT 1 FROM reservations WHERE product_id=$1) OR EXISTS(SELECT 1 FROM inventory_reservations WHERE product_id=$1) AS has_history",
        [productId],
      );
      if (history.rows[0].has_history) {
        if (product.rows[0].is_active) {
          await c.query(
            "UPDATE products SET is_active=false,updated_at=now() WHERE id=$1",
            [productId],
          );
          await productEvent(
            c,
            req.user!,
            productId,
            "PRODUCT_ARCHIVED",
            undefined,
            undefined,
            product.rows[0].name,
          );
          await audit(c, req.user!, "ARCHIVE", "PRODUCT", productId);
        }
        return {
          archived: true,
          alreadyArchived: !product.rows[0].is_active,
          imagePaths: [] as string[],
        };
      }
      const images = await c.query(
        "SELECT storage_path FROM product_images WHERE product_id=$1",
        [productId],
      );
      await productEvent(
        c,
        req.user!,
        productId,
        "PRODUCT_DELETED",
        undefined,
        undefined,
        product.rows[0].name,
      );
      await c.query("DELETE FROM products WHERE id=$1", [productId]);
      await audit(c, req.user!, "DELETE", "PRODUCT", productId);
      return {
        deleted: true,
        imagePaths: images.rows.map((image) => image.storage_path as string),
      };
    });
    await Promise.all(
      result.imagePaths.map((storagePath) =>
        fs.promises.unlink(path.join(uploadDir, storagePath)).catch(() => undefined),
      ),
    );
    const { imagePaths: _imagePaths, ...response } = result;
    res.json(response);
  }),
);
const uploader = multer({
  storage: multer.diskStorage({
    destination: (_r, _f, cb) => cb(null, path.join(uploadDir, "products")),
    filename: (_r, f, cb) =>
      cb(null, `${randomUUID()}${path.extname(f.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (_r, f, cb) =>
    cb(null, ["image/jpeg", "image/png", "image/webp"].includes(f.mimetype)),
});
app.post(
  "/api/products/:id/images",
  auth(["ADMIN"]),
  uploader.single("image"),
  asyncRoute(async (req, res) => {
    if (!req.file)
      throw error("INVALID_IMAGE", "Use JPG, PNG, or WebP up to 5 MB");
    try {
      const productId = id.parse(req.params.id);
      const image = await tx(async (c) => {
        const product = await c.query(
          "SELECT id FROM products WHERE id=$1 FOR UPDATE",
          [productId],
        );
        if (!product.rowCount)
          throw error("NOT_FOUND", "Product not found", 404);
        const count = await c.query(
          "SELECT count(*) FROM product_images WHERE product_id=$1",
          [productId],
        );
        if (+count.rows[0].count >= 5)
          throw error("IMAGE_LIMIT", "Maximum 5 images per product");
        const inserted = await c.query(
          "INSERT INTO product_images(product_id,filename,storage_path,is_primary) VALUES($1,$2,$3,NOT EXISTS(SELECT 1 FROM product_images WHERE product_id=$1)) RETURNING *",
          [productId, req.file!.filename, `products/${req.file!.filename}`],
        );
        await audit(c, req.user!, "ADD_IMAGE", "PRODUCT", productId, {
          filename: inserted.rows[0].filename,
          isPrimary: inserted.rows[0].is_primary,
        });
        return inserted.rows[0];
      });
      res.status(201).json(image);
    } catch (uploadError) {
      await fs.promises.unlink(req.file.path).catch(() => undefined);
      throw uploadError;
    }
  }),
);
app.delete(
  "/api/product-images/:id",
  auth(["ADMIN"]),
  asyncRoute(async (req, res) => {
    const imageId = id.parse(req.params.id);
    const image = await tx(async (c) => {
      const deleted = await c.query(
        "DELETE FROM product_images WHERE id=$1 RETURNING product_id,storage_path,is_primary",
        [imageId],
      );
      if (!deleted.rowCount) throw error("NOT_FOUND", "Image not found", 404);
      if (deleted.rows[0].is_primary)
        await c.query(
          "UPDATE product_images SET is_primary=true WHERE id=(SELECT id FROM product_images WHERE product_id=$1 ORDER BY created_at LIMIT 1)",
          [deleted.rows[0].product_id],
        );
      await audit(
        c,
        req.user!,
        "DELETE_IMAGE",
        "PRODUCT",
        deleted.rows[0].product_id,
        { storagePath: deleted.rows[0].storage_path },
      );
      return deleted.rows[0];
    });
    await fs.promises
      .unlink(path.join(uploadDir, image.storage_path))
      .catch(() => undefined);
    res.status(204).end();
  }),
);
app.post(
  "/api/product-images/:id/primary",
  auth(["ADMIN"]),
  asyncRoute(async (req, res) => {
    const imageId = id.parse(req.params.id);
    const result = await tx(async (c) => {
      const r = await c.query(
        "SELECT product_id FROM product_images WHERE id=$1",
        [imageId],
      );
      if (!r.rowCount) throw error("NOT_FOUND", "Image not found", 404);
      await c.query(
        "UPDATE product_images SET is_primary=(id=$1) WHERE product_id=$2",
        [imageId, r.rows[0].product_id],
      );
      await audit(c, req.user!, "PRIMARY_IMAGE_CHANGED", "PRODUCT", r.rows[0].product_id, {
        imageId,
      });
      return { ok: true };
    });
    res.json(result);
  }),
);

async function recordImportedBatch(
  c: PoolClient,
  movement: Record<string, any>,
) {
  const batch = await c.query(
    `INSERT INTO inventory_batches(
       source_movement_id,product_id,supplier_id,invoice_code,import_date,
       imported_quantity,created_at
     ) VALUES($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [
      movement.id,
      movement.product_id,
      movement.supplier_id,
      movement.invoice_code,
      movement.business_date,
      movement.quantity,
      movement.created_at,
    ],
  );
  await c.query(
    `INSERT INTO inventory_batch_locations(batch_id,warehouse_id,quantity)
     VALUES($1,$2,$3)`,
    [batch.rows[0].id, movement.warehouse_id, movement.quantity],
  );
  await c.query(
    `INSERT INTO inventory_batch_changes(movement_id,batch_id,warehouse_id,quantity)
     VALUES($1,$2,$3,$4)`,
    [movement.id, batch.rows[0].id, movement.warehouse_id, movement.quantity],
  );
}

async function consumeImportedBatches(
  c: PoolClient,
  movementId: string,
  productId: string,
  warehouseId: string,
  requestedQuantity: number,
) {
  const batches = await c.query(
    `SELECT location.batch_id,location.quantity
     FROM inventory_batch_locations location
     JOIN inventory_batches batch ON batch.id=location.batch_id
     WHERE batch.product_id=$1 AND location.warehouse_id=$2
       AND location.quantity>0
     ORDER BY batch.import_date,batch.created_at,batch.id
     FOR UPDATE OF location`,
    [productId, warehouseId],
  );
  let remaining = requestedQuantity;
  for (const batch of batches.rows) {
    if (remaining <= 0) break;
    const quantity = Math.min(remaining, +batch.quantity);
    await c.query(
      `UPDATE inventory_batch_locations SET quantity=quantity-$1
       WHERE batch_id=$2 AND warehouse_id=$3`,
      [quantity, batch.batch_id, warehouseId],
    );
    await c.query(
      `INSERT INTO inventory_batch_changes(movement_id,batch_id,warehouse_id,quantity)
       VALUES($1,$2,$3,$4)`,
      [movementId, batch.batch_id, warehouseId, -quantity],
    );
    remaining -= quantity;
  }
}

async function transferImportedBatches(
  c: PoolClient,
  movementId: string,
  productId: string,
  sourceWarehouseId: string,
  destinationWarehouseId: string,
  requestedQuantity: number,
) {
  const batches = await c.query(
    `SELECT location.batch_id,location.quantity
     FROM inventory_batch_locations location
     JOIN inventory_batches batch ON batch.id=location.batch_id
     WHERE batch.product_id=$1 AND location.warehouse_id=$2
       AND location.quantity>0
     ORDER BY batch.import_date,batch.created_at,batch.id
     FOR UPDATE OF location`,
    [productId, sourceWarehouseId],
  );
  let remaining = requestedQuantity;
  for (const batch of batches.rows) {
    if (remaining <= 0) break;
    const quantity = Math.min(remaining, +batch.quantity);
    await c.query(
      `UPDATE inventory_batch_locations SET quantity=quantity-$1
       WHERE batch_id=$2 AND warehouse_id=$3`,
      [quantity, batch.batch_id, sourceWarehouseId],
    );
    await c.query(
      `INSERT INTO inventory_batch_locations(batch_id,warehouse_id,quantity)
       VALUES($1,$2,$3)
       ON CONFLICT(batch_id,warehouse_id)
       DO UPDATE SET quantity=inventory_batch_locations.quantity+EXCLUDED.quantity`,
      [batch.batch_id, destinationWarehouseId, quantity],
    );
    await c.query(
      `INSERT INTO inventory_batch_changes(movement_id,batch_id,warehouse_id,quantity)
       VALUES($1,$2,$3,$4),($1,$2,$5,$6)`,
      [
        movementId,
        batch.batch_id,
        sourceWarehouseId,
        -quantity,
        destinationWarehouseId,
        quantity,
      ],
    );
    remaining -= quantity;
  }
}

async function move(
  c: PoolClient,
  user: User,
  productId: string,
  type: string,
  quantity: number,
  notes?: string,
  supplierId?: string,
  purchasePrice?: number,
  referenceId?: string,
  businessDate?: string,
  warehouseId?: string,
  invoiceCode?: string,
) {
  const r = await c.query("SELECT * FROM products WHERE id=$1 FOR UPDATE", [
    productId,
  ]);
  if (!r.rowCount) throw error("NOT_FOUND", "Product not found", 404);
  const p = r.rows[0],
    reserve =
      type === "RESERVATION" ||
      type === "RESERVATION_RELEASE" ||
      type === "RESERVATION_CANCEL",
    newCurrent = p.current_quantity + (reserve ? 0 : quantity),
    newReserved =
      p.reserved_quantity +
      (type === "RESERVATION"
        ? quantity
        : type === "RESERVATION_RELEASE" || type === "RESERVATION_CANCEL"
          ? -quantity
          : 0),
    effectiveSupplierId =
      supplierId ??
      (["IMPORT", "SUPPLIER_RETURN"].includes(type)
        ? p.supplier_id
        : undefined),
    movementPurchasePrice =
      purchasePrice ??
      (type === "LOST" || type === "DESTROYED" ? +p.purchase_price : undefined);
  const selectedWarehouse = warehouseId
    ? await c.query("SELECT id,name FROM warehouses WHERE id=$1", [warehouseId])
    : await c.query("SELECT id,name FROM warehouses WHERE slug='showroom'");
  if (!selectedWarehouse.rowCount)
    throw error("NOT_FOUND", "Inventory location not found", 404);
  const effectiveWarehouseId = selectedWarehouse.rows[0].id;
  await c.query(
    "INSERT INTO product_location_stock(product_id,warehouse_id,quantity) VALUES($1,$2,0) ON CONFLICT DO NOTHING",
    [productId, effectiveWarehouseId],
  );
  const locationStock = await c.query(
    "SELECT quantity FROM product_location_stock WHERE product_id=$1 AND warehouse_id=$2 FOR UPDATE",
    [productId, effectiveWarehouseId],
  );
  const newLocationQuantity = +locationStock.rows[0].quantity + (reserve ? 0 : quantity);
  if (["IMPORT", "SUPPLIER_RETURN"].includes(type) && !effectiveSupplierId)
    throw error(
      "PRODUCT_SUPPLIER_REQUIRED",
      "Assign a supplier to the product before recording this stock movement",
    );
  if (
    newCurrent < 0 ||
    newReserved < 0 ||
    newReserved > newCurrent ||
    newLocationQuantity < 0
  )
    throw error(
      "INSUFFICIENT_STOCK",
      `Only ${p.current_quantity - p.reserved_quantity} units are available.`,
    );
  await c.query(
    "UPDATE products SET current_quantity=$1,reserved_quantity=$2,purchase_price=COALESCE($3,purchase_price),supplier_id=COALESCE($4,supplier_id),updated_at=now() WHERE id=$5",
    [newCurrent, newReserved, movementPurchasePrice, effectiveSupplierId, productId],
  );
  await c.query(
    "UPDATE product_location_stock SET quantity=$1,updated_at=now() WHERE product_id=$2 AND warehouse_id=$3",
    [newLocationQuantity, productId, effectiveWarehouseId],
  );
  if (invoiceCode)
    await c.query(
      `INSERT INTO invoice_codes(code,created_by)
       VALUES($1,$2) ON CONFLICT (code) DO NOTHING`,
      [invoiceCode, user.id],
    );
  const movement = await c.query(
    "INSERT INTO stock_movements(product_id,type,quantity,user_id,reference_id,supplier_id,purchase_price,business_date,notes,warehouse_id,invoice_code) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",
    [
      productId,
      type,
      quantity,
      user.id,
      referenceId || null,
      effectiveSupplierId || null,
      movementPurchasePrice ?? null,
      businessDate || null,
      notes || null,
      effectiveWarehouseId,
      invoiceCode || null,
    ],
  );
  if (type === "IMPORT") await recordImportedBatch(c, movement.rows[0]);
  else if (quantity < 0)
    await consumeImportedBatches(
      c,
      movement.rows[0].id,
      productId,
      effectiveWarehouseId,
      Math.abs(quantity),
    );
  return { product: p, movement: movement.rows[0] };
}
app.post(
  "/api/inventory/import",
  auth(),
  asyncRoute(async (req, res) => {
    const x = z
      .object({
        productId: id,
        warehouseId: id,
        quantity: qty,
        importDate: dateOnly,
        invoiceCode: invoiceCodeSchema,
        notes: z.string().optional(),
      })
      .parse(req.body);
    await tx(async (c) => {
      await move(
        c,
        req.user!,
        x.productId,
        "IMPORT",
        x.quantity,
        x.notes,
        undefined,
        undefined,
        undefined,
        x.importDate,
        x.warehouseId,
        x.invoiceCode,
      );
      await audit(c, req.user!, "IMPORT", "PRODUCT", x.productId, {
        productId: x.productId,
        warehouseId: x.warehouseId,
        quantity: x.quantity,
        importDate: x.importDate,
        invoiceCode: x.invoiceCode,
        notes: x.notes || null,
      });
    });
    res.status(201).json({ ok: true });
  }),
);
app.post(
  "/api/inventory/adjust",
  auth(),
  asyncRoute(async (req, res) => {
    const x = z
      .object({
        productId: id,
        warehouseId: id,
        destinationWarehouseId: id.nullable().optional(),
        quantity: qty,
        type: z.enum(["SUPPLIER_RETURN", "SOLD", "CORRECTION", "TRANSPORT"]),
        correctionDirection: z
          .enum(["INCREASE", "DECREASE"])
          .nullable()
          .optional(),
        businessDate: dateOnly,
        notes: z.string().optional(),
      })
      .parse(req.body);
    if (x.type === "CORRECTION" && !x.correctionDirection)
      throw error(
        "VALIDATION",
        "Correction direction is required for a correction",
      );
    if (x.type === "TRANSPORT" && !x.destinationWarehouseId)
      throw error(
        "VALIDATION",
        "Destination warehouse is required for transport",
      );
    if (
      x.type === "TRANSPORT" &&
      x.destinationWarehouseId === x.warehouseId
    )
      throw error(
        "VALIDATION",
        "Source and destination warehouses must be different",
      );
    const result = await tx(async (c) => {
      if (x.type === "TRANSPORT") {
        const product = await c.query(
          "SELECT id,name FROM products WHERE id=$1 FOR UPDATE",
          [x.productId],
        );
        if (!product.rowCount)
          throw error("NOT_FOUND", "Product not found", 404);
        const locations = await c.query(
          "SELECT id,name FROM warehouses WHERE id IN ($1,$2)",
          [x.warehouseId, x.destinationWarehouseId],
        );
        if (locations.rowCount !== 2)
          throw error("NOT_FOUND", "Inventory location not found", 404);
        const locationNames = new Map(
          locations.rows.map((location) => [location.id, location.name]),
        );
        await c.query(
          `INSERT INTO product_location_stock(product_id,warehouse_id,quantity)
           VALUES($1,$2,0),($1,$3,0)
           ON CONFLICT DO NOTHING`,
          [x.productId, x.warehouseId, x.destinationWarehouseId],
        );
        const stock = await c.query(
          `SELECT warehouse_id,quantity
           FROM product_location_stock
           WHERE product_id=$1 AND warehouse_id IN ($2,$3)
           ORDER BY warehouse_id
           FOR UPDATE`,
          [x.productId, x.warehouseId, x.destinationWarehouseId],
        );
        const source = stock.rows.find(
          (location) => location.warehouse_id === x.warehouseId,
        );
        if (!source || +source.quantity < x.quantity)
          throw error(
            "INSUFFICIENT_STOCK",
            `Only ${source?.quantity || 0} units are available in ${locationNames.get(x.warehouseId)}.`,
          );
        await c.query(
          `UPDATE product_location_stock
           SET quantity=quantity + CASE
             WHEN warehouse_id=$2 THEN $4::integer
             ELSE $5::integer
           END,
             updated_at=now()
           WHERE product_id=$1 AND warehouse_id IN ($2,$3)`,
          [
            x.productId,
            x.warehouseId,
            x.destinationWarehouseId,
            -x.quantity,
            x.quantity,
          ],
        );
        const movement = await c.query(
          `INSERT INTO stock_movements(
             product_id,type,quantity,user_id,business_date,notes,
             warehouse_id,destination_warehouse_id
           ) VALUES($1,'TRANSPORT',$2,$3,$4,$5,$6,$7)
           RETURNING id`,
          [
            x.productId,
            x.quantity,
            req.user!.id,
            x.businessDate,
            x.notes || null,
            x.warehouseId,
            x.destinationWarehouseId,
          ],
        );
        await transferImportedBatches(
          c,
          movement.rows[0].id,
          x.productId,
          x.warehouseId,
          x.destinationWarehouseId!,
          x.quantity,
        );
        await audit(c, req.user!, "TRANSPORT", "PRODUCT", x.productId, {
          movementId: movement.rows[0].id,
          quantity: x.quantity,
          businessDate: x.businessDate,
          fromWarehouseId: x.warehouseId,
          fromWarehouse: locationNames.get(x.warehouseId),
          toWarehouseId: x.destinationWarehouseId,
          toWarehouse: locationNames.get(x.destinationWarehouseId!),
          notes: x.notes || null,
        });
        return { ok: true };
      }
      if (x.type === "SOLD") {
        const product = await c.query(
          "SELECT id,name,supplier_id,is_active FROM products WHERE id=$1 FOR UPDATE",
          [x.productId],
        );
        if (!product.rowCount)
          throw error("NOT_FOUND", "Product not found", 404);
        if (!product.rows[0].is_active)
          throw error("ARCHIVED_PRODUCT", "Archived products cannot be sold");
        const warehouse = await c.query(
          "SELECT id,name FROM warehouses WHERE id=$1",
          [x.warehouseId],
        );
        if (!warehouse.rowCount)
          throw error("NOT_FOUND", "Inventory location not found", 404);
        await c.query(
          "INSERT INTO product_location_stock(product_id,warehouse_id,quantity) VALUES($1,$2,0) ON CONFLICT DO NOTHING",
          [x.productId, x.warehouseId],
        );
        const locationStock = await c.query(
          "SELECT quantity FROM product_location_stock WHERE product_id=$1 AND warehouse_id=$2 FOR UPDATE",
          [x.productId, x.warehouseId],
        );
        if (
          shouldReserveSoldProduct(+locationStock.rows[0].quantity, x.quantity)
        ) {
          const reservation = await c.query(
            `INSERT INTO inventory_reservations(
               product_id,warehouse_id,supplier_id,quantity,action_date,notes,created_by
             ) VALUES($1,$2,$3,$4,$5,$6,$7)
             RETURNING id`,
            [
              x.productId,
              x.warehouseId,
              product.rows[0].supplier_id,
              x.quantity,
              x.businessDate,
              x.notes || null,
              req.user!.id,
            ],
          );
          await audit(
            c,
            req.user!,
            "RESERVE_SOLD_PRODUCT",
            "INVENTORY_RESERVATION",
            reservation.rows[0].id,
            {
              productId: x.productId,
              warehouseId: x.warehouseId,
              quantity: x.quantity,
              actionDate: x.businessDate,
              availableAtLocation: +locationStock.rows[0].quantity,
              notes: x.notes || null,
            },
          );
          return { ok: true, reserved: true, id: reservation.rows[0].id };
        }
      }
      const signed =
        x.type === "CORRECTION"
          ? x.correctionDirection === "DECREASE"
            ? -x.quantity
            : x.quantity
          : -x.quantity;
      await move(
        c,
        req.user!,
        x.productId,
        x.type,
        signed,
        x.notes,
        undefined,
        undefined,
        undefined,
        x.businessDate,
        x.warehouseId,
      );
      await audit(c, req.user!, x.type, "PRODUCT", x.productId, {
        ...x,
        quantity: signed,
      });
      return { ok: true };
    });
    res.status(201).json(result);
  }),
);

app.get(
  "/api/inventory/reservations",
  auth(),
  asyncRoute(async (_req, res) => {
    const result = await pool.query(
      `SELECT reservation.id,reservation.quantity,reservation.action_date,
         reservation.notes,reservation.created_at,
         product.id product_id,product.name product_name,
         supplier.name supplier_name,
         warehouse.id warehouse_id,warehouse.name warehouse_name,
         creator.name employee_name,
         COALESCE(stock.quantity,0)::integer available_quantity
       FROM inventory_reservations reservation
       JOIN products product ON product.id=reservation.product_id
       JOIN warehouses warehouse ON warehouse.id=reservation.warehouse_id
       JOIN users creator ON creator.id=reservation.created_by
       LEFT JOIN suppliers supplier ON supplier.id=reservation.supplier_id
       LEFT JOIN product_location_stock stock
         ON stock.product_id=reservation.product_id
        AND stock.warehouse_id=reservation.warehouse_id
       WHERE reservation.status='PENDING'
       ORDER BY reservation.action_date, reservation.created_at`,
    );
    res.json(result.rows);
  }),
);

app.post(
  "/api/inventory/reservations/:id/complete",
  auth(),
  asyncRoute(async (req, res) => {
    const reservationId = id.parse(req.params.id);
    const result = await tx(async (c) => {
      const reservationResult = await c.query(
        `SELECT reservation.*,product.name product_name,warehouse.name warehouse_name
         FROM inventory_reservations reservation
         JOIN products product ON product.id=reservation.product_id
         JOIN warehouses warehouse ON warehouse.id=reservation.warehouse_id
         WHERE reservation.id=$1
         FOR UPDATE OF reservation`,
        [reservationId],
      );
      if (!reservationResult.rowCount)
        throw error("NOT_FOUND", "Reserved product not found", 404);
      const reservation = reservationResult.rows[0];
      if (reservation.status !== "PENDING")
        throw error("ALREADY_COMPLETED", "This reserved product is already completed");

      await move(
        c,
        req.user!,
        reservation.product_id,
        "SOLD",
        -reservation.quantity,
        reservation.notes || "Completed reserved sale",
        reservation.supplier_id,
        undefined,
        reservation.id,
        reservation.action_date,
        reservation.warehouse_id,
      );
      await c.query(
        `UPDATE inventory_reservations
         SET status='COMPLETED',completed_by=$1,completed_at=now(),updated_at=now()
         WHERE id=$2`,
        [req.user!.id, reservationId],
      );
      await audit(
        c,
        req.user!,
        "COMPLETE_RESERVED_SALE",
        "INVENTORY_RESERVATION",
        reservationId,
        {
          productId: reservation.product_id,
          productName: reservation.product_name,
          warehouseId: reservation.warehouse_id,
          warehouseName: reservation.warehouse_name,
          quantity: reservation.quantity,
          actionDate: reservation.action_date,
        },
      );
      return { ok: true };
    });
    res.json(result);
  }),
);

app.get(
  "/api/stock-movements",
  auth(),
  asyncRoute(async (req, res) => {
    const [movements, events, audits, reservedSales] = await Promise.all([
      pool.query(
        `SELECT
           sm.*,
           COALESCE(sm.business_date,sm.created_at::date) display_date,
           product.name product_name,
           movement_user.name employee_name,
           CASE WHEN destination_warehouse.name IS NULL THEN warehouse.name
             ELSE warehouse.name || ' → ' || destination_warehouse.name END warehouse_name,
           sm.supplier_id related_supplier_id,
           supplier.name supplier_name,
           deleted_user.name deleted_by_name,
           CASE
             WHEN sm.type='REVERSED' THEN '—'
             WHEN sm.deleted_at IS NOT NULL THEN 'REVERSED'
             ELSE 'ACTIVE'
           END status
         FROM stock_movements sm
         JOIN products product ON product.id=sm.product_id
         JOIN users movement_user ON movement_user.id=sm.user_id
         LEFT JOIN warehouses warehouse ON warehouse.id=sm.warehouse_id
         LEFT JOIN warehouses destination_warehouse
           ON destination_warehouse.id=sm.destination_warehouse_id
         LEFT JOIN suppliers supplier ON supplier.id=sm.supplier_id
         LEFT JOIN users deleted_user ON deleted_user.id=sm.deleted_by
         WHERE sm.type IN ('IMPORT','SUPPLIER_RETURN','SOLD','LOST','DESTROYED','CORRECTION','TRANSPORT','REVERSED','DAMAGE','OTHER')
         ORDER BY COALESCE(sm.business_date,sm.created_at::date) DESC,sm.created_at DESC`,
      ),
      pool.query(
        `SELECT
           event.id,
           event.product_id,
           event.product_name,
           event.action type,
           CASE WHEN event.field_name IS NOT NULL THEN 'CHANGED' ELSE event.action END status,
           NULL::integer quantity,
           NULL::numeric purchase_price,
           NULL::numeric sale_selling_price,
           event.created_at,
           event.created_at::date display_date,
           event.user_id,
           event_user.name employee_name,
           product.supplier_id,
           supplier.name supplier_name,
           NULL::text customer_name,
           NULL::uuid reference_id,
           event.notes,
           NULL::timestamptz deleted_at,
           NULL::text deleted_by_name,
           NULL::bigint sale_number,
           event.field_name,
           event.old_value,
           event.new_value,
           ARRAY(
             SELECT related_supplier.id
             FROM suppliers related_supplier
             WHERE event.action='SUPPLIER_CHANGED'
               AND related_supplier.name IN (event.old_value,event.new_value)
           ) supplier_ids
         FROM product_events event
         JOIN users event_user ON event_user.id=event.user_id
         LEFT JOIN products product ON product.id=event.product_id
         LEFT JOIN suppliers supplier ON supplier.id=product.supplier_id
         ORDER BY event.created_at DESC`,
      ),
      pool.query(
        `SELECT
           audit.id,
           audit.action type,
           CASE
             WHEN audit.action LIKE '%CHANGE%' OR audit.action LIKE 'UPDATE%' THEN 'CHANGED'
             WHEN audit.action='ARCHIVE' THEN 'ARCHIVED'
             WHEN audit.action='DELETE' THEN 'DELETED'
             WHEN audit.action='COMPLETE_RESERVATION' THEN 'COMPLETED'
             WHEN audit.action IN ('IN_TRANSIT','DELIVERED') THEN audit.action
             ELSE 'RECORDED'
           END status,
           audit.created_at,
           audit.created_at::date display_date,
           audit.user_id,
           actor.name employee_name,
           audit.entity_type,
           audit.entity_id,
           audit.details audit_details,
           COALESCE(direct_product.id,reservation_product.id) product_id,
           COALESCE(
             direct_product.name,
             reservation_product.name,
             sale_items.product_names
           ) product_name,
           COALESCE(reservation.quantity,sale_items.quantity) quantity,
           NULL::numeric purchase_price,
           NULL::numeric sale_selling_price,
           COALESCE(direct_product.supplier_id,reservation.supplier_id) supplier_id,
           COALESCE(direct_supplier.name,reservation_supplier.name,sale_items.supplier_names) supplier_name,
           COALESCE(reservation_customer.name,sale_customer.name) customer_name,
           sale.sale_number,
           COALESCE(NULLIF(audit.details->>'notes',''),reservation.notes,sale.notes) notes,
           NULL::timestamptz deleted_at,
           NULL::text deleted_by_name,
           NULL::uuid reference_id,
           NULL::text field_name,
           NULL::text old_value,
           NULL::text new_value,
           CASE
             WHEN audit.entity_type='PRODUCT' THEN ARRAY[audit.entity_id]
             WHEN audit.entity_type='RESERVATION' THEN ARRAY[reservation.product_id]
             WHEN audit.entity_type='SALE' THEN sale_items.product_ids
             ELSE ARRAY[]::uuid[]
           END product_ids,
           CASE
             WHEN audit.entity_type='PRODUCT' AND direct_product.supplier_id IS NOT NULL
               THEN ARRAY[direct_product.supplier_id]
             WHEN audit.entity_type='RESERVATION' AND reservation.supplier_id IS NOT NULL
               THEN ARRAY[reservation.supplier_id]
             WHEN audit.entity_type='SALE' THEN sale_items.supplier_ids
             WHEN audit.entity_type='SUPPLIER' THEN ARRAY[audit.entity_id]
             ELSE ARRAY[]::uuid[]
           END supplier_ids,
           CASE audit.entity_type
             WHEN 'PRODUCT' THEN direct_product.name
             WHEN 'RESERVATION' THEN 'Reservation'
             WHEN 'SALE' THEN 'Sale #' || sale.sale_number::text
             WHEN 'CATEGORY' THEN category.name
             WHEN 'CUSTOMER' THEN customer.name
             WHEN 'SUPPLIER' THEN audit_supplier.name
             WHEN 'CONTACT' THEN contact.name
             WHEN 'USER' THEN target_user.name
             WHEN 'SETTINGS' THEN 'Application settings'
             WHEN 'INVOICE_CODE' THEN COALESCE(
               audit.details->>'code',
               audit.details->>'newCode',
               audit.details->>'oldCode'
             )
             ELSE audit.entity_type
           END target_name
         FROM audit_logs audit
         LEFT JOIN users actor ON actor.id=audit.user_id
         LEFT JOIN products direct_product
           ON direct_product.id=audit.entity_id AND audit.entity_type='PRODUCT'
         LEFT JOIN suppliers direct_supplier ON direct_supplier.id=direct_product.supplier_id
         LEFT JOIN reservations reservation
           ON reservation.id=audit.entity_id AND audit.entity_type='RESERVATION'
         LEFT JOIN products reservation_product ON reservation_product.id=reservation.product_id
         LEFT JOIN suppliers reservation_supplier ON reservation_supplier.id=reservation.supplier_id
         LEFT JOIN customers reservation_customer ON reservation_customer.id=reservation.customer_id
         LEFT JOIN sales sale ON sale.id=audit.entity_id AND audit.entity_type='SALE'
         LEFT JOIN customers sale_customer ON sale_customer.id=sale.customer_id
         LEFT JOIN LATERAL (
           SELECT
             array_agg(DISTINCT item.product_id) product_ids,
             array_agg(DISTINCT item.supplier_id) FILTER (WHERE item.supplier_id IS NOT NULL) supplier_ids,
             string_agg(DISTINCT item_product.name,', ') product_names,
             string_agg(DISTINCT item_supplier.name,', ') supplier_names,
             sum(item.quantity)::integer quantity
           FROM sale_items item
           JOIN products item_product ON item_product.id=item.product_id
           LEFT JOIN suppliers item_supplier ON item_supplier.id=item.supplier_id
           WHERE item.sale_id=sale.id
         ) sale_items ON true
         LEFT JOIN categories category
           ON category.id=audit.entity_id AND audit.entity_type='CATEGORY'
         LEFT JOIN customers customer
           ON customer.id=audit.entity_id AND audit.entity_type='CUSTOMER'
         LEFT JOIN suppliers audit_supplier
           ON audit_supplier.id=audit.entity_id AND audit.entity_type='SUPPLIER'
         LEFT JOIN contacts contact
           ON contact.id=audit.entity_id AND audit.entity_type='CONTACT'
         LEFT JOIN users target_user
           ON target_user.id=audit.entity_id AND audit.entity_type='USER'
         WHERE audit.entity_type IN ('PRODUCT','CATEGORY','SUPPLIER','USER','SETTINGS','INVOICE_CODE')
           AND NOT (
           (audit.entity_type='PRODUCT' AND audit.action IN ('CREATE','UPDATE','ARCHIVE','DELETE','IMPORT','SUPPLIER_RETURN','SOLD','LOST','DESTROYED','CORRECTION','TRANSPORT'))
           OR (audit.entity_type='RESERVATION' AND audit.action IN ('RESERVE','RESERVATION_CANCEL','RESERVATION_EXPIRE'))
           OR (audit.entity_type='SALE' AND audit.action IN ('SALE','RETURN'))
           OR (audit.entity_type='STOCK_MOVEMENT' AND audit.action='REVERSE_MOVEMENT')
         )
         ORDER BY audit.created_at DESC`,
      ),
      pool.query(
        `SELECT reservation.id,reservation.product_id,
           product.name product_name,
           'SOLD (RESERVED)'::text type,
           reservation.status,
           -reservation.quantity quantity,
           reservation.action_date business_date,
           reservation.action_date display_date,
           reservation.created_at,
           reservation.created_by user_id,
           creator.name employee_name,
           reservation.supplier_id,
           supplier.name supplier_name,
           reservation.notes,
           warehouse.name warehouse_name,
           NULL::text invoice_code,
           NULL::timestamptz deleted_at,
           NULL::text deleted_by_name
         FROM inventory_reservations reservation
         JOIN products product ON product.id=reservation.product_id
         JOIN users creator ON creator.id=reservation.created_by
         JOIN warehouses warehouse ON warehouse.id=reservation.warehouse_id
         LEFT JOIN suppliers supplier ON supplier.id=reservation.supplier_id
         ORDER BY reservation.action_date DESC,reservation.created_at DESC`,
      ),
    ]);

    const rows = [
      ...movements.rows.map((row) => ({
        ...row,
        history_source: "MOVEMENT",
        product_ids: [row.product_id],
        supplier_ids: row.related_supplier_id ? [row.related_supplier_id] : [],
      })),
      ...events.rows.map((row) => ({
        ...row,
        history_source: "PRODUCT_EVENT",
        product_ids: row.product_id ? [row.product_id] : [],
        supplier_ids: [
          ...new Set(
            [...(row.supplier_ids || []), row.supplier_id].filter(Boolean),
          ),
        ],
      })),
      ...audits.rows.map((row) => ({ ...row, history_source: "AUDIT" })),
      ...reservedSales.rows.map((row) => ({
        ...row,
        history_source: "INVENTORY_RESERVATION",
        product_ids: [row.product_id],
        supplier_ids: row.supplier_id ? [row.supplier_id] : [],
      })),
    ];
    const productId = req.query.productId
        ? id.parse(String(req.query.productId))
        : "",
      supplierId = req.query.supplierId
        ? id.parse(String(req.query.supplierId))
        : "",
      userId = req.query.userId ? id.parse(String(req.query.userId)) : "",
      type = String(req.query.type || ""),
      status = String(req.query.status || ""),
      from = req.query.from ? dateOnly.parse(String(req.query.from)) : "",
      to = req.query.to ? dateOnly.parse(String(req.query.to)) : "",
      search = String(req.query.q || "").trim().toLowerCase();
    const filtered = rows.filter((row) => {
      const productIds = (row.product_ids || []).filter(Boolean);
      const supplierIds = (row.supplier_ids || []).filter(Boolean);
      const date =
        typeof row.display_date === "string" && /^\d{4}-\d{2}-\d{2}/.test(row.display_date)
          ? row.display_date.slice(0, 10)
          : businessDate(new Date(row.display_date || row.created_at));
      const searchable = [
        row.type,
        row.status,
        row.product_name,
        row.supplier_name,
        row.customer_name,
        row.employee_name,
        row.notes,
        row.target_name,
        row.sale_number,
        row.field_name,
        row.old_value,
        row.new_value,
        JSON.stringify(row.audit_details || {}),
      ]
        .filter((value) => value !== null && value !== undefined)
        .join(" ")
        .toLowerCase();
      return (
        (!productId || productIds.includes(productId)) &&
        (!supplierId || supplierIds.includes(supplierId)) &&
        (!userId || row.user_id === userId) &&
        (!type || row.type === type) &&
        (!status || row.status === status) &&
        (!from || date >= from) &&
        (!to || date <= to) &&
        (!search || searchable.includes(search))
      );
    });
    const visibleRows = filtered
      .map((row) => {
        const visibleRow = { ...row };
        delete visibleRow.purchase_price;
        delete visibleRow.sale_selling_price;
        delete visibleRow.customer_name;
        delete visibleRow.sale_number;
        return visibleRow;
      })
      .sort((a, b) => {
        const displayDifference =
          new Date(b.display_date || b.created_at).getTime() -
          new Date(a.display_date || a.created_at).getTime();
        return (
          displayDifference ||
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });
    res.json(visibleRows);
  }),
);
app.delete(
  "/api/stock-movements/:id",
  auth(),
  asyncRoute(async (req, res) => {
    const movementId = id.parse(req.params.id);
    const reason = z
      .object({ reason: z.string().min(3) })
      .parse(req.body).reason;
    const result = await tx(async (c) => {
      const movement = await c.query(
        "SELECT * FROM stock_movements WHERE id=$1 FOR UPDATE",
        [movementId],
      );
      if (!movement.rowCount)
        throw error("NOT_FOUND", "Inventory operation not found", 404);
      const m = movement.rows[0];
      if (m.deleted_at)
        throw error(
          "ALREADY_DELETED",
          "This inventory operation has already been reversed",
        );
      if (
        !["IMPORT", "SUPPLIER_RETURN", "SOLD", "LOST", "DESTROYED", "CORRECTION"].includes(m.type)
      )
        throw error(
          "CANNOT_REVERSE",
          m.type === "RETURN"
            ? "Returns cannot be reversed because their sale and refund records must remain consistent"
            : "Sales and reservations must be handled through their dedicated workflows",
        );
      const product = await c.query(
        "SELECT * FROM products WHERE id=$1 FOR UPDATE",
        [m.product_id],
      );
      const p = product.rows[0],
        newCurrent = p.current_quantity - m.quantity;
      const warehouseId = m.warehouse_id || (
        await c.query("SELECT id FROM warehouses WHERE slug='showroom'")
      ).rows[0].id;
      const location = await c.query(
        "SELECT quantity FROM product_location_stock WHERE product_id=$1 AND warehouse_id=$2 FOR UPDATE",
        [m.product_id, warehouseId],
      );
      const newLocationQuantity = +location.rows[0].quantity - m.quantity;
      if (
        newCurrent < 0 ||
        newCurrent < p.reserved_quantity ||
        newLocationQuantity < 0
      )
        throw error(
          "CANNOT_REVERSE",
          "This operation cannot be reversed because it would invalidate current stock or reservations",
        );
      const batchChanges = await c.query(
        `SELECT change.batch_id,change.warehouse_id,change.quantity,
           location.quantity current_quantity
         FROM inventory_batch_changes change
         JOIN inventory_batch_locations location
           ON location.batch_id=change.batch_id
          AND location.warehouse_id=change.warehouse_id
         WHERE change.movement_id=$1
         FOR UPDATE OF location`,
        [movementId],
      );
      if (
        m.type === "IMPORT" &&
        (batchChanges.rows.reduce(
          (sum, change) => sum + +change.quantity,
          0,
        ) !== +m.quantity ||
          batchChanges.rows.some(
            (change) => change.warehouse_id !== warehouseId,
          ))
      )
        throw error(
          "CANNOT_REVERSE",
          "This import cannot be reversed because some of its stock was already sold or moved",
        );
      for (const change of batchChanges.rows) {
        const nextQuantity = +change.current_quantity - +change.quantity;
        if (nextQuantity < 0)
          throw error(
            "CANNOT_REVERSE",
            "This operation cannot be reversed because its invoice stock has already changed",
          );
        await c.query(
          `UPDATE inventory_batch_locations SET quantity=$1
           WHERE batch_id=$2 AND warehouse_id=$3`,
          [nextQuantity, change.batch_id, change.warehouse_id],
        );
      }
      await c.query(
        "UPDATE products SET current_quantity=$1,updated_at=now() WHERE id=$2",
        [newCurrent, p.id],
      );
      await c.query(
        "UPDATE product_location_stock SET quantity=$1,updated_at=now() WHERE product_id=$2 AND warehouse_id=$3",
        [newLocationQuantity, m.product_id, warehouseId],
      );
      await c.query(
        "UPDATE stock_movements SET deleted_at=now(),deleted_by=$1,deletion_reason=$2,notes=CASE WHEN notes IS NULL OR notes='' THEN $2 ELSE notes || ' | Reversal reason: ' || $2 END WHERE id=$3",
        [req.user!.id, reason, movementId],
      );
      await c.query(
        "INSERT INTO stock_movements(product_id,type,quantity,user_id,reference_id,supplier_id,purchase_price,notes,warehouse_id) VALUES($1,'REVERSED',$2,$3,$4,$5,$6,$7,$8)",
        [
          m.product_id,
          -m.quantity,
          req.user!.id,
          m.id,
          m.supplier_id,
          m.purchase_price,
          reason,
          warehouseId,
        ],
      );
      if (m.type === "SOLD" && m.reference_id)
        await c.query(
          `UPDATE inventory_reservations
           SET status='PENDING',completed_by=NULL,completed_at=NULL,updated_at=now()
           WHERE id=$1 AND status='COMPLETED'`,
          [m.reference_id],
        );
      await audit(
        c,
        req.user!,
        "REVERSE_MOVEMENT",
        "STOCK_MOVEMENT",
        movementId,
        { reason, originalQuantity: m.quantity },
      );
      return { ok: true };
    });
    res.json(result);
  }),
);
app.get(
  "/api/dashboard",
  auth(),
  asyncRoute(async (_q, res) => {
    const [summary, locationRows, reservationSummary] = await Promise.all([
      pool.query(
        `SELECT
           count(*) FILTER (WHERE is_active)::integer products,
           COALESCE(sum(current_quantity) FILTER (WHERE is_active),0)::integer physical_stock,
           count(*) FILTER (WHERE is_active AND current_quantity=0)::integer out_stock,
           count(*) FILTER (WHERE is_active AND current_quantity BETWEEN 1 AND 2)::integer low_stock,
           (SELECT count(*)::integer FROM suppliers) suppliers
         FROM products`,
      ),
      pool.query(
        `SELECT warehouse.id warehouse_id,warehouse.name warehouse_name,
           warehouse.slug warehouse_slug,warehouse.kind warehouse_kind,
           COALESCE(sum(COALESCE(stock.quantity,0)) OVER (
             PARTITION BY warehouse.id
           ),0)::integer warehouse_stock,
           count(*) FILTER (WHERE COALESCE(stock.quantity,0)>0) OVER (
             PARTITION BY warehouse.id
           )::integer warehouse_products,
           product.id product_id,
           product.name product_name,supplier.name supplier_name,
           category.name category_name,
           ARRAY(
             SELECT DISTINCT invoice_batch.invoice_code
             FROM inventory_batches invoice_batch
             WHERE invoice_batch.product_id=product.id
             ORDER BY invoice_batch.invoice_code
           ) invoice_codes,
           COALESCE((
             SELECT json_agg(invoice ORDER BY invoice.code)
             FROM (
               SELECT batch.invoice_code code,
                 sum(batch_location.quantity)::integer remaining_quantity
               FROM inventory_batches batch
               JOIN inventory_batch_locations batch_location
                 ON batch_location.batch_id=batch.id
               WHERE batch.product_id=product.id
                 AND batch_location.warehouse_id=warehouse.id
               GROUP BY batch.invoice_code
               HAVING sum(batch_location.quantity)>0
             ) invoice
           ),'[]'::json) invoice_stock,
           COALESCE(stock.quantity,0)::integer quantity
         FROM warehouses warehouse
         LEFT JOIN products product ON product.is_active
         LEFT JOIN product_location_stock stock
           ON stock.product_id=product.id AND stock.warehouse_id=warehouse.id
         LEFT JOIN suppliers supplier ON supplier.id=product.supplier_id
         LEFT JOIN categories category ON category.id=product.category_id
         ORDER BY CASE warehouse.kind WHEN 'SHOWROOM' THEN 0 ELSE 1 END,
           warehouse.name,product.name`,
      ),
      pool.query(
        `SELECT count(*)::integer reserved_actions,
           COALESCE(sum(quantity),0)::integer reserved_products
         FROM inventory_reservations
         WHERE status='PENDING'`,
      ),
    ]);
    const locations = new Map<string, any>();
    for (const row of locationRows.rows) {
      let location = locations.get(row.warehouse_id);
      if (!location) {
        location = {
          id: row.warehouse_id,
          name: row.warehouse_name,
          slug: row.warehouse_slug,
          kind: row.warehouse_kind,
          stock: row.warehouse_stock,
          products: row.warehouse_products,
          products_table: [],
        };
        locations.set(row.warehouse_id, location);
      }
      if (row.product_id && row.quantity > 0)
        location.products_table.push({
          warehouse_id: row.warehouse_id,
          product_id: row.product_id,
          product_name: row.product_name,
          supplier_name: row.supplier_name,
          category_name: row.category_name,
          invoice_codes: row.invoice_codes,
          invoice_stock: row.invoice_stock,
          quantity: row.quantity,
        });
    }
    res.json({
      ...summary.rows[0],
      ...reservationSummary.rows[0],
      locations: [...locations.values()],
    });
  }),
);
app.get(
  "/api/inventory/summary",
  auth(),
  asyncRoute(async (req, res) => {
    const warehouseId = req.query.warehouseId
      ? id.parse(String(req.query.warehouseId))
      : null;
    const r = warehouseId
      ? await pool.query(
          `SELECT COALESCE(sum(stock.quantity),0)::integer physical_stock,
             count(*) FILTER (WHERE stock.quantity=0)::integer out_stock,
             count(*) FILTER (WHERE stock.quantity BETWEEN 1 AND 2)::integer low_stock
           FROM products product
           LEFT JOIN product_location_stock stock
             ON stock.product_id=product.id AND stock.warehouse_id=$1
           WHERE product.is_active`,
          [warehouseId],
        )
      : await pool.query(
          "SELECT COALESCE(sum(current_quantity),0)::integer physical_stock,count(*) FILTER (WHERE current_quantity=0)::integer out_stock,count(*) FILTER (WHERE current_quantity BETWEEN 1 AND 2)::integer low_stock FROM products WHERE is_active",
        );
    res.json(r.rows[0]);
  }),
);
app.get(
  "/api/inventory/products",
  auth(),
  asyncRoute(async (req, res) => {
    const values: string[] = [];
    const productWhere = ["p.is_active=true"];
    const movementWhere = ["sm.product_id=p.id"];
    let locationJoin = "";
    let quantityExpression = "p.current_quantity";
    let invoiceWarehouseCondition = "";
    let invoiceCodeCondition = "";
    const add = (target: string[], sql: string, value: string) => {
      values.push(value);
      target.push(sql.replace("?", `$${values.length}`));
    };
    if (req.query.warehouseId) {
      const warehouseId = id.parse(String(req.query.warehouseId));
      values.push(warehouseId);
      const placeholder = `$${values.length}`;
      locationJoin = `LEFT JOIN product_location_stock location_stock ON location_stock.product_id=p.id AND location_stock.warehouse_id=${placeholder}`;
      quantityExpression = "COALESCE(location_stock.quantity,0)";
      invoiceWarehouseCondition =
        `AND batch_location.warehouse_id=${placeholder}`;
      movementWhere.push(
        `(sm.warehouse_id=${placeholder} OR sm.destination_warehouse_id=${placeholder})`,
      );
      productWhere.push(`${quantityExpression}>0`);
    }
    if (req.query.productId)
      add(productWhere, "p.id=?", String(req.query.productId));
    if (req.query.supplierId)
      add(productWhere, "p.supplier_id=?", String(req.query.supplierId));
    if (req.query.categoryId)
      add(productWhere, "p.category_id=?", String(req.query.categoryId));
    if (req.query.invoiceCode) {
      const invoiceCode = invoiceCodeSchema.parse(
        String(req.query.invoiceCode),
      );
      values.push(invoiceCode);
      invoiceCodeCondition = `AND batch.invoice_code=$${values.length}`;
      productWhere.push(
        `EXISTS(
           SELECT 1 FROM inventory_batches invoice_filter
           WHERE invoice_filter.product_id=p.id
             AND invoice_filter.invoice_code=$${values.length}
         )`,
      );
    }
    if (req.query.stockStatus === "OUT")
      productWhere.push(`${quantityExpression}=0`);
    if (req.query.stockStatus === "LOW")
      productWhere.push(`${quantityExpression} BETWEEN 1 AND 2`);
    if (req.query.stockStatus === "AVAILABLE")
      productWhere.push(`${quantityExpression}>0`);
    if (req.query.type)
      add(movementWhere, "sm.type=?", String(req.query.type));
    if (req.query.status === "ACTIVE")
      movementWhere.push("sm.deleted_at IS NULL AND sm.type<>'REVERSED'");
    if (req.query.status === "REVERSED")
      movementWhere.push("(sm.deleted_at IS NOT NULL OR sm.type='REVERSED')");
    if (req.query.from)
      add(
        movementWhere,
        "COALESCE(sm.business_date,sm.created_at::date)>=?::date",
        String(req.query.from),
      );
    if (req.query.to)
      add(
        movementWhere,
        "COALESCE(sm.business_date,sm.created_at::date)<=?::date",
        String(req.query.to),
      );
    const hasMovementFilter =
      Boolean(req.query.type) ||
      Boolean(req.query.status) ||
      Boolean(req.query.from) ||
      Boolean(req.query.to);
    if (hasMovementFilter)
      productWhere.push(
        `EXISTS(SELECT 1 FROM stock_movements sm WHERE ${movementWhere.join(" AND ")})`,
      );
    const result = await pool.query(
      `SELECT p.id,p.name product_name,${quantityExpression} quantity,p.description notes,
         s.name supplier_name,c.name category_name,
         ARRAY(
           SELECT DISTINCT invoice_batch.invoice_code
           FROM inventory_batches invoice_batch
           WHERE invoice_batch.product_id=p.id
           ORDER BY invoice_batch.invoice_code
         ) invoice_codes,
         COALESCE((
           SELECT json_agg(invoice ORDER BY invoice.code)
           FROM (
             SELECT batch.invoice_code code,
               sum(batch_location.quantity)::integer remaining_quantity
             FROM inventory_batches batch
             JOIN inventory_batch_locations batch_location
               ON batch_location.batch_id=batch.id
             WHERE batch.product_id=p.id
               ${invoiceWarehouseCondition}
               ${invoiceCodeCondition}
             GROUP BY batch.invoice_code
             HAVING sum(batch_location.quantity)>0
           ) invoice
         ),'[]'::json) invoice_stock
       FROM products p
       ${locationJoin}
       LEFT JOIN suppliers s ON s.id=p.supplier_id
       LEFT JOIN categories c ON c.id=p.category_id
       WHERE ${productWhere.join(" AND ")}
       ORDER BY p.name`,
      values,
    );
    res.json(result.rows);
  }),
);
app.get(
  "/api/inventory/products/:id/activity",
  auth(),
  asyncRoute(async (req, res) => {
    const productId = id.parse(req.params.id);
    const product = await pool.query("SELECT id FROM products WHERE id=$1", [
      productId,
    ]);
    if (!product.rowCount) throw error("NOT_FOUND", "Product not found", 404);
    const [movements, events] = await Promise.all([
      pool.query(
        `SELECT
           sm.id,
           COALESCE(sm.business_date::timestamptz,sm.created_at) occurred_at,
           sm.type::text type,
           CASE
             WHEN sm.type='REVERSED' THEN NULL
             WHEN sm.deleted_at IS NOT NULL THEN 'REVERSED'
             ELSE 'ACTIVE'
           END status,
           abs(sm.quantity) quantity,
           supplier.name supplier_name,
           CASE WHEN destination_warehouse.name IS NULL THEN warehouse.name
             ELSE warehouse.name || ' → ' || destination_warehouse.name END warehouse_name,
           activity_product.name product_name,
           NULL::text field_name,
           NULL::text old_value,
           NULL::text new_value,
           movement_user.name user_name,
           sm.invoice_code,
           sm.notes
         FROM stock_movements sm
         JOIN products activity_product ON activity_product.id=sm.product_id
         JOIN users movement_user ON movement_user.id=sm.user_id
         LEFT JOIN suppliers supplier ON supplier.id=sm.supplier_id
         LEFT JOIN warehouses warehouse ON warehouse.id=sm.warehouse_id
         LEFT JOIN warehouses destination_warehouse
           ON destination_warehouse.id=sm.destination_warehouse_id
         WHERE sm.product_id=$1
           AND sm.type IN ('IMPORT','SUPPLIER_RETURN','SOLD','LOST','DESTROYED','CORRECTION','TRANSPORT','REVERSED','DAMAGE','OTHER')`,
        [productId],
      ),
      pool.query(
        `SELECT event.id,event.created_at occurred_at,event.action type,
           CASE WHEN event.field_name IS NOT NULL THEN 'CHANGED' ELSE event.action END status,
           NULL::integer quantity,NULL::text supplier_name,
           event.product_name,event.field_name,event.old_value,event.new_value,
           event_user.name user_name,event.notes
         FROM product_events event
         JOIN users event_user ON event_user.id=event.user_id
         WHERE event.product_id=$1`,
        [productId],
      ),
    ]);
    const activity = [...movements.rows, ...events.rows]
      .filter(
        (row) =>
          row.type === "PRODUCT_CREATED" ||
          String(row.type || "").endsWith("_CHANGED") ||
          [
            "IMPORT",
            "SUPPLIER_RETURN",
            "SOLD",
            "LOST",
            "DESTROYED",
            "CORRECTION",
            "TRANSPORT",
            "REVERSED",
            "DAMAGE",
            "OTHER",
            "PRODUCT_ARCHIVED",
            "PRODUCT_DELETED",
          ].includes(row.type),
      )
      .sort(
        (a, b) =>
          new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
      );
    res.json(activity);
  }),
);
app.get(
  "/api/inventory/movements",
  auth(),
  asyncRoute(async (req, res) => {
    const values: any[] = [],
      where: string[] = [
        "sm.type IN ('IMPORT','SUPPLIER_RETURN','SOLD','LOST','DESTROYED','CORRECTION','TRANSPORT','REVERSED','DAMAGE','OTHER')",
      ];
    const add = (sql: string, value: any) => {
      values.push(value);
      where.push(sql.replace("?", `$${values.length}`));
    };
    if (req.query.productId)
      add("sm.product_id=?", String(req.query.productId));
    if (req.query.supplierId)
      add("sm.supplier_id=?", String(req.query.supplierId));
    if (req.query.warehouseId) {
      values.push(id.parse(String(req.query.warehouseId)));
      const warehousePlaceholder = `$${values.length}`;
      where.push(
        `(sm.warehouse_id=${warehousePlaceholder} OR sm.destination_warehouse_id=${warehousePlaceholder})`,
      );
    }
    if (req.query.type) add("sm.type=?", String(req.query.type));
    if (req.query.status === "ACTIVE")
      where.push("sm.deleted_at IS NULL AND sm.type<>'REVERSED'");
    if (req.query.status === "REVERSED")
      where.push("(sm.deleted_at IS NOT NULL OR sm.type='REVERSED')");
    if (req.query.from)
      add(
        "COALESCE(sm.business_date,sm.created_at::date)>=?::date",
        String(req.query.from),
      );
    if (req.query.to)
      add(
        "COALESCE(sm.business_date,sm.created_at::date)<=?::date",
        String(req.query.to),
      );
    const r = await pool.query(
      `SELECT sm.id,sm.product_id,sm.type,sm.quantity,sm.user_id,sm.reference_id,
         sm.supplier_id,sm.business_date,sm.invoice_code,sm.notes,sm.created_at,sm.deleted_at,
         sm.deleted_by,sm.deletion_reason,
         COALESCE(sm.business_date,sm.created_at::date) display_date,
         p.name product_name,u.name employee_name,s.name supplier_name,
         CASE WHEN destination.name IS NULL THEN w.name
           ELSE w.name || ' → ' || destination.name END warehouse_name
       FROM stock_movements sm
       JOIN products p ON p.id=sm.product_id
       JOIN users u ON u.id=sm.user_id
       LEFT JOIN suppliers s ON s.id=sm.supplier_id
       LEFT JOIN warehouses w ON w.id=sm.warehouse_id
       LEFT JOIN warehouses destination ON destination.id=sm.destination_warehouse_id
       WHERE ${where.join(" AND ")}
       ORDER BY COALESCE(sm.business_date,sm.created_at::date) DESC,sm.created_at DESC
       LIMIT 500`,
      values,
    );
    res.json(r.rows);
  }),
);
app.get(
  "/api/users",
  auth(["ADMIN"]),
  asyncRoute(async (_q, res) => {
    const r = await pool.query(
      "SELECT id,name,username,role,is_active,last_login,created_at FROM users ORDER BY created_at",
    );
    res.json(r.rows);
  }),
);
app.post(
  "/api/users",
  auth(["ADMIN"]),
  asyncRoute(async (req, res) => {
    const x = z
      .object({
        name: z.string().min(1),
        username: z.string().min(3),
        password: z.string().min(8),
        role: z.enum(["ADMIN", "EMPLOYEE"]).default("EMPLOYEE"),
      })
      .parse(req.body);
    const passwordHash = await bcrypt.hash(x.password, 12);
    const created = await tx(async (c) => {
      const r = await c.query(
        "INSERT INTO users(name,username,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,name,username,role,is_active,created_at",
        [x.name, x.username, passwordHash, x.role],
      );
      await audit(c, req.user!, "CREATE", "USER", r.rows[0].id, {
        name: r.rows[0].name,
        username: r.rows[0].username,
        role: r.rows[0].role,
      });
      return r.rows[0];
    });
    res.status(201).json(created);
  }),
);
app.put(
  "/api/users/:id/password",
  auth(["ADMIN"]),
  asyncRoute(async (req, res) => {
    const userId = id.parse(req.params.id),
      x = z
        .object({
          newPassword: z.string().min(8),
          confirmPassword: z.string().min(8),
        })
        .parse(req.body);
    if (x.newPassword !== x.confirmPassword)
      throw error(
        "PASSWORD_MISMATCH",
        "New password and confirmation must match",
      );
    await tx(async (c) => {
      const employee = await c.query(
        "SELECT id,role FROM users WHERE id=$1 FOR UPDATE",
        [userId],
      );
      if (!employee.rowCount)
        throw error("NOT_FOUND", "Employee not found", 404);
      if (employee.rows[0].role !== "EMPLOYEE")
        throw error(
          "PASSWORD_RESET_RESTRICTED",
          "Only employee passwords can be reset",
        );
      await c.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
        await bcrypt.hash(x.newPassword, 12),
        userId,
      ]);
      await audit(c, req.user!, "RESET_EMPLOYEE_PASSWORD", "USER", userId);
    });
    res.json({ ok: true });
  }),
);
app.patch(
  "/api/users/:id",
  auth(["ADMIN"]),
  asyncRoute(async (req, res) => {
    const x = z
      .object({
        name: z.string().min(1).optional(),
        role: z.enum(["ADMIN", "EMPLOYEE"]).optional(),
        isActive: z.boolean().optional(),
      })
      .parse(req.body);
    if (!Object.keys(x).length)
      throw error("VALIDATION", "No employee changes supplied");
    const userId = id.parse(req.params.id);
    const result = await tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(927364)");
      const target = await c.query(
        "SELECT id,name,username,role,is_active FROM users WHERE id=$1 FOR UPDATE",
        [userId],
      );
      if (!target.rowCount)
        throw error("NOT_FOUND", "Employee not found", 404);

      const willRemainAdmin =
        (x.role ?? target.rows[0].role) === "ADMIN" &&
        (x.isActive ?? target.rows[0].is_active);
      if (target.rows[0].role === "ADMIN" && !willRemainAdmin) {
        const activeAdmins = await c.query(
          "SELECT id FROM users WHERE role='ADMIN' AND is_active FOR UPDATE",
        );
        if (activeAdmins.rowCount <= 1)
          throw error(
            "LAST_ADMIN",
            "The last active administrator cannot be disabled or changed to employee",
          );
      }

      const updated = await c.query(
        "UPDATE users SET name=COALESCE($1,name),role=COALESCE($2,role),is_active=COALESCE($3,is_active) WHERE id=$4 RETURNING id,name,username,role,is_active,last_login,created_at",
        [x.name, x.role, x.isActive, userId],
      );
      const changes = changedValues(target.rows[0], updated.rows[0], [
        "name",
        "role",
        "is_active",
      ]);
      if (Object.keys(changes).length)
        await audit(c, req.user!, "UPDATE_USER", "USER", userId, {
          name: updated.rows[0].name,
          username: updated.rows[0].username,
          changes,
        });
      return updated.rows[0];
    });
    res.json(result);
  }),
);
app.get(
  "/api/audit-logs",
  auth(["ADMIN"]),
  asyncRoute(async (_q, res) => {
    const r = await pool.query(
      "SELECT a.*,u.name user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 500",
    );
    res.json(r.rows);
  }),
);
app.get(
  "/api/settings",
  auth(),
  asyncRoute(async (_q, res) =>
    res.json((await pool.query("SELECT * FROM settings")).rows),
  ),
);
app.put(
  "/api/settings",
  auth(["ADMIN"]),
  asyncRoute(async (req, res) => {
    const x = z.record(z.string().max(200)).parse(req.body);
    await tx(async (c) => {
      const before = await c.query(
        "SELECT key,value FROM settings WHERE key=ANY($1::text[])",
        [Object.keys(x)],
      );
      const oldValues = Object.fromEntries(
        before.rows.map((row) => [row.key, row.value]),
      );
      const entries = Object.entries(x);
      if (entries.length)
        await c.query(
          `INSERT INTO settings(key,value)
           SELECT input.key,input.value
           FROM unnest($1::text[],$2::text[]) AS input(key,value)
           ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value`,
          [
            entries.map(([key]) => key),
            entries.map(([, value]) => value),
          ],
        );
      const changes = Object.fromEntries(
        Object.entries(x)
          .filter(([key, value]) => oldValues[key] !== value)
          .map(([key, value]) => [
            key,
            { oldValue: oldValues[key] ?? null, newValue: value },
          ]),
      );
      if (Object.keys(changes).length)
        await audit(c, req.user!, "UPDATE", "SETTINGS", undefined, {
          changes,
        });
    });
    res.json({ ok: true });
  }),
);
app.use((_req, _res, next) => next(error("NOT_FOUND", "Route not found", 404)));
app.use((e: any, _req: Request, res: Response, _next: NextFunction) => {
  if (e instanceof z.ZodError)
    return res.status(400).json({
      error: {
        code: "VALIDATION",
        message: e.issues.map((i) => i.message).join("; "),
      },
    });
  if (e.code === "23505")
    return res.status(409).json({
      error: {
        code: "DUPLICATE",
        message: "A record with that value already exists",
      },
    });
  if (e.code === "23503")
    return res.status(409).json({
      error: {
        code: "RECORD_IN_USE",
        message: "This record is still used by another part of the application",
      },
    });
  if (["22007", "22008", "23514"].includes(e.code))
    return res.status(400).json({
      error: { code: "VALIDATION", message: "The supplied value is not valid" },
    });
  if (e instanceof multer.MulterError)
    return res.status(400).json({
      error: {
        code: "INVALID_IMAGE",
        message:
          e.code === "LIMIT_FILE_SIZE"
            ? "The image must be 5 MB or smaller"
            : "The image upload is not valid",
      },
    });
  if (!e.status) console.error(e);
  res.status(e.status || 500).json({
    error: {
      code: e.code || "SERVER_ERROR",
      message: e.status ? e.message : "An unexpected server error occurred",
    },
  });
});
const port = +process.env.PORT! || 4000;
let server: ReturnType<typeof app.listen> | undefined;

const start = async () => {
  await runMigrations();
  server = app.listen(port, "0.0.0.0", () => {
    if (secret === "development-only-change-me")
      console.warn(
        "WARNING: JWT_SECRET is using the development default. Set a long random value in .env before exposing this application.",
      );
    console.log(`API listening on port ${port}`);
  });
};

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received; closing the API safely`);
  const finish = async () => {
    await pool.end();
    process.exit(0);
  };
  if (server) server.close(() => void finish());
  else await finish();
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

void start().catch(async (startupError) => {
  console.error("API startup failed", startupError);
  await pool.end();
  process.exit(1);
});
