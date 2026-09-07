# REST API

The active application is inventory-only. All `/api/*` endpoints other than `/api/auth/login` require `Authorization: Bearer <token>`. Standard errors use `{ "error": { "code", "message" } }`.

| Resource | Operations |
| --- | --- |
| auth | `POST /api/auth/login`, `GET /api/auth/me`, `PUT /api/auth/password` |
| products | read-only list UI with detail/create/update/archive APIs retained; list filters include category, supplier, warehouse, and invoice code; each row lists warehouses where stock is currently greater than zero |
| invoices | list invoice codes and remaining quantities; `GET /api/invoices/:code` returns imported products and selectable import dates |
| categories | list/create/update/safe delete-or-archive |
| suppliers | list/create/update |
| warehouses | list the fixed Showroom, Galovani, and Isani locations |
| inventory | import, adjust, location stock/current-product/activity/movement reads, and pending sold-before-arrival reservations |
| history | `GET /api/stock-movements`; reverse eligible movements with `DELETE /api/stock-movements/:id` |
| users | administrator-managed list/create/update/password reset |
| dashboard | `GET /api/dashboard` |

The former customer, full-sales, payment, delivery, and financial-report API handlers have been removed. Their historical migration files and database tables remain so upgrades do not destroy existing installation data.

Products require an existing category and supplier. The inventory interface uses the product name, description, category, supplier, status, stock totals, and history. Field changes continue to create `product_events` entries.

Administrators can describe a product first through `POST /api/products`; it starts with quantity zero and has no invoice code until its first import. Inventory imports accept `{productId,warehouseId,quantity,importDate,invoiceCode,notes?}`. Invoice codes contain digits only, preserve leading zeroes, and are stored on import batches. `GET /api/invoices` lists existing and empty codes so the UI can reuse an invoice or enter a new code. Administrators can create empty codes with `POST /api/invoices`, rename them with `PATCH /api/invoices/:code`, and delete only codes that have never been used with `DELETE /api/invoices/:code`. `GET /api/invoices/:code?importDate=YYYY-MM-DD` shows the products imported on one of that invoice's import dates, the quantity still remaining from those batches, and the remaining quantity grouped by warehouse.

Invoice-batch quantities are retained per warehouse. Decreasing stock consumes the oldest invoice stock first (FIFO), and warehouse transport carries the same invoice provenance to the destination. Product details expose total stock before invoice selection and the remaining quantity for the selected invoice afterward.

Adjustments require `{productId,warehouseId,quantity,type,businessDate}` and accept `SUPPLIER_RETURN`, `SOLD`, `CORRECTION`, or `TRANSPORT`. If a `SOLD` adjustment does not have enough stock at the selected location, it creates a pending sold-before-arrival reservation instead of making stock negative and records `SOLD (RESERVED)` on the History page. `GET /api/inventory/reservations` lists pending actions. After enough stock is imported, `POST /api/inventory/reservations/:id/complete` atomically subtracts it and completes the action. Corrections require an increase/decrease direction. Transport requires `destinationWarehouseId` and moves stock between locations without changing total quantity.

Warehouse inventory lists contain active products whose current quantity at that location is greater than zero. Category and invoice-code filters are applied by the API before rows reach the table.

`GET /api/inventory/products` returns one current row per active product and supports warehouse, product, supplier, movement type, status, and date filters. Existing stock is assigned to Showroom when the location migration is first applied. `GET /api/inventory/products/:id/activity` combines inventory movements and product changes without creating duplicate history.

`GET /api/stock-movements` supplies the global inventory History page. It includes inventory movements plus product, category, supplier, user, and settings changes. Prices and retired sales/customer fields are omitted from responses.

Deleting a referenced category archives it so product references remain valid. Deleting a product with historical references archives it; unreferenced products may be deleted. All category and product write operations require an administrator.

Reverse an eligible import, supplier return, sold, lost, destroyed, or correction movement with `DELETE /api/stock-movements/:id` and `{reason}`. Reversing a completed sold-before-arrival movement reopens its Reserved entry. A generated `REVERSED` movement has no display status; the original movement retains its reversed status.
