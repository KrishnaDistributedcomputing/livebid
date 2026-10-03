"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Archive,
  Boxes,
  CircleDollarSign,
  Gavel,
  LayoutDashboard,
  LogOut,
  PackageCheck,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldX,
  Store,
  Users,
  Zap,
} from "lucide-react";

type AdminTab = "users" | "products" | "shows" | "auctions" | "orders" | "audit";

type Summary = {
  users: number;
  activeUsers: number;
  suspendedUsers: number;
  sellers: number;
  products: number;
  liveShows: number;
  activeAuctions: number;
  orders: number;
  orderValueMinor: number;
  pendingOutboxEvents: number;
};

type AdminUser = {
  id: string;
  email: string;
  username: string;
  role: string;
  status: string;
  sellerName: string | null;
  verificationStatus: string | null;
  productCount: number;
  orderCount: number;
  createdAt: string;
  lastSeenAt: string | null;
};

type AuditEvent = {
  id: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  createdAt: string;
};

const tabs: Array<{ id: AdminTab; label: string; icon: typeof Users }> = [
  { id: "users", label: "Users", icon: Users },
  { id: "products", label: "Products", icon: Boxes },
  { id: "shows", label: "Shows", icon: Radio },
  { id: "auctions", label: "Auctions", icon: Gavel },
  { id: "orders", label: "Orders", icon: PackageCheck },
  { id: "audit", label: "Audit", icon: Activity },
];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error?.message ?? "The request failed.");
  }
  return body as T;
}

function money(amountMinor: unknown, currency: unknown = "USD") {
  if (typeof amountMinor !== "number") return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: typeof currency === "string" ? currency : "USD",
  }).format(amountMinor / 100);
}

function date(value: unknown) {
  if (typeof value !== "string") return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AdminPortal() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [email, setEmail] = useState("admin@livebid.local");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [tab, setTab] = useState<AdminTab>("users");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [resources, setResources] = useState<Array<Record<string, unknown>>>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const loadSummary = useCallback(async () => {
    const body = await api<{ summary: Summary }>("/api/admin/dashboard");
    setSummary(body.summary);
  }, []);

  const loadUsers = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (role) params.set("role", role);
    if (status) params.set("status", status);
    const body = await api<{ users: AdminUser[] }>(`/api/admin/users?${params}`);
    setUsers(body.users);
  }, [role, search, status]);

  const loadInitialUsers = useCallback(async () => {
    const body = await api<{ users: AdminUser[] }>("/api/admin/users");
    setUsers(body.users);
  }, []);

  const loadSection = useCallback(async (section: AdminTab) => {
    setBusy(true);
    try {
      if (section === "users") {
        await loadUsers();
      } else if (section === "audit") {
        const body = await api<{ events: AuditEvent[] }>("/api/admin/audit");
        setAuditEvents(body.events);
      } else {
        const body = await api<{ items: Array<Record<string, unknown>> }>(
          `/api/admin/resources?type=${section}`,
        );
        setResources(body.items);
      }
    } finally {
      setBusy(false);
    }
  }, [loadUsers]);

  useEffect(() => {
    api<{ user: { role: string } | null }>("/api/auth/me")
      .then(async ({ user }) => {
        const isAdmin = user?.role === "ADMIN";
        setAuthenticated(isAdmin);
        if (isAdmin) await Promise.all([loadSummary(), loadInitialUsers()]);
      })
      .catch(() => setAuthenticated(false));
  }, [loadInitialUsers, loadSummary]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setLoginError("");
    try {
      const result = await api<{ user: { role: string } }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (result.user.role !== "ADMIN") {
        await api("/api/auth/logout", { method: "POST" });
        throw new Error("This account does not have administrator access.");
      }
      setAuthenticated(true);
      await Promise.all([loadSummary(), loadInitialUsers()]);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setAuthenticated(false);
    setPassword("");
  }

  async function changeStatus(user: AdminUser) {
    const nextStatus = user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    const reason = window.prompt(
      `${nextStatus === "SUSPENDED" ? "Suspend" : "Activate"} ${user.username}. Enter a reason:`,
    );
    if (!reason) return;
    setBusy(true);
    setNotice("");
    try {
      await api(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus, reason }),
      });
      setNotice(`${user.username} is now ${nextStatus.toLowerCase()}.`);
      await Promise.all([loadUsers(), loadSummary()]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Status update failed.");
    } finally {
      setBusy(false);
    }
  }

  if (authenticated === null) {
    return (
      <main className="admin-loading">
        <Zap size={28} />
        <span>Loading LiveBid operations</span>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="admin-login-shell">
        <section className="admin-login-panel">
          <div className="admin-login-brand">
            <span><Zap size={24} /></span>
            <div>
              <small>LIVEBID OPERATIONS</small>
              <h1>Admin portal</h1>
            </div>
          </div>
          <p>Sign in with an administrator account to manage marketplace operations.</p>
          <form onSubmit={login}>
            <label>
              Email
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            {loginError && <p className="admin-error" role="alert">{loginError}</p>}
            <button type="submit" disabled={busy}>
              <ShieldCheck size={18} />
              {busy ? "Signing in..." : "Sign in securely"}
            </button>
          </form>
          <Link href="/">Return to marketplace</Link>
        </section>
      </main>
    );
  }

  const metricCards = summary
    ? [
        ["Accounts", summary.users, Users],
        ["Sellers", summary.sellers, Store],
        ["Products", summary.products, Boxes],
        ["Live shows", summary.liveShows, Radio],
        ["Active auctions", summary.activeAuctions, Gavel],
        ["Orders", summary.orders, PackageCheck],
        ["Order value", money(summary.orderValueMinor), CircleDollarSign],
        ["Pending events", summary.pendingOutboxEvents, Archive],
      ] as const
    : [];

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="admin-wordmark" href="/">
          <span><Zap size={20} /></span>
          <strong>LIVEBID</strong>
        </Link>
        <div className="admin-section-label">OPERATIONS</div>
        <button
          type="button"
          className="admin-overview-link is-active"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          <LayoutDashboard size={18} /> Overview
        </button>
        <nav aria-label="Admin sections">
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                className={tab === item.id ? "is-active" : ""}
                key={item.id}
                onClick={() => {
                  setTab(item.id);
                  loadSection(item.id).catch((error: unknown) => {
                    setNotice(error instanceof Error ? error.message : "Unable to load admin data.");
                  });
                }}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <button type="button" className="admin-logout" onClick={logout}>
          <LogOut size={18} /> Sign out
        </button>
      </aside>

      <main className="admin-main">
        <header className="admin-header">
          <div>
            <span>MARKETPLACE CONTROL</span>
            <h1>Operations overview</h1>
            <p>Monitor activity, manage accounts, and review administrative actions.</p>
          </div>
          <div className="admin-system-state">
            <span />
            <div><strong>Systems operational</strong><small>PostgreSQL + Redis</small></div>
          </div>
        </header>

        <section className="admin-metrics" aria-label="Operational metrics">
          {metricCards.map(([label, value, Icon]) => (
            <article key={label}>
              <div><Icon size={18} /></div>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </section>

        <section className="admin-data-panel">
          <div className="admin-panel-heading">
            <div>
              <span>{tab.toUpperCase()}</span>
              <h2>{tabs.find((item) => item.id === tab)?.label}</h2>
            </div>
            <button
              type="button"
              className="admin-refresh"
              onClick={() => loadSection(tab)}
              disabled={busy}
            >
              <RefreshCw size={16} className={busy ? "is-spinning" : ""} /> Refresh
            </button>
          </div>

          {notice && <div className="admin-notice" role="status">{notice}</div>}

          {tab === "users" && (
            <>
              <div className="admin-filters">
                <label>
                  <Search size={17} />
                  <span className="sr-only">Search users</span>
                  <input
                    type="search"
                    placeholder="Search email, username, or seller"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
                <select value={role} onChange={(event) => setRole(event.target.value)}>
                  <option value="">All roles</option>
                  <option value="BUYER">Buyers</option>
                  <option value="SELLER">Sellers</option>
                  <option value="ADMIN">Administrators</option>
                </select>
                <select value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="">All statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                </select>
                <button type="button" onClick={() => loadUsers()}>Apply filters</button>
              </div>
              <div className="admin-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>User</th><th>Role</th><th>Status</th><th>Products</th>
                      <th>Orders</th><th>Joined</th><th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td><strong>{user.sellerName ?? user.username}</strong><small>{user.email}</small></td>
                        <td><span className="admin-role">{user.role}</span></td>
                        <td><span className={`admin-status ${user.status.toLowerCase()}`}>{user.status}</span></td>
                        <td>{user.productCount}</td>
                        <td>{user.orderCount}</td>
                        <td>{date(user.createdAt)}</td>
                        <td>
                          <button
                            type="button"
                            className={user.status === "ACTIVE" ? "admin-suspend" : "admin-activate"}
                            onClick={() => changeStatus(user)}
                            disabled={busy}
                          >
                            {user.status === "ACTIVE" ? <ShieldX size={15} /> : <ShieldCheck size={15} />}
                            {user.status === "ACTIVE" ? "Suspend" : "Activate"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab !== "users" && tab !== "audit" && (
            <ResourceTable type={tab} items={resources} />
          )}

          {tab === "audit" && (
            <div className="admin-table-wrap">
              <table>
                <thead><tr><th>Action</th><th>Administrator</th><th>Target</th><th>Reason</th><th>Time</th></tr></thead>
                <tbody>
                  {auditEvents.map((event) => (
                    <tr key={event.id}>
                      <td><strong>{event.action.replaceAll("_", " ")}</strong></td>
                      <td>{event.actor}</td>
                      <td><small>{event.targetType}</small>{event.targetId.slice(0, 8)}</td>
                      <td>{event.reason}</td>
                      <td>{date(event.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {auditEvents.length === 0 && <div className="admin-empty">No administrative actions recorded.</div>}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function ResourceTable({
  type,
  items,
}: {
  type: Exclude<AdminTab, "users" | "audit">;
  items: Array<Record<string, unknown>>;
}) {
  const columns = {
    products: ["title", "seller", "category", "condition", "status", "buyNowPriceMinor", "quantity"],
    shows: ["title", "seller", "status", "scheduledAt", "startedAt"],
    auctions: ["product", "seller", "status", "currentPriceMinor", "sequence", "endsAt"],
    orders: ["id", "buyer", "seller", "totalMinor", "paymentStatus", "fulfillmentStatus", "createdAt"],
  }[type];

  function display(key: string, value: unknown, item: Record<string, unknown>) {
    if (key.endsWith("Minor")) return money(value, item.currency);
    if (key.endsWith("At")) return date(value);
    if (key === "id" && typeof value === "string") return value.slice(0, 8);
    return value == null ? "—" : String(value);
  }

  return (
    <div className="admin-table-wrap">
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column.replace(/([A-Z])/g, " $1")}</th>)}</tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={String(item.id ?? index)}>
              {columns.map((column) => <td key={column}>{display(column, item[column], item)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <div className="admin-empty">No records found.</div>}
    </div>
  );
}
