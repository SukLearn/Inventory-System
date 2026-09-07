# REST API

The active application is inventory-only. All `/api/*` endpoints other than `/api/auth/login` require `Authorization: Bearer <token>`. Standard errors use `{ "error": { "code", "message" } }`.

| Resource | Operations |
| --- | --- |
| auth | `POST /api/auth/login`, `GET /api/auth/me`, `PUT /api/auth/password` |
| products | read-only list UI with detail/create/update/archive APIs retained; list filters include category, supplier, warehouse, and invoice code; each row lists warehouses where stock is currently greater than zero |
| invoices | read-only list of invoice codes already used by active imports, for reuse in the import form |
| categories | list/create/update/safe delete-or-archive |
| suppliers | list/create/update |
| warehouses | list the fixed Showroom, Galovani, and Isani locations |
| inventory | `POST /api/inventory/import`, `POST /api/inventory/adjust`, location stock/current-product/activity/movement reads; adjustments support supplier return, sold, correction, and warehouse transport |
| history | `GET /api/stock-movements`; reverse eligible movements with `DELETE /api/stock-movements/:id` |
| users | administrator-managed list/create/update/password reset |
| dashboard | `GET /api/dashboard` |

Customer, contact, sale, reservation, payment, delivery, and report endpoints return `404 FEATURE_NOT_AVAILABLE`. Their existing database tables are intentionally retained so historical installations can be rolled back safely without data loss.

Products require an existing category and supplier. Active product responses omit prices, width, and height. Editable inventory product details retain depth, material, color, description, category, and supplier. Field changes continue to create `product_events` entries.

Inventory imports accept `{productId,warehouseId,quantity,importDate,invoiceCode,notes?}` for an existing product. Administrators may instead supply `{newProduct:{name,categoryId,supplierId},warehouseId,quantity,importDate,invoiceCode,notes?}` to create and import a product in one transaction. Invoice codes contain digits only and are stored on each import movement, allowing multiple products to share one invoice. `GET /invoices` lists existing codes so the UI can reuse an invoice or enter a new code. The supplier is taken from the selected or newly created product and stored on the movement. Adjustments require `{productId,warehouseId,quantity,type,businessDate}` and accept `SUPPLIER_RETURN`, `SOLD`, `CORRECTION`, or `TRANSPORT`. Supplier returns and sold adjustments decrease stock, corrections require an increase/decrease direction, and transport additionally requires `destinationWarehouseId`. Transport atomically moves stock between two locations without changing the product's total quantity.

Warehouse inventory lists contain active products whose current quantity at that location is greater than zero. Category and invoice-code filters are applied by the API before rows reach the table.

`GET /api/inventory/products` returns one current row per active product and supports warehouse, product, supplier, movement type, status, and date filters. Existing stock is assigned to Showroom when the location migration is first applied. `GET /api/inventory/products/:id/activity` combines inventory movements and product changes without creating duplicate history.

`GET /api/stock-movements` supplies the global inventory History page. It includes inventory movements plus product, category, supplier, user, and settings changes. Prices and retired sales/customer fields are omitted from responses.

Deleting a referenced category archives it so product references remain valid. Deleting a product with historical references archives it; unreferenced products may be deleted. All category and product write operations require an administrator.

Reverse an eligible import, lost, destroyed, or correction movement with `DELETE /api/stock-movements/:id` and `{reason}`. A generated `REVERSED` movement has no display status; the original movement retains its reversed status.
