import React, {
  useEffect as reactUseEffect,
  useId,
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
import logoUrl from "../logo/Website.png";
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

function InvoiceCodeInput({
  codes,
  ...props
}: Omit<NumericInputProps, "integer"> & { codes: O[] }) {
  const suggestionsId = useId();
  return (
    <>
      <input
        {...props}
        type="text"
        inputMode="numeric"
        pattern="[0-9]+"
        list={suggestionsId}
        autoComplete="off"
      />
      <datalist id={suggestionsId}>
        {codes.map((invoice) => (
          <option key={invoice.code} value={invoice.code} />
        ))}
      </datalist>
    </>
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
const readShopName = () => localStorage.getItem("shopName") || "Rom Classic";
const applyTheme = (theme = localStorage.getItem("theme") || "White") =>
  (document.documentElement.dataset.theme = theme.toLowerCase());
applyTheme();
document.title = "Inventory";
function StatusValue({ value }: { value: any }) {
  const v = String(value || "");
  const color =
    v === "ACTIVE" || v === "SALE" || v === "SOLD"
      ? "green"
      : v === "REVERSED"
        ? "yellow"
        : v === "RETURN"
          ? "blue"
          : v === "LOST" || v === "DESTROYED"
            ? "red"
            : "";
  return (
    <span className={`status ${color ? `status-${color}` : ""}`}>
      {v === "SUPPLIER_RETURN" ? "RETURN" : v}
    </span>
  );
}
function StockValue({ value }: { value: any }) {
  const quantity = Number(value || 0);
  const className =
    quantity === 0 ? "stock-empty" : quantity < 3 ? "stock-low" : "";
  return <span className={className}>{quantity}</span>;
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

function InvoiceCodeManagement() {
  const [invoices, setInvoices] = useState<O[]>([]);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const load = () =>
    api("/invoices")
      .then(setInvoices)
      .catch((error) => setMessage(error.message));
  useEffect(load, []);
  const remove = async (invoice: O) => {
    if (!confirm(`Delete invoice code “${invoice.code}”?`)) return;
    try {
      await api(`/invoices/${encodeURIComponent(invoice.code)}`, {
        method: "DELETE",
      });
      setMessage("Invoice code deleted successfully.");
      void load();
    } catch (error: any) {
      setMessage(error.message);
    }
  };
  return (
    <section className="category-management invoice-code-management">
      <button
        type="button"
        className="category-management-toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>Invoice Code Management</span>
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="category-management-content">
          <form
            className="inline category-create-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const code = String(
                new FormData(form).get("code") || "",
              ).trim();
              try {
                await api("/invoices", {
                  method: "POST",
                  body: JSON.stringify({ code }),
                });
                form.reset();
                setMessage("Invoice code created successfully.");
                void load();
              } catch (error: any) {
                setMessage(error.message);
              }
            }}
          >
            <label>
              Invoice code
              <InvoiceCodeInput codes={invoices} name="code" required />
            </label>
            <button className="form-submit">Create invoice code</button>
          </form>
          {message && (
            <p
              className={
                message === "Invoice Contains Products, It can't be DELETED"
                  ? "error"
                  : ""
              }
            >
              {message}
            </p>
          )}
          <T
            rows={invoices}
            cols={[
              [
                "Invoice code",
                (invoice) => <InvoiceLinks invoiceCodes={[invoice.code]} />,
                (invoice) => invoice.code,
              ],
              ["Products", (invoice) => invoice.product_count],
              [
                "Manage",
                (invoice) => (
                  <form
                    key={invoice.code}
                    className="category-row-editor"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      const code = String(
                        new FormData(event.currentTarget).get("code") || "",
                      ).trim();
                      try {
                        await api(
                          `/invoices/${encodeURIComponent(invoice.code)}`,
                          {
                            method: "PATCH",
                            body: JSON.stringify({ code }),
                          },
                        );
                        setMessage("Invoice code renamed successfully.");
                        void load();
                      } catch (error: any) {
                        setMessage(error.message);
                      }
                    }}
                  >
                    <InvoiceCodeInput
                      codes={[]}
                      name="code"
                      defaultValue={invoice.code}
                      aria-label={`Rename invoice ${invoice.code}`}
                      required
                    />
                    <button>Save</button>
                    <button type="button" onClick={() => remove(invoice)}>
                      Delete
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
    const name = shopName.trim() || "Rom Classic";
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
      {admin && (
        <>
          <CategoryManagement />
          <InvoiceCodeManagement />
        </>
      )}
    </>
  );
}
function InventoryLocation({ slug }: { slug: string }) {
  const [warehouse, setWarehouse] = useState<O>();
  const [message, setMessage] = useState("");
  useEffect(() => {
    loadWarehouses()
      .then((rows: O[]) => {
        const match = rows.find((row) => row.slug === slug);
        if (!match) throw Error("Inventory location not found");
        setWarehouse(match);
      })
      .catch((error) => setMessage(error.message));
  }, [slug]);
  if (message) return <p className="error">{message}</p>;
  if (!warehouse) return <p>Loading…</p>;
  return <InventoryWithSummary warehouse={warehouse} />;
}
function InventoryWithSummary({ warehouse }: { warehouse: O }) {
  const [products, setProducts] = useState<O[]>([]),
    [suppliers, setSuppliers] = useState<O[]>([]),
    [categories, setCategories] = useState<O[]>([]),
    [invoices, setInvoices] = useState<O[]>([]),
    [inventoryRows, setInventoryRows] = useState<O[]>([]),
    [filters, setFilters] = useState<O>({}),
    [errorMessage, setErrorMessage] = useState("");
  const loadPage = () => {
    Promise.all([
      api("/products"),
      api("/suppliers"),
      api("/categories"),
      api("/invoices"),
    ])
      .then(([productRows, supplierRows, categoryRows, invoiceRows]) => {
        setProducts(productRows);
        setSuppliers(supplierRows);
        setCategories(categoryRows);
        setInvoices(invoiceRows);
      })
      .catch((error) => setErrorMessage(error.message));
  };
  const loadInventoryTable = () => {
    const q = new URLSearchParams({ warehouseId: warehouse.id });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) q.set(key, String(value));
    });
    api("/inventory/products?" + q)
      .then((rows) =>
        setInventoryRows(
          rowsByInvoice(
            rows.map((row: O) => ({
              ...row,
              quantity: filters.invoiceCode
                ? (row.invoice_stock || []).reduce(
                    (sum: number, invoice: O) =>
                      sum + +invoice.remaining_quantity,
                    0,
                  )
                : row.quantity,
            })),
            "quantity",
          ).map((row: O, displayId: number) => ({
            ...row,
            display_id: displayId + 1,
          })),
        ),
      )
      .catch((error) => setErrorMessage(error.message));
  };
  useEffect(loadPage, [warehouse.id]);
  useEffect(loadInventoryTable, [
    filters.productId,
    filters.supplierId,
    filters.categoryId,
    filters.invoiceCode,
    filters.stockStatus,
    warehouse.id,
  ]);
  return (
    <>
      <h2>{warehouse.name}</h2>
      <form className="inventory-stock-filters">
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
          Category
          <select
            onChange={(e) =>
              setFilters({ ...filters, categoryId: e.target.value })
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
          Invoice code
          <InvoiceCodeInput
            codes={invoices}
            placeholder="Type or choose a code"
            value={filters.invoiceCode || ""}
            onChange={(event) =>
              setFilters({ ...filters, invoiceCode: event.target.value })
            }
          />
        </label>
        <label>
          Stock status
          <select
            onChange={(e) =>
              setFilters({ ...filters, stockStatus: e.target.value })
            }
          >
            <option value="">All</option>
            <option value="AVAILABLE">Available</option>
            <option value="LOW">Low Stock</option>
          </select>
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
          ["Category", (row) => row.category_name || "—"],
          ["Product", (row) => row.product_name],
          [
            "Invoice code",
            (row) =>
              row.invoice_code ? (
                <InvoiceLinks invoiceCodes={[row.invoice_code]} />
              ) : (
                "—"
              ),
          ],
          ["Quantity", (row) => <StockValue value={row.quantity} />],
          ["Notes", (row) => <NoteButton note={row.notes} label="View" />],
        ]}
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
  const [selectedInvoiceCode, setSelectedInvoiceCode] = useState("");
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
          <label>
            Invoice code
            <select
              value={selectedInvoiceCode}
              onChange={(event) => setSelectedInvoiceCode(event.target.value)}
            >
              <option value="">All invoice codes</option>
              {(product.invoice_stock || []).map((invoice: O) => (
                <option key={invoice.code} value={invoice.code}>
                  {invoice.code}
                </option>
              ))}
            </select>
          </label>
          <label>
            Current quantity
            <input
              value={
                selectedInvoiceCode
                  ? product.invoice_stock?.find(
                      (invoice: O) => invoice.code === selectedInvoiceCode,
                    )?.remaining_quantity || 0
                  : product.current_quantity
              }
              readOnly
            />
          </label>
          <label>
            Last imported date
            <input value={product.last_import_date ? dt(product.last_import_date) : ""} readOnly />
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
          ["Supplier", (row) => row.supplier_name || "—"],
          ["Warehouse", (row) => row.warehouse_name || "—"],
          ["Changes", (row) => <ChangeButton activity={row} />],
          ["Notes", (row) => <NoteButton note={row.notes} label="View" />],
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
let warehouseRowsRequest: Promise<O[]> | undefined;
const loadWarehouses = () => {
  if (!warehouseRowsRequest)
    warehouseRowsRequest = api("/warehouses").catch((error) => {
      warehouseRowsRequest = undefined;
      throw error;
    });
  return warehouseRowsRequest;
};
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
const dt = (v: any) =>
  v ? dateFormatter.format(new Date(v)) : "—";
const dtt = (v: any) =>
  v ? dateTimeFormatter.format(new Date(v)) : "—";
const today = (date: Date | string | number = new Date()) => {
  const parts = datePartsFormatter.formatToParts(new Date(date));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};
type TableColumn = [
  string,
  (x: O, index: number) => any,
  ((x: O) => string | number | null | undefined)?,
];
function T({
  rows,
  cols,
  initialPageSize = 20,
}: {
  rows: O[];
  cols: TableColumn[];
  initialPageSize?: 5 | 10 | 20 | 50 | 100;
}) {
  const [sort, setSort] = useState<{ index: number; direction: 1 | -1 } | null>(
    null,
  );
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [page, setPage] = useState(1);
  const columnSignature = cols.map(([heading]) => heading).join("\u0000");
  useEffect(() => setPage(1), [rows]);
  useEffect(() => {
    setSort(null);
    setPage(1);
  }, [columnSignature]);
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
      <div className="data-table-toolbar">
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
        <div className="mobile-table-sort">
          <label>
            Sort by
            <select
              value={sort?.index ?? ""}
              onChange={(event) => {
                const index = event.target.value;
                setPage(1);
                setSort(
                  index === ""
                    ? null
                    : { index: Number(index), direction: sort?.direction || 1 },
                );
              }}
            >
              <option value="">Original order</option>
              {cols.map((column, index) => (
                <option key={column[0]} value={index}>
                  {column[0]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!sort}
            aria-label="Reverse sort direction"
            onClick={() => {
              setPage(1);
              setSort((current) =>
                current
                  ? { ...current, direction: current.direction === 1 ? -1 : 1 }
                  : null,
              );
            }}
          >
            {sort?.direction === -1 ? "Descending" : "Ascending"}
          </button>
        </div>
      </div>
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
            <tr
              key={[
                x.id || x.product_id || "row",
                x.invoice_code || "",
                firstRow + index,
              ].join(":")}
            >
              {cols.map((c) => (
                <td key={c[0]} data-label={c[0]}>
                  {c[1](x, firstRow + index)}
                </td>
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
        : `${row.quantity > 0 && row.type !== "TRANSPORT" ? "+" : ""}${row.quantity}`,
    ],
    ["Supplier", row.supplier_name || "—"],
    ["Invoice code", row.invoice_code || "—"],
    ["Location", row.warehouse_name || "—"],
    ["Employee", row.employee_name || "—"],
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
  const [message, setMessage] = useState("");
  useEffect(() => {
    api("/dashboard").then(sd).catch((error) => setMessage(error.message));
  }, []);
  if (message) return <p className="error">{message}</p>;
  if (!d) return <p>Loading…</p>;
  const locations = Object.fromEntries(
    (d.locations || []).map((location: O) => [location.slug, location]),
  );
  const a = [
    ["Galovani Stock", locations.galovani?.stock || 0],
    ["Galovani Products", locations.galovani?.products || 0],
    ["Isani Stock", locations.isani?.stock || 0],
    ["Isani Products", locations.isani?.products || 0],
    ["Showroom Stock", locations.showroom?.stock || 0],
    ["Showroom Products", locations.showroom?.products || 0],
    ["Low Stock", d.low_stock],
    ["Out of Stock", d.out_stock],
    ["Reserved", d.reserved_products],
  ];
  return (
    <>
      <h2>Dashboard</h2>
      <section className="cards dashboard-cards">
        {a.map((x) => (
          <div className="card" key={String(x[0])}>
            <small>{x[0]}</small>
            <strong>{x[1]}</strong>
          </div>
        ))}
      </section>
      {(d.locations || []).map((location: O) => (
        <section className="dashboard-location-table" key={location.id}>
          <h3>{location.name}</h3>
          <T
            rows={rowsByInvoice(location.products_table || [], "quantity")}
            cols={[
              [
                "Product",
                (product) => (
                  <Link
                    className="inventory-id-link"
                    to={`/inventory/${product.product_id}`}
                  >
                    {product.product_name}
                  </Link>
                ),
                (product) => product.product_name,
              ],
              ["Supplier", (product) => product.supplier_name || "—"],
              ["Category", (product) => product.category_name || "—"],
              [
                "Invoice code",
                (product) =>
                  product.invoice_code ? (
                    <InvoiceLinks invoiceCodes={[product.invoice_code]} />
                  ) : (
                    "—"
                  ),
              ],
              ["Quantity", (product) => <StockValue value={product.quantity} />],
            ]}
          />
        </section>
      ))}
    </>
  );
}

function InvoiceLinks({
  invoiceStock,
  invoiceCodes,
}: {
  invoiceStock?: O[];
  invoiceCodes?: string[];
}) {
  const entries: O[] = invoiceStock?.length
    ? invoiceStock
    : (invoiceCodes || []).map((code) => ({ code }));
  if (!entries.length) return <>—</>;
  return (
    <span className="invoice-links">
      {entries.map((invoice, index) => (
        <React.Fragment key={invoice.code}>
          {index > 0 && ", "}
          <Link to={`/invoice/${encodeURIComponent(invoice.code)}`}>
            {invoice.code}
          </Link>
          {invoice.remaining_quantity !== undefined &&
            ` (${invoice.remaining_quantity})`}
        </React.Fragment>
      ))}
    </span>
  );
}

function invoiceWarehouses(warehouseStock: O[] = []) {
  if (!warehouseStock.length) return "—";
  return warehouseStock
    .map((warehouse) => `${warehouse.warehouse_name} (${warehouse.quantity})`)
    .join(", ");
}

function rowsByInvoice(rows: O[], quantityField: string) {
  return rows.flatMap((row) => {
    const totalQuantity = +row[quantityField] || 0;
    const invoiceRows = (row.invoice_stock || []).map((invoice: O) => ({
      ...row,
      invoice_code: invoice.code,
      [quantityField]: +invoice.remaining_quantity || 0,
    }));
    const trackedQuantity = invoiceRows.reduce(
      (sum: number, invoice: O) => sum + +invoice[quantityField],
      0,
    );
    const unassignedQuantity = Math.max(0, totalQuantity - trackedQuantity);
    if (!invoiceRows.length || unassignedQuantity > 0)
      invoiceRows.push({
        ...row,
        invoice_code: null,
        [quantityField]: unassignedQuantity || totalQuantity,
      });
    return invoiceRows;
  });
}

function ReservedProducts() {
  const [rows, setRows] = useState<O[]>([]);
  const [message, setMessage] = useState("");
  const [completingId, setCompletingId] = useState("");
  const load = () =>
    api("/inventory/reservations")
      .then((result) => {
        setRows(result);
        setMessage("");
      })
      .catch((error) => setMessage(error.message));
  useEffect(load, []);
  const complete = async (row: O) => {
    if (
      !confirm(
        `Complete the reserved sale of ${row.quantity} × ${row.product_name}? Stock will be subtracted from ${row.warehouse_name}.`,
      )
    )
      return;
    setCompletingId(row.id);
    try {
      await api(`/inventory/reservations/${row.id}/complete`, {
        method: "POST",
      });
      await load();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setCompletingId("");
    }
  };
  return (
    <>
      <h2>Reserved</h2>
      {message && <p className="error">{message}</p>}
      <T
        rows={rows}
        cols={[
          ["Supplier", (row) => row.supplier_name || "—"],
          ["Selling date", (row) => dt(row.action_date)],
          ["Product", (row) => row.product_name],
          ["Quantity", (row) => row.quantity],
          ["Warehouse", (row) => row.warehouse_name],
          ["Available now", (row) => <StockValue value={row.available_quantity} />],
          [
            "Action",
            (row) => {
              const ready = +row.available_quantity >= +row.quantity;
              return (
                <button
                  type="button"
                  disabled={!ready || completingId === row.id}
                  title={ready ? "" : "Import enough stock at this location first"}
                  onClick={() => complete(row)}
                >
                  {completingId === row.id
                    ? "Completing…"
                    : ready
                      ? "Complete sale"
                      : "Waiting for import"}
                </button>
              );
            },
          ],
        ]}
      />
    </>
  );
}

function InvoiceDetails() {
  const { code = "" } = useParams();
  const [details, setDetails] = useState<O>();
  const [selectedDate, setSelectedDate] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const query = selectedDate
      ? `?importDate=${encodeURIComponent(selectedDate)}`
      : "";
    api(`/invoices/${encodeURIComponent(code)}${query}`)
      .then((result) => {
        setDetails(result);
        if (!selectedDate) setSelectedDate(result.selected_date || "");
        setMessage("");
      })
      .catch((error) => setMessage(error.message));
  }, [code, selectedDate]);
  return (
    <>
      <h2>Invoice {code}</h2>
      {message && <p className="error">{message}</p>}
      {details && (
        <>
          {details.dates.length > 0 && (
            <label className="invoice-date-filter">
              Import date
              <select
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
              >
                {details.dates.map((date: string) => (
                  <option key={date} value={date}>
                    {dt(date)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <T
            rows={details.products}
            cols={[
              ["Supplier", (row) => row.supplier_name || "—"],
              [
                "Product",
                (row) => (
                  <Link
                    className="inventory-id-link"
                    to={`/inventory/${row.product_id}`}
                  >
                    {row.product_name}
                  </Link>
                ),
                (row) => row.product_name,
              ],
              ["Warehouse", (row) => invoiceWarehouses(row.warehouse_stock)],
              ["Imported quantity", (row) => row.imported_quantity],
              ["Remaining on invoice", (row) => (
                <StockValue value={row.remaining_quantity} />
              )],
            ]}
          />
        </>
      )}
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
function Products() {
  const [r, sr] = useState<O[]>([]),
    [e, se] = useState(""),
    [categories, setCategories] = useState<O[]>([]),
    [suppliers, setSuppliers] = useState<O[]>([]),
    [warehouses, setWarehouses] = useState<O[]>([]),
    [invoices, setInvoices] = useState<O[]>([]),
    [filters, setFilters] = useState({
      categoryId: "",
      supplierId: "",
      warehouseId: "",
      invoiceCode: "",
    });
  const load = () => {
    const query = new URLSearchParams({ status: "all" });
    Object.entries(filters).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    return api("/products?" + query)
      .then((rows) => {
        sr(
          rowsByInvoice(
            rows.map((product: O) => ({
              ...product,
              displayed_quantity:
                filters.invoiceCode
                  ? (product.invoice_stock || []).reduce(
                      (sum: number, invoice: O) =>
                        sum + +invoice.remaining_quantity,
                      0,
                    )
                  : product.warehouse_quantity ?? product.current_quantity,
            })),
            "displayed_quantity",
          ).map((product: O, displayId: number) => ({
            ...product,
            display_id: displayId + 1,
          })),
        );
        se("");
      })
      .catch((x) => se(x.message));
  };
  useEffect(() => {
    Promise.all([
      api("/categories"),
      api("/suppliers"),
      loadWarehouses(),
      api("/invoices"),
    ])
      .then(([categoryRows, supplierRows, warehouseRows, invoiceRows]) => {
        setCategories(categoryRows);
        setSuppliers(supplierRows);
        setWarehouses(warehouseRows);
        setInvoices(invoiceRows);
      })
      .catch((error) => se(error.message));
  }, []);
  useEffect(load, [
    filters.categoryId,
    filters.supplierId,
    filters.warehouseId,
    filters.invoiceCode,
  ]);
  const columns: TableColumn[] = [
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
    ["Name", (product) => product.name],
    ["Category", (product) => product.category_name || "—"],
  ];
  if (!filters.supplierId)
    columns.push(["Supplier", (product) => product.supplier_name || "—"]);
  columns.push([
    "Invoice code",
    (product) =>
      product.invoice_code ? (
        <InvoiceLinks invoiceCodes={[product.invoice_code]} />
      ) : (
        "—"
      ),
  ]);
  if (!filters.warehouseId)
    columns.push([
      "Warehouse",
      (product) =>
        product.warehouse_names?.length
          ? product.warehouse_names.join(", ")
          : "—",
    ]);
  columns.push(
    [
      "In stock",
      (product) => <StockValue value={product.displayed_quantity} />,
    ],
    ["Status", (product) => (product.is_active ? "Active" : "Inactive")],
  );
  return (
    <>
      <h2>Products</h2>
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
          Warehouse
          <select
            value={filters.warehouseId}
            onChange={(event) =>
              setFilters({ ...filters, warehouseId: event.target.value })
            }
          >
            <option value="">All</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Invoice code
          <InvoiceCodeInput
            codes={invoices}
            placeholder="Type or choose a code"
            value={filters.invoiceCode}
            onChange={(event) =>
              setFilters({ ...filters, invoiceCode: event.target.value })
            }
          />
        </label>
        <button
          type="button"
          onClick={() =>
            setFilters({
              categoryId: "",
              supplierId: "",
              warehouseId: "",
              invoiceCode: "",
            })
          }
        >
          Clear filters
        </button>
      </form>
      {e && <p className="error">{e}</p>}
      <T rows={r} cols={columns} />
    </>
  );
}
function Suppliers({ admin }: { admin: boolean }) {
  const [rows, setRows] = useState<O[]>([]);
  const [editing, setEditing] = useState<O>();
  const [message, setMessage] = useState("");
  const load = () =>
    api("/suppliers")
      .then(setRows)
      .catch((error) => setMessage(error.message));
  useEffect(load, []);
  const saveSupplier = async (
    event: React.FormEvent<HTMLFormElement>,
    supplier?: O,
  ) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      await api(supplier ? `/suppliers/${supplier.id}` : "/suppliers", {
        method: supplier ? "PATCH" : "POST",
        body: JSON.stringify({
          name: values.get("name"),
          notes: values.get("notes") || null,
        }),
      });
      form.reset();
      setEditing(undefined);
      setMessage(supplier ? "Supplier saved successfully." : "Supplier created successfully.");
      void load();
    } catch (error: any) {
      setMessage(error.message);
    }
  };
  return (
    <>
      <h2>Suppliers</h2>
      {admin && (
        <form className="inline" onSubmit={(event) => saveSupplier(event)}>
          <label>
            Name
            <input name="name" required />
          </label>
          <label>
            Notes
            <input name="notes" />
          </label>
          <button className="form-submit">Add Supplier</button>
        </form>
      )}
      {message && <p>{message}</p>}
      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(undefined)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h3>Edit supplier</h3>
            <form onSubmit={(event) => saveSupplier(event, editing)}>
              <label>
                Name
                <input name="name" defaultValue={editing.name} required />
              </label>
              <label>
                Notes
                <textarea name="notes" defaultValue={editing.notes || ""} />
              </label>
              <div className="toolbar">
                <button className="form-submit">Save</button>
                <button type="button" onClick={() => setEditing(undefined)}>Close</button>
              </div>
            </form>
          </div>
        </div>
      )}
      <T
        rows={rows}
        cols={[
          [
            "Supplier",
            (supplier) => (
              <Link
                className="supplier-link"
                to={`/suppliers/${encodeURIComponent(supplier.name)}`}
                state={{ supplierId: supplier.id }}
              >
                {supplier.name}
              </Link>
            ),
            (supplier) => supplier.name,
          ],
          ["Available products", (supplier) => <StockValue value={supplier.available_products} />],
          ["Unique products registered", (supplier) => supplier.unique_products_registered],
          ["Notes", (supplier) => <NoteButton note={supplier.notes} />],
          ["Action", (supplier) => admin ? <button onClick={() => setEditing(supplier)}>Edit</button> : "—"],
        ]}
      />
    </>
  );
}
function SupplierDetail() {
  const { supplierName = "" } = useParams();
  const location = useLocation();
  const supplierId = (location.state as { supplierId?: string } | null)
    ?.supplierId;
  const [details, setDetails] = useState<O>();
  const [message, setMessage] = useState("");
  const load = () =>
    (supplierId
      ? Promise.resolve(supplierId)
      : api("/suppliers").then((suppliers: O[]) => {
          const supplier = suppliers.find((row) => row.name === supplierName);
          if (!supplier) throw Error("Supplier not found");
          return supplier.id;
        }))
      .then((resolvedSupplierId) =>
        api(`/suppliers/${resolvedSupplierId}/inventory`),
      )
      .then(setDetails)
      .catch((error) => setMessage(error.message));
  useEffect(load, [supplierName, supplierId]);
  if (message) return <p className="error">{message}</p>;
  if (!details) return <p>Loading…</p>;
  const actions = (details.actions || []).map((action: O) => ({
    ...action,
    supplier_name: details.supplier.name,
  }));
  return (
    <>
      <h2>{details.supplier.name}</h2>
      {details.supplier.notes && (
        <p>
          Notes: <NoteButton note={details.supplier.notes} />
        </p>
      )}
      <h3>Products from supplier</h3>
      <T
        rows={details.products || []}
        cols={[
          [
            "Product",
            (product) => (
              <Link
                className="inventory-id-link"
                to={`/inventory/${product.id}`}
              >
                {product.name}
              </Link>
            ),
            (product) => product.name,
          ],
          ["Quantity", (product) => <StockValue value={product.quantity} />],
          ["Showroom", (product) => <StockValue value={product.location_quantities?.showroom || 0} />],
          ["Galovani", (product) => <StockValue value={product.location_quantities?.galovani || 0} />],
          ["Isani", (product) => <StockValue value={product.location_quantities?.isani || 0} />],
        ]}
      />
      <h3>Actions</h3>
      <MovementTable
        rows={actions}
        reload={load}
        showWarehouse
        detailsInNotes
      />
    </>
  );
}
function MovementTable({
  rows,
  reload,
  allowDelete = false,
  showEmployee = true,
  showWarehouse = false,
  detailsInNotes = false,
}: {
  rows: O[];
  reload: () => void;
  allowDelete?: boolean;
  showEmployee?: boolean;
  showWarehouse?: boolean;
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
        x.quantity === null
          ? "—"
          : (x.quantity > 0 && x.type !== "TRANSPORT" ? "+" : "") +
            x.quantity,
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
  if (showWarehouse)
    cols.splice(
      cols.length - 1,
      0,
      [
        "Invoice code",
        (x: O) =>
          x.invoice_code ? (
            <InvoiceLinks invoiceCodes={[x.invoice_code]} />
          ) : (
            "—"
          ),
        (x: O) => x.invoice_code || "",
      ],
      ["Warehouse", (x: O) => x.warehouse_name || "—"],
    );
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
          ["IMPORT", "SUPPLIER_RETURN", "SOLD", "LOST", "DESTROYED", "CORRECTION"].includes(x.type) ? (
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
          "SUPPLIER_RETURN",
          "SOLD",
          "LOST",
          "DESTROYED",
          "CORRECTION",
          "TRANSPORT",
          "REVERSED",
        ].includes(x.type),
      )
    : rows;
  return <T rows={display} cols={cols} />;
}
function Inventory({ admin }: { admin: boolean }) {
  const [products, setProducts] = useState<O[]>([]),
    [adjustmentProducts, setAdjustmentProducts] = useState<O[]>([]),
    [warehouses, setWarehouses] = useState<O[]>([]),
    [categories, setCategories] = useState<O[]>([]),
    [suppliers, setSuppliers] = useState<O[]>([]),
    [invoices, setInvoices] = useState<O[]>([]),
    [h, sh] = useState<O[]>([]),
    [e, se] = useState(""),
    [notice, setNotice] = useState(""),
    [importProductId, setImportProductId] = useState(""),
    [adjustmentProductId, setAdjustmentProductId] = useState(""),
    [invoiceSelection, setInvoiceSelection] = useState("NEW"),
    [reason, setReason] = useState("SUPPLIER_RETURN"),
    [direction, setDirection] = useState("INCREASE"),
    [adjustmentWarehouseId, setAdjustmentWarehouseId] = useState(""),
    [destinationWarehouseId, setDestinationWarehouseId] = useState("");
  const load = () => {
    Promise.all([
      api("/products"),
      loadWarehouses(),
      api("/categories"),
      api("/suppliers"),
      api("/invoices"),
      api("/inventory/movements"),
    ])
      .then(([
        productRows,
        warehouseRows,
        categoryRows,
        supplierRows,
        invoiceRows,
        movementRows,
      ]) => {
        setProducts(productRows);
        setWarehouses(warehouseRows);
        setCategories(categoryRows);
        setSuppliers(supplierRows);
        setInvoices(invoiceRows);
        sh(movementRows);
        se("");
      })
      .catch((error) => se(error.message));
  };
  useEffect(load, []);
  useEffect(() => {
    setAdjustmentProductId("");
    if (!adjustmentWarehouseId) {
      setAdjustmentProducts([]);
      return;
    }
    let cancelled = false;
    const includeEmpty = reason === "TRANSPORT" ? "" : "&includeEmpty=true";
    api(
      `/products?warehouseId=${encodeURIComponent(adjustmentWarehouseId)}${includeEmpty}`,
    )
      .then((rows) => {
        if (cancelled) return;
        setAdjustmentProducts(
          reason === "TRANSPORT"
            ? rows.filter((product: O) => +product.warehouse_quantity > 0)
            : rows,
        );
      })
      .catch((error) => {
        if (!cancelled) se(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [adjustmentWarehouseId, reason]);
  const submit =
    (url: string) => async (x: React.FormEvent<HTMLFormElement>) => {
      x.preventDefault();
      const form = x.currentTarget;
      const f = new FormData(form);
      try {
        const describesProduct =
          url.endsWith("/import") && f.get("productId") === "NEW";
        const body = describesProduct
          ? {
              name: f.get("productName"),
              categoryId: f.get("categoryId"),
              supplierId: f.get("supplierId"),
              description: f.get("description") || null,
            }
          : url.endsWith("/import")
          ? {
              productId: f.get("productId"),
              warehouseId: f.get("warehouseId"),
              quantity: +f.get("quantity")!,
              importDate: f.get("importDate"),
              invoiceCode:
                invoiceSelection === "NEW"
                  ? f.get("newInvoiceCode")
                  : invoiceSelection,
              notes: f.get("notes"),
            }
          : {
              productId: f.get("productId"),
              warehouseId: f.get("warehouseId"),
              destinationWarehouseId:
                f.get("destinationWarehouseId") || null,
              quantity: +f.get("quantity")!,
              type: f.get("type"),
              correctionDirection: f.get("correctionDirection"),
              businessDate: f.get("businessDate"),
              notes: f.get("notes"),
            };
        const result = await api(describesProduct ? "/products" : url, {
          method: "POST",
          body: JSON.stringify(body),
        });
        form.reset();
        setImportProductId("");
        setAdjustmentProductId("");
        setInvoiceSelection("NEW");
        setReason("SUPPLIER_RETURN");
        setDirection("INCREASE");
        setAdjustmentWarehouseId("");
        setDestinationWarehouseId("");
        setNotice(
          describesProduct
            ? "Product described with quantity 0. It can now be marked as sold."
            : result?.reserved
              ? "There was not enough stock at this location, so the sold product was added to Reserved."
              : "Inventory action saved successfully.",
        );
        load();
      } catch (z: any) {
        setNotice("");
        se(z.message);
      }
    };
  const pick = (
    <select
      name="productId"
      required
      disabled={
        !adjustmentWarehouseId ||
        (reason === "TRANSPORT" && !adjustmentProducts.length)
      }
      value={adjustmentProductId}
      onChange={(event) => setAdjustmentProductId(event.target.value)}
    >
      <option value="">
        {!adjustmentWarehouseId
          ? "Select warehouse first"
          : reason === "TRANSPORT" && !adjustmentProducts.length
            ? "No products available to transport"
            : "Product"}
      </option>
      {adjustmentProducts.map((x) => (
        <option key={x.id} value={x.id}>
          {x.name} ({x.warehouse_quantity})
        </option>
      ))}
    </select>
  );
  const warehousePick = (
    <select name="warehouseId" required defaultValue="">
      <option value="" disabled>Warehouse</option>
      {warehouses.map((warehouse) => (
        <option key={warehouse.id} value={warehouse.id}>
          {warehouse.name}
        </option>
      ))}
    </select>
  );
  return (
    <>
      <h2>Import</h2>
      <div className="twocol inventory-action-forms">
        <form onSubmit={submit("/inventory/import")}>
          <h3>Import</h3>
          <label>
            Product
            <select
              name="productId"
              required
              value={importProductId}
              onChange={(event) => setImportProductId(event.target.value)}
            >
              <option value="">Product</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} ({product.available_quantity})
                </option>
              ))}
              {admin && <option value="NEW">+ New product</option>}
            </select>
          </label>
          {importProductId === "NEW" && (
            <div className="new-product-fields">
              <label>
                Product name
                <input name="productName" required />
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
                Description
                <textarea name="description" placeholder="Optional" />
              </label>
            </div>
          )}
          {importProductId !== "NEW" && (
            <>
              <label>Warehouse{warehousePick}</label>
              <label>
                Quantity
                <NumericInput name="quantity" integer min="1" required />
              </label>
              <label>
                Invoice
                <select
                  value={invoiceSelection}
                  onChange={(event) => setInvoiceSelection(event.target.value)}
                  required
                >
                  <option value="NEW">+ New invoice</option>
                  {invoices.map((invoice) => (
                    <option key={invoice.code} value={invoice.code}>
                      {invoice.code}
                    </option>
                  ))}
                </select>
              </label>
              {invoiceSelection === "NEW" && (
                <label>
                  New invoice code
                  <InvoiceCodeInput
                    codes={[]}
                    name="newInvoiceCode"
                    required
                  />
                </label>
              )}
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
            </>
          )}
          <button className="form-submit inventory-action">
            {importProductId === "NEW" ? "Describe product" : "Import"}
          </button>
        </form>
        <form onSubmit={submit("/inventory/adjust")}>
          <h3>Adjustment</h3>
          <label>
            Warehouse
            <select
              name="warehouseId"
              required
              value={adjustmentWarehouseId}
              onChange={(event) => {
                const nextWarehouseId = event.target.value;
                setAdjustmentWarehouseId(nextWarehouseId);
                if (destinationWarehouseId === nextWarehouseId)
                  setDestinationWarehouseId("");
              }}
            >
              <option value="" disabled>Warehouse</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </label>
          <label>Product{pick}</label>
          <label>
            Quantity
            <NumericInput name="quantity" integer min="1" required />
          </label>
          <label>
            Reason
            <select
              name="type"
              value={reason}
              onChange={(x) => {
                setReason(x.target.value);
                if (x.target.value !== "TRANSPORT")
                  setDestinationWarehouseId("");
              }}
            >
              <option value="SUPPLIER_RETURN">RETURN</option>
              <option value="SOLD">SOLD</option>
              <option>CORRECTION</option>
              <option>TRANSPORT</option>
            </select>
          </label>
          <div className="adjustment-variable-slot">
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
            {reason === "TRANSPORT" && (
              <label>
                Destination warehouse
                <select
                  name="destinationWarehouseId"
                  required
                  value={destinationWarehouseId}
                  onChange={(event) =>
                    setDestinationWarehouseId(event.target.value)
                  }
                >
                  <option value="" disabled>Destination warehouse</option>
                  {warehouses
                    .filter(
                      (warehouse) => warehouse.id !== adjustmentWarehouseId,
                    )
                    .map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>
          <label>
            {reason === "SOLD" ? "Reservation Date" : "Adjustment date"}
            <input
              name="businessDate"
              type="date"
              defaultValue={today()}
              required
            />
          </label>
          <label>
            Notes
            <input name="notes" placeholder="Optional" />
          </label>
          <button className="form-submit inventory-action">
            Record adjustment
          </button>
        </form>
      </div>
      {e && <p className="error">{e}</p>}
      {notice && <p className="success">{notice}</p>}
      <h3>Actions</h3>
      <MovementTable
        rows={h}
        reload={load}
        allowDelete
        showEmployee={false}
        showWarehouse
      />
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
          row.employee_name,
          row.notes,
          row.target_name,
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
      .map((row) => ({ ...row, product_name: row.product_name || "—" }));
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
            placeholder="Action, product, supplier, note…"
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
          <NavLink to="/import-export">Import</NavLink>
          <NavLink to="/reserved">Reserved</NavLink>
          <NavLink to="/showroom">Showroom</NavLink>
          <NavLink to="/warehouses/galovani">Galovani</NavLink>
          <NavLink to="/warehouses/isani">Isani</NavLink>
          <NavLink to="/suppliers">Suppliers</NavLink>
          <NavLink to="/history">History</NavLink>
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
            element={<Products />}
          />
          <Route path="/inventory" element={<Navigate to="/showroom" replace />} />
          <Route
            path="/import-export"
            element={<Inventory admin={u.role === "ADMIN"} />}
          />
          <Route path="/reserved" element={<ReservedProducts />} />
          <Route
            path="/invoice/:code"
            element={<InvoiceDetails key={location.pathname} />}
          />
          <Route path="/showroom" element={<InventoryLocation slug="showroom" />} />
          <Route path="/warehouses/galovani" element={<InventoryLocation slug="galovani" />} />
          <Route path="/warehouses/isani" element={<InventoryLocation slug="isani" />} />
          <Route
            path="/inventory/:id"
            element={
              <InventoryDetail
                key={location.pathname}
                admin={u.role === "ADMIN"}
              />
            }
          />
          <Route path="/suppliers" element={<Suppliers admin={u.role === "ADMIN"} />} />
          <Route path="/suppliers/:supplierName" element={<SupplierDetail />} />
          <Route path="/history" element={<History />} />
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
