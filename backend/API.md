# REST API

All `/api/*` endpoints other than `/api/auth/login` require `Authorization: Bearer <token>`. Standard errors use `{ "error": { "code", "message" } }`.

| Resource | Operations |
| --- | --- |
| auth | `POST /api/auth/login`, `GET /api/auth/me`, `PUT /api/auth/password` |
| products/categories/customers/suppliers/contacts/users | list/create/update; products also `POST /:id/images`, image deletion/primary |
| inventory | `POST /api/inventory/import`, `POST /api/inventory/adjust`, `GET /api/inventory/summary`, `GET /api/inventory/movements` |
| reservations | list/create, `POST /:id/release`, `POST /:id/complete` |
| sales | list/detail/create, `PUT /:id/paid`, `PUT /:id/delivery`, `POST /:id/returns` |
| payments/deliveries | `GET /api/payments?status=`, `GET /api/deliveries?status=` |
| dashboard/reports | `GET /api/dashboard`, `GET /api/reports?period=MONTH\|QUARTER\|YEAR` |
| stock-movements/audit-logs/settings | read (settings may be updated by admin) |

Create sales with `{businessDate,customerId?,items:[{productId,supplierId?,quantity,finalUnitPrice?,discountAmount?}],payments:[{method,amount}],notes?,deliveryRequired?,deliveryAddress?,deliveryDate?,deliveryNotes?}`. Item and payment totals are validated server-side.

Inventory returns require `{type:"RETURN",saleNumber,productId,quantity,notes?}`. The server verifies the original sale item, uses its negotiated price, limits the refund to money actually paid, restores stock, and preserves the sale/payment/refund records.

Reverse an eligible inventory movement with `DELETE /api/stock-movements/:id` and `{reason}`. Sales, reservations, and returns use their dedicated workflows and cannot be reversed through this endpoint.
