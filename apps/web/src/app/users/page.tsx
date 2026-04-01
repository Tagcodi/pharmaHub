"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../components/AppShell";
import { useI18n } from "../i18n/I18nProvider";
import { formatDateTime } from "../i18n/format";
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
  const { locale } = useI18n();
  const text = USERS_COPY[locale] as (typeof USERS_COPY)["en"];
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
      setSuccessMsg(
        text.createSuccess.replace("{role}", formatRole(form.role, text))
      );
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
        text.statusSuccess
          .replace("{name}", user.fullName)
          .replace(
            "{action}",
            isActive ? text.reactivated.toLowerCase() : text.deactivated.toLowerCase()
          )
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
            aria-label={text.loadingUsers}
          />
          <p className="text-on-surface-variant text-sm font-medium">
            {text.loadingStaffManagement}
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
            {text.staffManagement}
          </p>
          <h1 className="text-[2.75rem] font-bold text-on-surface tracking-[-0.04em] leading-none">
            {text.manageUsers}
          </h1>
          <p className="mt-2 text-on-surface-variant text-base">
            {text.createAccounts.replace("{pharmacy}", session.pharmacy.name)}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label={text.totalStaff} value={String(users.length)} note={text.activeDirectory} />
          <StatCard label={text.owners} value={String(ownerCount)} note={text.protectedAccounts} />
          <StatCard
            label={text.pharmacists}
            value={String(pharmacistCount)}
            note={text.canDispense}
          />
          <StatCard
            label={text.cashiers}
            value={String(cashierCount)}
            note={text.counterAccess}
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
                  {text.teamDirectory}
                </h2>
                <p className="text-on-surface-variant text-sm mt-1">
                  {text.ownerOnlyDirectory}
                </p>
              </div>
              <div className="px-3 py-1.5 rounded-full bg-surface-low text-outline text-xs font-bold tracking-widest uppercase">
                {text.ownerOnly}
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
                <p className="text-on-surface font-semibold text-sm">{text.noStaffAccounts}</p>
                <p className="text-on-surface-variant text-xs max-w-[240px] text-center leading-relaxed">
                  {text.noStaffDescription}
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-surface-low text-outline text-[0.7rem] uppercase tracking-[0.08em]">
                      <th className="px-4 py-3 font-bold">{text.user}</th>
                      <th className="px-4 py-3 font-bold">{text.role}</th>
                      <th className="px-4 py-3 font-bold">{text.branch}</th>
                      <th className="px-4 py-3 font-bold">{text.lastLogin}</th>
                      <th className="px-4 py-3 font-bold">{text.status}</th>
                      <th className="px-4 py-3 font-bold">{text.actions}</th>
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
                          <RoleChip role={user.role} text={text} />
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
                            text.unassigned
                          )}
                        </td>
                        <td className="px-4 py-4 align-top text-on-surface-variant text-sm">
                          {user.lastLoginAt ? formatDateTime(user.lastLoginAt, locale) : text.never}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <StatusChip isActive={user.isActive} text={text} />
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
                                ? text.saving
                                : user.isActive
                                  ? text.deactivate
                                  : text.reactivate}
                            </button>
                          ) : (
                            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-outline">
                              {text.protected}
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
              {text.createStaffAccount}
            </h3>
            <p className="text-on-surface-variant text-sm mt-1 mb-6">
              {text.newAccountsDescription}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <FormField
                id="fullName"
                label={text.fullName}
                placeholder={text.fullNamePlaceholder}
                required
                value={form.fullName}
                onChange={field("fullName")}
              />
              <FormField
                id="email"
                label={text.email}
                type="email"
                placeholder={text.emailPlaceholder}
                required
                value={form.email}
                onChange={field("email")}
              />
              <FormField
                id="password"
                label={text.temporaryPassword}
                type="password"
                placeholder={text.passwordPlaceholder}
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
                  {text.role} <span className="text-on-error-container ml-0.5">*</span>
                </label>
                <select
                  id="role"
                  value={form.role}
                  onChange={field("role")}
                  className="h-11 px-4 rounded-lg bg-surface-lowest text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow"
                  style={{ boxShadow: "0 1px 4px rgba(0,66,83,0.06)" }}
                >
                  <option value="PHARMACIST">{text.pharmacist}</option>
                  <option value="CASHIER">{text.cashier}</option>
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
                {isSubmitting ? text.creatingAccount : text.createStaffAccountButton}
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

function RoleChip({
  role,
  text,
}: {
  role: string;
  text: (typeof USERS_COPY)["en"];
}) {
  const styles =
    role === "OWNER"
      ? "bg-secondary-container text-on-secondary-container"
      : role === "PHARMACIST"
        ? "bg-tertiary-fixed text-on-tertiary-fixed-variant"
        : "bg-surface-low text-on-surface-variant";

  return (
    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold tracking-wide ${styles}`}>
      {formatRole(role, text)}
    </span>
  );
}

function StatusChip({
  isActive,
  text,
}: {
  isActive: boolean;
  text: (typeof USERS_COPY)["en"];
}) {
  return (
    <span
      className={`inline-flex px-3 py-1 rounded-full text-xs font-bold tracking-wide ${
        isActive
          ? "bg-secondary-container text-on-secondary-container"
          : "bg-error-container text-on-error-container"
      }`}
    >
      {isActive ? text.active : text.inactive}
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
function formatRole(role: string, text: (typeof USERS_COPY)["en"]) {
  if (role === "OWNER") {
    return text.owner;
  }

  if (role === "PHARMACIST") {
    return text.pharmacist;
  }

  return text.cashier;
}

const USERS_COPY = {
  en: {
    loadingUsers: "Loading users",
    loadingStaffManagement: "Loading staff management…",
    staffManagement: "Staff Management",
    manageUsers: "Manage pharmacy users.",
    createAccounts: "Create pharmacist and cashier accounts for {pharmacy}.",
    totalStaff: "Total Staff",
    activeDirectory: "Active directory",
    owners: "Owners",
    protectedAccounts: "Protected accounts",
    pharmacists: "Pharmacists",
    canDispense: "Can dispense medicines",
    cashiers: "Cashiers",
    counterAccess: "Counter access",
    teamDirectory: "Team directory",
    ownerOnlyDirectory: "Owner-only access to staff accounts and branch assignments.",
    ownerOnly: "Owner only",
    noStaffAccounts: "No staff accounts yet",
    noStaffDescription:
      "Create pharmacist and cashier accounts using the form. Staff inherit your current branch by default.",
    user: "User",
    role: "Role",
    branch: "Branch",
    lastLogin: "Last login",
    status: "Status",
    actions: "Actions",
    unassigned: "Unassigned",
    never: "Never",
    saving: "Saving…",
    deactivate: "Deactivate",
    reactivate: "Reactivate",
    protected: "Protected",
    createStaffAccount: "Create staff account",
    newAccountsDescription:
      "New accounts inherit your current branch unless branch assignment is added later.",
    fullName: "Full name",
    fullNamePlaceholder: "Saron Bekele",
    email: "Email",
    emailPlaceholder: "staff@pharmahub.et",
    temporaryPassword: "Temporary password",
    passwordPlaceholder: "Min. 8 characters",
    pharmacist: "Pharmacist",
    cashier: "Cashier",
    owner: "Owner",
    creatingAccount: "Creating account…",
    createStaffAccountButton: "Create Staff Account",
    active: "Active",
    inactive: "Inactive",
    createSuccess: "{role} account created successfully.",
    statusSuccess: "{name} was {action} successfully.",
    reactivated: "Reactivated",
    deactivated: "Deactivated",
  },
  am: {
    loadingUsers: "ተጠቃሚዎች በመጫን ላይ",
    loadingStaffManagement: "የሰራተኛ አስተዳደር በመጫን ላይ…",
    staffManagement: "የሰራተኛ አስተዳደር",
    manageUsers: "የፋርማሲ ተጠቃሚዎችን ያስተዳድሩ።",
    createAccounts: "ለ {pharmacy} የፋርማሲስት እና የካሽየር መለያዎችን ይፍጠሩ።",
    totalStaff: "ጠቅላላ ሰራተኞች",
    activeDirectory: "ንቁ ዝርዝር",
    owners: "ባለቤቶች",
    protectedAccounts: "የተጠበቁ መለያዎች",
    pharmacists: "ፋርማሲስቶች",
    canDispense: "መድሃኒት ማቅረብ ይችላሉ",
    cashiers: "ካሽየሮች",
    counterAccess: "የካውንተር መዳረሻ",
    teamDirectory: "የቡድን ዝርዝር",
    ownerOnlyDirectory: "ለሰራተኛ መለያዎች እና ለቅርንጫፍ መደበኞች የባለቤት ብቻ መዳረሻ።",
    ownerOnly: "ለባለቤት ብቻ",
    noStaffAccounts: "እስካሁን የሰራተኛ መለያዎች የሉም",
    noStaffDescription:
      "ቅጹን በመጠቀም የፋርማሲስት እና የካሽየር መለያዎችን ይፍጠሩ። ሰራተኞች በነባሪ የአሁኑን ቅርንጫፍ ይወርሳሉ።",
    user: "ተጠቃሚ",
    role: "ሚና",
    branch: "ቅርንጫፍ",
    lastLogin: "የመጨረሻ መግቢያ",
    status: "ሁኔታ",
    actions: "እርምጃዎች",
    unassigned: "አልተመደበም",
    never: "አይተከሰተም",
    saving: "በማስቀመጥ ላይ…",
    deactivate: "አቦዝን",
    reactivate: "እንደገና አንቃ",
    protected: "የተጠበቀ",
    createStaffAccount: "የሰራተኛ መለያ ፍጠር",
    newAccountsDescription:
      "አዲስ መለያዎች በኋላ የቅርንጫፍ መደበኛ ካልተጨመረ በቀር የአሁኑን ቅርንጫፍ ይወርሳሉ።",
    fullName: "ሙሉ ስም",
    fullNamePlaceholder: "ሳሮን በቀለ",
    email: "ኢሜይል",
    emailPlaceholder: "staff@pharmahub.et",
    temporaryPassword: "ጊዜያዊ የይለፍ ቃል",
    passwordPlaceholder: "ቢያንስ 8 ቁምፊዎች",
    pharmacist: "ፋርማሲስት",
    cashier: "ካሽየር",
    owner: "ባለቤት",
    creatingAccount: "መለያ በመፍጠር ላይ…",
    createStaffAccountButton: "የሰራተኛ መለያ ፍጠር",
    active: "ንቁ",
    inactive: "የቦዘነ",
    createSuccess: "{role} መለያ በተሳካ ሁኔታ ተፈጥሯል።",
    statusSuccess: "{name} በተሳካ ሁኔታ {action}።",
    reactivated: "እንደገና ተንቅቷል",
    deactivated: "ተቦዝኗል",
  },
  om: {
    loadingUsers: "Fayyadamtoonni fe'amaa jiru",
    loadingStaffManagement: "Bulchiinsi hojjettootaa fe'amaa jira…",
    staffManagement: "Bulchiinsa Hojjettootaa",
    manageUsers: "Fayyadamtoota farmasii bulchi.",
    createAccounts: "Herrega farmaasistii fi kaashiyerii {pharmacy}f uumi.",
    totalStaff: "Hojjettoota Waliigalaa",
    activeDirectory: "Tarree hojii irra jiru",
    owners: "Abbootii qabeenyaa",
    protectedAccounts: "Herregoota eegamoo",
    pharmacists: "Farmaasistoota",
    canDispense: "Qoricha kennuu danda'u",
    cashiers: "Kaashiyeroota",
    counterAccess: "Seensa kaawuntarii",
    teamDirectory: "Tarree garee",
    ownerOnlyDirectory: "Seensa abbaa qabeenyaa qofa herrega hojjettootaa fi ramaddii dameef.",
    ownerOnly: "Abbaa qabeenya qofa",
    noStaffAccounts: "Herregni hojjettootaa hin jiru",
    noStaffDescription:
      "Furmaata kanaan herrega farmaasistii fi kaashiyerii uumi. Hojjettoonni damee amma jiru ofumaan argatu.",
    user: "Fayyadamaa",
    role: "Gahee",
    branch: "Damee",
    lastLogin: "Seensa dhumaa",
    status: "Haala",
    actions: "Tarkaanfiiwwan",
    unassigned: "Hin ramadamin",
    never: "Matumaa",
    saving: "Olkaa'amaa jira…",
    deactivate: "Dhaabi",
    reactivate: "Deebisii banuu",
    protected: "Eegamaa",
    createStaffAccount: "Herrega hojjetaa uumi",
    newAccountsDescription:
      "Herregoonni haaraan ramaddiin damee booda yoo hin dabalamin damee ammaa dhaalu.",
    fullName: "Maqaa guutuu",
    fullNamePlaceholder: "Saron Bekele",
    email: "Imeelii",
    emailPlaceholder: "staff@pharmahub.et",
    temporaryPassword: "Jecha darbii yeroo",
    passwordPlaceholder: "Qubee 8 ol",
    pharmacist: "Farmaasistii",
    cashier: "Kaashiyerii",
    owner: "Abbaa qabeenyaa",
    creatingAccount: "Herregni uumamaa jira…",
    createStaffAccountButton: "Herrega Hojjetaa Uumi",
    active: "Hojii irra",
    inactive: "Hojii ala",
    createSuccess: "Herregni {role} milkaa'inaan uumameera.",
    statusSuccess: "{name} milkaa'inaan {action}.",
    reactivated: "deebi'ee hojii irra ooleera",
    deactivated: "dhaabbateera",
  },
} as const;
