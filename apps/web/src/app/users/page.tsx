"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../components/AppShell";
import {
  fetchJson,
  formatError,
  TOKEN_KEY,
  type SessionResponse,
} from "../lib/api";

type PharmacyUser = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  branch: {
    id: string;
    name: string;
    code: string;
  } | null;
  createdAt: string;
  lastLoginAt: string | null;
};

const initialForm = {
  fullName: "",
  email: "",
  password: "",
  role: "PHARMACIST",
};

export default function UsersPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [users, setUsers] = useState<PharmacyUser[]>([]);
  const [form, setForm] = useState(initialForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTogglingUserId, setIsTogglingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    void loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function field(key: keyof typeof initialForm) {
    return (
      event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
      setForm((prev) => ({
        ...prev,
        [key]: event.target.value,
      }));
    };
  }

  async function loadPage() {
    const token = window.localStorage.getItem(TOKEN_KEY);

    if (!token) {
      router.replace("/login");
      return;
    }

    setError(null);

    try {
      const sessionData = await fetchJson<SessionResponse>("/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (sessionData.user.role !== "OWNER") {
        router.replace("/dashboard");
        return;
      }

      const usersData = await fetchJson<PharmacyUser[]>("/users", {
        headers: { Authorization: `Bearer ${token}` },
      });

      setSession(sessionData);
      setUsers(usersData);
    } catch (err) {
      window.localStorage.removeItem(TOKEN_KEY);
      setError(formatError(err));
      router.replace("/login");
    } finally {
      setIsLoading(false);
    }
  }

  async function reloadUsers() {
    const token = window.localStorage.getItem(TOKEN_KEY);

    if (!token) {
      router.replace("/login");
      return;
    }

    const usersData = await fetchJson<PharmacyUser[]>("/users", {
      headers: { Authorization: `Bearer ${token}` },
    });

    setUsers(usersData);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = window.localStorage.getItem(TOKEN_KEY);

    if (!token) {
      router.replace("/login");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      await fetchJson("/users", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });

      setForm(initialForm);
      setSuccessMsg(`${form.role.toLowerCase()} account created successfully.`);
      await reloadUsers();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updateUserStatus(user: PharmacyUser, isActive: boolean) {
    const token = window.localStorage.getItem(TOKEN_KEY);

    if (!token) {
      router.replace("/login");
      return;
    }

    setIsTogglingUserId(user.id);
    setError(null);
    setSuccessMsg(null);

    try {
      await fetchJson(`/users/${user.id}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive }),
      });

      setSuccessMsg(
        `${user.fullName} was ${isActive ? "reactivated" : "deactivated"} successfully.`
      );
      await reloadUsers();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsTogglingUserId(null);
    }
  }

  function signOut() {
    window.localStorage.removeItem(TOKEN_KEY);
    router.replace("/login");
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div
            className="w-10 h-10 rounded-full border-4 border-surface-high border-t-primary animate-spin-loader"
            role="status"
            aria-label="Loading users"
          />
          <p className="text-on-surface-variant text-sm font-medium">
            Loading staff management…
          </p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const ownerCount = users.filter((user) => user.role === "OWNER").length;
  const pharmacistCount = users.filter((user) => user.role === "PHARMACIST").length;
  const cashierCount = users.filter((user) => user.role === "CASHIER").length;
  const initials = session.user.fullName
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  return (
    <AppShell session={session}>
      <div className="px-8 py-8 max-w-[1200px] mx-auto w-full">
        <div className="mb-10">
          <p className="text-[0.75rem] font-bold tracking-[0.08em] uppercase text-outline mb-2">
            Staff Management
          </p>
          <h1 className="text-[2.75rem] font-bold text-on-surface tracking-[-0.04em] leading-none">
            Manage pharmacy users.
          </h1>
          <p className="mt-2 text-on-surface-variant text-base">
            Create pharmacist and cashier accounts for {session.pharmacy.name}.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Staff" value={String(users.length)} note="Active directory" />
          <StatCard label="Owners" value={String(ownerCount)} note="Protected accounts" />
          <StatCard
            label="Pharmacists"
            value={String(pharmacistCount)}
            note="Can dispense medicines"
          />
          <StatCard
            label="Cashiers"
            value={String(cashierCount)}
            note="Counter access"
          />
        </div>

        <div className="grid lg:grid-cols-[1fr_360px] gap-6">
          <section
            className="rounded-lg bg-surface-lowest p-8"
            style={{ boxShadow: "0 12px 40px rgba(0,66,83,0.08)" }}
          >
            <div className="flex items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-[1.1rem] font-bold text-on-surface">
                  Team directory
                </h2>
                <p className="text-on-surface-variant text-sm mt-1">
                  Owner-only access to staff accounts and branch assignments.
                </p>
              </div>
              <div className="px-3 py-1.5 rounded-full bg-surface-low text-outline text-xs font-bold tracking-widest uppercase">
                Owner only
              </div>
            </div>

            {error ? (
              <div className="mb-5 px-4 py-3 rounded-lg bg-error-container text-on-error-container text-sm">
                {error}
              </div>
            ) : null}

            {successMsg ? (
              <div className="mb-5 px-4 py-3 rounded-lg bg-secondary-container text-on-secondary-container text-sm">
                {successMsg}
              </div>
            ) : null}

            {users.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-3 rounded-lg bg-surface-low">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(0,66,83,0.06)" }}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="7" r="3" stroke="#70787d" strokeWidth="1.5" />
                    <path d="M4 16c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="#70787d" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </div>
                <p className="text-on-surface font-semibold text-sm">No staff accounts yet</p>
                <p className="text-on-surface-variant text-xs max-w-[240px] text-center leading-relaxed">
                  Create pharmacist and cashier accounts using the form. Staff inherit your current branch by default.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-surface-low text-outline text-[0.7rem] uppercase tracking-[0.08em]">
                      <th className="px-4 py-3 font-bold">User</th>
                      <th className="px-4 py-3 font-bold">Role</th>
                      <th className="px-4 py-3 font-bold">Branch</th>
                      <th className="px-4 py-3 font-bold">Last login</th>
                      <th className="px-4 py-3 font-bold">Status</th>
                      <th className="px-4 py-3 font-bold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user, index) => (
                      <tr
                        key={user.id}
                        className={index % 2 === 0 ? "bg-surface-lowest" : "bg-surface"}
                      >
                        <td className="px-4 py-4 align-top">
                          <p className="text-on-surface font-semibold">{user.fullName}</p>
                          <p className="text-on-surface-variant text-sm mt-1">
                            {user.email}
                          </p>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <RoleChip role={user.role} />
                        </td>
                        <td className="px-4 py-4 align-top text-on-surface-variant text-sm">
                          {user.branch ? (
                            <>
                              <p className="text-on-surface font-medium">
                                {user.branch.name}
                              </p>
                              <p className="mt-1">{user.branch.code}</p>
                            </>
                          ) : (
                            "Unassigned"
                          )}
                        </td>
                        <td className="px-4 py-4 align-top text-on-surface-variant text-sm">
                          {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Never"}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <StatusChip isActive={user.isActive} />
                        </td>
                        <td className="px-4 py-4 align-top">
                          {user.role !== "OWNER" ? (
                            <button
                              type="button"
                              onClick={() => updateUserStatus(user, !user.isActive)}
                              disabled={isTogglingUserId === user.id}
                              className={[
                                "rounded-full px-3 py-1.5 text-xs font-bold tracking-wide transition-colors disabled:opacity-60",
                                user.isActive
                                  ? "bg-error-container text-on-error-container hover:opacity-90"
                                  : "bg-secondary-container text-on-secondary-container hover:opacity-90",
                              ].join(" ")}
                            >
                              {isTogglingUserId === user.id
                                ? "Saving…"
                                : user.isActive
                                  ? "Deactivate"
                                  : "Reactivate"}
                            </button>
                          ) : (
                            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-outline">
                              Protected
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section
            className="rounded-lg bg-surface-lowest p-6"
            style={{ boxShadow: "0 4px 16px rgba(0,66,83,0.06)" }}
          >
            <h3 className="text-[1rem] font-bold text-on-surface">
              Create staff account
            </h3>
            <p className="text-on-surface-variant text-sm mt-1 mb-6">
              New accounts inherit your current branch unless branch assignment is added later.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <FormField
                id="fullName"
                label="Full name"
                placeholder="Saron Bekele"
                required
                value={form.fullName}
                onChange={field("fullName")}
              />
              <FormField
                id="email"
                label="Email"
                type="email"
                placeholder="staff@pharmahub.et"
                required
                value={form.email}
                onChange={field("email")}
              />
              <FormField
                id="password"
                label="Temporary password"
                type="password"
                placeholder="Min. 8 characters"
                required
                minLength={8}
                value={form.password}
                onChange={field("password")}
              />

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="role"
                  className="text-[0.75rem] font-bold text-on-surface tracking-[0.01em]"
                >
                  Role <span className="text-on-error-container ml-0.5">*</span>
                </label>
                <select
                  id="role"
                  value={form.role}
                  onChange={field("role")}
                  className="h-11 px-4 rounded-lg bg-surface-lowest text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow"
                  style={{ boxShadow: "0 1px 4px rgba(0,66,83,0.06)" }}
                >
                  <option value="PHARMACIST">Pharmacist</option>
                  <option value="CASHIER">Cashier</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-12 rounded-[4px] text-white font-bold text-sm tracking-wide disabled:opacity-60 transition-opacity cursor-pointer"
                style={{
                  background: isSubmitting
                    ? "#004253"
                    : "linear-gradient(135deg, #004253, #005b71)",
                }}
              >
                {isSubmitting ? "Creating account…" : "Create Staff Account"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div
      className="rounded-lg bg-surface-lowest p-5"
      style={{ boxShadow: "0 4px 16px rgba(0,66,83,0.06)" }}
    >
      <p className="text-[0.75rem] font-bold tracking-[0.08em] uppercase text-outline mb-1">
        {label}
      </p>
      <p className="text-[2.75rem] font-bold text-on-surface leading-none tracking-[-0.04em]">
        {value}
      </p>
      <p className="text-on-surface-variant text-xs mt-1">{note}</p>
    </div>
  );
}

function RoleChip({ role }: { role: string }) {
  const styles =
    role === "OWNER"
      ? "bg-secondary-container text-on-secondary-container"
      : role === "PHARMACIST"
        ? "bg-tertiary-fixed text-on-tertiary-fixed-variant"
        : "bg-surface-low text-on-surface-variant";

  return (
    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold tracking-wide ${styles}`}>
      {role.toLowerCase()}
    </span>
  );
}

function StatusChip({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex px-3 py-1 rounded-full text-xs font-bold tracking-wide ${
        isActive
          ? "bg-secondary-container text-on-secondary-container"
          : "bg-error-container text-on-error-container"
      }`}
    >
      {isActive ? "active" : "inactive"}
    </span>
  );
}

function FormField({
  id,
  label,
  type = "text",
  placeholder,
  required,
  minLength,
  value,
  onChange,
}: {
  id: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-[0.75rem] font-bold text-on-surface tracking-[0.01em]"
      >
        {label}
        {required ? <span className="text-on-error-container ml-0.5">*</span> : null}
      </label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        value={value}
        onChange={onChange}
        className="h-11 px-4 rounded-lg bg-surface-lowest text-on-surface text-sm placeholder:text-outline/60 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow"
        style={{ boxShadow: "0 1px 4px rgba(0,66,83,0.06)" }}
      />
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
