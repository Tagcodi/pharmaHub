"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../components/AppShell";
import { AppLoading } from "../components/ui/AppLoading";
import { EmptyStateCard } from "../components/ui/EmptyStateCard";
import { KpiCard } from "../components/ui/KpiCard";
import { StatusBadge } from "../components/ui/StatusBadge";
import { SurfaceCard } from "../components/ui/SurfaceCard";
import { useI18n } from "../i18n/I18nProvider";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
} from "../i18n/format";
import {
  TOKEN_KEY,
  fetchJson,
  formatError,
  getAuthHeaders,
  getStoredToken,
  type AlertsOverviewResponse,
  type SessionResponse,
} from "../lib/api";

export default function AlertsPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const text = ALERTS_COPY[locale] as (typeof ALERTS_COPY)["en"];
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [overview, setOverview] = useState<AlertsOverviewResponse | null>(null);
  const [search, setSearch] = useState("");
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

      const overviewData = await fetchJson<AlertsOverviewResponse>(
        "/alerts/overview",
        {
          headers: getAuthHeaders(token),
        }
      );

      setSession(sessionData);
      setOverview(overviewData);
      setError(null);
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

  const query = search.trim().toLowerCase();
  const lowStockMedicines = useMemo(() => {
    const medicines = overview?.lowStockMedicines ?? [];

    return medicines.filter((item) => {
      if (!query) {
        return true;
      }

      return (
        item.name.toLowerCase().includes(query) ||
        (item.genericName ?? "").toLowerCase().includes(query) ||
        (item.currentBatchNumber ?? "").toLowerCase().includes(query)
      );
    });
  }, [overview?.lowStockMedicines, query]);

  const expiryBatches = useMemo(() => {
    const items = overview?.expiryBatches ?? [];

    return items.filter((item) => {
      if (!query) {
        return true;
      }

      return (
        item.medicineName.toLowerCase().includes(query) ||
        (item.genericName ?? "").toLowerCase().includes(query) ||
        item.batchNumber.toLowerCase().includes(query)
      );
    });
  }, [overview?.expiryBatches, query]);

  const inventorySignals = useMemo(() => {
    const items = overview?.inventorySignals ?? [];

    return items.filter((item) => {
      if (!query) {
        return true;
      }

      return (
        item.medicineName.toLowerCase().includes(query) ||
        item.batchNumber.toLowerCase().includes(query) ||
        item.title.toLowerCase().includes(query)
      );
    });
  }, [overview?.inventorySignals, query]);

  const salesSignals = useMemo(() => {
    const items = overview?.salesSignals ?? [];

    return items.filter((item) => {
      if (!query) {
        return true;
      }

      return (
        item.saleNumber.toLowerCase().includes(query) ||
        (item.reason ?? "").toLowerCase().includes(query) ||
        item.title.toLowerCase().includes(query)
      );
    });
  }, [overview?.salesSignals, query]);

  if (isLoading) {
    return <AppLoading message={text.loadingAlerts} />;
  }

  if (!session) {
    return null;
  }

  const metrics = overview?.metrics ?? {
    totalAlerts: 0,
    criticalAlerts: 0,
    warningAlerts: 0,
    lowStockCount: 0,
    expiringSoonCount: 0,
    expiredCount: 0,
    suspectedLossCount: 0,
    cycleCountShortageCount: 0,
    voidedSaleCount: 0,
  };

  return (
    <AppShell session={session}>
      <div className="mx-auto w-full max-w-[1360px] px-8 py-8">
        <div className="mb-7 flex flex-wrap items-start gap-5">
          <div>
            <h1 className="text-[2rem] font-bold leading-none tracking-[-0.04em] text-on-surface">
              {text.alertCenter}
            </h1>
            <p className="mt-2 max-w-[720px] text-sm text-on-surface-variant">
              {text.alertDescription.replace(
                "{branch}",
                overview?.branch.name ?? text.thisBranch
              )}
            </p>
          </div>

          <div className="relative ml-auto min-w-[280px] flex-1 max-w-[380px]">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline/50"
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
            >
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M10.5 10.5L14 14"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="search"
              placeholder={text.searchPlaceholder}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-11 w-full rounded-lg bg-surface-low pl-9 pr-4 text-sm text-on-surface placeholder:text-outline/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        <div className="mb-7 grid gap-5 xl:grid-cols-5">
          <KpiCard
            label={text.totalAlerts}
            value={String(metrics.totalAlerts)}
            note={`${formatNumber(metrics.warningAlerts, locale)} ${text.warning.toLowerCase()} / ${formatNumber(metrics.criticalAlerts, locale)} ${text.critical.toLowerCase()}`}
          />
          <KpiCard
            label={text.criticalRisk}
            value={String(metrics.criticalAlerts)}
            valueColor="#93000a"
            note={text.immediateReview}
          />
          <KpiCard
            label={text.lowStock}
            value={String(metrics.lowStockCount)}
            valueColor="#93000a"
            note={`${formatNumber(metrics.cycleCountShortageCount, locale)} ${text.recentCountShortages}`}
          />
          <KpiCard
            label={text.expiryPressure}
            value={String(metrics.expiringSoonCount)}
            valueColor="#6e3900"
            note={`${formatNumber(metrics.expiredCount, locale)} ${text.batchesExpired}`}
          />
          <KpiCard
            label={text.reversalSignals}
            value={String(metrics.voidedSaleCount)}
            note={`${formatNumber(metrics.suspectedLossCount, locale)} ${text.suspectedLossEvents}`}
          />
        </div>

        {error ? (
          <div className="mb-6 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
          <SurfaceCard className="overflow-hidden">
            <SectionHeader
              title={text.lowStockMedicines}
              description={text.lowStockDescription}
              actionHref="/medicines"
              actionLabel={text.openInventory}
            />

            {lowStockMedicines.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left">
                  <thead>
                    <tr className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-outline">
                      <th className="px-6 pb-3">Medicine</th>
                      <th className="pb-3">Batch</th>
                      <th className="pb-3 text-right">Units</th>
                      <th className="pb-3 text-right">Value</th>
                      <th className="pb-3">Next Expiry</th>
                      <th className="pb-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStockMedicines.map((item) => (
                      <tr
                        key={item.id}
                        style={{ borderTop: "1px solid rgba(0,66,83,0.06)" }}
                      >
                        <td className="px-6 py-4 pr-4">
                          <p className="text-sm font-semibold text-on-surface">{item.name}</p>
                          <p className="mt-1 text-xs text-on-surface-variant">
                            {[item.genericName, item.form, item.strength]
                              .filter(Boolean)
                              .join(" • ") || text.catalogMedicine}
                          </p>
                        </td>
                        <td className="py-4 pr-4 text-sm text-on-surface-variant">
                          {item.currentBatchNumber ?? text.noActiveBatch}
                        </td>
                        <td className="py-4 pr-4 text-right text-sm font-semibold text-on-surface">
                          {formatNumber(item.totalQuantityOnHand, locale)}
                        </td>
                        <td className="py-4 pr-4 text-right text-sm text-on-surface">
                          ETB {formatCurrency(item.totalStockValue, locale)}
                        </td>
                        <td className="py-4 pr-4 text-sm text-on-surface-variant">
                          {item.nextExpiryDate ? formatDate(item.nextExpiryDate, locale) : text.noStock}
                        </td>
                        <td className="py-4 pr-6">
                          <StatusBadge
                            label={item.status === "CRITICAL" ? text.critical : text.warning}
                            tone={item.status === "CRITICAL" ? "danger" : "warning"}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6">
                <EmptyStateCard
                  compact
                  title={text.noLowStockMedicines}
                  description={text.noLowStockDescription}
                />
              </div>
            )}
          </SurfaceCard>

          <SurfaceCard className="overflow-hidden">
            <SectionHeader
              title={text.expiryQueue}
              description={text.expiryQueueDescription}
              actionHref="/medicines/adjustments"
              actionLabel={text.openAdjustments}
            />

            {expiryBatches.length ? (
              <div className="space-y-3 p-6">
                {expiryBatches.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-outline/10 bg-surface-low p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-on-surface">
                          {item.medicineName}
                        </p>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {text.batchLabel} {item.batchNumber} • {formatNumber(item.quantityOnHand, locale)} {text.units}
                          {item.supplierName ? ` • ${item.supplierName}` : ""}
                        </p>
                      </div>
                      <StatusBadge
                        label={formatExpiryLabel(item.status, item.daysUntilExpiry, text)}
                        tone={
                          item.status === "WARNING"
                            ? "warning"
                            : "danger"
                        }
                      />
                    </div>

                    <div className="mt-4 grid gap-3 text-xs md:grid-cols-3">
                      <InfoPair label={text.expiryDate} value={formatDate(item.expiryDate, locale)} />
                      <InfoPair label={text.received} value={formatDate(item.receivedAt, locale)} />
                      <InfoPair
                        label={text.stockValue}
                        value={`ETB ${formatCurrency(item.quantityOnHand * item.sellingPrice, locale)}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6">
                <EmptyStateCard
                  compact
                  title={text.noExpiryAlerts}
                  description={text.noExpiryDescription}
                />
              </div>
            )}
          </SurfaceCard>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <SurfaceCard className="overflow-hidden">
            <SectionHeader
              title={text.lossSignals}
              description={text.lossSignalsDescription}
              actionHref="/medicines/counts"
              actionLabel={text.runStockCount}
            />

            {inventorySignals.length ? (
              <div className="space-y-3 p-6">
                {inventorySignals.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-outline/10 bg-surface-low p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-on-surface">{item.title}</p>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {item.medicineName} • {text.batchLabel} {item.batchNumber}
                        </p>
                      </div>
                      <StatusBadge
                        label={item.severity === "CRITICAL" ? text.critical : text.warning}
                        tone={item.severity === "CRITICAL" ? "danger" : "warning"}
                      />
                    </div>

                    <p className="mt-3 text-sm text-on-surface-variant">{item.description}</p>
                    <div className="mt-4 flex items-center justify-between gap-3 text-xs text-on-surface-variant">
                      <span>{item.actor}</span>
                      <span>{formatDateTime(item.createdAt, locale)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6">
                <EmptyStateCard
                  compact
                  title={text.noLossSignals}
                  description={text.noLossDescription}
                />
              </div>
            )}
          </SurfaceCard>

          <SurfaceCard className="overflow-hidden">
            <SectionHeader
              title={text.recentSaleReversals}
              description={text.saleReversalDescription}
              actionHref="/sales"
              actionLabel={text.openSales}
            />

            {salesSignals.length ? (
              <div className="space-y-3 p-6">
                {salesSignals.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-outline/10 bg-surface-low p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-on-surface">{item.title}</p>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {item.saleNumber} • {item.actor}
                        </p>
                      </div>
                      <StatusBadge label={text.warning} tone="warning" />
                    </div>

                    <p className="mt-3 text-sm text-on-surface-variant">{item.description}</p>
                    <div className="mt-4 flex items-center justify-between gap-3 text-xs text-on-surface-variant">
                      <span>
                        {item.totalAmount === null
                          ? text.amountUnavailable
                          : `ETB ${formatCurrency(item.totalAmount, locale)}`}
                      </span>
                      <span>{formatDateTime(item.createdAt, locale)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6">
                <EmptyStateCard
                  compact
                  title={text.noSaleReversals}
                  description={text.noSaleReversalDescription}
                />
              </div>
            )}
          </SurfaceCard>
        </div>
      </div>
    </AppShell>
  );
}

function SectionHeader({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 px-6 py-5"
      style={{ borderBottom: "1px solid rgba(0,66,83,0.06)" }}
    >
      <div>
        <h2 className="text-[1rem] font-bold text-on-surface">{title}</h2>
        <p className="mt-1 text-sm text-on-surface-variant">{description}</p>
      </div>

      <Link
        href={actionHref}
        className="ml-auto inline-flex h-10 items-center rounded-lg border border-outline/15 bg-surface-low px-4 text-sm font-bold text-on-surface transition-colors hover:bg-surface"
      >
        {actionLabel}
      </Link>
    </div>
  );
}

function InfoPair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-outline">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-on-surface">{value}</p>
    </div>
  );
}

function formatExpiryLabel(
  status: "EXPIRED" | "CRITICAL" | "WARNING",
  daysUntilExpiry: number,
  text: (typeof ALERTS_COPY)["en"]
) {
  if (status === "EXPIRED") {
    return text.expired;
  }

  if (daysUntilExpiry === 0) {
    return text.expiresToday;
  }

  return text.daysLeft
    .replace("{count}", String(daysUntilExpiry))
    .replace("{suffix}", daysUntilExpiry === 1 ? "" : text.pluralSuffix);
}

const ALERTS_COPY = {
  en: {
    loadingAlerts: "Loading branch alerts…",
    alertCenter: "Alert Center",
    alertDescription:
      "Live exception monitoring for expiry pressure, low stock, suspicious loss, and sale reversals across {branch}.",
    thisBranch: "this branch",
    searchPlaceholder: "Search medicine, batch, or sale…",
    totalAlerts: "Total Alerts",
    warning: "Warning",
    critical: "Critical",
    criticalRisk: "Critical Risk",
    immediateReview: "Immediate review recommended",
    lowStock: "Low Stock",
    recentCountShortages: "recent count shortages",
    expiryPressure: "Expiry Pressure",
    batchesExpired: "batches already expired",
    reversalSignals: "Reversal Signals",
    suspectedLossEvents: "suspected loss events",
    lowStockMedicines: "Low Stock Medicines",
    lowStockDescription: "Batches that need replenishment or closer count supervision.",
    openInventory: "Open Inventory",
    catalogMedicine: "Catalog medicine",
    noActiveBatch: "No active batch",
    noStock: "No stock",
    noLowStockMedicines: "No low-stock medicines",
    noLowStockDescription: "Inventory levels are currently above the branch alert threshold.",
    expiryQueue: "Expiry Queue",
    expiryQueueDescription: "Batches that should be sold through, quarantined, or adjusted soon.",
    openAdjustments: "Open Adjustments",
    batchLabel: "Batch",
    units: "units",
    expiryDate: "Expiry Date",
    received: "Received",
    stockValue: "Stock Value",
    noExpiryAlerts: "No expiry alerts",
    noExpiryDescription: "There are no active batches inside the branch expiry threshold.",
    expired: "Expired",
    expiresToday: "Expires today",
    daysLeft: "{count} day{suffix} left",
    pluralSuffix: "s",
    lossSignals: "Loss And Count Signals",
    lossSignalsDescription: "Stock discrepancies and suspected shrinkage recorded in the last two weeks.",
    runStockCount: "Run Stock Count",
    noLossSignals: "No loss signals",
    noLossDescription: "The branch has no recent suspicious stock or cycle-count shortage alerts.",
    recentSaleReversals: "Recent Sale Reversals",
    saleReversalDescription: "Voided transactions that may need supervisor follow-up.",
    openSales: "Open Sales",
    amountUnavailable: "Amount unavailable",
    noSaleReversals: "No sale reversals",
    noSaleReversalDescription: "Voided sales will appear here for supervisor review.",
  },
  am: {
    loadingAlerts: "የቅርንጫፍ ማንቂያዎች በመጫን ላይ…",
    alertCenter: "ማንቂያ ማዕከል",
    alertDescription:
      "ለ {branch} የማብቂያ ግፊት፣ ዝቅተኛ እቃ፣ አጠራጣሪ ጉድለት እና የሽያጭ መመለሻ ቀጥታ ክትትል።",
    thisBranch: "ይህ ቅርንጫፍ",
    searchPlaceholder: "መድሃኒት፣ ባች ወይም ሽያጭ ይፈልጉ…",
    totalAlerts: "ጠቅላላ ማንቂያዎች",
    warning: "ማስጠንቀቂያ",
    critical: "ከባድ",
    criticalRisk: "ከባድ አደጋ",
    immediateReview: "አስቸኳይ ግምገማ ይመከራል",
    lowStock: "ዝቅተኛ እቃ",
    recentCountShortages: "የቅርብ ቆጠራ ጉድለቶች",
    expiryPressure: "የማብቂያ ግፊት",
    batchesExpired: "አስቀድመው ያለቁ ባቾች",
    reversalSignals: "የመመለሻ ምልክቶች",
    suspectedLossEvents: "የተጠረጠሩ የጉድለት ክስተቶች",
    lowStockMedicines: "ዝቅተኛ እቃ ያላቸው መድሃኒቶች",
    lowStockDescription: "እንደገና ማስገባት ወይም ቅርብ ቆጠራ ክትትል የሚፈልጉ ባቾች።",
    openInventory: "እቃ ክፈት",
    catalogMedicine: "የካታሎግ መድሃኒት",
    noActiveBatch: "ንቁ ባች የለም",
    noStock: "እቃ የለም",
    noLowStockMedicines: "ዝቅተኛ እቃ ያላቸው መድሃኒቶች የሉም",
    noLowStockDescription: "የእቃ ደረጃዎች አሁን ከቅርንጫፉ የማንቂያ ወሰን በላይ ናቸው።",
    expiryQueue: "የማብቂያ ወረፋ",
    expiryQueueDescription: "በቅርቡ መሸጥ፣ ማግለል ወይም ማስተካከል የሚገባቸው ባቾች።",
    openAdjustments: "ማስተካከያዎችን ክፈት",
    batchLabel: "ባች",
    units: "ዩኒቶች",
    expiryDate: "የማብቂያ ቀን",
    received: "የተቀበለ",
    stockValue: "የእቃ ዋጋ",
    noExpiryAlerts: "የማብቂያ ማንቂያዎች የሉም",
    noExpiryDescription: "በቅርንጫፉ የማብቂያ ወሰን ውስጥ ያሉ ንቁ ባቾች የሉም።",
    expired: "አልቋል",
    expiresToday: "ዛሬ ያልቃል",
    daysLeft: "{count} ቀን{suffix} ቀርቷል",
    pluralSuffix: "",
    lossSignals: "የጉድለት እና ቆጠራ ምልክቶች",
    lossSignalsDescription: "ባለፉት ሁለት ሳምንታት ውስጥ የተመዘገቡ የእቃ ልዩነቶች እና የመጥፋት ጥርጣሬዎች።",
    runStockCount: "የእቃ ቆጠራ አሂድ",
    noLossSignals: "የጉድለት ምልክቶች የሉም",
    noLossDescription: "ቅርንጫፉ የቅርብ አጠራጣሪ የእቃ ወይም የቆጠራ ጉድለት ማንቂያ የለውም።",
    recentSaleReversals: "የቅርብ የሽያጭ መመለሻዎች",
    saleReversalDescription: "የአስተዳዳሪ ክትትል ሊፈልጉ የሚችሉ የተሰረዙ ግብይቶች።",
    openSales: "ሽያጭን ክፈት",
    amountUnavailable: "መጠኑ አይገኝም",
    noSaleReversals: "የሽያጭ መመለሻ የለም",
    noSaleReversalDescription: "የተሰረዙ ሽያጮች ለአስተዳዳሪ ግምገማ እዚህ ይታያሉ።",
  },
  om: {
    loadingAlerts: "Akeekkachiisonni damee fe'amaa jiru…",
    alertCenter: "Giddugala Akeekkachiisaa",
    alertDescription:
      "To'annoo kallattii gidirfama xumuramuu, kuusaa gadi aanaa, badiinsa shakkisiisaa fi deebii gurgurtaa {branch} keessatti ilaala.",
    thisBranch: "damee kana",
    searchPlaceholder: "Qoricha, baachii yookaan gurgurtaa barbaadi…",
    totalAlerts: "Akeekkachiisota Waliigalaa",
    warning: "Akeekkachiisa",
    critical: "Cimaa",
    criticalRisk: "Balaa Cimaa",
    immediateReview: "Sakatta'iinsi ariifataa ni gorfama",
    lowStock: "Kuusaa Gadi Aanaa",
    recentCountShortages: "hanqina lakkoofsa yeroo dhiyoo",
    expiryPressure: "Dhiphina Xumuramuu",
    batchesExpired: "baachiileen xumuraman",
    reversalSignals: "Mallattoolee Deebii",
    suspectedLossEvents: "taateewwan badiinsa shakkaman",
    lowStockMedicines: "Qorichoota kuusaan isaanii gadi bu'e",
    lowStockDescription: "Baachiilee guutamuu yookaan lakkoofsa dhiyaataa barbaadan.",
    openInventory: "Kuusaa Bani",
    catalogMedicine: "Qoricha kaataalogii",
    noActiveBatch: "Baachiin hojii irra jiru hin jiru",
    noStock: "Kuusaan hin jiru",
    noLowStockMedicines: "Qorichi kuusaan isaa gadi bu'e hin jiru",
    noLowStockDescription: "Sadarkaan kuusaa amma daangaa akeekkachiisaa damee caala.",
    expiryQueue: "Tarree Xumuramuu",
    expiryQueueDescription: "Baachiilee dhihoo keessatti gurguramuu, adda baafamuu, yookaan sirreeffamuu qaban.",
    openAdjustments: "Sirreeffamoota Bani",
    batchLabel: "Baachii",
    units: "yuunitii",
    expiryDate: "Guyyaa Xumuraa",
    received: "Fudhatame",
    stockValue: "Gatii Kuusaa",
    noExpiryAlerts: "Akeekkachiisni xumuramuu hin jiru",
    noExpiryDescription: "Baachiileen hojii irra jiran daangaa xumuraa damee keessa hin jiran.",
    expired: "Xumurame",
    expiresToday: "Har'a xumura",
    daysLeft: "guyyaa {count} hafe",
    pluralSuffix: "",
    lossSignals: "Mallattoolee Badiinsaa fi Lakkoofsaa",
    lossSignalsDescription: "Wal dhabdee kuusaa fi hanqina shakkamaa torban lama darbani keessatti galmaa'e.",
    runStockCount: "Lakkoofsa Kuusaa Hojjechiisi",
    noLossSignals: "Mallattoon badiinsaa hin jiru",
    noLossDescription: "Dameen kun akeekkachiisa kuusaa shakkisiisaa yookaan hanqina lakkoofsa yeroo dhiyoo hin qabu.",
    recentSaleReversals: "Deebii Gurgurtaa Yeroo Dhihoo",
    saleReversalDescription: "Daldala haqaman hordoffii ol'aanaa barbaadu danda'an.",
    openSales: "Gurgurtaa Bani",
    amountUnavailable: "Maallaqni hin argamu",
    noSaleReversals: "Deebiin gurgurtaa hin jiru",
    noSaleReversalDescription: "Gurgurtaan haqame sakatta'iinsaaf asitti mul'ata.",
  },
} as const;
