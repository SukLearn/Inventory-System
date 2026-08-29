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
  calculateReservationBalance,
  calculateSaleBalance,
  isValidDateOnly,
  nextDeliveryStatus,
  reportPeriodBounds,
  returnNote as formatReturnNote,
  returnStatus,
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
) => {
  const p = productId
    ? await c.query("SELECT name FROM products WHERE id=$1", [productId])
    : { rows: [{ name: null }] };
  return c.query(
    "INSERT INTO product_events(product_id,product_name,action,field_name,old_value,new_value,user_id,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      productId || null,
      p.rows[0]?.name || null,
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
const nonnegativeNumber = numericValue.refine(
  (value) => value >= 0,
  "Enter a non-negative numeric value",
);
const money = nonnegativeNumber.refine(
  (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8,
  "Money can have at most 2 decimal places",
);
const positiveMoney = money.refine(
  (value) => value > 0,
  "Amount must be greater than zero",
);
const positiveInteger = numericValue
  .refine(Number.isInteger, "Enter a whole number")
  .refine((value) => value > 0, "Enter a number greater than zero");
const qty = positiveInteger;
const dateOnly = z
  .string()
  .refine(isValidDateOnly, "Choose a valid calendar date");
const productSchema = z.object({
  name: z.string().min(1),
  categoryId: id,
  supplierId: id,
  description: z.string().optional().nullable(),
  purchasePrice: money.default(0),
  sellingPrice: money.default(0),
  width: nonnegativeNumber.optional().nullable(),
  height: nonnegativeNumber.optional().nullable(),
  depth: nonnegativeNumber.optional().nullable(),
  material: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});
const contactSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal("")).nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

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

function listResource(table: string, columns = "*", searchPhone = true) {
  return asyncRoute(async (req, res) => {
    const q = String(req.query.q || "");
    const search = searchPhone
      ? "WHERE name ILIKE $1 OR COALESCE(phone,'') ILIKE $1"
      : "WHERE name ILIKE $1";
    const r = await pool.query(
      `SELECT ${columns} FROM ${table} ${q ? search : ""} ORDER BY created_at DESC`,
      q ? [`%${q}%`] : [],
    );
    res.json(r.rows);
  });
}
function contactRoutes(name: string, table: string, adminWrite = false) {
  const entityType = name.slice(0, -1).toUpperCase();
  app.get(`/api/${name}`, auth(), listResource(table));
  app.post(
    `/api/${name}`,
    auth(adminWrite ? ["ADMIN"] : undefined),
    asyncRoute(async (req, res) => {
      const x = contactSchema.parse(req.body);
      const created = await tx(async (c) => {
        const r = await c.query(
          `INSERT INTO ${table}(name,phone,email,address,notes) VALUES($1,$2,$3,$4,$5) RETURNING *`,
          [
            x.name,
            x.phone || null,
            x.email || null,
            x.address || null,
            x.notes || null,
          ],
        );
        await audit(c, req.user!, "CREATE", entityType, r.rows[0].id, {
          name: r.rows[0].name,
          phone: r.rows[0].phone,
          email: r.rows[0].email,
          address: r.rows[0].address,
          notes: r.rows[0].notes,
        });
        return r.rows[0];
      });
      res.status(201).json(created);
    }),
  );
  app.patch(
    `/api/${name}/:id`,
    auth(adminWrite ? ["ADMIN"] : undefined),
    asyncRoute(async (req, res) => {
      const x = contactSchema.partial().parse(req.body);
      const keys = Object.keys(x);
      if (!keys.length) throw error("VALIDATION", "No changes supplied");
      const entityId = id.parse(req.params.id);
      const updated = await tx(async (c) => {
        const before = await c.query(
          `SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`,
          [entityId],
        );
        if (!before.rowCount) throw error("NOT_FOUND", "Record not found", 404);
        const r = await c.query(
          `UPDATE ${table} SET ${keys.map((k, i) => `${k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase())}=$${i + 1}`).join(",")},updated_at=now() WHERE id=$${keys.length + 1} RETURNING *`,
          [...Object.values(x), entityId],
        );
        const changes = changedValues(before.rows[0], r.rows[0], keys);
        if (Object.keys(changes).length)
          await audit(c, req.user!, "UPDATE", entityType, entityId, {
            name: r.rows[0].name,
            changes,
          });
        return r.rows[0];
      });
      res.json(updated);
    }),
  );
}
contactRoutes("customers", "customers");
contactRoutes("suppliers", "suppliers", true);
app.get("/api/contacts", auth(), listResource("contacts"));
app.post(
  "/api/contacts",
  auth(["ADMIN"]),
  asyncRoute(async (req, res) => {
    const x = contactSchema
      .extend({ type: z.string().min(1).default("OTHER") })
      .parse(req.body);
    const created = await tx(async (c) => {
      const r = await c.query(
        "INSERT INTO contacts(name,type,phone,email,notes) VALUES($1,$2,$3,$4,$5) RETURNING *",
        [x.name, x.type, x.phone || null, x.email || null, x.notes || null],
      );
      await audit(c, req.user!, "CREATE", "CONTACT", r.rows[0].id, {
        name: r.rows[0].name,
        type: r.rows[0].type,
        phone: r.rows[0].phone,
        email: r.rows[0].email,
        notes: r.rows[0].notes,
      });
      return r.rows[0];
    });
    res.status(201).json(created);
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
    if (req.query.minPrice !== undefined && req.query.minPrice !== "") {
      p.push(money.parse(req.query.minPrice));
      where.push(`p.selling_price>=$${p.length}`);
    }
    if (req.query.maxPrice !== undefined && req.query.maxPrice !== "") {
      p.push(money.parse(req.query.maxPrice));
      where.push(`p.selling_price<=$${p.length}`);
    }
    if (out) where.push("p.current_quantity=0");
    const r = await pool.query(
      `SELECT p.*,c.name category_name,s.name supplier_name,
         (p.current_quantity-p.reserved_quantity) available_quantity,
         (EXISTS(SELECT 1 FROM sale_items WHERE product_id=p.id)
           OR EXISTS(SELECT 1 FROM stock_movements WHERE product_id=p.id)
           OR EXISTS(SELECT 1 FROM reservations WHERE product_id=p.id)) has_history,
         (SELECT storage_path FROM product_images i WHERE i.product_id=p.id ORDER BY i.is_primary DESC,i.created_at LIMIT 1) primary_image
       FROM products p
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
      `SELECT p.*,
         (p.current_quantity-p.reserved_quantity) available_quantity,
         (EXISTS(SELECT 1 FROM sale_items WHERE product_id=p.id)
           OR EXISTS(SELECT 1 FROM stock_movements WHERE product_id=p.id)
           OR EXISTS(SELECT 1 FROM reservations WHERE product_id=p.id)) has_history,
         c.name category_name,
         s.name supplier_name,
         (SELECT max(COALESCE(sm.business_date,sm.created_at::date)) FROM stock_movements sm WHERE sm.product_id=p.id AND sm.type='IMPORT' AND sm.deleted_at IS NULL) last_import_date,
         (SELECT max(sa.business_date) FROM sale_items si JOIN sales sa ON sa.id=si.sale_id WHERE si.product_id=p.id) last_sale_date
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
app.post(
  "/api/products",
  auth(["ADMIN"]),
  asyncRoute(async (req, res) => {
    const x = productSchema.parse(req.body);
    const product = await tx(async (c) => {
      const r = await c.query(
        "INSERT INTO products(name,category_id,supplier_id,description,purchase_price,selling_price,width,height,depth,material,color) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *",
        [
          x.name,
          x.categoryId,
          x.supplierId,
          x.description,
          x.purchasePrice,
          x.sellingPrice,
          x.width,
          x.height,
          x.depth,
          x.material,
          x.color,
        ],
      );
      await productEvent(c, req.user!, r.rows[0].id, "PRODUCT_CREATED");
      await audit(c, req.user!, "CREATE", "PRODUCT", r.rows[0].id);
      return r.rows[0];
    });
    res.status(201).json(product);
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
        purchasePrice: "purchase_price",
        sellingPrice: "selling_price",
        isActive: "is_active",
      },
      activityByField: Record<string, [string, string]> = {
        name: ["NAME_CHANGED", "NAME"],
        categoryId: ["CATEGORY_CHANGED", "CATEGORY"],
        supplierId: ["SUPPLIER_CHANGED", "SUPPLIER"],
        description: ["NOTES_CHANGED", "NOTES"],
        purchasePrice: ["PURCHASE_PRICE_CHANGED", "PURCHASE PRICE"],
        sellingPrice: ["SELLING_PRICE_CHANGED", "SELLING PRICE"],
        width: ["WIDTH_CHANGED", "WIDTH"],
        height: ["HEIGHT_CHANGED", "HEIGHT"],
        depth: ["DEPTH_CHANGED", "DEPTH"],
        material: ["MATERIAL_CHANGED", "MATERIAL"],
        color: ["COLOR_CHANGED", "COLOR"],
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
             OR EXISTS(SELECT 1 FROM reservations WHERE product_id=p.id)) has_history
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
      if (x.isActive === true && !before.is_active && before.has_history)
        throw error(
          "ARCHIVED_PRODUCT",
          "Products with history must remain archived",
        );
      const numericFields = new Set([
        "purchasePrice",
        "sellingPrice",
        "width",
        "height",
        "depth",
      ]);
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
        );
      }
      await audit(c, req.user!, "UPDATE", "PRODUCT", productId, {
        fields: changedKeys,
      });
      return after;
    });
    res.json(product);
  }),
);
app.delete(
  "/api/products/:id",
  auth(["ADMIN"]),
  asyncRoute(async (req, res) => {
    const productId = id.parse(req.params.id);
    const result = await tx(async (c) => {
      const product = await c.query(
        "SELECT id,is_active FROM products WHERE id=$1 FOR UPDATE",
        [productId],
      );
      if (!product.rowCount) throw error("NOT_FOUND", "Product not found", 404);
      const history = await c.query(
        "SELECT EXISTS(SELECT 1 FROM sale_items WHERE product_id=$1) OR EXISTS(SELECT 1 FROM stock_movements WHERE product_id=$1) OR EXISTS(SELECT 1 FROM reservations WHERE product_id=$1) AS has_history",
        [productId],
      );
      if (history.rows[0].has_history) {
        if (product.rows[0].is_active) {
          await c.query(
            "UPDATE products SET is_active=false,updated_at=now() WHERE id=$1",
            [productId],
          );
          await productEvent(c, req.user!, productId, "PRODUCT_ARCHIVED");
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
      await productEvent(c, req.user!, productId, "PRODUCT_DELETED");
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
      supplierId ?? (type === "IMPORT" ? p.supplier_id : undefined),
    movementPurchasePrice =
      purchasePrice ??
      (type === "LOST" || type === "DESTROYED" ? +p.purchase_price : undefined);
  if (type === "IMPORT" && !effectiveSupplierId)
    throw error(
      "PRODUCT_SUPPLIER_REQUIRED",
      "Assign a supplier to the product before importing stock",
    );
  if (newCurrent < 0 || newReserved < 0 || newReserved > newCurrent)
    throw error(
      "INSUFFICIENT_STOCK",
      `Only ${p.current_quantity - p.reserved_quantity} units are available.`,
    );
  await c.query(
    "UPDATE products SET current_quantity=$1,reserved_quantity=$2,purchase_price=COALESCE($3,purchase_price),supplier_id=COALESCE($4,supplier_id),updated_at=now() WHERE id=$5",
    [newCurrent, newReserved, movementPurchasePrice, effectiveSupplierId, productId],
  );
  const movement = await c.query(
    "INSERT INTO stock_movements(product_id,type,quantity,user_id,reference_id,supplier_id,purchase_price,business_date,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
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
    ],
  );
  return { product: p, movement: movement.rows[0] };
}
async function releaseReservedStock(
  c: PoolClient,
  user: User,
  reservation: any,
  type: "RESERVATION_CANCEL" | "RESERVATION_RELEASE",
  notes?: string,
) {
  const r = await c.query("SELECT * FROM products WHERE id=$1 FOR UPDATE", [
    reservation.product_id,
  ]);
  if (!r.rowCount) throw error("NOT_FOUND", "Product not found", 404);
  const p = r.rows[0],
    newReserved = p.reserved_quantity - reservation.quantity;
  if (newReserved < 0)
    throw error(
      "INVALID_RESERVATION",
      "Reserved quantity is inconsistent with this reservation",
    );
  await c.query(
    "UPDATE products SET reserved_quantity=$1,updated_at=now() WHERE id=$2",
    [newReserved, p.id],
  );
  await c.query(
    "INSERT INTO stock_movements(product_id,type,quantity,user_id,reference_id,notes) VALUES($1,$2,$3,$4,$5,$6)",
    [
      reservation.product_id,
      type,
      -reservation.quantity,
      user.id,
      reservation.id,
      notes || null,
    ],
  );
}

async function expireReservations() {
  const candidates = await pool.query(
    "SELECT id FROM reservations WHERE status='ACTIVE' AND expires_at IS NOT NULL AND expires_at<now()",
  );
  for (const candidate of candidates.rows) {
    await tx(async (c) => {
      const result = await c.query(
        `SELECT r.*,u.name,u.username,u.role
         FROM reservations r
         JOIN users u ON u.id=r.created_by
         WHERE r.id=$1
         FOR UPDATE OF r`,
        [candidate.id],
      );
      const reservation = result.rows[0];
      if (
        !reservation ||
        reservation.status !== "ACTIVE" ||
        !reservation.expires_at ||
        new Date(reservation.expires_at) >= new Date()
      )
        return;
      const user: User = {
        id: reservation.created_by,
        name: reservation.name,
        username: reservation.username,
        role: reservation.role,
      };
      await releaseReservedStock(
        c,
        user,
        reservation,
        "RESERVATION_CANCEL",
        "Reservation expired",
      );
      await c.query(
        "UPDATE reservations SET status='EXPIRED',updated_at=now() WHERE id=$1",
        [reservation.id],
      );
      await audit(
        c,
        user,
        "RESERVATION_EXPIRE",
        "RESERVATION",
        reservation.id,
      );
    });
  }
}

type SaleReturnItem = { saleItemId: string; quantity: number };

async function processSaleReturn(
  c: PoolClient,
  user: User,
  saleId: string,
  items: SaleReturnItem[],
  reason: string,
) {
  const sale = await c.query(
    "SELECT id,sale_number,status,delivery_status FROM sales WHERE id=$1 FOR UPDATE",
    [saleId],
  );
  if (!sale.rowCount) throw error("NOT_FOUND", "Sale not found", 404);
  if (sale.rows[0].status === "CANCELLED")
    throw error("INVALID_RETURN", "Cancelled sales cannot be returned");

  const [paidResult, refundedResult] = await Promise.all([
    c.query(
      "SELECT COALESCE(sum(amount),0) amount FROM sale_payments WHERE sale_id=$1",
      [saleId],
    ),
    c.query(
      "SELECT COALESCE(sum(amount),0) amount FROM sale_refunds WHERE sale_id=$1",
      [saleId],
    ),
  ]);
  let refundable = Math.max(
    0,
    +paidResult.rows[0].amount - +refundedResult.rows[0].amount,
  );
  let totalRefund = 0;
  const notes: string[] = [];

  for (const requested of items) {
    const item = await c.query(
      "SELECT si.*,p.name product_name FROM sale_items si JOIN products p ON p.id=si.product_id WHERE si.id=$1 AND si.sale_id=$2 FOR UPDATE OF si",
      [requested.saleItemId, saleId],
    );
    if (!item.rowCount) throw error("NOT_FOUND", "Sale item not found", 404);

    const returned = await c.query(
      "SELECT COALESCE(sum(quantity),0) quantity FROM stock_movements WHERE reference_id=$1 AND type='RETURN' AND deleted_at IS NULL",
      [requested.saleItemId],
    );
    if (+returned.rows[0].quantity + requested.quantity > item.rows[0].quantity)
      throw error("RETURN_LIMIT", "Cannot return more than was sold");

    await move(
      c,
      user,
      item.rows[0].product_id,
      "RETURN",
      requested.quantity,
      reason,
      undefined,
      undefined,
      requested.saleItemId,
    );

    const refundDue = +(
      +item.rows[0].final_unit_price * requested.quantity
    ).toFixed(2);
    const refund = Math.min(refundDue, refundable);
    if (refund > 0) {
      await c.query(
        "INSERT INTO sale_refunds(sale_id,sale_item_id,amount,reason,created_by) VALUES($1,$2,$3,$4,$5)",
        [saleId, requested.saleItemId, refund, reason, user.id],
      );
      refundable = +(refundable - refund).toFixed(2);
      totalRefund = +(totalRefund + refund).toFixed(2);
    }
    notes.push(
      formatReturnNote(
        item.rows[0].product_name,
        requested.quantity,
        reason,
      ),
    );
  }

  const allItems = await c.query(
    "SELECT si.quantity,COALESCE((SELECT sum(sm.quantity) FROM stock_movements sm WHERE sm.reference_id=si.id AND sm.type='RETURN' AND sm.deleted_at IS NULL),0) returned FROM sale_items si WHERE si.sale_id=$1",
    [saleId],
  );
  const saleStatus = returnStatus(
    allItems.rows.map((item) => ({
      quantity: +item.quantity,
      returned: +item.returned,
    })),
  );
  const returnedBeforeDelivery = !["IN_TRANSIT", "DELIVERED"].includes(
    sale.rows[0].delivery_status,
  );
  await c.query(
    "UPDATE sales SET status=$1,notes=CASE WHEN notes IS NULL OR btrim(notes)='' THEN $2 ELSE notes || E'\\n' || $2 END,delivery_status=CASE WHEN $3 THEN 'CANCELLED' ELSE delivery_status END,delivery_required=CASE WHEN $3 THEN false ELSE delivery_required END,updated_at=now() WHERE id=$4",
    [saleStatus, notes.join("\n"), returnedBeforeDelivery, saleId],
  );
  await audit(c, user, "RETURN", "SALE", saleId, {
    saleNumber: sale.rows[0].sale_number,
    items,
    refund: totalRefund,
    notes: reason,
    deliveryCancelled: returnedBeforeDelivery,
  });

  return {
    refund: totalRefund,
    saleNumber: +sale.rows[0].sale_number,
    saleStatus,
    deliveryStatus: returnedBeforeDelivery
      ? "CANCELLED"
      : sale.rows[0].delivery_status,
  };
}

app.post(
  "/api/inventory/import",
  auth(),
  asyncRoute(async (req, res) => {
    const x = z
      .object({
        productId: id,
        quantity: qty,
        purchasePrice: money,
        importDate: dateOnly,
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
        x.purchasePrice,
        undefined,
        x.importDate,
      );
      await audit(c, req.user!, "IMPORT", "PRODUCT", x.productId, x);
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
        quantity: qty,
        type: z.enum(["DESTROYED", "LOST", "RETURN", "CORRECTION"]),
        correctionDirection: z
          .enum(["INCREASE", "DECREASE"])
          .nullable()
          .optional(),
        saleNumber: positiveInteger.optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    if (x.type === "CORRECTION" && !x.correctionDirection)
      throw error(
        "VALIDATION",
        "Correction direction is required for a correction",
      );
    if (["DESTROYED", "LOST"].includes(x.type) && !x.notes)
      throw error("VALIDATION", "A note is required for this adjustment");
    if (x.type === "RETURN" && !x.saleNumber)
      throw error("VALIDATION", "Sale ID is required for a return");
    const result = await tx(async (c) => {
      if (x.type === "RETURN") {
        const sale = await c.query(
          "SELECT id FROM sales WHERE sale_number=$1",
          [x.saleNumber],
        );
        if (!sale.rowCount) throw error("NOT_FOUND", "Sale ID not found", 404);
        const candidates = await c.query(
          "SELECT si.id,si.quantity-COALESCE((SELECT sum(sm.quantity) FROM stock_movements sm WHERE sm.reference_id=si.id AND sm.type='RETURN' AND sm.deleted_at IS NULL),0) available FROM sale_items si WHERE si.sale_id=$1 AND si.product_id=$2 ORDER BY si.id",
          [sale.rows[0].id, x.productId],
        );
        if (!candidates.rowCount)
          throw error(
            "RETURN_NOT_SOLD",
            "This product was not sold in that sale",
          );
        let remaining = x.quantity;
        const returnItems: SaleReturnItem[] = [];
        for (const candidate of candidates.rows) {
          if (remaining <= 0) break;
          const quantity = Math.min(remaining, +candidate.available);
          if (quantity > 0) {
            returnItems.push({ saleItemId: candidate.id, quantity });
            remaining -= quantity;
          }
        }
        if (remaining > 0)
          throw error(
            "RETURN_LIMIT",
            "Returned quantity exceeds the quantity sold",
          );
        const reason = x.notes || "Customer return";
        const processed = await processSaleReturn(
          c,
          req.user!,
          sale.rows[0].id,
          returnItems,
          reason,
        );
        return {
          ok: true,
          ...processed,
        };
      }
      const signed =
        x.type === "CORRECTION"
          ? x.correctionDirection === "DECREASE"
            ? -x.quantity
            : x.quantity
          : -x.quantity;
      await move(c, req.user!, x.productId, x.type, signed, x.notes);
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
  "/api/reservations",
  auth(),
  asyncRoute(async (_q, res) => {
    await expireReservations();
    const r = await pool.query(
      "SELECT r.*,p.name product_name,c.name customer_name,s.name supplier_name,u.name employee_name,CASE WHEN r.status='ACTIVE' AND r.expires_at IS NOT NULL AND r.expires_at<now() THEN 'EXPIRED' ELSE r.status::text END display_status,(r.quantity*r.selling_price) reservation_total,GREATEST((r.quantity*r.selling_price)-r.deposit_paid,0) remaining FROM reservations r JOIN products p ON p.id=r.product_id LEFT JOIN customers c ON c.id=r.customer_id LEFT JOIN suppliers s ON s.id=r.supplier_id JOIN users u ON u.id=r.created_by ORDER BY r.created_at DESC",
    );
    res.json(r.rows);
  }),
);
app.post(
  "/api/reservations",
  auth(),
  asyncRoute(async (req, res) => {
    const x = z
      .object({
        productId: id,
        customerId: id.optional().nullable(),
        supplierId: id.optional().nullable(),
        quantity: qty,
        sellingPrice: money,
        depositPaid: money.default(0),
        expiresAt: z.string().datetime().optional().nullable(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    const { total: reservationTotal } = calculateReservationBalance(
      x.quantity,
      x.sellingPrice,
      x.depositPaid,
    );
    if (x.depositPaid > reservationTotal)
      throw error("VALIDATION", "Deposit cannot exceed the negotiated price");
    const out = await tx(async (c) => {
      const r = await c.query(
        "INSERT INTO reservations(product_id,customer_id,supplier_id,quantity,selling_price,deposit_paid,created_by,expires_at,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
        [
          x.productId,
          x.customerId,
          x.supplierId,
          x.quantity,
          x.sellingPrice,
          x.depositPaid,
          req.user!.id,
          x.expiresAt,
          x.notes,
        ],
      );
      await move(
        c,
        req.user!,
        x.productId,
        "RESERVATION",
        x.quantity,
        x.notes,
        undefined,
        undefined,
        r.rows[0].id,
      );
      await audit(c, req.user!, "RESERVE", "RESERVATION", r.rows[0].id, x);
      return r.rows[0];
    });
    res.status(201).json(out);
  }),
);
app.post(
  "/api/reservations/:id/release",
  auth(),
  asyncRoute(async (req, res) => {
    const rid = id.parse(req.params.id);
    await tx(async (c) => {
      const r = await c.query(
        "SELECT * FROM reservations WHERE id=$1 FOR UPDATE",
        [rid],
      );
      if (!r.rowCount || r.rows[0].status !== "ACTIVE")
        throw error("INVALID_RESERVATION", "Reservation is not active");
      const x = r.rows[0];
      await releaseReservedStock(
        c,
        req.user!,
        x,
        "RESERVATION_CANCEL",
        req.body.notes,
      );
      await c.query(
        "UPDATE reservations SET status='CANCELLED',updated_at=now() WHERE id=$1",
        [rid],
      );
      await audit(c, req.user!, "RESERVATION_CANCEL", "RESERVATION", rid, {
        notes: req.body.notes || null,
      });
    });
    res.json({ ok: true });
  }),
);

const saleSchema = z.object({
  customerId: id.optional().nullable(),
  items: z
    .array(
      z.object({
        productId: id,
        supplierId: id.optional().nullable(),
        quantity: qty,
        finalUnitPrice: money.optional(),
        discountAmount: money.optional(),
      }),
    )
    .min(1),
  payments: z
    .array(
      z.object({
        method: z.enum(["CASH", "CARD", "BANK_TRANSFER", "OTHER"]),
        amount: positiveMoney,
      }),
    )
    .default([]),
  notes: z.string().optional(),
  businessDate: dateOnly.optional(),
  deliveryRequired: z.boolean().default(false),
  deliveryAddress: z.string().optional(),
  deliveryDate: dateOnly.optional(),
  deliveryNotes: z.string().optional(),
});
async function createSale(
  c: PoolClient,
  user: User,
  x: z.infer<typeof saleSchema>,
  reservationId?: string,
) {
  let subtotal = 0,
    discount = 0;
  const items: any[] = [];
  for (const i of x.items) {
    const p = await c.query("SELECT * FROM products WHERE id=$1 FOR UPDATE", [
      i.productId,
    ]);
    if (!p.rowCount) throw error("NOT_FOUND", "Product not found", 404);
    const product = p.rows[0];
    if (
      product.current_quantity - product.reserved_quantity < i.quantity &&
      !reservationId
    )
      throw error(
        "INSUFFICIENT_STOCK",
        `Only ${product.current_quantity - product.reserved_quantity} units are available.`,
      );
    const regular = +product.selling_price,
      final = i.finalUnitPrice ?? regular - (i.discountAmount || 0);
    if (final < 0) throw error("VALIDATION", "Final price cannot be negative");
    items.push({
      ...i,
      regular,
      final,
      cost: +product.purchase_price,
      supplierId: i.supplierId ?? product.supplier_id,
    });
    subtotal += regular * i.quantity;
    discount += (regular - final) * i.quantity;
  }
  const total = +(subtotal - discount).toFixed(2),
    paid = +x.payments.reduce((s, p) => s + p.amount, 0).toFixed(2);
  if (paid > total)
    throw error("PAYMENT_EXCEEDS_TOTAL", "Payments cannot exceed sale total");
  const sale = await c.query(
    "INSERT INTO sales(customer_id,employee_id,subtotal,discount_total,total,notes,business_date,delivery_required,delivery_address,delivery_date,delivery_notes,delivery_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *",
    [
      x.customerId,
      user.id,
      subtotal,
      discount,
      total,
      x.notes || null,
      x.businessDate || businessDate(),
      x.deliveryRequired,
      x.deliveryAddress || null,
      x.deliveryDate || null,
      x.deliveryNotes || null,
      x.deliveryRequired ? "PENDING" : "NOT_REQUIRED",
    ],
  );
  for (const i of items) {
    await c.query(
      "INSERT INTO sale_items(sale_id,product_id,supplier_id,quantity,regular_unit_price,discount_amount,final_unit_price,line_total,cost_price) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        sale.rows[0].id,
        i.productId,
        i.supplierId || null,
        i.quantity,
        i.regular,
        i.regular - i.final,
        i.final,
        i.final * i.quantity,
        i.cost,
      ],
    );
    if (reservationId)
      await releaseReservedStock(
        c,
        user,
        { product_id: i.productId, quantity: i.quantity, id: reservationId },
        "RESERVATION_RELEASE",
        "Converted to sale",
      );
    await move(
      c,
      user,
      i.productId,
      "SALE",
      -i.quantity,
      "Sale",
      undefined,
      undefined,
      sale.rows[0].id,
    );
  }
  for (const payment of x.payments) {
    await c.query(
      "INSERT INTO sale_payments(sale_id,method,amount) VALUES($1,$2,$3)",
      [sale.rows[0].id, payment.method, payment.amount],
    );
    await audit(c, user, "ADD_PAYMENT", "SALE", sale.rows[0].id, {
      amount: payment.amount,
      paid: payment.amount,
      method: payment.method,
      source: reservationId ? "RESERVATION_DEPOSIT" : "SALE_CREATION",
    });
  }
  return sale.rows[0];
}
app.get(
  "/api/sales",
  auth(),
  asyncRoute(async (req, res) => {
    const q = String(req.query.q || ""),
      r = await pool.query(
        `SELECT
           s.*,
           c.name AS customer_name,
           u.name AS employee_name,
           COALESCE(pay.gross_paid, 0) AS gross_paid,
           COALESCE(ref.refunded, 0) AS refunded,
           COALESCE(ret.returned_value, 0) AS returned_value,
           COALESCE(items.value, '[]') AS items
         FROM sales s
         LEFT JOIN customers c ON c.id = s.customer_id
         JOIN users u ON u.id = s.employee_id
         LEFT JOIN LATERAL (
           SELECT sum(amount) AS gross_paid
           FROM sale_payments
           WHERE sale_id = s.id
         ) pay ON true
         LEFT JOIN LATERAL (
           SELECT sum(amount) AS refunded
           FROM sale_refunds
           WHERE sale_id = s.id
         ) ref ON true
         LEFT JOIN LATERAL (
           SELECT sum(sm.quantity * si.final_unit_price) AS returned_value
           FROM sale_items si
           JOIN stock_movements sm
             ON sm.reference_id = si.id
            AND sm.type = 'RETURN'
            AND sm.deleted_at IS NULL
           WHERE si.sale_id = s.id
         ) ret ON true
         LEFT JOIN LATERAL (
           SELECT json_agg(
             json_build_object(
               'name', p.name,
               'quantity', si.quantity,
               'costPrice', si.cost_price,
               'regularPrice', si.regular_unit_price,
               'discountAmount', si.discount_amount,
               'salePrice', si.final_unit_price
             )
             ORDER BY si.id
           ) AS value
           FROM sale_items si
           JOIN products p ON p.id = si.product_id
           WHERE si.sale_id = s.id
         ) items ON true
         ${q ? "WHERE s.sale_number::text ILIKE $1 OR c.name ILIKE $1" : ""}
         ORDER BY s.business_date DESC, s.created_at DESC`,
        q ? [`%${q}%`] : [],
      );
    res.json(
      r.rows.map((sale) => {
        const balance = calculateSaleBalance(
          +sale.total,
          +sale.gross_paid,
          +sale.refunded,
          +sale.returned_value,
        );
        return { ...sale, ...balance };
      }),
    );
  }),
);
app.post(
  "/api/sales",
  auth(),
  asyncRoute(async (req, res) => {
    const x = saleSchema.parse(req.body);
    if (!x.businessDate) throw error("VALIDATION", "Sale date is required");
    const out = await tx(async (c) => {
      const sale = await createSale(c, req.user!, x);
      await audit(c, req.user!, "SALE", "SALE", sale.id, {
        total: sale.total,
        businessDate: x.businessDate,
      });
      return sale;
    });
    res.status(201).json(out);
  }),
);
app.get(
  "/api/sales/:id",
  auth(),
  asyncRoute(async (req, res) => {
    const sid = id.parse(req.params.id);
    const sale = await pool.query(
      "SELECT s.*,c.name customer_name,u.name employee_name FROM sales s LEFT JOIN customers c ON c.id=s.customer_id JOIN users u ON u.id=s.employee_id WHERE s.id=$1",
      [sid],
    );
    if (!sale.rowCount) throw error("NOT_FOUND", "Sale not found", 404);
    const [items, payments] = await Promise.all([
      pool.query(
        "SELECT si.*,p.name product_name FROM sale_items si JOIN products p ON p.id=si.product_id WHERE sale_id=$1",
        [sid],
      ),
      pool.query("SELECT * FROM sale_payments WHERE sale_id=$1", [sid]),
    ]);
    res.json({ ...sale.rows[0], items: items.rows, payments: payments.rows });
  }),
);
app.put(
  "/api/sales/:id/paid",
  auth(),
  asyncRoute(async (req, res) => {
    const saleId = id.parse(req.params.id);
    const x = z
      .object({
        paid: money,
        method: z
          .enum(["CASH", "CARD", "BANK_TRANSFER", "OTHER"])
          .default("CASH"),
      })
      .parse(req.body);
    const result = await tx(async (c) => {
      const sale = await c.query(
        `SELECT
           s.total,
           s.status,
           COALESCE((SELECT sum(amount) FROM sale_payments WHERE sale_id=s.id), 0) AS gross_paid,
           COALESCE((SELECT sum(amount) FROM sale_refunds WHERE sale_id=s.id), 0) AS refunded,
           COALESCE((
             SELECT sum(sm.quantity * si.final_unit_price)
             FROM sale_items si
             JOIN stock_movements sm
               ON sm.reference_id=si.id
              AND sm.type='RETURN'
              AND sm.deleted_at IS NULL
             WHERE si.sale_id=s.id
           ), 0) AS returned_value
         FROM sales s
         WHERE s.id=$1
         FOR UPDATE`,
        [saleId],
      );
      if (!sale.rowCount) throw error("NOT_FOUND", "Sale not found", 404);
      const row = sale.rows[0];
      if (row.status === "CANCELLED")
        throw error("INVALID_PAYMENT", "Cancelled sales cannot accept payments");
      const currentBalance = calculateSaleBalance(
        +row.total,
        +row.gross_paid,
        +row.refunded,
        +row.returned_value,
      );
      if (x.paid > currentBalance.effectiveTotal)
        throw error(
          "PAYMENT_EXCEEDS_TOTAL",
          "Paid amount cannot exceed the value of the products kept by the customer",
        );
      if (x.paid < currentBalance.paid)
        throw error(
          "PAYMENT_REDUCTION_NOT_ALLOWED",
          "Paid amount cannot be reduced because payment history is preserved",
        );
      const difference = +(x.paid - currentBalance.paid).toFixed(2);
      if (difference > 0)
        await c.query(
          "INSERT INTO sale_payments(sale_id,method,amount) VALUES($1,$2,$3)",
          [saleId, x.method, difference],
        );
      await audit(c, req.user!, "ADD_PAYMENT", "SALE", saleId, {
        amount: difference,
        paid: x.paid,
        method: x.method,
      });
      return {
        ...calculateSaleBalance(
          +row.total,
          +row.gross_paid + difference,
          +row.refunded,
          +row.returned_value,
        ),
      };
    });
    res.json(result);
  }),
);
app.put(
  "/api/sales/:id/delivery",
  auth(),
  asyncRoute(async (req, res) => {
    const saleId = id.parse(req.params.id);
    const result = await tx(async (c) => {
      const sale = await c.query(
        `SELECT
           s.id,
           s.total,
           s.status,
           s.delivery_status,
           COALESCE((SELECT sum(amount) FROM sale_payments WHERE sale_id=s.id), 0) AS gross_paid,
           COALESCE((SELECT sum(amount) FROM sale_refunds WHERE sale_id=s.id), 0) AS refunded,
           COALESCE((
             SELECT sum(sm.quantity * si.final_unit_price)
             FROM sale_items si
             JOIN stock_movements sm
               ON sm.reference_id=si.id
              AND sm.type='RETURN'
              AND sm.deleted_at IS NULL
             WHERE si.sale_id=s.id
           ), 0) AS returned_value
         FROM sales s
         WHERE s.id=$1
         FOR UPDATE`,
        [saleId],
      );
      if (!sale.rowCount) throw error("NOT_FOUND", "Sale not found", 404);
      const row = sale.rows[0];
      if (!["COMPLETED", "PARTIALLY_RETURNED"].includes(row.status))
        throw error(
          "INVALID_DELIVERY",
          "Only active completed sales can be sent for delivery",
        );
      const balance = calculateSaleBalance(
        +row.total,
        +row.gross_paid,
        +row.refunded,
        +row.returned_value,
      );
      if (balance.paid < balance.effectiveTotal)
        throw error(
          "PAYMENT_REQUIRED",
          "The final sale amount must be fully paid before delivery",
        );
      const current = row.delivery_status;
      const next = nextDeliveryStatus(current);
      if (current === next) return { deliveryStatus: next };
      await c.query(
        "UPDATE sales SET delivery_required=true,delivery_status=$1,updated_at=now() WHERE id=$2",
        [next, saleId],
      );
      await audit(c, req.user!, next, "SALE", saleId, {
        oldStatus: current,
        newStatus: next,
      });
      return { deliveryStatus: next };
    });
    res.json(result);
  }),
);
app.post(
  "/api/sales/:id/returns",
  auth(),
  asyncRoute(async (req, res) => {
    const sid = id.parse(req.params.id);
    const x = z
      .object({
        items: z.array(z.object({ saleItemId: id, quantity: qty })).min(1),
        reason: z.string().min(1),
      })
      .parse(req.body);
    const result = await tx((c) =>
      processSaleReturn(c, req.user!, sid, x.items as SaleReturnItem[], x.reason),
    );
    res.json({ ok: true, ...result });
  }),
);
app.post(
  "/api/reservations/:id/complete",
  auth(),
  asyncRoute(async (req, res) => {
    const rid = id.parse(req.params.id);
    const out = await tx(async (c) => {
      const r = await c.query(
        "SELECT * FROM reservations WHERE id=$1 FOR UPDATE",
        [rid],
      );
      if (!r.rowCount || r.rows[0].status !== "ACTIVE")
        throw error("INVALID_RESERVATION", "Reservation is not active");
      const reservation = r.rows[0];
      if (reservation.selling_price === null)
        throw error(
          "VALIDATION",
          "This reservation has no selling price and cannot be marked sold",
        );
      const x = {
        customerId: reservation.customer_id,
        items: [
          {
            productId: reservation.product_id,
            supplierId: reservation.supplier_id,
            quantity: reservation.quantity,
            finalUnitPrice: +reservation.selling_price,
          },
        ],
        payments:
          +reservation.deposit_paid > 0
            ? [{ method: "CASH" as const, amount: +reservation.deposit_paid }]
            : [],
        notes: reservation.notes || undefined,
        deliveryRequired: false,
      };
      const sale = await createSale(c, req.user!, x, rid);
      await c.query(
        "UPDATE reservations SET status='COMPLETED',updated_at=now() WHERE id=$1",
        [rid],
      );
      await audit(c, req.user!, "COMPLETE_RESERVATION", "RESERVATION", rid, {
        saleId: sale.id,
        depositPaid: reservation.deposit_paid,
      });
      return sale;
    });
    res.status(201).json(out);
  }),
);

app.get(
  "/api/stock-movements",
  auth(),
  asyncRoute(async (req, res) => {
    const [movements, events, audits] = await Promise.all([
      pool.query(
        `SELECT
           sm.*,
           sale_item.final_unit_price sale_selling_price,
           COALESCE(sm.business_date,sm.created_at::date) display_date,
           product.name product_name,
           movement_user.name employee_name,
           COALESCE(
             sm.supplier_id,
             sale_item.supplier_id,
             reservation.supplier_id,
             return_item.supplier_id
           ) related_supplier_id,
           supplier.name supplier_name,
           COALESCE(sale_customer.name,reservation_customer.name,return_customer.name) customer_name,
           deleted_user.name deleted_by_name,
           COALESCE(sale.sale_number,return_sale.sale_number) sale_number,
           CASE
             WHEN sm.type='REVERSED' THEN '—'
             WHEN sm.deleted_at IS NOT NULL THEN 'REVERSED'
             WHEN sm.type IN ('RESERVATION','RESERVATION_RELEASE','RESERVATION_CANCEL')
               THEN reservation.status::text
             WHEN sm.type='SALE' THEN sale.status::text
             WHEN sm.type='RETURN' THEN 'RETURNED'
             ELSE 'ACTIVE'
           END status
         FROM stock_movements sm
         JOIN products product ON product.id=sm.product_id
         JOIN users movement_user ON movement_user.id=sm.user_id
         LEFT JOIN sales sale ON sale.id=sm.reference_id AND sm.type='SALE'
         LEFT JOIN customers sale_customer ON sale_customer.id=sale.customer_id
         LEFT JOIN LATERAL (
           SELECT item.final_unit_price,item.supplier_id
           FROM sale_items item
           WHERE item.sale_id=sale.id AND item.product_id=sm.product_id
           ORDER BY item.id
           LIMIT 1
         ) sale_item ON true
         LEFT JOIN reservations reservation
           ON reservation.id=sm.reference_id
          AND sm.type IN ('RESERVATION','RESERVATION_RELEASE','RESERVATION_CANCEL')
         LEFT JOIN customers reservation_customer
           ON reservation_customer.id=reservation.customer_id
         LEFT JOIN sale_items return_item
           ON return_item.id=sm.reference_id AND sm.type='RETURN'
         LEFT JOIN sales return_sale ON return_sale.id=return_item.sale_id
         LEFT JOIN customers return_customer
           ON return_customer.id=return_sale.customer_id
         LEFT JOIN suppliers supplier ON supplier.id=COALESCE(
           sm.supplier_id,
           sale_item.supplier_id,
           reservation.supplier_id,
           return_item.supplier_id
         )
         LEFT JOIN users deleted_user ON deleted_user.id=sm.deleted_by
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
         WHERE NOT (
           (audit.entity_type='PRODUCT' AND audit.action IN ('CREATE','UPDATE','ARCHIVE','DELETE','IMPORT','LOST','DESTROYED','CORRECTION'))
           OR (audit.entity_type='RESERVATION' AND audit.action IN ('RESERVE','RESERVATION_CANCEL','RESERVATION_EXPIRE'))
           OR (audit.entity_type='SALE' AND audit.action IN ('SALE','RETURN'))
           OR (audit.entity_type='STOCK_MOVEMENT' AND audit.action='REVERSE_MOVEMENT')
         )
         ORDER BY audit.created_at DESC`,
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
    res.json(
      filtered.sort((a, b) => {
        const displayDifference =
          new Date(b.display_date || b.created_at).getTime() -
          new Date(a.display_date || a.created_at).getTime();
        return (
          displayDifference ||
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }),
    );
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
        !["IMPORT", "LOST", "DESTROYED", "CORRECTION"].includes(m.type)
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
      if (newCurrent < 0 || newCurrent < p.reserved_quantity)
        throw error(
          "CANNOT_REVERSE",
          "This operation cannot be reversed because it would invalidate current stock or reservations",
        );
      await c.query(
        "UPDATE products SET current_quantity=$1,updated_at=now() WHERE id=$2",
        [newCurrent, p.id],
      );
      await c.query(
        "UPDATE stock_movements SET deleted_at=now(),deleted_by=$1,deletion_reason=$2,notes=CASE WHEN notes IS NULL OR notes='' THEN $2 ELSE notes || ' | Reversal reason: ' || $2 END WHERE id=$3",
        [req.user!.id, reason, movementId],
      );
      await c.query(
        "INSERT INTO stock_movements(product_id,type,quantity,user_id,reference_id,supplier_id,purchase_price,notes) VALUES($1,'REVERSED',$2,$3,$4,$5,$6,$7)",
        [
          m.product_id,
          -m.quantity,
          req.user!.id,
          m.id,
          m.supplier_id,
          m.purchase_price,
          reason,
        ],
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
  "/api/customers/:id/history",
  auth(),
  asyncRoute(async (req, res) => {
    const cid = id.parse(req.params.id);
    const c = await pool.query("SELECT * FROM customers WHERE id=$1", [cid]);
    if (!c.rowCount) throw error("NOT_FOUND", "Customer not found", 404);
    const sales = await pool.query(
      `SELECT
         s.*,
         COALESCE((SELECT sum(amount) FROM sale_payments WHERE sale_id=s.id), 0) AS gross_paid,
         COALESCE((SELECT sum(amount) FROM sale_refunds WHERE sale_id=s.id), 0) AS refunded,
         COALESCE((
           SELECT sum(sm.quantity * si.final_unit_price)
           FROM sale_items si
           JOIN stock_movements sm
             ON sm.reference_id=si.id
            AND sm.type='RETURN'
            AND sm.deleted_at IS NULL
           WHERE si.sale_id=s.id
         ), 0) AS returned_value
       FROM sales s
       WHERE customer_id=$1
       ORDER BY business_date DESC, created_at DESC`,
      [cid],
    );
    const history = sales.rows.map((sale) => ({
      ...sale,
      ...calculateSaleBalance(
        +sale.total,
        +sale.gross_paid,
        +sale.refunded,
        +sale.returned_value,
      ),
    }));
    res.json({
      customer: c.rows[0],
      sales: history,
      totalSpent: history.reduce((sum, sale) => sum + sale.paid, 0),
    });
  }),
);

app.get(
  "/api/dashboard",
  auth(),
  asyncRoute(async (_q, res) => {
    await expireReservations();
    const r = await pool.query(
      `SELECT
         (SELECT count(*) FROM products WHERE is_active) AS products,
         (SELECT COALESCE(sum(current_quantity-reserved_quantity), 0) FROM products WHERE is_active) AS available,
         (SELECT COALESCE(sum(reserved_quantity), 0) FROM products) AS reserved,
         (SELECT COALESCE(sum(quantity*selling_price), 0) FROM reservations WHERE status='ACTIVE') AS reserved_total,
         (SELECT count(*) FROM products WHERE current_quantity=0 AND is_active) AS out_stock,
         (SELECT count(*) FROM customers) AS customers,
         (
           SELECT COALESCE(sum(amount), 0)
           FROM (
             SELECT total AS amount FROM sales WHERE business_date=current_date
             UNION ALL
             SELECT -(sm.quantity*si.final_unit_price) AS amount
             FROM stock_movements sm
             JOIN sale_items si ON si.id=sm.reference_id
             WHERE sm.type='RETURN' AND sm.deleted_at IS NULL
               AND COALESCE(sm.business_date,sm.created_at::date)=current_date
           ) daily_revenue
         ) AS today_revenue,
         (
           SELECT COALESCE(sum(amount), 0)
           FROM (
             SELECT total AS amount FROM sales WHERE date_trunc('month',business_date)=date_trunc('month',current_date)
             UNION ALL
             SELECT -(sm.quantity*si.final_unit_price) AS amount
             FROM stock_movements sm
             JOIN sale_items si ON si.id=sm.reference_id
             WHERE sm.type='RETURN' AND sm.deleted_at IS NULL
               AND date_trunc('month',COALESCE(sm.business_date,sm.created_at::date))=date_trunc('month',current_date)
           ) monthly_revenue
         ) AS month_revenue`,
    );
    const top = await pool.query(
      `SELECT
         p.name,
         sum(si.quantity-COALESCE(ret.quantity, 0)) AS quantity
       FROM sale_items si
       JOIN products p ON p.id=si.product_id
       JOIN sales s ON s.id=si.sale_id
       LEFT JOIN LATERAL (
         SELECT sum(quantity) AS quantity
         FROM stock_movements
         WHERE reference_id=si.id AND type='RETURN' AND deleted_at IS NULL
       ) ret ON true
       WHERE s.status IN ('COMPLETED', 'PARTIALLY_RETURNED')
       GROUP BY p.id, p.name
       HAVING sum(si.quantity-COALESCE(ret.quantity, 0)) > 0
       ORDER BY quantity DESC
       LIMIT 5`,
    );
    const trend = await pool.query(
      `SELECT to_char(day, 'YYYY-MM-DD') AS date,sum(amount) AS revenue
       FROM (
         SELECT business_date AS day,total AS amount
         FROM sales
         WHERE business_date >= current_date-interval '30 days'
         UNION ALL
         SELECT COALESCE(sm.business_date,sm.created_at::date) AS day,
                -(sm.quantity*si.final_unit_price) AS amount
         FROM stock_movements sm
         JOIN sale_items si ON si.id=sm.reference_id
         WHERE sm.type='RETURN' AND sm.deleted_at IS NULL
           AND COALESCE(sm.business_date,sm.created_at::date) >= current_date-interval '30 days'
       ) activity
       GROUP BY day
       ORDER BY day`,
    );
    res.json({ ...r.rows[0], topProducts: top.rows, salesTrend: trend.rows });
  }),
);
app.get(
  "/api/inventory/summary",
  auth(),
  asyncRoute(async (_q, res) => {
    const r = await pool.query(
      "SELECT COALESCE(sum(current_quantity),0) physical_stock,COALESCE(sum(reserved_quantity),0) reserved,COALESCE(sum(current_quantity-reserved_quantity),0) available,COALESCE(sum(current_quantity*purchase_price),0) cost_value FROM products WHERE is_active",
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
    const add = (target: string[], sql: string, value: string) => {
      values.push(value);
      target.push(sql.replace("?", `$${values.length}`));
    };
    if (req.query.productId)
      add(productWhere, "p.id=?", String(req.query.productId));
    if (req.query.supplierId)
      add(productWhere, "p.supplier_id=?", String(req.query.supplierId));
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
      `SELECT p.id,p.name product_name,p.current_quantity quantity,
         p.purchase_price stored_purchase_cost,p.description notes,
         s.name supplier_name
       FROM products p
       LEFT JOIN suppliers s ON s.id=p.supplier_id
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
    const [movements, deliveries, events] = await Promise.all([
      pool.query(
        `SELECT
           sm.id,
           COALESCE(sm.business_date::timestamptz,sm.created_at) occurred_at,
           sm.type::text type,
           CASE
             WHEN sm.type='REVERSED' THEN NULL
             WHEN sm.deleted_at IS NOT NULL THEN 'REVERSED'
             WHEN sm.type='SALE' THEN
               CASE
                 WHEN GREATEST(COALESCE(pay.paid,0)-COALESCE(ref.refunded,0),0)
                        >= GREATEST(sa.total-COALESCE(ret.returned_value,0),0)
                   THEN 'PAID'
                 WHEN GREATEST(COALESCE(pay.paid,0)-COALESCE(ref.refunded,0),0)>0
                   THEN 'PARTIALLY_PAID'
                 ELSE 'UNPAID'
               END
             WHEN sm.type='RETURN' THEN rsa.status::text
             WHEN sm.type IN ('RESERVATION','RESERVATION_RELEASE','RESERVATION_CANCEL')
               THEN reservation.status::text
             ELSE 'ACTIVE'
           END status,
           abs(sm.quantity) quantity,
           COALESCE(return_item.final_unit_price,sale_item.final_unit_price,reservation.selling_price,sm.purchase_price) price,
           COALESCE(sale_customer.name,return_customer.name,reservation_customer.name) customer_name,
           supplier.name supplier_name,
           COALESCE(sa.sale_number,rsa.sale_number) sale_number,
           activity_product.name product_name,
           NULL::text field_name,
           NULL::text old_value,
           NULL::text new_value,
           movement_user.name user_name,
           sm.notes
         FROM stock_movements sm
         JOIN products activity_product ON activity_product.id=sm.product_id
         JOIN users movement_user ON movement_user.id=sm.user_id
         LEFT JOIN sales sa ON sa.id=sm.reference_id AND sm.type='SALE'
         LEFT JOIN LATERAL (
           SELECT si.final_unit_price,si.supplier_id
           FROM sale_items si
           WHERE si.sale_id=sa.id AND si.product_id=sm.product_id
           ORDER BY si.id LIMIT 1
         ) sale_item ON true
         LEFT JOIN customers sale_customer ON sale_customer.id=sa.customer_id
         LEFT JOIN sale_items return_item ON return_item.id=sm.reference_id AND sm.type='RETURN'
         LEFT JOIN sales rsa ON rsa.id=return_item.sale_id
         LEFT JOIN customers return_customer ON return_customer.id=rsa.customer_id
         LEFT JOIN reservations reservation
           ON reservation.id=sm.reference_id
          AND sm.type IN ('RESERVATION','RESERVATION_RELEASE','RESERVATION_CANCEL')
         LEFT JOIN customers reservation_customer ON reservation_customer.id=reservation.customer_id
         LEFT JOIN suppliers supplier
           ON supplier.id=COALESCE(sm.supplier_id,sale_item.supplier_id,return_item.supplier_id,reservation.supplier_id)
         LEFT JOIN LATERAL (
           SELECT sum(amount) paid FROM sale_payments WHERE sale_id=sa.id
         ) pay ON true
         LEFT JOIN LATERAL (
           SELECT sum(amount) refunded FROM sale_refunds WHERE sale_id=sa.id
         ) ref ON true
         LEFT JOIN LATERAL (
           SELECT sum(return_movement.quantity*returned_item.final_unit_price) returned_value
           FROM stock_movements return_movement
           JOIN sale_items returned_item ON returned_item.id=return_movement.reference_id
           WHERE returned_item.sale_id=sa.id
             AND return_movement.type='RETURN'
             AND return_movement.deleted_at IS NULL
         ) ret ON true
         WHERE sm.product_id=$1`,
        [productId],
      ),
      pool.query(
        `SELECT DISTINCT
           audit.id,
           audit.created_at occurred_at,
           audit.action type,
           audit.action status,
           (SELECT sum(quantity) FROM sale_items WHERE sale_id=sale.id AND product_id=$1) quantity,
           NULL::numeric price,
           customer.name customer_name,
           supplier_names.value supplier_name,
           sale.sale_number,
           activity_product.name product_name,
           NULL::text field_name,
           NULL::text old_value,
           NULL::text new_value,
           audit_user.name user_name,
           COALESCE(NULLIF(sale.delivery_notes,''),NULLIF(audit.details->>'notes','')) notes
         FROM audit_logs audit
         JOIN sales sale ON sale.id=audit.entity_id AND audit.entity_type='SALE'
         JOIN products activity_product ON activity_product.id=$1
         LEFT JOIN users audit_user ON audit_user.id=audit.user_id
         LEFT JOIN customers customer ON customer.id=sale.customer_id
         LEFT JOIN LATERAL (
           SELECT string_agg(DISTINCT supplier.name,', ') value
           FROM sale_items item
           LEFT JOIN suppliers supplier ON supplier.id=item.supplier_id
           WHERE item.sale_id=sale.id AND item.product_id=$1
         ) supplier_names ON true
         WHERE audit.action IN ('IN_TRANSIT','DELIVERED')
           AND EXISTS(SELECT 1 FROM sale_items WHERE sale_id=sale.id AND product_id=$1)`,
        [productId],
      ),
      pool.query(
        `SELECT event.id,event.created_at occurred_at,event.action type,
           CASE WHEN event.field_name IS NOT NULL THEN 'CHANGED' ELSE event.action END status,
           NULL::integer quantity,NULL::numeric price,
           NULL::text customer_name,NULL::text supplier_name,NULL::bigint sale_number,
           event.product_name,event.field_name,event.old_value,event.new_value,
           event_user.name user_name,event.notes
         FROM product_events event
         JOIN users event_user ON event_user.id=event.user_id
         WHERE event.product_id=$1`,
        [productId],
      ),
    ]);
    res.json(
      [...movements.rows, ...deliveries.rows, ...events.rows].sort(
        (a, b) =>
          new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
      ),
    );
  }),
);
app.get(
  "/api/inventory/movements",
  auth(),
  asyncRoute(async (req, res) => {
    const values: any[] = [],
      where: string[] = [];
    const add = (sql: string, value: any) => {
      values.push(value);
      where.push(sql.replace("?", `$${values.length}`));
    };
    if (req.query.productId)
      add("sm.product_id=?", String(req.query.productId));
    if (req.query.supplierId)
      add("sm.supplier_id=?", String(req.query.supplierId));
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
      `SELECT sm.*,COALESCE(sm.purchase_price,p.purchase_price) stored_purchase_cost,COALESCE(sm.business_date,sm.created_at::date) display_date,p.name product_name,u.name employee_name,s.name supplier_name FROM stock_movements sm JOIN products p ON p.id=sm.product_id JOIN users u ON u.id=sm.user_id LEFT JOIN suppliers s ON s.id=sm.supplier_id ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY COALESCE(sm.business_date,sm.created_at::date) DESC,sm.created_at DESC LIMIT 500`,
      values,
    );
    res.json(r.rows);
  }),
);
app.get(
  "/api/deliveries",
  auth(),
  asyncRoute(async (req, res) => {
    const filter = String(req.query.status || "ALL");
    const r = await pool.query(
      `SELECT
         s.*,
         c.name AS customer_name,
         c.phone AS customer_phone,
         COALESCE((SELECT sum(amount) FROM sale_payments WHERE sale_id=s.id), 0) AS gross_paid,
         COALESCE((SELECT sum(amount) FROM sale_refunds WHERE sale_id=s.id), 0) AS refunded,
         COALESCE((
           SELECT sum(sm.quantity * si.final_unit_price)
           FROM sale_items si
           JOIN stock_movements sm
             ON sm.reference_id=si.id
            AND sm.type='RETURN'
            AND sm.deleted_at IS NULL
           WHERE si.sale_id=s.id
         ), 0) AS returned_value,
         COALESCE((
           SELECT json_agg(
             json_build_object('name', p.name, 'quantity', si.quantity)
             ORDER BY si.id
           )
           FROM sale_items si
           JOIN products p ON p.id=si.product_id
           WHERE si.sale_id=s.id
         ), '[]') AS items
       FROM sales s
       LEFT JOIN customers c ON c.id=s.customer_id
       WHERE s.delivery_status IN ('IN_TRANSIT', 'DELIVERED')
          OR s.status IN ('COMPLETED', 'PARTIALLY_RETURNED')
       ORDER BY s.business_date DESC, s.created_at DESC`,
    );
    const rows = r.rows
      .map((sale) => {
        const balance = calculateSaleBalance(
          +sale.total,
          +sale.gross_paid,
          +sale.refunded,
          +sale.returned_value,
        );
        return {
          ...sale,
          ...balance,
          delivery_view_status: ["IN_TRANSIT", "DELIVERED"].includes(
            sale.delivery_status,
          )
            ? sale.delivery_status
            : "READY",
        };
      })
      .filter(
        (sale) =>
          ["IN_TRANSIT", "DELIVERED"].includes(sale.delivery_status) ||
          (sale.status !== "RETURNED" &&
            sale.paid >= sale.effectiveTotal &&
            sale.effectiveTotal > 0),
      )
      .filter((s) => filter === "ALL" || s.delivery_view_status === filter);
    res.json(rows);
  }),
);
app.put(
  "/api/deliveries/:id/delivered",
  auth(),
  asyncRoute(async (req, res) => {
    const saleId = id.parse(req.params.id);
    const result = await tx(async (c) => {
      const r = await c.query(
        "UPDATE sales SET delivery_status='DELIVERED',delivery_required=true,updated_at=now() WHERE id=$1 AND delivery_status='IN_TRANSIT' RETURNING id,delivery_status",
        [saleId],
      );
      if (!r.rowCount)
        throw error(
          "INVALID_DELIVERY",
          "Only in-transit deliveries can be marked delivered",
        );
      await audit(c, req.user!, "DELIVERED", "SALE", saleId, {
        oldStatus: "IN_TRANSIT",
        newStatus: "DELIVERED",
      });
      return r.rows[0];
    });
    res.json(result);
  }),
);
app.get(
  "/api/payments",
  auth(),
  asyncRoute(async (req, res) => {
    const filter = String(req.query.status || "OUTSTANDING");
    const r = await pool.query(
      `SELECT
         s.id,
         s.sale_number,
         s.business_date,
         s.total,
         c.name AS customer_name,
         c.phone AS customer_phone,
         COALESCE((SELECT sum(amount) FROM sale_payments WHERE sale_id=s.id), 0) AS gross_paid,
         COALESCE((SELECT sum(amount) FROM sale_refunds WHERE sale_id=s.id), 0) AS refunded,
         COALESCE((
           SELECT sum(sm.quantity * si.final_unit_price)
           FROM sale_items si
           JOIN stock_movements sm
             ON sm.reference_id=si.id
            AND sm.type='RETURN'
            AND sm.deleted_at IS NULL
           WHERE si.sale_id=s.id
         ), 0) AS returned_value
       FROM sales s
       LEFT JOIN customers c ON c.id=s.customer_id
       WHERE s.status IN ('COMPLETED', 'PARTIALLY_RETURNED')
       ORDER BY s.business_date DESC, s.created_at DESC`,
    );
    const rows = r.rows
      .map((sale) => {
        const balance = calculateSaleBalance(
          +sale.total,
          +sale.gross_paid,
          +sale.refunded,
          +sale.returned_value,
        );
        return {
          ...sale,
          ...balance,
          payment_status: balance.paymentStatus,
        };
      })
      .filter((s) =>
        filter === "ALL"
          ? true
          : filter === "OUTSTANDING"
            ? s.remaining > 0
            : filter === "PAID"
              ? s.remaining <= 0
              : true,
      );
    res.json(rows);
  }),
);
app.get(
  "/api/reports",
  auth(["ADMIN"]),
  asyncRoute(async (req, res) => {
    await expireReservations();
    const period = z
      .enum(["MONTH", "QUARTER", "YEAR"])
      .catch("MONTH")
      .parse(String(req.query.period || "MONTH"));
    const { from, to } = reportPeriodBounds(period);
    const [
      sales,
      returnedValue,
      imports,
      losses,
      returns,
      refunds,
      mostReturned,
      supplierEarnings,
      mostSold,
      inTransit,
      reserved,
    ] = await Promise.all([
      pool.query(
        `SELECT
           COALESCE(sum(s.total), 0) AS gross_sales,
           count(*) FILTER (
             WHERE s.status IN ('COMPLETED', 'PARTIALLY_RETURNED')
               AND GREATEST(s.total - COALESCE(ret.returned_value, 0), 0) > 0
               AND GREATEST(COALESCE(pay.paid, 0) - COALESCE(ref.refund, 0), 0)
                   >= GREATEST(s.total - COALESCE(ret.returned_value, 0), 0)
           ) AS paid_closed_sales
         FROM sales s
         LEFT JOIN LATERAL (
           SELECT sum(amount) AS paid FROM sale_payments WHERE sale_id=s.id
         ) pay ON true
         LEFT JOIN LATERAL (
           SELECT sum(amount) AS refund FROM sale_refunds WHERE sale_id=s.id
         ) ref ON true
         LEFT JOIN LATERAL (
           SELECT sum(sm.quantity * si.final_unit_price) AS returned_value
           FROM sale_items si
           JOIN stock_movements sm
             ON sm.reference_id=si.id
            AND sm.type='RETURN'
            AND sm.deleted_at IS NULL
           WHERE si.sale_id=s.id
         ) ret ON true
         WHERE s.business_date >= $1::date
           AND s.business_date < $2::date`,
        [from, to],
      ),
      pool.query(
        "SELECT COALESCE(sum(sm.quantity*si.final_unit_price),0) amount FROM stock_movements sm JOIN sale_items si ON si.id=sm.reference_id WHERE sm.type='RETURN' AND sm.deleted_at IS NULL AND COALESCE(sm.business_date,sm.created_at::date)>=$1::date AND COALESCE(sm.business_date,sm.created_at::date)<$2::date",
        [from, to],
      ),
      pool.query(
        "SELECT COALESCE(sum(sm.quantity*sm.purchase_price),0) cost FROM stock_movements sm WHERE sm.type='IMPORT' AND sm.deleted_at IS NULL AND COALESCE(sm.business_date,sm.created_at::date)>=$1::date AND COALESCE(sm.business_date,sm.created_at::date)<$2::date",
        [from, to],
      ),
      pool.query(
        "SELECT COALESCE(sum(abs(sm.quantity)*COALESCE(sm.purchase_price,0)),0) amount FROM stock_movements sm WHERE sm.type IN ('LOST','DESTROYED') AND sm.deleted_at IS NULL AND COALESCE(sm.business_date,sm.created_at::date)>=$1::date AND COALESCE(sm.business_date,sm.created_at::date)<$2::date",
        [from, to],
      ),
      pool.query(
        "SELECT COALESCE(sum(sm.quantity),0) quantity FROM stock_movements sm WHERE sm.type='RETURN' AND sm.deleted_at IS NULL AND COALESCE(sm.business_date,sm.created_at::date)>=$1::date AND COALESCE(sm.business_date,sm.created_at::date)<$2::date",
        [from, to],
      ),
      pool.query(
        "SELECT COALESCE(sum(amount),0) amount FROM sale_refunds WHERE created_at>=$1::date AND created_at<$2::date",
        [from, to],
      ),
      pool.query(
        "SELECT p.name,COALESCE(sum(sm.quantity),0) quantity FROM stock_movements sm JOIN products p ON p.id=sm.product_id WHERE sm.type='RETURN' AND sm.deleted_at IS NULL AND COALESCE(sm.business_date,sm.created_at::date)>=$1::date AND COALESCE(sm.business_date,sm.created_at::date)<$2::date GROUP BY p.id,p.name ORDER BY quantity DESC,p.name LIMIT 1",
        [from, to],
      ),
      pool.query(
        `SELECT supplier_name,COALESCE(sum(revenue),0) revenue,COALESCE(sum(quantity),0) quantity
         FROM (
           SELECT COALESCE(sup.name,'Unassigned') supplier_name,
                  si.quantity*si.final_unit_price revenue,
                  si.quantity quantity
           FROM sales s
           JOIN sale_items si ON si.sale_id=s.id
           LEFT JOIN suppliers sup ON sup.id=si.supplier_id
           WHERE s.business_date >= $1::date AND s.business_date < $2::date
           UNION ALL
           SELECT COALESCE(sup.name,'Unassigned') supplier_name,
                  -(sm.quantity*si.final_unit_price) revenue,
                  -sm.quantity quantity
           FROM stock_movements sm
           JOIN sale_items si ON si.id=sm.reference_id
           LEFT JOIN suppliers sup ON sup.id=si.supplier_id
           WHERE sm.type='RETURN' AND sm.deleted_at IS NULL
             AND COALESCE(sm.business_date,sm.created_at::date)>=$1::date
             AND COALESCE(sm.business_date,sm.created_at::date)<$2::date
         ) supplier_activity
         GROUP BY supplier_name
         ORDER BY revenue DESC, supplier_name`,
        [from, to],
      ),
      pool.query(
        "SELECT p.name,COALESCE(sum(si.quantity-COALESCE(ret.quantity,0)),0) quantity FROM sales s JOIN sale_items si ON si.sale_id=s.id JOIN products p ON p.id=si.product_id LEFT JOIN LATERAL(SELECT sum(sm.quantity) quantity FROM stock_movements sm WHERE sm.type='RETURN' AND sm.deleted_at IS NULL AND sm.reference_id=si.id) ret ON true WHERE s.business_date>=$1::date AND s.business_date<$2::date GROUP BY p.id,p.name ORDER BY quantity DESC,p.name LIMIT 1",
        [from, to],
      ),
      pool.query(
        "SELECT count(*) count FROM sales WHERE delivery_status='IN_TRANSIT'",
      ),
      pool.query(
        "SELECT COALESCE(sum(quantity),0) quantity,COALESCE(sum(quantity*selling_price),0) total FROM reservations WHERE status='ACTIVE'",
      ),
    ]);
    res.json({
      period,
      from,
      to,
      metrics: {
        revenue: +sales.rows[0].gross_sales - +returnedValue.rows[0].amount,
        importCost: +imports.rows[0].cost,
        lossAmount: +losses.rows[0].amount,
        returnedQuantity: +returns.rows[0].quantity,
        refundedAmount: +refunds.rows[0].amount,
        paidClosedSales: +sales.rows[0].paid_closed_sales,
        inTransit: +inTransit.rows[0].count,
        reservedProducts: +reserved.rows[0].quantity,
        reservedProductsTotal: +reserved.rows[0].total,
      },
      mostReturnedProduct: mostReturned.rows[0] || null,
      mostSoldProduct: mostSold.rows[0] || null,
      supplierEarnings: supplierEarnings.rows,
    });
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
      for (const [k, v] of Object.entries(x))
        await c.query(
          "INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",
          [k, v],
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
  await expireReservations();
  setInterval(
    () =>
      void expireReservations().catch((expirationError) =>
        console.error("Could not expire reservations", expirationError),
      ),
    60_000,
  ).unref();
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
