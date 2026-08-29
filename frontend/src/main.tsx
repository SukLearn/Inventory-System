import React, { useEffect as reactUseEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Routes,
  Route,
} from "react-router-dom";
import "@fontsource/open-sans/latin-400.css";
import "@fontsource/open-sans/latin-500.css";
import "@fontsource/open-sans/latin-600.css";
import "@fontsource/open-sans/latin-700.css";
import "./style.css";
import "./changes.css";
import {
  installLanguageSupport,
  readLanguage,
  saveLanguage,
  type AppLanguage,
} from "./i18n";
import { installMobileControls } from "./mobileControls";

installLanguageSupport();
installMobileControls();

class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error("The interface could not be rendered", error);
  }

  render() {
    if (this.state.failed)
      return (
        <main className="login">
          <h1>Furniture Shop</h1>
          <p className="error">The page could not be displayed.</p>
          <button onClick={() => window.location.reload()}>Reload</button>
        </main>
      );
    return this.props.children;
  }
}

function DeliveryButton({ sale, reload }: { sale: O; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const paid = +sale.paid >= +(sale.effectiveTotal ?? sale.total);
  const done = sale.delivery_status === "DELIVERED";
  const label =
    sale.delivery_status === "IN_TRANSIT" || done ? "Delivered" : "In Transit";
  const update = async () => {
    setBusy(true);
    try {
      await api("/sales/" + sale.id + "/delivery", { method: "PUT" });
      reload();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button disabled={!paid || done || busy} onClick={update}>
      {label}
    </button>
  );
}
function EmployeePasswordButton({
  employee,
  reload,
  onError,
}: {
  employee: O;
  reload: () => void;
  onError: (message: string) => void;
}) {
  if (employee.role !== "EMPLOYEE") return null;
  const reset = async () => {
    const newPassword = prompt(`New password for ${employee.name}:`);
    if (newPassword === null) return;
    const confirmPassword = prompt("Confirm the new password:");
    if (confirmPassword === null) return;
    if (newPassword.length < 8) {
      onError("Password must contain at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      onError("New password and confirmation must match.");
      return;
    }
    try {
      await api("/users/" + employee.id + "/password", {
        method: "PUT",
        body: JSON.stringify({ newPassword, confirmPassword }),
      });
      onError("Password reset successfully.");
      reload();
    } catch (e: any) {
      onError(e.message);
    }
  };
  return <button onClick={reset}>Reset password</button>;
}
const preferenceEvent = "furniture-shop-preferences";
const readShopName = () => localStorage.getItem("shopName") || "Furniture Shop";
const applyTheme = (theme = localStorage.getItem("theme") || "White") =>
  (document.documentElement.dataset.theme = theme.toLowerCase());
applyTheme();
document.title = readShopName();
function StatusValue({ value }: { value: any }) {
  const v = String(value || "");
  const color =
    v === "ACTIVE" || v === "SALE"
      ? "green"
      : v === "REVERSED"
        ? "yellow"
        : v === "RETURN"
          ? "blue"
          : v === "LOST" || v === "DESTROYED"
            ? "red"
            : "";
  return (
    <span className={`status ${color ? `status-${color}` : ""}`}>{v}</span>
  );
}
function ShopTitle() {
  const [name, setName] = useState(readShopName());
  useEffect(() => {
    const sync = () => setName(readShopName());
    window.addEventListener(preferenceEvent, sync);
    return () => window.removeEventListener(preferenceEvent, sync);
  }, []);
  return <span data-no-translate>{name}</span>;
}
function SettingsWithPreferences() {
  const [shopName, setShopName] = useState(readShopName()),
    [theme, setTheme] = useState(localStorage.getItem("theme") || "White"),
    [language, setLanguage] = useState<AppLanguage>(readLanguage()),
    [message, setMessage] = useState("");
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const name = shopName.trim() || "Furniture Shop";
    localStorage.setItem("shopName", name);
    localStorage.setItem("theme", theme);
    saveLanguage(language);
    applyTheme(theme);
    document.title = name;
    window.dispatchEvent(new Event(preferenceEvent));
    setMessage("Settings saved");
  };
  const changePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget,
      newPassword = String(new FormData(form).get("newPassword") || ""),
      confirmPassword = String(new FormData(form).get("confirmPassword") || "");
    if (newPassword.length < 8) {
      setMessage("New password must contain at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage("New password and confirmation must match.");
      return;
    }
    try {
      await api("/auth/password", {
        method: "PUT",
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      form.reset();
      setMessage("Password changed successfully.");
    } catch (x: any) {
      setMessage(x.message);
    }
  };
  return (
    <>
      <h2>Settings</h2>
      <form className="settings-form" onSubmit={save}>
        <label>
          Shop Name
          <input
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            required
          />
        </label>
        <label>
          Theme
          <select
            value={theme}
            onChange={(e) => {
              setTheme(e.target.value);
              applyTheme(e.target.value);
            }}
          >
            <option>Dark</option>
            <option>White</option>
            <option>Obsidian</option>
          </select>
        </label>
        <label>
          Language
          <select
            value={language}
            onChange={(e) => {
              const next = e.target.value as AppLanguage;
              setLanguage(next);
              saveLanguage(next);
            }}
          >
            <option value="English">English</option>
            <option value="Georgian">Georgian</option>
          </select>
        </label>
        <button className="form-submit settings-action">Save</button>
      </form>
      <form className="settings-form" onSubmit={changePassword}>
        <h3>Change password</h3>
        <label>
          Current password
          <input name="oldPassword" type="password" required />
        </label>
        <label>
          New password
          <input name="newPassword" type="password" minLength={8} required />
          <small>At least 8 characters.</small>
        </label>
        <label>
          Confirm new password
          <input
            name="confirmPassword"
            type="password"
            minLength={8}
            required
          />
        </label>
        <button className="form-submit settings-action">Change password</button>
      </form>
      {message && (
        <p
          className={
            message.includes("success") || message === "Settings saved"
              ? ""
              : "error"
          }
        >
          {message}
        </p>
      )}
    </>
  );
}
function ReportsWithPeriods() {
  const [period, setPeriod] = useState("MONTH"),
    [r, sr] = useState<O>(),
    [e, se] = useState("");
  useEffect(() => {
    sr(undefined);
    api("/reports?period=" + period)
      .then(sr)
      .catch((x) => se(x.message));
  }, [period]);
  if (e) return <p className="error">{e}</p>;
  if (!r) return <p>Loading...</p>;
  const m = r.metrics;
  return (
    <>
      <h2>Reports</h2>
      <label className="page-filter">
        Period
        <select value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="MONTH">Month</option>
          <option value="QUARTER">Quarter</option>
          <option value="YEAR">Year</option>
        </select>
      </label>
      <section className="cards report-cards">
        {[
          ["Total earnings", gel(m.revenue)],
          ["Imported product cost", gel(m.importCost)],
          ["Financial loss", gel(m.lossAmount)],
          ["Returned products", m.returnedQuantity],
          ["Returned / refunded", gel(m.refundedAmount)],
          ["In transit", m.inTransit],
          ["Paid / closed sales", m.paidClosedSales],
          [
            "Most returned product",
            r.mostReturnedProduct
              ? `${r.mostReturnedProduct.name} (${r.mostReturnedProduct.quantity})`
              : "-",
          ],
          [
            "Most sold product",
            r.mostSoldProduct
              ? `${r.mostSoldProduct.name} (${r.mostSoldProduct.quantity})`
              : "-",
          ],
        ].map((x) => (
          <div className="card" key={String(x[0])}>
            <small>{x[0]}</small>
            <strong>{x[1]}</strong>
          </div>
        ))}
      </section>
      <h3>Supplier earnings</h3>
      <T
        rows={r.supplierEarnings}
        cols={[
          ["Supplier", (x) => x.supplier_name],
          ["Products sold", (x) => x.quantity],
          ["Earnings", (x) => gel(x.revenue)],
        ]}
      />
    </>
  );
}
function InventoryWithSummary() {
  const [summary, setSummary] = useState<O>(),
    [products, setProducts] = useState<O[]>([]),
    [suppliers, setSuppliers] = useState<O[]>([]),
    [moves, setMoves] = useState<O[]>([]),
    [filters, setFilters] = useState<O>({});
  const load = () => {
    api("/inventory/summary").then(setSummary);
    api("/products").then(setProducts);
    api("/suppliers").then(setSuppliers);
    const q = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v) as [string, string][],
    ).toString();
    api("/inventory/movements?" + q).then(setMoves);
  };
  useEffect(load, [JSON.stringify(filters)]);
  return (
    <>
      <h2>Inventory</h2>
      {summary && (
        <section className="cards">
          {[
            ["Physical Stock", summary.physical_stock],
            ["Reserved", summary.reserved],
            ["Available", summary.available],
            ["Inventory Cost Value", gel(summary.cost_value)],
          ].map((x) => (
            <div className="card" key={String(x[0])}>
              <small>{x[0]}</small>
              <strong>{x[1]}</strong>
            </div>
          ))}
        </section>
      )}
      <form>
        <label>
          Product
          <select
            onChange={(e) =>
              setFilters({ ...filters, productId: e.target.value })
            }
          >
            <option value="">All</option>
            {products.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Supplier
          <select
            onChange={(e) =>
              setFilters({ ...filters, supplierId: e.target.value })
            }
          >
            <option value="">All</option>
            {suppliers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Movement type
          <select
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
          >
            <option value="">All</option>
            {[
              "IMPORT",
              "RETURN",
              "LOST",
              "DESTROYED",
              "CORRECTION",
              "REVERSED",
            ].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="">All</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="REVERSED">REVERSED</option>
          </select>
        </label>
        <label>
          From
          <input
            type="date"
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
          />
        </label>
        <label>
          To
          <input
            type="date"
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
          />
        </label>
      </form>
      <Inventory showTitle={false} showHistory={false} onChanged={load} />
      <MovementTable rows={moves} reload={load} allowDelete />
    </>
  );
}
function Deliveries() {
  const [status, setStatus] = useState("ALL"),
    [rows, setRows] = useState<O[]>([]),
    [e, setError] = useState("");
  const load = () =>
    api("/deliveries?status=" + status)
      .then(setRows)
      .catch((x) => setError(x.message));
  useEffect(load, [status]);
  return (
    <>
      <h2>Deliveries</h2>
      <label className="page-filter">
        Status
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option>ALL</option>
          <option>READY</option>
          <option>IN_TRANSIT</option>
          <option>DELIVERED</option>
        </select>
      </label>
      {e && <p className="error">{e}</p>}
      <T
        rows={rows}
        cols={[
          ["Sale ID", (x) => x.sale_number],
          ["Date", (x) => dt(x.business_date)],
          ["Customer", (x) => x.customer_name || "-"],
          ["Contact", (x) => x.customer_phone || "-"],
          [
            "Products",
            (x) =>
              (x.items || [])
                .map((i: any) => i.name + " x " + i.quantity)
                .join(", "),
          ],
          ["Address", (x) => x.delivery_address || "-"],
          ["Status", (x) => x.delivery_view_status],
          ["Delivery", (x) => <DeliveryButton sale={x} reload={load} />],
        ]}
      />
    </>
  );
}
function Payments() {
  const [status, setStatus] = useState("OUTSTANDING"),
    [rows, setRows] = useState<O[]>([]),
    [e, setError] = useState("");
  const load = () =>
    api("/payments?status=" + status)
      .then(setRows)
      .catch((x) => setError(x.message));
  useEffect(load, [status]);
  const outstanding = rows.reduce((s, x) => s + +x.remaining, 0);
  return (
    <>
      <h2>Payments</h2>
      <section className="cards">
        <div className="card">
          <small>Total Outstanding</small>
          <strong>{gel(outstanding)}</strong>
        </div>
      </section>
      <label className="page-filter payments-filter">
        Show
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="OUTSTANDING">Outstanding</option>
          <option value="PAID">Paid</option>
          <option value="ALL">All</option>
        </select>
      </label>
      {e && <p className="error">{e}</p>}
      <T
        rows={rows}
        cols={[
          ["Sale ID", (x) => x.sale_number],
          ["Customer", (x) => x.customer_name || "-"],
          ["Contact", (x) => x.customer_phone || "-"],
          ["Sale Total", (x) => gel(x.total)],
          ["Paid", (x) => gel(x.paid)],
          ["Remaining", (x) => gel(x.remaining)],
          ["Payment Status", (x) => x.payment_status],
          ["Date", (x) => dt(x.business_date)],
          ["Action", (x) => <PaidEditor sale={x} reload={load} />],
        ]}
      />
    </>
  );
}
function SalesWithBusinessDate() {
  const [p, sp] = useState<O[]>([]),
    [r, sr] = useState<O[]>([]),
    [e, se] = useState("");
  const load = () => {
    api("/products").then(sp);
    api("/sales").then(sr);
  };
  useEffect(load, []);
  return (
    <>
      <h2>Sales</h2>
      <form
        onSubmit={async (x) => {
          x.preventDefault();
          const form = x.currentTarget;
          const f = new FormData(form);
          try {
            await api("/sales", {
              method: "POST",
              body: JSON.stringify({
                businessDate: f.get("businessDate"),
                items: [
                  {
                    productId: f.get("productId"),
                    quantity: +f.get("quantity")!,
                    finalUnitPrice: +f.get("price")!,
                  },
                ],
                payments: f.get("paid")
                  ? [{ method: f.get("method"), amount: +f.get("paid")! }]
                  : [],
                notes: f.get("notes"),
              }),
            });
            form.reset();
            load();
          } catch (z: any) {
            se(z.message);
          }
        }}
      >
        <label>
          Sale date
          <input
            name="businessDate"
            type="date"
            defaultValue={today()}
            required
          />
        </label>
        <label>
          Product
          <select name="productId" required>
            <option value="">Product</option>
            {p
              .filter((x) => x.available_quantity > 0)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} ({x.available_quantity})
                </option>
              ))}
          </select>
        </label>
        <label className="quantity-field">
          Quantity
          <input name="quantity" type="number" min="1" defaultValue="1" />
        </label>
        <label>
          Final unit price
          <input name="price" type="number" min="0" step="0.01" required />
        </label>
        <label>
          Payment method
          <select name="method">
            <option>CASH</option>
            <option>CARD</option>
            <option>BANK_TRANSFER</option>
            <option>OTHER</option>
          </select>
        </label>
        <label>
          Paid now
          <input name="paid" type="number" min="0" step="0.01" />
        </label>
        <label>
          Notes
          <input name="notes" />
        </label>
        <button className="form-submit">Complete sale</button>
      </form>
      {e && <p className="error">{e}</p>}
      <T
        rows={r}
        cols={[
          ["Sale #", (x) => x.sale_number],
          ["Sale date", (x) => dt(x.business_date || x.created_at)],
          [
            "Product",
            (x) =>
              (x.items || [])
                .map((a: any) => a.name + " x " + a.quantity)
                .join(", "),
          ],
          [
            "Product cost",
            (x) =>
              (x.items || [])
                .map((a: any) => gel(+a.costPrice * a.quantity))
                .join(", "),
          ],
          ["Selling price", (x) => gel(x.total)],
          ["Total", (x) => gel(x.total)],
          ["Paid", (x) => <PaidEditor sale={x} reload={load} />],
          ["Remaining", (x) => gel(x.remaining)],
          [
            "Status",
            (x) => (
              <StatusValue
                value={
                  x.status === "RETURNED"
                    ? "RETURNED"
                    : x.status === "PARTIALLY_RETURNED"
                      ? "PARTIALLY_RETURNED"
                      : x.paymentStatus
                }
              />
            ),
          ],
          [
            "Delivery",
            (x) => (
              <StatusValue
                value={
                    x.delivery_status === "NOT_REQUIRED"
                    ? +x.paid >= +(x.effectiveTotal ?? x.total)
                      ? "READY"
                      : "NOT_READY"
                    : x.delivery_status
                }
              />
            ),
          ],
          ["Notes", (x) => <NoteButton note={x.notes} />],
        ]}
      />
    </>
  );
}
type O = Record<string, any>;
type AsyncEffect = () => void | (() => void) | Promise<unknown>;
const useEffect = (
  effect: AsyncEffect,
  dependencies: React.DependencyList,
) =>
  reactUseEffect(() => {
    const result = effect();
    if (typeof result === "function") return result;
    if (result && typeof (result as Promise<unknown>).then === "function")
      void (result as Promise<unknown>).catch(console.error);
    return undefined;
  }, dependencies);
const tok = () => localStorage.token;
const authExpiredEvent = "furniture-shop-auth-expired";
async function api(u: string, o: RequestInit = {}): Promise<any> {
  const headers = new Headers(o.headers);
  if (o.body && !(o.body instanceof FormData) && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  if (tok()) headers.set("Authorization", "Bearer " + tok());
  const r = await fetch("/api" + u, {
    ...o,
    headers,
  });
  const text = r.status === 204 ? "" : await r.text();
  let d: O | null = null;
  if (text) {
    try {
      d = JSON.parse(text);
    } catch {
      d = { error: { message: text } };
    }
  }
  if (r.status === 401 && tok()) {
    delete localStorage.token;
    window.dispatchEvent(new Event(authExpiredEvent));
  }
  if (!r.ok)
    throw Error(d?.error?.message || `Request failed (${r.status})`);
  return d;
}
const gel = (n: any) =>
  new Intl.NumberFormat("en-GE", { style: "currency", currency: "GEL" }).format(
    +n || 0,
  );
const dt = (v: any) =>
  v
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "Asia/Tbilisi",
      }).format(new Date(v))
    : "—";
const today = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tbilisi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};
function T({ rows, cols }: { rows: O[]; cols: [string, (x: O) => any][] }) {
  const [sort, setSort] = useState<{ index: number; direction: 1 | -1 } | null>(
    null,
  );
  const value = (row: O, index: number) => {
    const v = cols[index][1](row);
    return typeof v === "number"
      ? v
      : typeof v === "string"
        ? v.toLowerCase()
        : "";
  };
  const sorted = sort
    ? [...rows].sort((a, b) => {
        const av = value(a, sort.index),
          bv = value(b, sort.index);
        return (
          (typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv))) * sort.direction
        );
      })
    : rows;
  const toggle = (index: number) =>
    setSort((s) =>
      s?.index === index
        ? { index, direction: s.direction === 1 ? -1 : 1 }
        : { index, direction: 1 },
    );
  return (
    <div className="table">
      <table>
        <thead>
          <tr>
            {cols.map((c, index) => (
              <th key={c[0]}>
                <button className="sort" onClick={() => toggle(index)}>
                  {c[0]}{" "}
                  {sort?.index === index
                    ? sort.direction === 1
                      ? "▲"
                      : "▼"
                    : "↕"}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((x, i) => (
            <tr key={x.id || i}>
              {cols.map((c) => (
                <td key={c[0]}>{c[1](x)}</td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={cols.length}>No records found.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
function NoteButton({ note }: { note?: string | null }) {
  const [open, setOpen] = useState(false);
  if (!note) return <>—</>;
  return (
    <>
      <button className="note-button" onClick={() => setOpen(true)}>
        View note
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Note</h3>
            <p>{note}</p>
            <button onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
function Login({ done }: { done: (u: O) => void }) {
  const [u, su] = useState(""),
    [p, sp] = useState(""),
    [e, se] = useState("");
  return (
    <main className="login">
      <h1>
        <ShopTitle />
      </h1>
      <form
        onSubmit={async (x) => {
          x.preventDefault();
          try {
            const d = await api("/auth/login", {
              method: "POST",
              body: JSON.stringify({ username: u, password: p }),
            });
            localStorage.token = d.token;
            done(d.user);
          } catch (z: any) {
            se(z.message);
          }
        }}
      >
        <label>
          Username
          <input
            value={u}
            onChange={(x) => su(x.target.value)}
            autoComplete="username"
            required
            autoFocus
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={p}
            onChange={(x) => sp(x.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {e && <p className="error">{e}</p>}
        <button>Sign in</button>
      </form>
    </main>
  );
}
function Dashboard() {
  const [d, sd] = useState<O>();
  useEffect(() => {
    api("/dashboard").then(sd);
  }, []);
  if (!d) return <p>Loading…</p>;
  const a = [
    ["Products", d.products],
    ["Available", d.available],
    ["Reserved", d.reserved],
    ["Out of stock", d.out_stock],
    ["Today", gel(d.today_revenue)],
    ["Month", gel(d.month_revenue)],
    ["Customers", d.customers],
  ];
  return (
    <>
      <h2>Dashboard</h2>
      <section className="cards">
        {a.map((x) => (
          <div className="card" key={String(x[0])}>
            <small>{x[0]}</small>
            <strong>{x[1]}</strong>
          </div>
        ))}
      </section>
      <h3>Top-selling products</h3>
      <T
        rows={d.topProducts}
        cols={[
          ["Product", (x) => x.name],
          ["Units", (x) => x.quantity],
        ]}
      />
      <h3>Sales over time</h3>
      <T
        rows={d.salesTrend}
        cols={[
          ["Date", (x) => x.date],
          ["Revenue", (x) => gel(x.revenue)],
        ]}
      />
    </>
  );
}
function Products({ admin }: { admin: boolean }) {
  const [r, sr] = useState<O[]>([]),
    [e, se] = useState("");
  const load = () =>
    api("/products?status=all")
      .then(sr)
      .catch((x) => se(x.message));
  const remove = async (product: O) => {
    if (
      !confirm(
        `Remove “${product.name}”? Products with sales or stock history will be archived instead.`,
      )
    )
      return;
    try {
      const result = await api("/products/" + product.id, { method: "DELETE" });
      alert(
        result.archived
          ? "This product has history, so it was archived instead of deleted."
          : "Product deleted.",
      );
      void load();
    } catch (x: any) {
      se(x.message);
    }
  };
  useEffect(load, []);
  return (
    <>
      <h2>Products</h2>
      {admin && (
        <form
          className="inline"
          onSubmit={async (x) => {
            x.preventDefault();
            const form = x.currentTarget;
            const f = new FormData(form);
            try {
              await api("/products", {
                method: "POST",
                body: JSON.stringify({
                  name: f.get("name"),
                  sellingPrice: +f.get("price")!,
                  purchasePrice: +f.get("cost")!,
                }),
              });
              form.reset();
              void load();
            } catch (z: any) {
              se(z.message);
            }
          }}
        >
          <label>
            Product name
            <input name="name" required />
          </label>
          <label>
            Selling price
            <input name="price" type="number" min="0" required />
          </label>
          <label>
            Purchase cost
            <input
              name="cost"
              type="number"
              min="0"
              step="1"
              defaultValue="0"
            />
          </label>
          <button className="form-submit">Add product</button>
        </form>
      )}
      {e && <p className="error">{e}</p>}
      <T
        rows={r}
        cols={[
          ["Name", (x) => x.name],
          ["Category", (x) => x.category_name || "—"],
          ["In stock", (x) => x.current_quantity],
          ["Reserved", (x) => x.reserved_quantity],
          ["Available now", (x) => x.available_quantity],
          ["Purchase cost", (x) => gel(x.purchase_price)],
          ["Selling price", (x) => gel(x.selling_price)],
          ["Status", (x) => (x.is_active ? "Active" : "Inactive")],
          [
            "Action",
            (x) =>
              admin ? (
                <button onClick={() => remove(x)}>
                  {x.is_active ? "Delete / archive" : "Delete"}
                </button>
              ) : (
                "—"
              ),
          ],
        ]}
      />
    </>
  );
}
function Resource({
  title,
  url,
  fields,
  canCreate = true,
}: {
  title: string;
  url: string;
  fields: string[];
  canCreate?: boolean;
}) {
  const [r, sr] = useState<O[]>([]),
    [e, se] = useState("");
  const load = () =>
    api(url)
      .then(sr)
      .catch((x) => se(x.message));
  useEffect(() => {
    sr([]);
    void load();
  }, [url]);
  return (
    <>
      <h2>{title}</h2>
      {canCreate && <form
        className="inline"
        onSubmit={async (x) => {
          x.preventDefault();
          const form = x.currentTarget;
          const f = new FormData(form);
          try {
            await api(url, {
              method: "POST",
              body: JSON.stringify(
                Object.fromEntries([...f.entries()].filter(([, v]) => v)),
              ),
            });
            form.reset();
            void load();
          } catch (z: any) {
            se(z.message);
          }
        }}
      >
        {fields.map((k) => (
          <label key={k}>
            {k}
            <input name={k} required={k === "name"} />
          </label>
        ))}
        <button className="form-submit">Add {title.slice(0, -1)}</button>
      </form>}
      {e && <p className="error">{e}</p>}
      <T
        rows={r}
        cols={
          fields.map((k) => [
            k,
            (x: O) =>
              k === "notes" ? <NoteButton note={x[k]} /> : x[k] || "—",
          ]) as any
        }
      />
    </>
  );
}
function MovementTable({
  rows,
  reload,
  allowDelete = false,
}: {
  rows: O[];
  reload: () => void;
  allowDelete?: boolean;
}) {
  const remove = async (m: O) => {
    const reason = prompt("Why is this inventory operation being reversed?");
    if (!reason) return;
    try {
      await api("/stock-movements/" + m.id, {
        method: "DELETE",
        body: JSON.stringify({ reason }),
      });
      reload();
    } catch (e: any) {
      alert(e.message);
    }
  };
  const cols: any = [
    ["Date", (x: O) => dt(x.display_date || x.business_date || x.created_at)],
    ["Movement type", (x: O) => <StatusValue value={x.type} />],
    ["Product", (x: O) => x.product_name],
    [
      "Quantity",
      (x: O) =>
        x.quantity === null ? "—" : (x.quantity > 0 ? "+" : "") + x.quantity,
    ],
    [
      "Purchase cost",
      (x: O) => (x.purchase_price === null ? "—" : gel(x.purchase_price)),
    ],
    ["Supplier", (x: O) => x.supplier_name || "—"],
    ["Employee", (x: O) => x.employee_name],
    ["Notes", (x: O) => <NoteButton note={x.notes} />],
  ];
  if (allowDelete)
    cols.push(
      [
        "Status",
        (x: O) => <StatusValue value={x.deleted_at ? "REVERSED" : "ACTIVE"} />,
      ],
      [
        "Manage",
        (x: O) =>
          !x.deleted_at &&
          ["IMPORT", "LOST", "DESTROYED", "CORRECTION"].includes(x.type) ? (
            <button onClick={() => remove(x)}>Reverse</button>
          ) : (
            "—"
          ),
      ],
    );
  const display = allowDelete
    ? rows.filter((x) =>
        [
          "IMPORT",
          "RETURN",
          "LOST",
          "DESTROYED",
          "CORRECTION",
          "REVERSED",
        ].includes(x.type),
      )
    : rows;
  return <T rows={display} cols={cols} />;
}
function Inventory({
  showTitle = true,
  showHistory = true,
  onChanged,
}: {
  showTitle?: boolean;
  showHistory?: boolean;
  onChanged?: () => void;
} = {}) {
  const [p, sp] = useState<O[]>([]),
    [s, ss] = useState<O[]>([]),
    [h, sh] = useState<O[]>([]),
    [e, se] = useState(""),
    [reason, setReason] = useState("RETURN"),
    [qty, setQty] = useState("1"),
    [direction, setDirection] = useState("INCREASE");
  const load = () => {
    api("/products").then(sp);
    api("/suppliers").then(ss);
    if (showHistory) api("/stock-movements").then(sh);
  };
  useEffect(load, []);
  const submit =
    (url: string) => async (x: React.FormEvent<HTMLFormElement>) => {
      x.preventDefault();
      const form = x.currentTarget;
      const f = new FormData(form);
      try {
        const body = url.endsWith("/import")
          ? {
              productId: f.get("productId"),
              quantity: +f.get("quantity")!,
              purchasePrice: +f.get("price")!,
              supplierId: f.get("supplierId"),
              importDate: f.get("importDate"),
              notes: f.get("notes"),
            }
          : {
              productId: f.get("productId"),
              quantity: +f.get("quantity")!,
              type: f.get("type"),
              correctionDirection: f.get("correctionDirection"),
              saleNumber: f.get("saleNumber")
                ? +f.get("saleNumber")!
                : undefined,
              notes: f.get("notes"),
            };
        await api(url, { method: "POST", body: JSON.stringify(body) });
        form.reset();
        setReason("RETURN");
        setQty("1");
        setDirection("INCREASE");
        load();
        onChanged?.();
      } catch (z: any) {
        se(z.message);
      }
    };
  const pick = (
    <select name="productId" required>
      <option value="">Product</option>
      {p.map((x) => (
        <option key={x.id} value={x.id}>
          {x.name} ({x.available_quantity})
        </option>
      ))}
    </select>
  );
  const result =
    reason === "RETURN"
      ? `Stock will increase by ${qty || 0}`
      : reason === "CORRECTION"
        ? `Stock will ${direction === "INCREASE" ? "increase" : "decrease"} by ${qty || 0}`
        : `Stock will decrease by ${qty || 0}`;
  return (
    <>
      {showTitle && <h2>Inventory</h2>}
      <div className="twocol">
        <form onSubmit={submit("/inventory/import")}>
          <h3>Import</h3>
          <label>Product{pick}</label>
          <label>
            Quantity
            <input name="quantity" type="number" min="1" required />
          </label>
          <label>
            Purchase price
            <input name="price" type="number" min="0" step="0.01" required />
          </label>
          <label>
            Supplier
            <select name="supplierId" required>
              <option value="">Select supplier</option>
              {s.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Import date
            <input
              name="importDate"
              type="date"
              defaultValue={today()}
              required
            />
          </label>
          <label>
            Notes
            <input name="notes" placeholder="Optional" />
          </label>
          <button className="form-submit inventory-action">Import</button>
        </form>
        <form onSubmit={submit("/inventory/adjust")}>
          <h3>Adjustment</h3>
          <label>Product{pick}</label>
          <label>
            Quantity
            <input
              name="quantity"
              type="number"
              min="1"
              value={qty}
              onChange={(x) => setQty(x.target.value)}
              required
            />
          </label>
          <label>
            Reason
            <select
              name="type"
              value={reason}
              onChange={(x) => setReason(x.target.value)}
            >
              <option>RETURN</option>
              <option>LOST</option>
              <option>DESTROYED</option>
              <option>CORRECTION</option>
            </select>
          </label>
          {reason === "RETURN" && (
            <label>
              Sale ID
              <input name="saleNumber" type="number" min="1" required />
            </label>
          )}
          {reason === "CORRECTION" && (
            <label>
              Correction direction
              <select
                name="correctionDirection"
                value={direction}
                onChange={(x) => setDirection(x.target.value)}
              >
                <option value="INCREASE">Increase stock</option>
                <option value="DECREASE">Decrease stock</option>
              </select>
            </label>
          )}
          <p>
            <b>Result:</b> {result}
          </p>
          <label>
            Notes
            <input
              name="notes"
              placeholder={
                reason === "LOST" || reason === "DESTROYED"
                  ? "Required"
                  : "Optional"
              }
              required={reason === "LOST" || reason === "DESTROYED"}
            />
          </label>
          <button className="form-submit inventory-action">
            Record adjustment
          </button>
        </form>
      </div>
      {e && <p className="error">{e}</p>}
      {showHistory && <MovementTable rows={h} reload={load} allowDelete />}
    </>
  );
}
function History() {
  const [h, sh] = useState<O[]>([]);
  const load = () => api("/stock-movements").then(sh);
  useEffect(load, []);
  const display = h.map((x) =>
    x.type === "SALE" && x.sale_selling_price != null
      ? {
          ...x,
          product_name: `${x.product_name} | Selling Price: ${gel(x.sale_selling_price)}`,
        }
      : x,
  );
  return (
    <>
      <h2>History</h2>
      <MovementTable rows={display} reload={load} />
    </>
  );
}
function PaidEditor({ sale, reload }: { sale: O; reload: () => void }) {
  const [value, setValue] = useState(String(sale.paid));
  useEffect(() => setValue(String(sale.paid)), [sale.paid]);
  const save = async () => {
    try {
      await api("/sales/" + sale.id + "/paid", {
        method: "PUT",
        body: JSON.stringify({ paid: +value, method: "CASH" }),
      });
      reload();
    } catch (e: any) {
      alert(e.message);
    }
  };
  return (
    <span>
      <input
        className="paid-input"
        type="number"
        min={sale.paid}
        max={sale.effectiveTotal ?? sale.total}
        step="0.01"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button onClick={save}>Save</button>
    </span>
  );
}
function Reservations() {
  const [p, sp] = useState<O[]>([]),
    [s, ss] = useState<O[]>([]),
    [r, sr] = useState<O[]>([]),
    [e, se] = useState("");
  const load = () => {
    api("/products").then(sp);
    api("/suppliers").then(ss);
    api("/reservations").then(sr);
  };
  const finish = async (x: O) => {
    try {
      await api("/reservations/" + x.id + "/complete", {
        method: "POST",
        body: "{}",
      });
      load();
    } catch (z: any) {
      se(z.message);
    }
  };
  const cancel = async (x: O) => {
    try {
      await api("/reservations/" + x.id + "/release", {
        method: "POST",
        body: JSON.stringify({ notes: "Cancelled from reservations page" }),
      });
      load();
    } catch (z: any) {
      se(z.message);
    }
  };
  useEffect(load, []);
  return (
    <>
      <h2>Reservations</h2>
      <form
        onSubmit={async (x) => {
          x.preventDefault();
          const form = x.currentTarget;
          const f = new FormData(form);
          try {
            await api("/reservations", {
              method: "POST",
              body: JSON.stringify({
                productId: f.get("productId"),
                supplierId: f.get("supplierId") || null,
                quantity: +f.get("quantity")!,
                sellingPrice: +f.get("sellingPrice")!,
                notes: f.get("notes"),
              }),
            });
            form.reset();
            load();
          } catch (z: any) {
            se(z.message);
          }
        }}
      >
        <label>
          Product
          <select name="productId" required>
            <option value="">Product</option>
            {p.filter((x) => x.available_quantity > 0).map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Supplier
          <select name="supplierId">
            <option value="">No supplier</option>
            {s.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantity
          <input name="quantity" type="number" min="1" defaultValue="1" />
        </label>
        <label>
          Selling price
          <input
            name="sellingPrice"
            type="number"
            min="0"
            step="0.01"
            required
          />
        </label>
        <label>
          Notes
          <input name="notes" />
        </label>
        <button className="form-submit">Reserve</button>
      </form>
      {e && <p className="error">{e}</p>}
      <T
        rows={r}
        cols={[
          ["Product", (x) => x.product_name],
          ["Supplier", (x) => x.supplier_name || "—"],
          ["Quantity", (x) => x.quantity],
          ["Selling price", (x) => gel(x.selling_price)],
          [
            "Status",
            (x) => (
              <StatusValue
                value={
                  x.display_status === "COMPLETED"
                    ? "Sold"
                    : x.display_status === "CANCELLED"
                      ? "Cancelled reservation"
                      : x.display_status
                }
              />
            ),
          ],
          ["Created", (x) => dt(x.created_at)],
          ["Notes", (x) => <NoteButton note={x.notes} />],
          [
            "Action",
            (x) =>
              x.display_status === "ACTIVE" ? (
                <>
                  <button onClick={() => cancel(x)}>Cancel</button>{" "}
                  <button onClick={() => finish(x)}>Sold</button>
                </>
              ) : (
                "—"
              ),
          ],
        ]}
      />
    </>
  );
}
function Employees() {
  const [r, sr] = useState<O[]>([]),
    [e, se] = useState("");
  const load = () =>
    api("/users")
      .then(sr)
      .catch((x) => se(x.message));
  useEffect(load, []);
  return (
    <>
      <h2>Employees</h2>
      <form
        onSubmit={async (x) => {
          x.preventDefault();
          const form = x.currentTarget;
          const f = new FormData(form);
          const password = String(f.get("password") || "");
          if (password.length < 8) {
            se("Password must contain at least 8 characters.");
            return;
          }
          try {
            await api("/users", {
              method: "POST",
              body: JSON.stringify(Object.fromEntries(f)),
            });
            form.reset();
            se("");
            void load();
          } catch (z: any) {
            se(
              z.message === "A record with that value already exists"
                ? "That username is already in use. Choose another username."
                : z.message,
            );
          }
        }}
      >
        <label>
          Employee name
          <input name="name" required />
        </label>
        <label>
          Username
          <input name="username" minLength={3} required />
          <small>At least 3 characters.</small>
        </label>
        <label>
          Password
          <input name="password" type="password" minLength={8} required />
          <small>At least 8 characters.</small>
        </label>
        <label>
          Role
          <select name="role">
            <option>EMPLOYEE</option>
            <option>ADMIN</option>
          </select>
        </label>
        <button className="form-submit employee-action">Add employee</button>
      </form>
      {e && <p className={e.includes("success") ? "" : "error"}>{e}</p>}
      <T
        rows={r}
        cols={[
          ["Name", (x) => x.name],
          ["Username", (x) => x.username],
          ["Role", (x) => x.role],
          ["Status", (x) => (x.is_active ? "Active" : "Disabled")],
          [
            "Action",
            (x) => (
              <>
                <button
                  onClick={async () => {
                    try {
                      await api("/users/" + x.id, {
                        method: "PATCH",
                        body: JSON.stringify({ isActive: !x.is_active }),
                      });
                      void load();
                    } catch (z: any) {
                      se(z.message);
                    }
                  }}
                >
                  {x.is_active ? "Disable" : "Enable"}
                </button>{" "}
                <EmployeePasswordButton
                  employee={x}
                  reload={load}
                  onError={se}
                />
              </>
            ),
          ],
        ]}
      />
    </>
  );
}
function Shell({ u, out }: { u: O; out: () => void }) {
  const n = [
    "Dashboard",
    "Products",
    "Inventory",
    "Sales",
    "Reservations",
    "Payments",
    "Deliveries",
    "Customers",
    "Suppliers",
    "Contacts",
    "History",
    "Reports",
    "Employees",
    "Settings",
  ];
  return (
    <div className="shell">
      <aside>
        <h1>
          <ShopTitle />
        </h1>
        {n
          .filter(
            (x) =>
              u.role === "ADMIN" ||
              !["Reports", "Employees"].includes(x),
          )
          .map((x) => (
            <NavLink
              key={x}
              to={x === "Dashboard" ? "/" : "/" + x.toLowerCase()}
              end={x === "Dashboard"}
            >
              {x}
            </NavLink>
          ))}
        <button onClick={out}>Sign out</button>
      </aside>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route
            path="/products"
            element={<Products admin={u.role === "ADMIN"} />}
          />
          <Route path="/inventory" element={<InventoryWithSummary />} />
          <Route path="/sales" element={<SalesWithBusinessDate />} />
          <Route path="/reservations" element={<Reservations />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/deliveries" element={<Deliveries />} />
          <Route
            path="/customers"
            element={
              <Resource
                title="Customers"
                url="/customers"
                fields={["name", "phone", "address", "notes"]}
              />
            }
          />
          <Route
            path="/suppliers"
            element={
              <Resource
                title="Suppliers"
                url="/suppliers"
                fields={["name", "phone", "address", "notes"]}
                canCreate={u.role === "ADMIN"}
              />
            }
          />
          <Route
            path="/contacts"
            element={
              <Resource
                title="Contacts"
                url="/contacts"
                fields={["name", "phone", "notes"]}
                canCreate={u.role === "ADMIN"}
              />
            }
          />
          <Route path="/history" element={<History />} />
          <Route path="/reports" element={<ReportsWithPeriods />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/settings" element={<SettingsWithPreferences />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
function App() {
  const [u, su] = useState<O | null>(null),
    [checking, sc] = useState(true);
  useEffect(() => {
    const expire = () => su(null);
    window.addEventListener(authExpiredEvent, expire);
    return () => window.removeEventListener(authExpiredEvent, expire);
  }, []);
  useEffect(() => {
    const restore = async () => {
      if (!tok()) {
        sc(false);
        return;
      }
      try {
        su(await api("/auth/me"));
      } catch {
        delete localStorage.token;
      } finally {
        sc(false);
      }
    };
    void restore();
  }, []);
  if (checking)
    return (
      <main className="login">
        <p>Restoring your session…</p>
      </main>
    );
  return u ? (
    <Shell
      u={u}
      out={() => {
        delete localStorage.token;
        su(null);
      }}
    />
  ) : (
    <Login done={su} />
  );
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ErrorBoundary>,
);
