# REST API

All `/api/*` endpoints other than `/api/auth/login` require `Authorization: Bearer <token>`. Standard errors use `{ "error": { "code", "message" } }`.

Numeric request values accept plain non-negative decimal notation only. Quantities and numeric identifiers such as sale numbers must be positive whole numbers; prices, dimensions, payments, and deposits may use a single decimal point. Signed, comma-formatted, exponent, and alphanumeric strings are rejected.

| Resource | Operations |
| --- | --- |
| auth | `POST /api/auth/login`, `GET /api/auth/me`, `PUT /api/auth/password` |
| products/categories/customers/suppliers/contacts/users | list/create/update; categories also support safe `DELETE /:id`; products also support `POST /:id/images`, image deletion/primary |
| inventory | `POST /api/inventory/import`, `POST /api/inventory/adjust`, `GET /api/inventory/summary`, `GET /api/inventory/products`, `GET /api/inventory/products/:id/activity`, `GET /api/inventory/movements` |
| reservations | list/create, `POST /:id/release`, `POST /:id/complete` |
| sales | list/detail/create, `PUT /:id/paid`, `PUT /:id/delivery`, `POST /:id/returns` |
| payments/deliveries | `GET /api/payments?status=`, `GET /api/deliveries?status=` |
| dashboard/reports | `GET /api/dashboard`, `GET /api/reports?period=MONTH\|QUARTER\|YEAR` |
| stock-movements/audit-logs/settings | read (settings may be updated by admin) |

Create sales with `{businessDate,customerId?,items:[{productId,supplierId?,quantity,finalUnitPrice?,discountAmount?}],payments:[{method,amount}],notes?,deliveryRequired?,deliveryAddress?,deliveryDate?,deliveryNotes?}`. Item and payment totals are validated server-side.

`GET /api/sales/:id` accepts either the internal UUID or the human-readable sale number. It returns the stored sale-item price/cost snapshots together with payments, returns, refunds, supplier/product links, customer, creator, and delivery information.

Reservation `sellingPrice` is the negotiated **unit price**. Create reservations with `{productId,customerId?,supplierId?,quantity,sellingPrice,depositPaid?,expiresAt?,notes?}`. The reservation total is `quantity × sellingPrice`; the deposit cannot exceed that total and becomes the initial sale payment when the reservation is completed.

Dashboard and report reservation totals describe currently active reservations. Period revenue uses sale values on their business dates and subtracts merchandise returns on the dates the returns are recorded, so later returns do not rewrite an earlier period.

`GET /api/inventory/products` returns one row per current active product and accepts the Inventory page filters. `GET /api/inventory/products/:id/activity` assembles that product's activity from existing movements, reservations, sales, returns, deliveries, and product events without writing duplicate history.

`GET /api/stock-movements` supplies the global History page. It preserves inventory movement and product-event rows and also includes non-duplicated audit actions such as payments, deliveries, reservation completion, category/contact/customer/supplier changes, employee administration, settings changes, and authentication changes. Supported filters are `from`, `to`, `productId`, `supplierId`, `type`, `status`, `userId`, and `q`. Each row includes its stored detail fields for the History Notes modal.

`GET /api/customers/:id/history` returns the existing customer record together with net purchase rows, reservation history, field-level modification records, total paid spending, retained historical discounts, outstanding debt, active reservation balance, and last valid purchase information. Purchase balances use stored payments and refunds; retained values and discounts subtract returned item quantities. `PATCH /api/customers/:id` updates the same customer and writes one audit entry per changed field.

Inventory imports use `{productId,quantity,purchasePrice,importDate,notes?}`. The supplier is taken from the selected product and stored on the import movement. A generated `REVERSED` movement has no display status; the original reversed movement retains `REVERSED` status.

`GET /api/products` accepts combined `categoryId`, `supplierId`, `minPrice`, and `maxPrice` filters; price bounds apply to `selling_price`. Creating a product requires both category and supplier. Product updates create one `product_events` row for each field whose stored value actually changed.

Deleting a referenced category archives it so existing product references remain valid. An unreferenced category is deleted permanently. All category write operations require an administrator.

Deleting a product with sales, inventory movements, or reservations always archives it. History-backed archived products cannot be reactivated or permanently deleted; products without history may still be deleted.

Inventory returns require `{type:"RETURN",saleNumber,productId,quantity,notes?}`. The server verifies the original sale item, uses its negotiated price, limits the refund to money actually paid, restores stock, and preserves the sale/payment/refund records.

Reverse an eligible inventory movement with `DELETE /api/stock-movements/:id` and `{reason}`. Sales, reservations, and returns use their dedicated workflows and cannot be reversed through this endpoint.
