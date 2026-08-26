# REST API

All `/api/*` endpoints other than `/api/auth/login` require `Authorization: Bearer <token>`. Standard errors use `{ "error": { "code", "message" } }`.

| Resource | Operations |
| --- | --- |
| auth | `POST /api/auth/login`, `GET /api/auth/me` |
| products/categories/customers/suppliers/contacts/users | list/create/update; products also `POST /:id/images`, image deletion/primary |
| inventory | `POST /api/inventory/import`, `POST /api/inventory/adjust` |
| reservations | list/create, `POST /:id/release`, `POST /:id/complete` |
| sales | list/detail/create, `POST /:id/returns` |
| dashboard/reports | `GET /api/dashboard`, `GET /api/reports?from=&to=` |
| stock-movements/audit-logs/settings | read (settings may be updated by admin) |

Create sales with `{customerId?,items:[{productId,quantity,finalUnitPrice?,discountAmount?}],payments:[{method,amount}],notes?,deliveryRequired?,deliveryAddress?,deliveryDate?,deliveryNotes?}`. Item and payment totals are validated server-side.
