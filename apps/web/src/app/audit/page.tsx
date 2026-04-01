"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../components/AppShell";
import { AppLoading } from "../components/ui/AppLoading";
import { EmptyStateCard } from "../components/ui/EmptyStateCard";
import { KpiCard } from "../components/ui/KpiCard";
import { StatusBadge } from "../components/ui/StatusBadge";
import { SurfaceCard } from "../components/ui/SurfaceCard";
import { useI18n } from "../i18n/I18nProvider";
import { formatRelativeTime } from "../i18n/format";
import {
  TOKEN_KEY,
  fetchJson,
  formatError,
  getAuthHeaders,
  getStoredToken,
  type AuditLogsResponse,
  type SessionResponse,
} from "../lib/api";

const FILTERS = ["All", "Inventory", "Sales", "Access", "Users", "Catalog"] as const;

export default function AuditPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const text = AUDIT_COPY[locale] as (typeof AUDIT_COPY)["en"];
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [logs, setLogs] = useState<AuditLogsResponse | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPage() {
    const token = getStoredToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    try {
      const sessionData = await fetchJson<SessionResponse>("/auth/me", {
        headers: getAuthHeaders(token),
      });

      if (sessionData.user.role === "CASHIER") {
        router.replace("/dashboard");
        return;
      }

      const logsData = await fetchJson<AuditLogsResponse>("/audit/logs", {
        headers: getAuthHeaders(token),
      });

      setSession(sessionData);
      setLogs(logsData);
    } catch (err) {
      const message = formatError(err);

      if (message.toLowerCase().includes("missing bearer token")) {
        window.localStorage.removeItem(TOKEN_KEY);
        router.replace("/login");
        return;
      }

      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  const filteredItems = useMemo(() => {
    const items = logs?.items ?? [];

    if (filter === "All") {
      return items;
    }

    return items.filter((item) => item.category === filter);
  }, [filter, logs?.items]);

  if (isLoading) {
    return <AppLoading message={text.loadingAuditFeed} />;
  }

  if (!session) {
    return null;
  }

  const metrics = logs?.metrics ?? {
    totalEvents: 0,
    stockAdjustments: 0,
    suspectedLossEvents: 0,
    failedLoginCount: 0,
  };

  return (
    <AppShell session={session}>
      <div className="mx-auto w-full max-w-[1240px] px-8 py-8">
        <div className="mb-7 grid gap-5 lg:grid-cols-4">
          <KpiCard
            label={text.auditEvents}
            value={String(metrics.totalEvents)}
            note={text.latestEvents}
          />
          <KpiCard
            label={text.stockAdjustments}
            value={String(metrics.stockAdjustments)}
            note={text.manualCorrections}
          />
          <KpiCard
            label={text.suspectedLoss}
            value={String(metrics.suspectedLossEvents)}
            valueColor="#93000a"
            note={text.lossIncidents}
          />
          <KpiCard
            label={text.failedLogins}
            value={String(metrics.failedLoginCount)}
            valueColor="#93000a"
            note={text.rejectedSignIns}
          />
        </div>

        {error ? (
          <div className="mb-6 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
            {error}
          </div>
        ) : null}

        <SurfaceCard className="p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[2rem] font-bold leading-none tracking-[-0.04em] text-on-surface">
                {text.auditLog}
              </h1>
              <p className="mt-2 text-sm text-on-surface-variant">
                {text.auditDescription}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {FILTERS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setFilter(item)}
                  className={[
                    "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                    filter === item
                      ? "bg-primary/10 text-primary"
                      : "bg-surface-low text-on-surface-variant hover:bg-surface",
                  ].join(" ")}
                >
                  {formatAuditCategory(item, text)}
                </button>
              ))}
            </div>
          </div>

          {filteredItems.length ? (
            <div className="mt-6 space-y-4">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-outline/10 bg-surface-low p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-on-surface">
                          {item.title}
                        </p>
                        <StatusBadge
                          label={formatAuditCategory(item.category, text)}
                          tone={
                            item.tone === "danger"
                              ? "danger"
                              : item.tone === "warning"
                                ? "warning"
                                : item.tone === "success"
                                  ? "success"
                                  : "neutral"
                          }
                        />
                      </div>

                      <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
                        {item.description}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-outline">
                        {formatRelativeTime(item.createdAt, locale)}
                      </p>
                      <p className="mt-2 text-xs text-on-surface-variant">
                        {item.actor}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-6">
              <EmptyStateCard
                compact
                title={text.noAuditActivity}
                description={text.noAuditDescription}
              />
            </div>
          )}
        </SurfaceCard>
      </div>
    </AppShell>
  );
}

function formatAuditCategory(
  value: (typeof FILTERS)[number] | AuditLogsResponse["items"][number]["category"],
  text: (typeof AUDIT_COPY)["en"]
) {
  if (value === "Inventory") {
    return text.inventory;
  }

  if (value === "Sales") {
    return text.sales;
  }

  if (value === "Access") {
    return text.access;
  }

  if (value === "Users") {
    return text.users;
  }

  if (value === "Catalog") {
    return text.catalog;
  }

  return text.all;
}

const AUDIT_COPY = {
  en: {
    loadingAuditFeed: "Loading audit feed…",
    auditEvents: "Audit Events",
    latestEvents: "Latest branch and system events",
    stockAdjustments: "Stock Adjustments",
    manualCorrections: "Manual inventory corrections",
    suspectedLoss: "Suspected Loss",
    lossIncidents: "Loss or theft-suspected incidents",
    failedLogins: "Failed Logins",
    rejectedSignIns: "Rejected sign-in attempts",
    auditLog: "Audit Log",
    auditDescription:
      "Review access, inventory, sales, and staff events with branch-level accountability.",
    all: "All",
    inventory: "Inventory",
    sales: "Sales",
    access: "Access",
    users: "Users",
    catalog: "Catalog",
    noAuditActivity: "No audit activity yet",
    noAuditDescription:
      "As staff sign in, sell stock, and record adjustments, the audit trail will appear here.",
  },
  am: {
    loadingAuditFeed: "የኦዲት ፊድ በመጫን ላይ…",
    auditEvents: "የኦዲት ክስተቶች",
    latestEvents: "የቅርንጫፍ እና የሲስተም የቅርብ ክስተቶች",
    stockAdjustments: "የእቃ ማስተካከያዎች",
    manualCorrections: "በእጅ የተደረጉ የእቃ ማስተካከያዎች",
    suspectedLoss: "የተጠረጠረ ጉድለት",
    lossIncidents: "የጉድለት ወይም የስርቆት ጥርጣሬ ክስተቶች",
    failedLogins: "ያልተሳኩ መግቢያዎች",
    rejectedSignIns: "የተከለከሉ የመግቢያ ሙከራዎች",
    auditLog: "የኦዲት መዝገብ",
    auditDescription:
      "የመዳረሻ፣ የእቃ፣ የሽያጭ እና የሰራተኛ ክስተቶችን ከቅርንጫፍ ደረጃ ተጠያቂነት ጋር ይገምግሙ።",
    all: "ሁሉም",
    inventory: "እቃ",
    sales: "ሽያጭ",
    access: "መዳረሻ",
    users: "ተጠቃሚዎች",
    catalog: "ካታሎግ",
    noAuditActivity: "እስካሁን የኦዲት እንቅስቃሴ የለም",
    noAuditDescription:
      "ሰራተኞች ሲገቡ፣ እቃ ሲሸጡ እና ማስተካከያ ሲመዘግቡ የኦዲት መዝገቡ እዚህ ይታያል።",
  },
  om: {
    loadingAuditFeed: "Feediin odiitii fe'amaa jira…",
    auditEvents: "Taateewwan Odiitii",
    latestEvents: "Taateewwan damee fi sirnaa yeroo dhiyoo",
    stockAdjustments: "Sirreeffamoota Kuusaa",
    manualCorrections: "Sirreeffamoota kuusaa harkaatiin taasifaman",
    suspectedLoss: "Badiinsa Shakkame",
    lossIncidents: "Taateewwan badiinsaa yookaan hatamuu shakkame",
    failedLogins: "Seensawwan Kufan",
    rejectedSignIns: "Yaalii seensaa didaman",
    auditLog: "Galmee Odiitii",
    auditDescription:
      "Taateewwan seensaa, kuusaa, gurgurtaa fi hojjettootaa itti gaafatamummaa damee waliin ilaali.",
    all: "Hunda",
    inventory: "Kuusaa",
    sales: "Gurgurtaa",
    access: "Seensa",
    users: "Fayyadamtoota",
    catalog: "Kaataalogii",
    noAuditActivity: "Ammaaf hojii odiitii hin jiru",
    noAuditDescription:
      "Yeroo hojjettoonni seenan, kuusaa gurguran, fi sirreeffama galmeessan galmeen odiitii asitti mul'ata.",
  },
} as const;
