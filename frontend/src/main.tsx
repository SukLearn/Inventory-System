import React, {
  useEffect as reactUseEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Routes,
  Route,
  useLocation,
  useParams,
} from "react-router-dom";
import "@fontsource/open-sans/latin-400.css";
import "@fontsource/open-sans/latin-500.css";
import "@fontsource/open-sans/latin-600.css";
import "@fontsource/open-sans/latin-700.css";
import logoUrl from "../logo/root_servere.png";
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
          <h1 className="brand">
            <img className="brand-logo" src={logoUrl} alt="" />
            <span>Inventory</span>
          </h1>
          <p className="error">The page could not be displayed.</p>
          <button onClick={() => window.location.reload()}>Reload</button>
        </main>
      );
    return this.props.children;
  }
}

type NumericInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "inputMode" | "pattern" | "step"
> & { integer?: boolean; hideValidationMessage?: boolean };

function NumericInput({
  integer = false,
  hideValidationMessage = true,
  onChange,
  onKeyDown,
  onPaste,
  onDrop,
  onBlur,
  onInvalid,
  value,
  defaultValue,
  min,
  max,
  ...props
}: NumericInputProps) {
  const [validationError, setValidationError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const lastValidValue = useRef(String(value ?? defaultValue ?? ""));
  const editingPattern = integer
    ? /^(?:|0|[1-9]\d*)$/
    : /^(?:|0(?:\.\d*)?|[1-9]\d*(?:\.\d*)?)$/;
  const completePattern = integer
    ? /^(?:0|[1-9]\d*)$/
    : /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
  const htmlPattern = integer
    ? "(?:0|[1-9][0-9]*)"
    : "(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?";
  const formatError = integer
    ? "Enter a whole number without leading zeroes."
    : "Enter a number without leading zeroes, using at most one decimal point.";

  const showError = (element: HTMLInputElement, message = formatError) => {
    element.setCustomValidity(message);
    setValidationError(message);
  };
  const clearError = (element: HTMLInputElement) => {
    element.setCustomValidity("");
    setValidationError("");
  };
  const rangeError = (raw: string) => {
    if (!raw || !completePattern.test(raw)) return "";
    const numericValue = Number(raw);
    const minimum = min === undefined ? undefined : Number(min);
    const maximum = max === undefined ? undefined : Number(max);
    if (
      (minimum !== undefined && numericValue < minimum) ||
      (maximum !== undefined && numericValue > maximum)
    )
      return "Enter a value within the allowed range.";
    return "";
  };

  reactUseEffect(() => {
    if (value !== undefined) lastValidValue.current = String(value ?? "");
    const element = inputRef.current;
    if (!element) return;
    const raw = element.value;
    const message = raw && completePattern.test(raw) ? rangeError(raw) : "";
    if (message) showError(element, message);
    else if (!raw || completePattern.test(raw)) clearError(element);
  }, [value, min, max, integer]);

  return (
    <>
      <input
        ref={inputRef}
        {...props}
        type="text"
        inputMode={integer ? "numeric" : "decimal"}
        pattern={htmlPattern}
        value={value}
        defaultValue={defaultValue}
        aria-invalid={Boolean(validationError)}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey)
            return;
          const key = event.key;
          if (key.length !== 1) return;
          const allowedDigit = /^\d$/.test(key);
          const allowedDecimal =
            !integer && key === "." && !event.currentTarget.value.includes(".");
          if (!allowedDigit && !allowedDecimal) {
            event.preventDefault();
            showError(event.currentTarget);
          } else {
            clearError(event.currentTarget);
          }
        }}
        onPaste={(event) => {
          onPaste?.(event);
          if (event.defaultPrevented) return;
          const pasted = event.clipboardData.getData("text").trim();
          if (!completePattern.test(pasted)) {
            event.preventDefault();
            showError(event.currentTarget);
          }
        }}
        onDrop={(event) => {
          onDrop?.(event);
          if (event.defaultPrevented) return;
          const dropped = event.dataTransfer.getData("text").trim();
          if (!completePattern.test(dropped)) {
            event.preventDefault();
            showError(event.currentTarget);
          }
        }}
        onChange={(event) => {
          const raw = event.currentTarget.value;
          if (!editingPattern.test(raw)) {
            event.currentTarget.value = lastValidValue.current;
            showError(event.currentTarget);
            return;
          }
          lastValidValue.current = raw;
          const boundsMessage = rangeError(raw);
          if (boundsMessage) showError(event.currentTarget, boundsMessage);
          else clearError(event.currentTarget);
          onChange?.(event);
        }}
        onBlur={(event) => {
          const raw = event.currentTarget.value;
          const boundsMessage = rangeError(raw);
          if (raw && !completePattern.test(raw))
            showError(event.currentTarget, formatError);
          else if (boundsMessage) showError(event.currentTarget, boundsMessage);
          else clearError(event.currentTarget);
          onBlur?.(event);
        }}
        onInvalid={(event) => {
          event.preventDefault();
          const element = event.currentTarget;
          const message =
            element.validity.valueMissing
              ? "This numeric field is required."
              : rangeError(element.value) || formatError;
          showError(element, message);
          onInvalid?.(event);
        }}
      />
      {validationError && !hideValidationMessage && (
        <small className="numeric-input-error" role="alert">
          {validationError}
        </small>
      )}
    </>
  );
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
document.title = "Inventory";
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
function Brand() {
  return (
    <span className="brand" data-no-translate>
      <img className="brand-logo" src={logoUrl} alt="" />
      <ShopTitle />
    </span>
  );
}
function CategoryManagement() {
  const [categories, setCategories] = useState<O[]>([]);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const load = () =>
    api("/categories")
      .then(setCategories)
      .catch((error) => setMessage(error.message));
  useEffect(load, []);
  const remove = async (category: O) => {
    if (!confirm(`Delete “${category.name}”? Referenced categories will be archived instead.`))
      return;
    try {
      const result = await api("/categories/" + category.id, {
        method: "DELETE",
      });
      setMessage(
        result.archived
          ? `Category archived because ${result.referencedProducts} product(s) still use it. Reassign those products before permanent deletion.`
          : "Category deleted successfully.",
      );
      void load();
    } catch (error: any) {
      setMessage(error.message);
    }
  };
  return (
    <section className="category-management">
      <button
        type="button"
        className="category-management-toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>Category Management</span>
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="category-management-content">
          <form
            className="inline category-create-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const name = String(new FormData(form).get("name") || "").trim();
              try {
                await api("/categories", {
                  method: "POST",
                  body: JSON.stringify({ name }),
                });
                form.reset();
                setMessage("Category created successfully.");
                void load();
              } catch (error: any) {
                setMessage(error.message);
              }
            }}
          >
            <label>
              Category name
              <input name="name" required />
            </label>
            <button className="form-submit">Create category</button>
          </form>
          {message && <p>{message}</p>}
          <T
            rows={categories}
            cols={[
              ["Category", (category) => category.name],
              ["Products", (category) => category.product_count],
              ["Status", (category) => category.is_active ? "Active" : "Inactive"],
              [
                "Manage",
                (category) => (
                  <form
                    className="category-row-editor"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const name = String(
                        new FormData(event.currentTarget).get("name") || "",
                      ).trim();
                      try {
                        await api("/categories/" + category.id, {
                          method: "PATCH",
                          body: JSON.stringify({ name }),
                        });
                        setMessage("Category renamed successfully.");
                        void load();
                      } catch (error: any) {
                        setMessage(error.message);
                      }
                    }}
                  >
                    <input
                      name="name"
                      defaultValue={category.name}
                      aria-label={`Rename ${category.name}`}
                      required
                    />
                    <button>Save</button>
                    <button type="button" onClick={() => remove(category)}>
                      Delete / archive
                    </button>
                  </form>
                ),
              ],
            ]}
          />
        </div>
      )}
    </section>
  );
}
function SettingsWithPreferences({ admin }: { admin: boolean }) {
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
    document.title = "Inventory";
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
      {admin && <CategoryManagement />}
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
          ["Total Revenue", gel(m.revenue)],
          ["Imported product cost", gel(m.importCost)],
          ["Financial loss", gel(m.lossAmount)],
          ["Returned products", m.returnedQuantity],
          ["Returned / refunded", gel(m.refundedAmount)],
          ["In transit", m.inTransit],
          ["Paid / closed sales", m.paidClosedSales],
          ["Reserved products", m.reservedProducts],
          ["Reserved products total", gel(m.reservedProductsTotal)],
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
      <h3>Supplier Revenue</h3>
      <T
        rows={r.supplierEarnings}
        cols={[
          ["Supplier", (x) => x.supplier_name],
          ["Products sold", (x) => x.quantity],
          ["Revenue", (x) => gel(x.revenue)],
        ]}
      />
    </>
  );
}
function InventoryWithSummary() {
  const [summary, setSummary] = useState<O>(),
    [products, setProducts] = useState<O[]>([]),
    [suppliers, setSuppliers] = useState<O[]>([]),
    [inventoryRows, setInventoryRows] = useState<O[]>([]),
    [actionRows, setActionRows] = useState<O[]>([]),
    [filters, setFilters] = useState<O>({}),
    [errorMessage, setErrorMessage] = useState("");
  const loadPage = () => {
    Promise.all([
      api("/inventory/summary"),
      api("/products"),
      api("/suppliers"),
      api("/inventory/movements"),
    ])
      .then(([nextSummary, productRows, supplierRows, movementRows]) => {
        setSummary(nextSummary);
        setProducts(productRows);
        setSuppliers(supplierRows);
        setActionRows(movementRows);
      })
      .catch((error) => setErrorMessage(error.message));
  };
  const loadInventoryTable = () => {
    const q = new URLSearchParams(
      Object.entries(filters).filter(([, v]) => v) as [string, string][],
    ).toString();
    api("/inventory/products?" + q)
      .then((rows) =>
        setInventoryRows(
          rows.map((row: O, displayId: number) => ({
            ...row,
            display_id: displayId,
          })),
        ),
      )
      .catch((error) => setErrorMessage(error.message));
  };
  const reload = () => {
    loadPage();
    loadInventoryTable();
  };
  useEffect(loadPage, []);
  useEffect(loadInventoryTable, [
    filters.productId,
    filters.supplierId,
    filters.type,
    filters.status,
    filters.from,
    filters.to,
  ]);
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
      {errorMessage && <p className="error">{errorMessage}</p>}
      <h3>Inventory records</h3>
      <T
        rows={inventoryRows}
        cols={[
          [
            "ID",
            (row) => (
              <Link className="inventory-id-link" to={`/inventory/${row.id}`}>
                {row.display_id}
              </Link>
            ),
            (row) => row.display_id,
          ],
          ["Supplier", (row) => row.supplier_name || "—"],
          ["Product", (row) => row.product_name],
          ["Quantity", (row) => row.quantity],
          [
            "Purchase Cost",
            (row) =>
              row.stored_purchase_cost == null
                ? "—"
                : gel(row.stored_purchase_cost),
          ],
          ["Notes", (row) => <NoteButton note={row.notes} label="View" />],
        ]}
      />
      <Inventory
        products={products}
        showTitle={false}
        showHistory={false}
        onChanged={reload}
      />
      <h3>Inventory actions</h3>
      <MovementTable
        rows={actionRows}
        reload={reload}
        allowDelete
        showEmployee={false}
      />
    </>
  );
}
function InventoryDetail({ admin }: { admin: boolean }) {
  const { id: productId } = useParams();
  const [product, setProduct] = useState<O>();
  const [categories, setCategories] = useState<O[]>([]);
  const [suppliers, setSuppliers] = useState<O[]>([]);
  const [activity, setActivity] = useState<O[]>([]);
  const [message, setMessage] = useState("");
  const load = () => {
    if (!productId) return;
    return Promise.all([
      api("/products/" + productId),
      api("/categories"),
      api("/suppliers"),
      api("/inventory/products/" + productId + "/activity"),
    ])
      .then(([details, categoryRows, supplierRows, activityRows]) => {
        setProduct(details);
        setCategories(categoryRows);
        setSuppliers(supplierRows);
        setActivity(activityRows);
      })
      .catch((error) => setMessage(error.message));
  };
  useEffect(load, [productId]);
  return (
    <>
      <h2>Inventory details</h2>
      {message && (
        <p className={message.includes("success") ? "" : "error"}>
          {message}
        </p>
      )}
      {!product && !message && <p>Loading…</p>}
      {product && (
        <form
          className="inventory-detail-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!admin || !productId) return;
            const values = new FormData(event.currentTarget);
            try {
              const updated = await api("/products/" + productId, {
                method: "PATCH",
                body: JSON.stringify({
                  name: values.get("name"),
                  categoryId: values.get("categoryId"),
                  supplierId: values.get("supplierId"),
                  width: values.get("width") ? +values.get("width")! : null,
                  height: values.get("height") ? +values.get("height")! : null,
                  depth: values.get("depth") ? +values.get("depth")! : null,
                  material: values.get("material") || null,
                  color: values.get("color") || null,
                  purchasePrice: +values.get("purchasePrice")!,
                  sellingPrice: +values.get("sellingPrice")!,
                  description: values.get("notes") || null,
                }),
              });
              setProduct({ ...product, ...updated });
              await load();
              setMessage("Inventory details saved successfully.");
            } catch (error: any) {
              setMessage(error.message);
            }
          }}
        >
          <label>
            Product name
            <input name="name" defaultValue={product.name} disabled={!admin} required />
          </label>
          <label>
            Category
            <select
              name="categoryId"
              defaultValue={product.category_id || ""}
              disabled={!admin}
              required
            >
              <option value="" disabled>Select category</option>
              {categories
                .filter(
                  (category) =>
                    category.is_active || category.id === product.category_id,
                )
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Supplier
            <select
              name="supplierId"
              defaultValue={product.supplier_id || ""}
              disabled={!admin}
              required
            >
              <option value="" disabled>Select supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
          {[["width", "Width"], ["height", "Height"], ["depth", "Depth"]].map(
            ([name, label]) => (
              <label key={name}>
                {label}
                <NumericInput
                  name={name}
                  min="0"
                  defaultValue={product[name] ?? ""}
                  disabled={!admin}
                />
              </label>
            ),
          )}
          <label>
            Material
            <input name="material" defaultValue={product.material || ""} disabled={!admin} />
          </label>
          <label>
            Color
            <input name="color" defaultValue={product.color || ""} disabled={!admin} />
          </label>
          <label>
            Purchase cost
            <NumericInput name="purchasePrice" min="0" defaultValue={product.purchase_price} disabled={!admin} required />
          </label>
          <label>
            Selling price
            <NumericInput name="sellingPrice" min="0" defaultValue={product.selling_price} disabled={!admin} required />
          </label>
          <label>
            Current quantity
            <input value={product.current_quantity} readOnly   />
          </label>
          <label>
            Reserved quantity
            <input value={product.reserved_quantity} readOnly />
          </label>
          <label>
            Last imported date
            <input value={product.last_import_date ? dt(product.last_import_date) : ""} readOnly />
          </label>
          <label>
            Last sale date
            <input value={product.last_sale_date ? dt(product.last_sale_date) : ""} readOnly />
          </label>
          <label className="inventory-detail-notes">
            Notes
            <textarea name="notes" defaultValue={product.description || ""} disabled={!admin} />
          </label>
          {admin && <button className="form-submit">Save</button>}
        </form>
      )}
      <h3>Product activity</h3>
      <T
        rows={activity}
        cols={[
          ["Date", (row) => dt(row.occurred_at)],
          ["Type", (row) => <StatusValue value={row.type} />],
          ["Status", (row) => row.status || "—"],
          ["Quantity", (row) => row.quantity ?? "—"],
          ["Price", (row) => row.price == null ? "—" : gel(row.price)],
          ["Customer", (row) => row.customer_name || "—"],
          ["Supplier", (row) => row.supplier_name || "—"],
          ["Sale ID", (row) => row.sale_number || "—"],
          ["Changes", (row) => <ChangeButton activity={row} />],
          ["Notes", (row) => <NoteButton note={row.notes} label="View" />],
        ]}
      />
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
          <option value="ALL">All</option>
          <option value="READY">READY</option>
          <option value="IN_TRANSIT">IN_TRANSIT</option>
          <option value="DELIVERED">Delivered</option>
        </select>
      </label>
      {e && <p className="error">{e}</p>}
      <T
        rows={rows}
        initialPageSize={5}
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
          [
            "Action",
            (x) => (
              <PaidEditor sale={x} reload={load} hideValidationMessage />
            ),
          ],
        ]}
      />
    </>
  );
}
function SalesWithBusinessDate() {
  const [p, sp] = useState<O[]>([]),
    [customers, setCustomers] = useState<O[]>([]),
    [r, sr] = useState<O[]>([]),
    [e, se] = useState(""),
    [productId, setProductId] = useState(""),
    [quantity, setQuantity] = useState("1"),
    [discount, setDiscount] = useState("0");
  const load = () => {
    Promise.all([api("/products"), api("/customers"), api("/sales")])
      .then(([products, customerRows, sales]) => {
        sp(products);
        setCustomers(customerRows);
        sr(sales);
      })
      .catch((x) => se(x.message));
  };
  useEffect(load, []);
  const product = p.find((item) => item.id === productId);
  const regularPrice = +(product?.selling_price || 0);
  const discountAmount = +discount || 0;
  const finalPrice = Math.max(0, regularPrice - discountAmount);
  const saleTotal = finalPrice * (+quantity || 0);
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
                customerId: f.get("customerId") || null,
                items: [
                  {
                    productId: f.get("productId"),
                    quantity: +f.get("quantity")!,
                    discountAmount: +f.get("discount")!,
                  },
                ],
                payments: f.get("paid")
                  ? [{ method: f.get("method"), amount: +f.get("paid")! }]
                  : [],
                notes: f.get("notes"),
              }),
            });
            form.reset();
            setProductId("");
            setQuantity("1");
            setDiscount("0");
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
          Customer
          <select name="customerId">
            <option value="">Walk-in customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Product
          <select
            name="productId"
            value={productId}
            onChange={(event) => {
              setProductId(event.target.value);
              setDiscount("0");
            }}
            required
          >
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
          <NumericInput
            name="quantity"
            integer
            min="1"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            required
          />
        </label>
        <label>
          Regular unit price
          <input value={regularPrice} readOnly disabled />
        </label>
        <label>
          Customer discount per unit
          <NumericInput
            name="discount"
            min="0"
            max={regularPrice}
            value={discount}
            onChange={(event) => setDiscount(event.target.value)}
            required
          />
        </label>
        <p className="form-calculation">
          Final unit price: <b>{gel(finalPrice)}</b><br />
          Sale total: <b>{gel(saleTotal)}</b>
        </p>
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
          <NumericInput
            name="paid"
            min="0"
            hideValidationMessage
          />
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
        initialPageSize={10}
        cols={[
          [
            "ID",
            (x) => (
              <Link
                className="inventory-id-link"
                to={`/sales/${x.sale_number}`}
              >
                {x.sale_number}
              </Link>
            ),
            (x) => +x.sale_number,
          ],
          ["Sale date", (x) => dt(x.business_date || x.created_at)],
          ["Customer", (x) => x.customer_name || "Walk-in customer"],
          [
            "Product",
            (x) =>
              (x.items || [])
                .map((a: any) => a.name + " x " + a.quantity)
                .join(", "),
          ],
          [
            "Costed",
            (x) =>
              (x.items || [])
                .map((a: any) => gel(+a.costPrice * a.quantity))
                .join(", "),
          ],
          ["Sold", (x) => gel(x.total)],
          ["Discount", (x) => gel(x.discount_total)],
          ["Total", (x) => gel(x.total)],
          [
            "Paid",
            (x) => (
              <PaidEditor sale={x} reload={load} hideValidationMessage />
            ),
          ],
          ["Remaining", (x) => (+x.remaining === 0 ? "None" : gel(x.remaining))],
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
function SaleDetail() {
  const { id: saleReference } = useParams();
  const [sale, setSale] = useState<O>();
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!saleReference) return;
    setSale(undefined);
    setMessage("");
    api("/sales/" + encodeURIComponent(saleReference))
      .then(setSale)
      .catch((error) => setMessage(error.message));
  }, [saleReference]);
  if (!sale)
    return (
      <>
        <h2>Sale details</h2>
        <p className={message ? "error" : ""}>{message || "Loading…"}</p>
      </>
    );
  const paymentMethods = [
    ...new Set((sale.payments || []).map((payment: O) => payment.method)),
  ].join(", ");
  const deliveryDate = sale.delivered_at || sale.delivery_date;
  return (
    <>
      <h2>Sale #{sale.sale_number}</h2>
      <section className="cards sale-detail-cards">
        {[
          ["Total", gel(sale.total)],
          ["Discount", gel(sale.discount_total)],
          ["Paid", gel(sale.paid)],
          ["Remaining", +sale.remaining === 0 ? "None" : gel(sale.remaining)],
          ["Payment status", sale.paymentStatus],
          ["Returned value", gel(sale.returnedValue)],
          ["Refunded", gel(sale.refunded)],
        ].map(([label, value]) => (
          <div className="card" key={String(label)}>
            <small>{label}</small>
            <strong>{value}</strong>
          </div>
        ))}
      </section>
      <dl className="sale-detail-summary">
        <div>
          <dt>Sale ID</dt>
          <dd>{sale.sale_number}</dd>
        </div>
        <div>
          <dt>Date</dt>
          <dd>{dt(sale.business_date || sale.created_at)}</dd>
        </div>
        <div>
          <dt>Customer</dt>
          <dd>
            {sale.customer_name
              ? [sale.customer_name, sale.customer_surname]
                  .filter(Boolean)
                  .join(" ")
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Customer ID</dt>
          <dd>
            {sale.customer_id ? (
              <Link to={`/customers/${sale.customer_id}`}>
                {sale.customer_id}
              </Link>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt>Employee</dt>
          <dd>{sale.employee_name || "—"}</dd>
        </div>
        <div>
          <dt>Payment method</dt>
          <dd>{paymentMethods || "—"}</dd>
        </div>
        <div>
          <dt>Delivery status</dt>
          <dd>{sale.delivery_status || "—"}</dd>
        </div>
        <div>
          <dt>Delivery address</dt>
          <dd>{sale.delivery_address || "—"}</dd>
        </div>
        <div>
          <dt>Delivery date</dt>
          <dd>{deliveryDate ? dt(deliveryDate) : "—"}</dd>
        </div>
        <div>
          <dt>Notes</dt>
          <dd>
            <NoteButton note={sale.notes} label="View" />
          </dd>
        </div>
      </dl>
      <h3>Products</h3>
      <T
        rows={sale.items || []}
        cols={[
          ["Product", (item) => item.product_name],
          [
            "Product ID",
            (item) => (
              <Link to={`/inventory/${item.product_id}`}>
                {item.product_id}
              </Link>
            ),
          ],
          ["Supplier", (item) => item.supplier_name || "—"],
          ["Quantity", (item) => item.quantity],
          ["Returned", (item) => +item.returned_quantity || "—"],
          ["Original unit price", (item) => gel(item.regular_unit_price)],
          ["Final unit price", (item) => gel(item.final_unit_price)],
          ["Discount per unit", (item) => gel(item.discount_amount)],
          [
            "Discount total",
            (item) => gel(+item.discount_amount * +item.quantity),
          ],
          ["Purchase cost per unit", (item) => gel(item.cost_price)],
          ["Cost total", (item) => gel(+item.cost_price * +item.quantity)],
          ["Total", (item) => gel(item.line_total)],
        ]}
      />
      <h3>Payments</h3>
      <T
        rows={sale.payments || []}
        cols={[
          ["Date", (payment) => dt(payment.created_at)],
          ["Payment method", (payment) => payment.method],
          ["Amount", (payment) => gel(payment.amount)],
        ]}
      />
      <h3>Returns</h3>
      <T
        rows={sale.returns || []}
        cols={[
          [
            "Date",
            (returned) => dt(returned.business_date || returned.created_at),
          ],
          ["Product", (returned) => returned.product_name],
          ["Quantity", (returned) => returned.quantity],
          [
            "Returned value",
            (returned) => gel(+returned.quantity * +returned.final_unit_price),
          ],
          ["Employee", (returned) => returned.employee_name || "—"],
          [
            "Notes",
            (returned) => <NoteButton note={returned.notes} label="View" />,
          ],
        ]}
      />
      <h3>Refunds</h3>
      <T
        rows={sale.refunds || []}
        cols={[
          ["Date", (refund) => dt(refund.created_at)],
          ["Product", (refund) => refund.product_name],
          ["Amount", (refund) => gel(refund.amount)],
          ["Employee", (refund) => refund.employee_name || "—"],
          [
            "Reason",
            (refund) => <NoteButton note={refund.reason} label="View" />,
          ],
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
const gelFormatter = new Intl.NumberFormat("en-GE", {
  style: "currency",
  currency: "GEL",
});
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Tbilisi",
});
const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Tbilisi",
});
const datePartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Tbilisi",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const gel = (n: any) => gelFormatter.format(+n || 0);
const dt = (v: any) =>
  v ? dateFormatter.format(new Date(v)) : "—";
const dtt = (v: any) =>
  v ? dateTimeFormatter.format(new Date(v)) : "—";
const today = (date: Date | string | number = new Date()) => {
  const parts = datePartsFormatter.formatToParts(new Date(date));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};
const reservationExpiryIso = (value: FormDataEntryValue | null) =>
  value
    ? new Date(`${String(value)}T23:59:59.999+04:00`).toISOString()
    : null;
function T({
  rows,
  cols,
  initialPageSize = 20,
}: {
  rows: O[];
  cols: [
    string,
    (x: O, index: number) => any,
    ((x: O) => string | number | null | undefined)?,
  ][];
  initialPageSize?: 5 | 10 | 20 | 50 | 100;
}) {
  const [sort, setSort] = useState<{ index: number; direction: 1 | -1 } | null>(
    null,
  );
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [rows]);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const value = (row: O) => {
      const rendered = cols[sort.index][2]
        ? cols[sort.index][2]!(row)
        : cols[sort.index][1](row, 0);
      return typeof rendered === "number"
        ? rendered
        : typeof rendered === "string"
          ? rendered.toLowerCase()
          : "";
    };
    return [...rows].sort((a, b) => {
      const av = value(a),
        bv = value(b);
      return (
        (typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv))) * sort.direction
      );
    });
  }, [rows, cols, sort]);
  const toggle = (index: number) => {
    setPage(1);
    setSort((s) =>
      s?.index === index
        ? { index, direction: s.direction === 1 ? -1 : 1 }
        : { index, direction: 1 },
    );
  };
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const firstRow = (currentPage - 1) * pageSize;
  const visibleRows = sorted.slice(firstRow, firstRow + pageSize);
  const pageItems: Array<number | string> =
    pageCount <= 7
      ? Array.from({ length: pageCount }, (_, index) => index + 1)
      : currentPage <= 4
        ? [1, 2, 3, 4, 5, "ellipsis-end", pageCount]
        : currentPage >= pageCount - 3
          ? [
              1,
              "ellipsis-start",
              pageCount - 4,
              pageCount - 3,
              pageCount - 2,
              pageCount - 1,
              pageCount,
            ]
          : [
              1,
              "ellipsis-start",
              currentPage - 1,
              currentPage,
              currentPage + 1,
              "ellipsis-end",
              pageCount,
            ];
  return (
    <section className="data-table">
      <label className="table-record-limit">
        Show records
        <select
          value={pageSize}
          onChange={(event) => {
            setPageSize(+event.target.value as 5 | 10 | 20 | 50 | 100);
            setPage(1);
          }}
        >
          {[5, 10, 20, 50, 100].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
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
          {visibleRows.map((x, index) => (
            <tr key={x.id || firstRow + index}>
              {cols.map((c) => (
                <td key={c[0]}>{c[1](x, firstRow + index)}</td>
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
      {pageCount > 1 && (
        <nav className="table-pagination" aria-label="Table pagination">
          <span>
            Showing {firstRow + 1}-
            {Math.min(firstRow + pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="table-pagination-buttons">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </button>
            {pageItems.map((item) =>
              typeof item === "number" ? (
                <button
                  type="button"
                  className={item === currentPage ? "is-current" : ""}
                  aria-current={item === currentPage ? "page" : undefined}
                  key={item}
                  onClick={() => setPage(item)}
                >
                  {item}
                </button>
              ) : (
                <span className="table-pagination-ellipsis" key={item}>
                  …
                </span>
              ),
            )}
            <button
              type="button"
              disabled={currentPage === pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          </div>
        </nav>
      )}
    </section>
  );
}
function NoteButton({
  note,
  label = "View",
}: {
  note?: string | null;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!note) return <>—</>;
  return (
    <>
      <button className="note-button" onClick={() => setOpen(true)}>
        {label}
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
const historyLabel = (value: string) =>
  value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
const historyValue = (value: any): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(historyValue).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};
function HistoryDetailsButton({ row }: { row: O }) {
  const [open, setOpen] = useState(false);
  const details: [string, string][] = [
    ["Date and time", dtt(row.created_at)],
    ["Action", row.type || "—"],
    ["Status", row.status || "—"],
    ["Product", row.product_name || "—"],
    [
      "Quantity",
      row.quantity == null
        ? "—"
        : `${row.quantity > 0 ? "+" : ""}${row.quantity}`,
    ],
    [
      "Purchase cost",
      row.purchase_price == null ? "—" : gel(row.purchase_price),
    ],
    [
      "Selling price",
      row.sale_selling_price == null ? "—" : gel(row.sale_selling_price),
    ],
    ["Supplier", row.supplier_name || "—"],
    ["Customer", row.customer_name || "—"],
    ["Employee", row.employee_name || "—"],
    ["Sale ID", row.sale_number == null ? "—" : String(row.sale_number)],
  ];
  if (row.entity_type)
    details.push(["Record type", historyLabel(row.entity_type)]);
  if (row.target_name || row.audit_details?.name)
    details.push([
      "Record",
      historyValue(row.target_name || row.audit_details?.name),
    ]);
  if (row.field_name) details.push(["Field changed", row.field_name]);
  if (row.old_value != null) details.push(["Old value", row.old_value]);
  if (row.new_value != null) details.push(["New value", row.new_value]);
  if (row.deleted_by_name)
    details.push(["Reversed by", row.deleted_by_name]);
  if (row.deletion_reason)
    details.push(["Reversal reason", row.deletion_reason]);
  if (row.notes) details.push(["Notes", row.notes]);
  const auditDetails = row.audit_details || {};
  Object.entries(auditDetails).forEach(([key, value]) => {
    if (key === "changes" && value && typeof value === "object") {
      Object.entries(value as O).forEach(([field, change]: [string, any]) => {
        details.push([
          `${historyLabel(field)}: old value`,
          historyValue(change?.oldValue),
        ]);
        details.push([
          `${historyLabel(field)}: new value`,
          historyValue(change?.newValue),
        ]);
      });
      return;
    }
    if (key === "notes" && row.notes === value) return;
    details.push([historyLabel(key), historyValue(value)]);
  });
  return (
    <>
      <button className="note-button" type="button" onClick={() => setOpen(true)}>
        View
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="modal history-details-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>History details</h3>
            <dl className="change-details">
              {details.map(([label, value], index) => (
                <div key={`${label}-${index}`}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <button type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
function ChangeButton({ activity }: { activity: O }) {
  const [open, setOpen] = useState(false);
  const isChange =
    activity.status === "CHANGED" ||
    activity.type === "CHANGED" ||
    String(activity.type || "").endsWith("_CHANGED");
  if (!isChange) return <>—</>;
  const title = String(activity.type || activity.field_name || "Changed")
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return (
    <>
      <button className="note-button" onClick={() => setOpen(true)}>
        Changes
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal change-modal" onClick={(event) => event.stopPropagation()}>
            <h3>{title}</h3>
            <dl className="change-details">
              <div>
                <dt>Field changed</dt>
                <dd>{activity.field_name || "—"}</dd>
              </div>
              <div>
                <dt>Old value</dt>
                <dd>{activity.old_value ?? "—"}</dd>
              </div>
              <div>
                <dt>New value</dt>
                <dd>{activity.new_value ?? "—"}</dd>
              </div>
              <div>
                <dt>Changed by</dt>
                <dd>{activity.user_name || "—"}</dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{dt(activity.occurred_at)}</dd>
              </div>
            </dl>
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
        <Brand />
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
    ["Reserved products total", gel(d.reserved_total)],
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
// Backend image support remains enabled; flip this flag when the image UI is ready.
const productImageUiEnabled = false;
function ProductDetails({
  productId,
  admin,
  categories,
  suppliers,
  close,
  reload,
}: {
  productId: string;
  admin: boolean;
  categories: O[];
  suppliers: O[];
  close: () => void;
  reload: () => void;
}) {
  const [product, setProduct] = useState<O>();
  const [message, setMessage] = useState("");
  const load = () =>
    api("/products/" + productId)
      .then(setProduct)
      .catch((error) => setMessage(error.message));
  useEffect(load, [productId]);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [close]);
  const removeImage = async (imageId: string) => {
    try {
      await api("/product-images/" + imageId, { method: "DELETE" });
      await load();
      reload();
    } catch (error: any) {
      setMessage(error.message);
    }
  };
  const makePrimary = async (imageId: string) => {
    try {
      await api("/product-images/" + imageId + "/primary", {
        method: "POST",
      });
      await load();
      reload();
    } catch (error: any) {
      setMessage(error.message);
    }
  };
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="modal product-details-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <h3>Product details</h3>
          <button className="mobile-modal-close" type="button" onClick={close}>
            Close
          </button>
        </div>
        {!product && !message && <p>Loading…</p>}
        {message && <p className="error">{message}</p>}
        {product && (
          <>
            <section className="cards product-detail-cards">
              {[
                ["Physical Stock", product.current_quantity],
                ["Reserved", product.reserved_quantity],
                ["Available", product.available_quantity],
              ].map(([label, value]) => (
                <div className="card" key={String(label)}>
                  <small>{label}</small>
                  <strong>{value}</strong>
                </div>
              ))}
            </section>
            <form
              className="product-details-form"
              onSubmit={async (event) => {
                event.preventDefault();
                const values = new FormData(event.currentTarget);
                try {
                  const updated = await api("/products/" + productId, {
                    method: "PATCH",
                    body: JSON.stringify({
                      name: values.get("name"),
                      categoryId: values.get("categoryId") || null,
                      supplierId: values.get("supplierId") || null,
                      description: values.get("description") || null,
                      purchasePrice: +values.get("purchasePrice")!,
                      sellingPrice: +values.get("sellingPrice")!,
                      width: values.get("width") ? +values.get("width")! : null,
                      height: values.get("height") ? +values.get("height")! : null,
                      depth: values.get("depth") ? +values.get("depth")! : null,
                      material: values.get("material") || null,
                      color: values.get("color") || null,
                      isActive: values.get("isActive") === "on",
                    }),
                  });
                  setProduct({ ...product, ...updated });
                  setMessage("Product details saved successfully.");
                  reload();
                } catch (error: any) {
                  setMessage(error.message);
                }
              }}
            >
              <label>
                Product name
                <input name="name" defaultValue={product.name} required disabled={!admin} />
              </label>
              <label>
                Category
                <select
                  name="categoryId"
                  defaultValue={product.category_id || ""}
                  disabled={!admin}
                  required
                >
                  <option value="" disabled>Select category</option>
                  {categories
                    .filter(
                      (category) =>
                        category.is_active || category.id === product.category_id,
                    )
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Supplier
                <select
                  name="supplierId"
                  defaultValue={product.supplier_id || ""}
                  disabled={!admin}
                  required
                >
                  <option value="" disabled>Select supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Purchase cost
                <NumericInput name="purchasePrice" min="0" defaultValue={product.purchase_price} required disabled={!admin} />
              </label>
              <label>
                Selling price
                <NumericInput name="sellingPrice" min="0" defaultValue={product.selling_price} required disabled={!admin} />
              </label>
              {[["width", "Width"], ["height", "Height"], ["depth", "Depth"]].map(([name, label]) => (
                <label key={name}>
                  {label}
                  <NumericInput name={name} min="0" defaultValue={product[name] ?? ""} disabled={!admin} />
                </label>
              ))}
              <label>
                Material
                <input name="material" defaultValue={product.material || ""} disabled={!admin} />
              </label>
              <label>
                Color
                <input name="color" defaultValue={product.color || ""} disabled={!admin} />
              </label>
              <label className="details-description">
                Description
                <textarea name="description" defaultValue={product.description || ""} disabled={!admin} />
              </label>
              {admin && (
                <label className="checkbox-label">
                  <input
                    name="isActive"
                    type="checkbox"
                    defaultChecked={product.is_active}
                    disabled={product.has_history && !product.is_active}
                  />
                  {product.has_history && !product.is_active
                    ? "Archived product (history retained)"
                    : "Active product"}
                </label>
              )}
              {admin && <button className="form-submit">Save details</button>}
            </form>
            {productImageUiEnabled && (
              <>
                <h3>Product images</h3>
                <div className="product-gallery">
                  {(product.images || []).map((image: O) => (
                    <figure key={image.id}>
                      <img src={"/uploads/" + image.storage_path} alt={product.name} />
                      <figcaption>{image.is_primary ? "Primary image" : image.filename}</figcaption>
                      {admin && (
                        <div className="toolbar">
                          {!image.is_primary && <button type="button" onClick={() => makePrimary(image.id)}>Make primary</button>}
                          <button type="button" onClick={() => removeImage(image.id)}>Delete image</button>
                        </div>
                      )}
                    </figure>
                  ))}
                  {!product.images?.length && <p>No product images.</p>}
                </div>
                {admin && (
                  <label className="image-upload">
                    Add image (JPG, PNG or WebP; maximum 5)
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={(product.images || []).length >= 5}
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const body = new FormData();
                        body.append("image", file);
                        try {
                          await api("/products/" + productId + "/images", { method: "POST", body });
                          event.target.value = "";
                          await load();
                          reload();
                        } catch (error: any) {
                          setMessage(error.message);
                        }
                      }}
                    />
                  </label>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
function Products({ admin }: { admin: boolean }) {
  const [r, sr] = useState<O[]>([]),
    [e, se] = useState(""),
    [selectedProductId, setSelectedProductId] = useState<string>(),
    [categories, setCategories] = useState<O[]>([]),
    [suppliers, setSuppliers] = useState<O[]>([]),
    [filters, setFilters] = useState({
      categoryId: "",
      supplierId: "",
      minPrice: "",
      maxPrice: "",
    });
  const load = () => {
    const query = new URLSearchParams({ status: "all" });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    return api("/products?" + query)
      .then((rows) => {
        sr(
          rows.map((product: O, displayId: number) => ({
            ...product,
            display_id: displayId,
          })),
        );
        se("");
      })
      .catch((x) => se(x.message));
  };
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
  useEffect(() => {
    Promise.all([api("/categories"), api("/suppliers")])
      .then(([categoryRows, supplierRows]) => {
        setCategories(categoryRows);
        setSuppliers(supplierRows);
      })
      .catch((error) => se(error.message));
  }, []);
  useEffect(load, [
    filters.categoryId,
    filters.supplierId,
    filters.minPrice,
    filters.maxPrice,
  ]);
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
                  categoryId: f.get("categoryId"),
                  supplierId: f.get("supplierId"),
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
            Category
            <select name="categoryId" defaultValue="" required>
              <option value="" disabled>Select category</option>
              {categories
                .filter((category) => category.is_active)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Supplier
            <select name="supplierId" defaultValue="" required>
              <option value="" disabled>Select supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Selling price
            <NumericInput name="price" min="0" required />
          </label>
          <label>
            Purchase cost
            <NumericInput
              name="cost"
              min="0"
              defaultValue="0"
            />
          </label>
          <button className="form-submit">Add product</button>
        </form>
      )}
      <form className="product-filters" onSubmit={(event) => event.preventDefault()}>
        <label>
          Category
          <select
            value={filters.categoryId}
            onChange={(event) =>
              setFilters({ ...filters, categoryId: event.target.value })
            }
          >
            <option value="">All</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Supplier
          <select
            value={filters.supplierId}
            onChange={(event) =>
              setFilters({ ...filters, supplierId: event.target.value })
            }
          >
            <option value="">All</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Minimum price
          <NumericInput
            min="0"
            value={filters.minPrice}
            onChange={(event) =>
              setFilters({ ...filters, minPrice: event.target.value })
            }
          />
        </label>
        <label>
          Maximum price
          <NumericInput
            min="0"
            value={filters.maxPrice}
            onChange={(event) =>
              setFilters({ ...filters, maxPrice: event.target.value })
            }
          />
        </label>
        <button
          type="button"
          onClick={() =>
            setFilters({
              categoryId: "",
              supplierId: "",
              minPrice: "",
              maxPrice: "",
            })
          }
        >
          Clear filters
        </button>
      </form>
      {e && <p className="error">{e}</p>}
      {selectedProductId && (
        <ProductDetails
          productId={selectedProductId}
          admin={admin}
          categories={categories}
          suppliers={suppliers}
          close={() => setSelectedProductId(undefined)}
          reload={load}
        />
      )}
      <T
        rows={r}
        cols={[
          [
            "ID",
            (product) => (
              <Link
                className="inventory-id-link"
                to={`/inventory/${product.id}`}
              >
                {product.display_id}
              </Link>
            ),
            (product) => product.display_id,
          ],
          ["Name", (x) => x.name],
          ["Category", (x) => x.category_name || "—"],
          ["Supplier", (x) => x.supplier_name || "—"],
          ["In stock", (x) => x.current_quantity],
          ["Reserved", (x) => x.reserved_quantity],
          ["Available now", (x) => x.available_quantity],
          ["Purchase cost", (x) => gel(x.purchase_price)],
          ["Selling price", (x) => gel(x.selling_price)],
          ["Status", (x) => (x.is_active ? "Active" : "Inactive")],
          [
            "Action",
            (x) =>
              <div className="toolbar">
                <button onClick={() => setSelectedProductId(x.id)}>Details</button>
                {admin && (x.is_active || !x.has_history) && (
                  <button onClick={() => remove(x)}>
                    {x.is_active ? "Delete / archive" : "Delete"}
                  </button>
                )}
              </div>,
          ],
        ]}
      />
    </>
  );
}
function CustomerChangesButton({ changes }: { changes: O[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="note-button customer-changes-button"
        type="button"
        onClick={() => setOpen(true)}
      >
        Changes
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="modal customer-changes-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Customer modification history</h3>
            {changes.map((change) => (
              <section className="customer-change-record" key={change.id}>
                <h4>{historyLabel(change.type)}</h4>
                <dl className="change-details">
                  <div>
                    <dt>Field changed</dt>
                    <dd>{historyLabel(change.field_name || "—")}</dd>
                  </div>
                  <div>
                    <dt>Old value</dt>
                    <dd>{historyValue(change.old_value)}</dd>
                  </div>
                  <div>
                    <dt>New value</dt>
                    <dd>{historyValue(change.new_value)}</dd>
                  </div>
                  <div>
                    <dt>Changed by</dt>
                    <dd>{change.user_name || "—"}</dd>
                  </div>
                  <div>
                    <dt>Date</dt>
                    <dd>{dtt(change.occurred_at)}</dd>
                  </div>
                </dl>
              </section>
            ))}
            {!changes.length && <p>No customer changes recorded.</p>}
            <button type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
function CustomersPage() {
  const [customers, setCustomers] = useState<O[]>([]),
    [message, setMessage] = useState("");
  const load = () =>
    api("/customers")
      .then((rows) => {
        setCustomers(
          [...rows]
            .sort((a, b) => {
              const createdDifference =
                new Date(a.created_at).getTime() -
                new Date(b.created_at).getTime();
              return createdDifference || String(a.id).localeCompare(String(b.id));
            })
            .map((customer, displayId) => ({
              ...customer,
              display_id: displayId,
            })),
        );
        setMessage("");
      })
      .catch((error) => setMessage(error.message));
  useEffect(load, []);
  return (
    <>
      <h2>Customers</h2>
      <form
        className="inline customer-create-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const values = new FormData(form);
          try {
            await api("/customers", {
              method: "POST",
              body: JSON.stringify({
                name: values.get("name"),
                surname: values.get("surname") || null,
                address: values.get("address") || null,
                phone: values.get("phone") || null,
                nationality: values.get("nationality") || null,
                notes: values.get("notes") || null,
              }),
            });
            form.reset();
            void load();
          } catch (error: any) {
            setMessage(error.message);
          }
        }}
      >
        <label>
          Name
          <input name="name" required />
        </label>
        <label>
          Surname (optional)
          <input name="surname" />
        </label>
        <label>
          Address
          <input name="address" />
        </label>
        <label>
          Phone
          <input name="phone" />
        </label>
        <label>
          Nationality (optional)
          <input name="nationality" />
        </label>
        <label>
          Notes
          <input name="notes" />
        </label>
        <button className="form-submit">Add Customer</button>
      </form>
      {message && <p className="error">{message}</p>}
      <T
        rows={customers}
        initialPageSize={20}
        cols={[
          [
            "ID",
            (customer) => (
              <Link
                className="inventory-id-link"
                to={`/customers/${customer.id}`}
              >
                {customer.display_id}
              </Link>
            ),
            (customer) => customer.display_id,
          ],
          ["Name", (customer) => customer.name],
          ["Surname", (customer) => customer.surname || "—"],
          ["Phone", (customer) => customer.phone || "—"],
          ["Address", (customer) => customer.address || "—"],
          ["Nationality", (customer) => customer.nationality || "—"],
          ["Notes", (customer) => <NoteButton note={customer.notes} />],
        ]}
      />
    </>
  );
}
function CustomerDetail() {
  const { id: customerId } = useParams();
  const [details, setDetails] = useState<O>();
  const [message, setMessage] = useState("");
  const load = () => {
    if (!customerId) return;
    return api("/customers/" + customerId + "/history")
      .then((result) => {
        setDetails(result);
        setMessage("");
      })
      .catch((error) => setMessage(error.message));
  };
  useEffect(load, [customerId]);
  if (!details)
    return (
      <>
        <h2>Customer details</h2>
        <p className={message ? "error" : ""}>{message || "Loading…"}</p>
      </>
    );
  const customer = details.customer;
  const statistics = details.statistics;
  return (
    <>
      <h2>Customer details</h2>
      <div className="customer-detail-layout">
        <div className="customer-change-panel">
          <CustomerChangesButton changes={details.changes || []} />
        </div>
        <div className="customer-detail-content">
          <section className="cards customer-statistics">
            {[
              ["Total amount spent", gel(statistics.totalSpent)],
              ["Total discount received", gel(statistics.totalDiscount)],
              ["Outstanding debt", gel(statistics.outstandingDebt)],
              [
                "Active reservation balance",
                gel(statistics.activeReservationBalance),
              ],
              [
                "Last purchase date",
                statistics.lastPurchaseDate
                  ? dt(statistics.lastPurchaseDate)
                  : "—",
              ],
              ["Last purchased item", statistics.lastPurchasedItem || "—"],
            ].map(([label, value]) => (
              <div className="card" key={String(label)}>
                <small>{label}</small>
                <strong>{value}</strong>
              </div>
            ))}
          </section>
          <form
            key={customer.updated_at}
            className="customer-detail-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!customerId) return;
              const values = new FormData(event.currentTarget);
              try {
                await api("/customers/" + customerId, {
                  method: "PATCH",
                  body: JSON.stringify({
                    name: values.get("name"),
                    surname: values.get("surname") || null,
                    address: values.get("address") || null,
                    phone: values.get("phone") || null,
                    nationality: values.get("nationality") || null,
                  }),
                });
                await load();
                setMessage("Customer details saved successfully.");
              } catch (error: any) {
                setMessage(error.message);
              }
            }}
          >
            <label>
              Name
              <input name="name" defaultValue={customer.name} required />
            </label>
            <label>
              Surname (optional)
              <input name="surname" defaultValue={customer.surname || ""} />
            </label>
            <label>
              Address
              <input name="address" defaultValue={customer.address || ""} />
            </label>
            <label>
              Phone
              <input name="phone" defaultValue={customer.phone || ""} />
            </label>
            <label>
              Nationality (optional)
              <input
                name="nationality"
                defaultValue={customer.nationality || ""}
              />
            </label>
            <button className="form-submit">Save</button>
          </form>
          {message && (
            <p className={message.includes("success") ? "" : "error"}>
              {message}
            </p>
          )}
          <h3>Purchase history</h3>
          <T
            rows={details.purchases || []}
            cols={[
              ["Date", (sale) => dt(sale.business_date)],
              ["Sale ID", (sale) => sale.sale_number],
              ["Product", (sale) => sale.product_names || "—"],
              ["Address", (sale) => sale.delivery_address || "—"],
              [
                "Delivery Date",
                (sale) =>
                  sale.actual_delivery_date
                    ? dt(sale.actual_delivery_date)
                    : "—",
              ],
              [
                "Delivery Status",
                (sale) => sale.delivery_status || "—",
              ],
              ["Paid", (sale) => gel(sale.paid)],
              ["Discount", (sale) => gel(sale.discount)],
              ["Payment Method", (sale) => sale.payment_methods || "—"],
              ["Status", (sale) => <StatusValue value={sale.status} />],
            ]}
          />
          <h3>Reservation history</h3>
          <T
            rows={details.reservations || []}
            cols={[
              ["Date", (reservation) => dt(reservation.created_at)],
              ["Product", (reservation) => reservation.product_name],
              ["Quantity", (reservation) => reservation.quantity],
              [
                "Total",
                (reservation) => gel(reservation.reservation_total),
              ],
              ["Paid", (reservation) => gel(reservation.deposit_paid)],
              ["Remaining", (reservation) => gel(reservation.remaining)],
              [
                "Expires",
                (reservation) =>
                  reservation.expires_at ? dt(reservation.expires_at) : "—",
              ],
              [
                "Status",
                (reservation) => <StatusValue value={reservation.status} />,
              ],
              ["Notes", (reservation) => <NoteButton note={reservation.notes} />],
            ]}
          />
        </div>
      </div>
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
  showEmployee = true,
  detailsInNotes = false,
}: {
  rows: O[];
  reload: () => void;
  allowDelete?: boolean;
  showEmployee?: boolean;
  detailsInNotes?: boolean;
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
    [
      "Notes",
      (x: O) =>
        detailsInNotes ? (
          <HistoryDetailsButton row={x} />
        ) : (
          <NoteButton note={x.notes} />
        ),
    ],
  ];
  if (showEmployee)
    cols.splice(cols.length - 1, 0, [
      "Employee",
      (x: O) => x.employee_name,
    ]);
  if (allowDelete)
    cols.push(
      [
        "Status",
        (x: O) =>
          x.type === "REVERSED" ? (
            "—"
          ) : (
            <StatusValue value={x.deleted_at ? "REVERSED" : "ACTIVE"} />
          ),
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
  products: suppliedProducts,
  showTitle = true,
  showHistory = true,
  onChanged,
}: {
  products?: O[];
  showTitle?: boolean;
  showHistory?: boolean;
  onChanged?: () => void;
} = {}) {
  const [loadedProducts, setLoadedProducts] = useState<O[]>([]),
    [h, sh] = useState<O[]>([]),
    [e, se] = useState(""),
    [reason, setReason] = useState("RETURN"),
    [qty, setQty] = useState("1"),
    [direction, setDirection] = useState("INCREASE");
  const p = suppliedProducts ?? loadedProducts;
  const load = () => {
    if (!suppliedProducts) api("/products").then(setLoadedProducts);
    if (showHistory) api("/stock-movements").then(sh);
  };
  useEffect(load, [suppliedProducts, showHistory]);
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
      <div className="twocol inventory-action-forms">
        <form onSubmit={submit("/inventory/import")}>
          <h3>Import</h3>
          <label>Product{pick}</label>
          <label>
            Quantity
            <NumericInput name="quantity" integer min="1" required />
          </label>
          <label>
            Purchase price
            <NumericInput name="price" min="0" required />
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
            <NumericInput
              name="quantity"
              integer
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
              <NumericInput name="saleNumber" integer min="1" required />
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
  const [h, sh] = useState<O[]>([]),
    [products, setProducts] = useState<O[]>([]),
    [suppliers, setSuppliers] = useState<O[]>([]),
    [errorMessage, setErrorMessage] = useState(""),
    [filters, setFilters] = useState({
      from: "",
      to: "",
      productId: "",
      supplierId: "",
      type: "",
      status: "",
      userId: "",
      search: "",
    });
  const load = () =>
    Promise.all([
      api("/stock-movements"),
      api("/products?status=all"),
      api("/suppliers"),
    ])
      .then(([rows, productRows, supplierRows]) => {
        sh(rows);
        setProducts(productRows);
        setSuppliers(supplierRows);
        setErrorMessage("");
      })
      .catch((error) => setErrorMessage(error.message));
  useEffect(load, []);
  const { types, statuses, employees } = useMemo(
    () => ({
      types: [
        ...new Set(h.map((row) => String(row.type || "")).filter(Boolean)),
      ].sort(),
      statuses: [
        ...new Set(h.map((row) => String(row.status || "")).filter(Boolean)),
      ].sort(),
      employees: [
        ...new Map(
          h
            .filter((row) => row.user_id && row.employee_name)
            .map((row) => [row.user_id, row.employee_name]),
        ).entries(),
      ].sort((a, b) => String(a[1]).localeCompare(String(b[1]))),
    }),
    [h],
  );
  const display = useMemo(() => {
    const search = filters.search.toLowerCase();
    return h
      .filter((row) => {
        const productIds = (row.product_ids || [row.product_id]).filter(
          Boolean,
        );
        const supplierIds = (row.supplier_ids || [row.supplier_id]).filter(
          Boolean,
        );
        const value = row.display_date || row.created_at;
        const rowDate =
          typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
            ? value.slice(0, 10)
            : today(value);
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
          .filter((field) => field !== null && field !== undefined)
          .join(" ")
          .toLowerCase();
        return (
          (!filters.from || rowDate >= filters.from) &&
          (!filters.to || rowDate <= filters.to) &&
          (!filters.productId || productIds.includes(filters.productId)) &&
          (!filters.supplierId || supplierIds.includes(filters.supplierId)) &&
          (!filters.type || row.type === filters.type) &&
          (!filters.status || row.status === filters.status) &&
          (!filters.userId || row.user_id === filters.userId) &&
          (!search || searchable.includes(search))
        );
      })
      .map((row) =>
        row.type === "SALE" && row.sale_selling_price != null
          ? {
              ...row,
              product_name: `${row.product_name} | Selling Price: ${gel(row.sale_selling_price)}`,
            }
          : { ...row, product_name: row.product_name || "—" },
      );
  }, [h, filters]);
  return (
    <>
      <h2>History</h2>
      <form className="history-filters" onSubmit={(event) => event.preventDefault()}>
        <label>
          From
          <input
            type="date"
            value={filters.from}
            onChange={(event) =>
              setFilters({ ...filters, from: event.target.value })
            }
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={filters.to}
            onChange={(event) =>
              setFilters({ ...filters, to: event.target.value })
            }
          />
        </label>
        <label>
          Product
          <select
            value={filters.productId}
            onChange={(event) =>
              setFilters({ ...filters, productId: event.target.value })
            }
          >
            <option value="">All</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Supplier
          <select
            value={filters.supplierId}
            onChange={(event) =>
              setFilters({ ...filters, supplierId: event.target.value })
            }
          >
            <option value="">All</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Movement type
          <select
            value={filters.type}
            onChange={(event) =>
              setFilters({ ...filters, type: event.target.value })
            }
          >
            <option value="">All</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters({ ...filters, status: event.target.value })
            }
          >
            <option value="">All</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
        <label>
          Employee
          <select
            value={filters.userId}
            onChange={(event) =>
              setFilters({ ...filters, userId: event.target.value })
            }
          >
            <option value="">All</option>
            {employees.map(([userId, name]) => (
              <option key={userId} value={userId}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Search
          <input
            value={filters.search}
            onChange={(event) =>
              setFilters({ ...filters, search: event.target.value })
            }
            placeholder="Action, customer, note…"
          />
        </label>
        <button
          type="button"
          onClick={() =>
            setFilters({
              from: "",
              to: "",
              productId: "",
              supplierId: "",
              type: "",
              status: "",
              userId: "",
              search: "",
            })
          }
        >
          Clear filters
        </button>
      </form>
      {errorMessage && <p className="error">{errorMessage}</p>}
      <MovementTable rows={display} reload={load} detailsInNotes />
    </>
  );
}
function PaidEditor({
  sale,
  reload,
  hideValidationMessage = false,
}: {
  sale: O;
  reload: () => void;
  hideValidationMessage?: boolean;
}) {
  const [value, setValue] = useState(String(sale.paid));
  useEffect(() => setValue(String(sale.paid)), [sale.paid]);
  const numericValue = Number(value);
  const validValue =
    /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) &&
    numericValue >= +sale.paid &&
    numericValue <= +(sale.effectiveTotal ?? sale.total);
  const save = async () => {
    if (!validValue) return;
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
    <span className="paid-editor">
      <NumericInput
        className="paid-input"
        hideValidationMessage={hideValidationMessage}
        min={sale.paid}
        max={sale.effectiveTotal ?? sale.total}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button disabled={!validValue} onClick={save}>Save</button>
    </span>
  );
}
function Reservations() {
  const [p, sp] = useState<O[]>([]),
    [s, ss] = useState<O[]>([]),
    [customers, setCustomers] = useState<O[]>([]),
    [r, sr] = useState<O[]>([]),
    [e, se] = useState(""),
    [quantity, setQuantity] = useState("1"),
    [sellingPrice, setSellingPrice] = useState("0"),
    [deposit, setDeposit] = useState("0");
  const load = () => {
    Promise.all([
      api("/products"),
      api("/suppliers"),
      api("/customers"),
      api("/reservations"),
    ])
      .then(([products, suppliers, customerRows, reservations]) => {
        sp(products);
        ss(suppliers);
        setCustomers(customerRows);
        sr(reservations);
      })
      .catch((error) => se(error.message));
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
                customerId: f.get("customerId") || null,
                supplierId: f.get("supplierId") || null,
                quantity: +f.get("quantity")!,
                sellingPrice: +f.get("sellingPrice")!,
                depositPaid: +f.get("depositPaid")!,
                expiresAt: reservationExpiryIso(f.get("expiresAt")),
                notes: f.get("notes"),
              }),
            });
            form.reset();
            setQuantity("1");
            setSellingPrice("0");
            setDeposit("0");
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
          Customer
          <select name="customerId">
            <option value="">No customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
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
          <NumericInput
            name="quantity"
            integer
            min="1"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            required
          />
        </label>
        <label>
          Selling price per unit
          <NumericInput
            name="sellingPrice"
            min="0"
            value={sellingPrice}
            onChange={(event) => setSellingPrice(event.target.value)}
            required
          />
        </label>
        <label>
          Deposit paid
          <NumericInput
            name="depositPaid"
            min="0"
            max={(+quantity || 0) * (+sellingPrice || 0)}
            value={deposit}
            onChange={(event) => setDeposit(event.target.value)}
            required
          />
        </label>
        <label>
          Expiration date
          <input name="expiresAt" type="date" />
        </label>
        <p className="form-calculation">
          Reservation total: <b>{gel((+quantity || 0) * (+sellingPrice || 0))}</b><br />
          Remaining after deposit: <b>{gel(Math.max(0, (+quantity || 0) * (+sellingPrice || 0) - (+deposit || 0)))}</b>
        </p>
        <label>
          Notes
          <input name="notes" />
        </label>
        <button className="form-submit">Reserve</button>
      </form>
      {e && <p className="error">{e}</p>}
      <T
        rows={r}
        initialPageSize={5}
        cols={[
          ["Product", (x) => x.product_name],
          ["Customer", (x) => x.customer_name || "—"],
          ["Supplier", (x) => x.supplier_name || "—"],
          ["Quantity", (x) => x.quantity],
          ["Unit price", (x) => gel(x.selling_price)],
          ["Reservation total", (x) => gel(x.reservation_total)],
          ["Deposit paid", (x) => gel(x.deposit_paid)],
          ["Remaining", (x) => gel(x.remaining)],
          ["Expires", (x) => dt(x.expires_at)],
          [
            "Status",
            (x) => (
              <StatusValue
                value={
                  x.display_status === "COMPLETED"
                    ? "Sold"
                    : x.display_status === "CANCELLED"
                      ? "Cancelled"
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
function NavigationDropdown({
  label,
  children,
}: React.PropsWithChildren<{ label: string }>) {
  const [clickedOpen, setClickedOpen] = useState(false);
  const [suppressHover, setSuppressHover] = useState(false);
  const dropdown = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!dropdown.current?.contains(event.target as Node))
        setClickedOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  const items = React.Children.map(children, (child) => {
    if (!React.isValidElement<{ onClick?: React.MouseEventHandler }>(child))
      return child;
    const originalClick = child.props.onClick;
    return React.cloneElement(child, {
      onClick: (event: React.MouseEvent) => {
        originalClick?.(event);
        setClickedOpen(false);
        setSuppressHover(true);
      },
    });
  });
  return (
    <div
      ref={dropdown}
      className={`nav-dropdown ${clickedOpen ? "is-click-open" : ""} ${suppressHover ? "suppress-hover" : ""}`}
      onMouseLeave={() => setSuppressHover(false)}
    >
      <button
        type="button"
        className="nav-dropdown-trigger"
        aria-haspopup="menu"
        aria-expanded={clickedOpen}
        onClick={() => {
          setClickedOpen(true);
          setSuppressHover(false);
        }}
      >
        {label}
      </button>
      <div className="nav-dropdown-menu" role="menu">
        {items}
      </div>
    </div>
  );
}
function Shell({ u, out }: { u: O; out: () => void }) {
  const location = useLocation();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const primaryNavigation = [
    "Dashboard",
    "Products",
    "Inventory",
    "Sales",
    "Reservations",
    "Payments",
    "Deliveries",
  ];
  useEffect(() => setMobileNavigationOpen(false), [location.pathname]);
  useEffect(() => {
    if (!mobileNavigationOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavigationOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileNavigationOpen]);
  return (
    <div className="shell">
      <aside>
        <h1>
          <Brand />
        </h1>
        <button
          type="button"
          className="mobile-nav-toggle"
          aria-controls="primary-navigation"
          aria-expanded={mobileNavigationOpen}
          onClick={() => setMobileNavigationOpen((current) => !current)}
        >
          <span className="mobile-nav-icon" aria-hidden="true">
            {mobileNavigationOpen ? "×" : "☰"}
          </span>
          <span>{mobileNavigationOpen ? "Close" : "Menu"}</span>
        </button>
        <nav
          id="primary-navigation"
          className={`sidebar-navigation ${mobileNavigationOpen ? "is-open" : ""}`}
          aria-label="Main navigation"
        >
          {primaryNavigation.map((x) => (
            <NavLink
              key={x}
              to={x === "Dashboard" ? "/" : "/" + x.toLowerCase()}
              end={x === "Dashboard"}
            >
              {x}
            </NavLink>
          ))}
          <NavigationDropdown label="Contacts">
            <NavLink to="/customers">Customers</NavLink>
            <NavLink to="/suppliers">Suppliers</NavLink>
            <NavLink to="/contacts">Contacts</NavLink>
          </NavigationDropdown>
          <NavLink to="/history">History</NavLink>
          {u.role === "ADMIN" && <NavLink to="/reports">Reports</NavLink>}
          <NavigationDropdown label="Other">
            {u.role === "ADMIN" && (
              <NavLink to="/employees">Employees</NavLink>
            )}
            <NavLink to="/settings">Settings</NavLink>
            <button onClick={out}>Sign out</button>
          </NavigationDropdown>
        </nav>
      </aside>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route
            path="/products"
            element={<Products admin={u.role === "ADMIN"} />}
          />
          <Route path="/inventory" element={<InventoryWithSummary />} />
          <Route
            path="/inventory/:id"
            element={<InventoryDetail admin={u.role === "ADMIN"} />}
          />
          <Route path="/sales" element={<SalesWithBusinessDate />} />
          <Route path="/sales/:id" element={<SaleDetail />} />
          <Route path="/reservations" element={<Reservations />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/deliveries" element={<Deliveries />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
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
          <Route
            path="/settings"
            element={<SettingsWithPreferences admin={u.role === "ADMIN"} />}
          />
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
