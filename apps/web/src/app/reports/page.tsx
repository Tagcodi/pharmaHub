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
import {
  formatCompactNumber,
  formatCurrency,
  formatDate,
  formatNumber,
} from "../i18n/format";
import {
  TOKEN_KEY,
  fetchJson,
  formatError,
  getApiBase,
  getAuthHeaders,
  getStoredToken,
  type ReportsSummaryResponse,
  type SessionResponse,
} from "../lib/api";

const RANGE_OPTIONS = [7, 30, 90] as const;

export default function ReportsPage() {
  const router = useRouter();
  const { locale } = useI18n();
  const text = REPORTS_COPY[locale] as (typeof REPORTS_COPY)["en"];
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [report, setReport] = useState<ReportsSummaryResponse | null>(null);
  const [rangeDays, setRangeDays] = useState<(typeof RANGE_OPTIONS)[number]>(30);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadPage(30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPage(nextRange: (typeof RANGE_OPTIONS)[number], refresh = false) {
    const token = getStoredToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const sessionData =
        session ??
        (await fetchJson<SessionResponse>("/auth/me", {
          headers: getAuthHeaders(token),
        }));

      if (sessionData.user.role === "CASHIER") {
        router.replace("/dashboard");
        return;
      }

      const reportData = await fetchJson<ReportsSummaryResponse>(
        `/reports/summary?rangeDays=${nextRange}`,
        {
          headers: getAuthHeaders(token),
        }
      );

      setSession(sessionData);
      setReport(reportData);
      setRangeDays(nextRange);
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
      setIsRefreshing(false);
    }
  }

  async function exportReport() {
    const token = getStoredToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    setIsExporting(true);

    try {
      const response = await fetch(
        `${getApiBase()}/reports/export.csv?rangeDays=${rangeDays}`,
        {
          headers: getAuthHeaders(token),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || REPORTS_COPY.en.exportFailed);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `pharmahub-report-${rangeDays}d.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsExporting(false);
    }
  }

  const tallestDailySales = useMemo(() => {
    const values = report?.sales.dailySales.map((item) => item.value) ?? [];
    return Math.max(...values, 0);
  }, [report?.sales.dailySales]);

  if (isLoading) {
    return <AppLoading message={text.loadingReports} />;
  }

  if (!session || !report) {
    return null;
  }

  return (
    <AppShell session={session}>
      <div className="mx-auto w-full max-w-[1320px] px-8 py-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.08em] text-outline">
              {text.ownerReports}
            </p>
            <h1 className="mt-2 text-[2.4rem] font-bold leading-none tracking-[-0.04em] text-on-surface">
              {text.performanceAndControl}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-on-surface-variant">
              {text.reportDescription}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-full bg-surface-low p-1">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => void loadPage(option, true)}
                  disabled={isRefreshing && rangeDays === option}
                  className={[
                    "rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] transition-colors",
                    rangeDays === option
                      ? "bg-primary text-white"
                      : "text-on-surface-variant hover:text-on-surface",
                  ].join(" ")}
                >
                  {text.dayRange.replace("{days}", String(option))}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={exportReport}
              disabled={isExporting}
              className="flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-bold text-white disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M7 2v7m0 0l3-3m-3 3L4 6m-2 5h10"
                  stroke="white"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {isExporting ? text.exporting : text.exportCsv}
            </button>
          </div>
        </div>

        <div className="mb-7 grid gap-5 xl:grid-cols-5">
          <KpiCard
            label={text.sales}
            value={`ETB ${formatCurrency(report.sales.totalSalesAmount, locale)}`}
            note={`${formatNumber(report.sales.completedSalesCount, locale)} ${text.completedTickets}`}
          />
          <KpiCard
            label={text.unitsSold}
            value={formatNumber(report.sales.totalUnitsSold, locale)}
            note={`${text.averageTicket} ETB ${formatCurrency(report.sales.averageTicket, locale)}`}
          />
          <KpiCard
            label={text.inventoryValue}
            value={`ETB ${formatCurrency(report.inventory.totalInventoryValue, locale)}`}
            note={`${formatNumber(report.inventory.totalUnitsOnHand, locale)} ${text.unitsOnHand}`}
          />
          <KpiCard
            label={text.lowStock}
            value={String(report.inventory.lowStockCount)}
            valueColor="#93000a"
            note={`${formatNumber(report.inventory.nearExpiryBatchCount, locale)} ${text.nearExpiryBatches}`}
          />
          <KpiCard
            label={text.suspectedLoss}
            value={String(report.adjustments.suspectedLossCount)}
            valueColor="#93000a"
            note={`${formatNumber(report.adjustments.totalAdjustments, locale)} ${text.totalAdjustments}`}
          />
        </div>

        {error ? (
          <div className="mb-6 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
          <div className="space-y-6">
            <SurfaceCard className="p-7">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[1.1rem] font-bold text-on-surface">{text.salesTrend}</h2>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    {text.salesTrendDescription}
                  </p>
                </div>
                <span className="rounded-full bg-surface-low px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] text-outline">
                  {formatDate(report.range.startDate, locale)} {text.to} {formatDate(report.range.endDate, locale)}
                </span>
              </div>

              <div className="grid h-[220px] grid-cols-[repeat(auto-fit,minmax(26px,1fr))] items-end gap-3">
                {report.sales.dailySales.map((point) => (
                  <div key={point.dayKey} className="flex h-full flex-col items-center justify-end gap-3">
                    <div className="relative flex w-full flex-1 items-end rounded-full bg-surface-low px-1">
                      <div
                        className="w-full rounded-full"
                        style={{
                          minHeight: point.value > 0 ? "10px" : "4px",
                          height: `${
                            tallestDailySales > 0
                              ? Math.max((point.value / tallestDailySales) * 100, 4)
                              : 4
                          }%`,
                          background:
                            point.value > 0
                              ? "linear-gradient(180deg, #59d5ae 0%, #004253 100%)"
                              : "rgba(0,66,83,0.12)",
                        }}
                        title={`ETB ${formatCurrency(point.value, locale)}`}
                      />
                    </div>
                    <div className="text-center">
                        <p className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-outline">
                          {point.label}
                        </p>
                        <p className="mt-1 text-[0.68rem] text-on-surface-variant">
                          {point.value > 0 ? formatCompactNumber(point.value, locale) : "0"}
                        </p>
                      </div>
                  </div>
                ))}
              </div>
            </SurfaceCard>

            <SurfaceCard className="p-7">
              <div className="mb-5">
                <h2 className="text-[1.1rem] font-bold text-on-surface">{text.topMedicines}</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {text.topMedicinesDescription}
                </p>
              </div>

              {report.sales.topMedicines.length ? (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-outline">
                      <th className="pb-3">{text.medicine}</th>
                      <th className="pb-3 text-right">{text.unitsSold}</th>
                      <th className="pb-3 text-right">{text.revenue}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.sales.topMedicines.map((item) => (
                      <tr key={item.medicineId} style={{ borderTop: "1px solid rgba(0,66,83,0.06)" }}>
                        <td className="py-3 pr-3 text-sm font-semibold text-on-surface">
                          {item.name}
                        </td>
                        <td className="py-3 pr-3 text-right text-sm text-on-surface-variant">
                          {item.quantitySold}
                        </td>
                        <td className="py-3 text-right text-sm font-semibold text-on-surface">
                          ETB {formatCurrency(item.revenue, locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyStateCard
                  compact
                  title={text.noMedicinePerformance}
                  description={text.noMedicinePerformanceDescription}
                />
              )}
            </SurfaceCard>

            <SurfaceCard className="p-7">
              <div className="mb-5">
                <h2 className="text-[1.1rem] font-bold text-on-surface">{text.recentSales}</h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {text.recentSalesDescription}
                </p>
              </div>

              {report.sales.recentSales.length ? (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-outline">
                      <th className="pb-3">{text.saleNumber}</th>
                      <th className="pb-3">{text.soldBy}</th>
                      <th className="pb-3 text-right">{text.items}</th>
                      <th className="pb-3">{text.payment}</th>
                      <th className="pb-3 text-right">{text.total}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.sales.recentSales.map((sale) => (
                      <tr key={sale.id} style={{ borderTop: "1px solid rgba(0,66,83,0.06)" }}>
                        <td className="py-3 pr-3 text-sm font-semibold text-on-surface">
                          {sale.saleNumber}
                        </td>
                        <td className="py-3 pr-3 text-sm text-on-surface-variant">
                          {sale.soldBy}
                        </td>
                        <td className="py-3 pr-3 text-right text-sm text-on-surface-variant">
                          {sale.itemCount}
                        </td>
                        <td className="py-3 pr-3">
                          <StatusBadge label={formatPaymentMethod(sale.paymentMethod, text)} tone="neutral" />
                        </td>
                        <td className="py-3 text-right text-sm font-semibold text-on-surface">
                          ETB {formatCurrency(sale.totalAmount, locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <EmptyStateCard
                  compact
                  title={text.noRecentSales}
                  description={text.noRecentSalesDescription}
                />
              )}
            </SurfaceCard>
          </div>

          <div className="space-y-6">
            <SurfaceCard className="p-6">
              <h2 className="text-[1rem] font-bold text-on-surface">{text.paymentMix}</h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                {text.paymentMixDescription}
              </p>

              <div className="mt-5 space-y-4">
                {report.sales.paymentBreakdown.map((item) => (
                  <SummaryRow
                    key={item.method}
                    label={formatPaymentMethod(item.method, text)}
                    value={`${formatNumber(item.count, locale)} ${text.sales.toLowerCase()} • ETB ${formatCurrency(item.amount, locale)}`}
                  />
                ))}
              </div>
            </SurfaceCard>

            <SurfaceCard className="p-6">
              <h2 className="text-[1rem] font-bold text-on-surface">{text.inventoryPressure}</h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                {text.inventoryPressureDescription}
              </p>

              {report.inventory.lowStockMedicines.length ? (
                <div className="mt-5 space-y-4">
                  {report.inventory.lowStockMedicines.map((medicine) => (
                    <div
                      key={medicine.medicineId}
                      className="rounded-xl border border-outline/10 bg-surface-low p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-on-surface">{medicine.name}</p>
                          <p className="mt-1 text-xs text-on-surface-variant">
                            {formatNumber(medicine.quantityOnHand, locale)} {text.unitsOnHand}
                          </p>
                        </div>
                        <StatusBadge
                          label={medicine.isExpiringSoon ? text.lowAndExpiry : text.lowStock}
                          tone={medicine.isExpiringSoon ? "warning" : "danger"}
                        />
                      </div>
                      <p className="mt-3 text-xs text-on-surface-variant">
                        {text.nextExpiry}: {medicine.nextExpiryDate ? formatDate(medicine.nextExpiryDate, locale) : text.notAvailable}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5">
                  <EmptyStateCard
                    compact
                    title={text.noLowStockMedicines}
                    description={text.noLowStockPressureDescription}
                  />
                </div>
              )}
            </SurfaceCard>

            <SurfaceCard className="p-6">
              <h2 className="text-[1rem] font-bold text-on-surface">{text.adjustmentReasons}</h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                {text.adjustmentReasonsDescription}
              </p>

              <div className="mt-5 space-y-4">
                {report.adjustments.reasonBreakdown.length ? (
                  report.adjustments.reasonBreakdown.map((item) => (
                    <SummaryRow
                      key={item.reason}
                      label={formatReason(item.reason, text)}
                      value={`${formatNumber(item.count, locale)} ${text.events.toLowerCase()}`}
                    />
                  ))
                ) : (
                  <EmptyStateCard
                    compact
                    title={text.noAdjustmentsRecorded}
                    description={text.noAdjustmentsRecordedDescription}
                  />
                )}
              </div>
            </SurfaceCard>

            <SurfaceCard className="p-6">
              <h2 className="text-[1rem] font-bold text-on-surface">{text.recentLossEvents}</h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                {text.recentLossDescription}
              </p>

              {report.adjustments.recentLossEvents.length ? (
                <div className="mt-5 space-y-4">
                  {report.adjustments.recentLossEvents.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-outline/10 bg-surface-low p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-on-surface">
                            {item.medicineName}
                          </p>
                          <p className="mt-1 text-xs text-on-surface-variant">
                            {text.batch} {item.batchNumber} • {item.createdBy}
                          </p>
                        </div>
                        <StatusBadge
                          label={`${item.quantityDelta}`}
                          tone="danger"
                        />
                      </div>

                      <p className="mt-3 text-xs leading-relaxed text-on-surface-variant">
                        {formatReason(item.reason, text)}
                        {item.notes ? ` • ${item.notes}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-5">
                  <EmptyStateCard
                    compact
                    title={text.noRecentLossEvents}
                    description={text.noRecentLossEventsDescription}
                  />
                </div>
              )}
            </SurfaceCard>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-on-surface-variant">{label}</span>
      <span className="text-sm font-bold text-on-surface">{value}</span>
    </div>
  );
}

function formatPaymentMethod(value: string, text: (typeof REPORTS_COPY)["en"]) {
  if (value === "MOBILE_MONEY") {
    return text.mobileMoney;
  }

  if (value === "BANK_TRANSFER") {
    return text.bankTransfer;
  }

  if (value === "CARD") {
    return text.card;
  }

  return text.cash;
}

function formatReason(value: string, text: (typeof REPORTS_COPY)["en"]) {
  const key = value.toLowerCase();
  return (
    text.reasonMap[key as keyof typeof text.reasonMap] ??
    value.replaceAll("_", " ").toLowerCase()
  );
}

const REPORTS_COPY = {
  en: {
    loadingReports: "Loading reports…",
    exportFailed: "Failed to export the report.",
    ownerReports: "Owner Reports",
    performanceAndControl: "Performance and control.",
    reportDescription:
      "View live branch performance, track stock loss pressure, and export the current report window for review or handoff.",
    dayRange: "{days}d",
    exporting: "Exporting…",
    exportCsv: "Export CSV",
    sales: "Sales",
    completedTickets: "completed tickets",
    unitsSold: "Units Sold",
    averageTicket: "Average ticket",
    inventoryValue: "Inventory Value",
    unitsOnHand: "units on hand",
    lowStock: "Low Stock",
    nearExpiryBatches: "near-expiry batches",
    suspectedLoss: "Suspected Loss",
    totalAdjustments: "total adjustments",
    salesTrend: "Sales Trend",
    salesTrendDescription: "Daily completed sales across the selected window.",
    to: "to",
    topMedicines: "Top Medicines",
    topMedicinesDescription: "Highest-performing medicines by revenue in this window.",
    medicine: "Medicine",
    revenue: "Revenue",
    noMedicinePerformance: "No medicine performance yet",
    noMedicinePerformanceDescription:
      "Completed sales in the selected range will populate this ranking.",
    recentSales: "Recent Sales",
    recentSalesDescription: "Latest completed sales included in the current report window.",
    saleNumber: "Sale No.",
    soldBy: "Sold By",
    items: "Items",
    payment: "Payment",
    total: "Total",
    noRecentSales: "No recent sales",
    noRecentSalesDescription:
      "The recent sales table will appear once the branch records completed POS transactions.",
    paymentMix: "Payment Mix",
    paymentMixDescription: "Sales distribution by payment method.",
    inventoryPressure: "Inventory Pressure",
    inventoryPressureDescription: "Medicines that need owner attention soonest.",
    lowAndExpiry: "Low + expiry",
    nextExpiry: "Next expiry",
    notAvailable: "N/A",
    noLowStockMedicines: "No low-stock medicines",
    noLowStockPressureDescription:
      "Low-stock pressure will appear here when the branch inventory dips under threshold.",
    adjustmentReasons: "Adjustment Reasons",
    adjustmentReasonsDescription: "Why stock changed outside normal stock-in and sale flows.",
    events: "Events",
    noAdjustmentsRecorded: "No adjustments recorded",
    noAdjustmentsRecordedDescription:
      "Manual stock adjustments in the selected range will appear here.",
    recentLossEvents: "Recent Loss Events",
    recentLossDescription: "Most recent lost or theft-suspected events.",
    batch: "Batch",
    noRecentLossEvents: "No recent loss events",
    noRecentLossEventsDescription:
      "Lost or theft-suspected adjustments in the selected range will appear here.",
    mobileMoney: "Mobile money",
    bankTransfer: "Bank transfer",
    card: "Card",
    cash: "Cash",
    reasonMap: {
      damage: "damage",
      expired: "expired",
      count_correction: "count correction",
      return_to_supplier: "return to supplier",
      lost: "lost",
      theft_suspected: "theft suspected",
      other: "other",
    },
  },
  am: {
    loadingReports: "ሪፖርቶች በመጫን ላይ…",
    exportFailed: "ሪፖርቱን መላክ አልተቻለም።",
    ownerReports: "የባለቤት ሪፖርቶች",
    performanceAndControl: "አፈፃፀም እና ቁጥጥር።",
    reportDescription:
      "የቅርንጫፉን ቀጥታ አፈፃፀም ይመልከቱ፣ የእቃ ጉድለት ግፊትን ይከታተሉ፣ እና አሁን ያለውን የሪፖርት መስኮት ለግምገማ ወይም ለማስተላለፍ ይላኩ።",
    dayRange: "{days}ቀ",
    exporting: "በመላክ ላይ…",
    exportCsv: "CSV ላክ",
    sales: "ሽያጭ",
    completedTickets: "የተጠናቀቁ ቲኬቶች",
    unitsSold: "የተሸጡ ዩኒቶች",
    averageTicket: "አማካይ ቲኬት",
    inventoryValue: "የእቃ ዋጋ",
    unitsOnHand: "በእጅ ያሉ ዩኒቶች",
    lowStock: "ዝቅተኛ እቃ",
    nearExpiryBatches: "የሚቀርቡ የማብቂያ ባቾች",
    suspectedLoss: "የተጠረጠረ ጉድለት",
    totalAdjustments: "ጠቅላላ ማስተካከያዎች",
    salesTrend: "የሽያጭ አቅጣጫ",
    salesTrendDescription: "በተመረጠው መስኮት ውስጥ የዕለታዊ የተጠናቀቁ ሽያጮች።",
    to: "እስከ",
    topMedicines: "ከፍተኛ መድሃኒቶች",
    topMedicinesDescription: "በዚህ መስኮት ውስጥ በገቢ ከፍ ያሉ መድሃኒቶች።",
    medicine: "መድሃኒት",
    revenue: "ገቢ",
    noMedicinePerformance: "የመድሃኒት አፈፃፀም የለም",
    noMedicinePerformanceDescription: "በተመረጠው ክልል የተጠናቀቁ ሽያጮች ይህንን ደረጃ ይሞላሉ።",
    recentSales: "የቅርብ ሽያጮች",
    recentSalesDescription: "በአሁኑ የሪፖርት መስኮት ውስጥ የተካተቱ የቅርብ የተጠናቀቁ ሽያጮች።",
    saleNumber: "የሽያጭ ቁጥር",
    soldBy: "የሸጠው",
    items: "እቃዎች",
    payment: "ክፍያ",
    total: "ጠቅላላ",
    noRecentSales: "የቅርብ ሽያጮች የሉም",
    noRecentSalesDescription: "ቅርንጫፉ የተጠናቀቁ POS ግብይቶችን ሲመዘግብ የቅርብ ሽያጭ ሰንጠረዥ ይታያል።",
    paymentMix: "የክፍያ ቅልቅል",
    paymentMixDescription: "በክፍያ ዘዴ የተከፋፈለ ሽያጭ።",
    inventoryPressure: "የእቃ ግፊት",
    inventoryPressureDescription: "የባለቤት ትኩረት በቅርቡ የሚፈልጉ መድሃኒቶች።",
    lowAndExpiry: "ዝቅተኛ + ማብቂያ",
    nextExpiry: "ቀጣይ ማብቂያ",
    notAvailable: "የለም",
    noLowStockMedicines: "ዝቅተኛ እቃ ያላቸው መድሃኒቶች የሉም",
    noLowStockPressureDescription: "የቅርንጫፉ እቃ ከወሰኑ በታች ሲወርድ የዝቅተኛ እቃ ግፊት እዚህ ይታያል።",
    adjustmentReasons: "የማስተካከያ ምክንያቶች",
    adjustmentReasonsDescription: "እቃ ከመደበኛ የመግቢያ እና የሽያጭ ፍሰቶች ውጭ ለምን ተለወጠ።",
    events: "ክስተቶች",
    noAdjustmentsRecorded: "ማስተካከያ አልተመዘገበም",
    noAdjustmentsRecordedDescription: "በተመረጠው ክልል ውስጥ በእጅ የተደረጉ የእቃ ማስተካከያዎች እዚህ ይታያሉ።",
    recentLossEvents: "የቅርብ የጉድለት ክስተቶች",
    recentLossDescription: "በቅርቡ የተመዘገቡ የጠፉ ወይም የስርቆት ጥርጣሬ ክስተቶች።",
    batch: "ባች",
    noRecentLossEvents: "የቅርብ የጉድለት ክስተቶች የሉም",
    noRecentLossEventsDescription: "በተመረጠው ክልል የጠፉ ወይም የስርቆት ጥርጣሬ ማስተካከያዎች እዚህ ይታያሉ።",
    mobileMoney: "ሞባይል ገንዘብ",
    bankTransfer: "የባንክ ዝውውር",
    card: "ካርድ",
    cash: "ጥሬ ገንዘብ",
    reasonMap: {
      damage: "ጉዳት",
      expired: "ያለቀ",
      count_correction: "የቆጠራ ማስተካከያ",
      return_to_supplier: "ወደ አቅራቢ መመለስ",
      lost: "የጠፋ",
      theft_suspected: "ስርቆት ተጠርጥሯል",
      other: "ሌላ",
    },
  },
  om: {
    loadingReports: "Ripoortiin fe'amaa jira…",
    exportFailed: "Ripoortii erguun hin danda'amne.",
    ownerReports: "Ripoortota Abbaa Qabeenyaa",
    performanceAndControl: "Raawwii fi to'annoo.",
    reportDescription:
      "Raawwii damee kallattii ilaali, dhiibbaa badiinsa kuusaa hordofi, fi foddaa ripoortii amma jiru sakatta'iinsaaf yookaan dabarsaaf al-ergi.",
    dayRange: "{days}g",
    exporting: "Ergamaa jira…",
    exportCsv: "CSV Ergi",
    sales: "Gurgurtaa",
    completedTickets: "tikettii xumuraman",
    unitsSold: "Yuunitii Gurguraman",
    averageTicket: "Tikettii giddugaleessaa",
    inventoryValue: "Gatii Kuusaa",
    unitsOnHand: "yuunitii harkatti jiran",
    lowStock: "Kuusaa Gadi Aanaa",
    nearExpiryBatches: "baachiiwwan xumuramuu dhiyaatan",
    suspectedLoss: "Badiinsa Shakkame",
    totalAdjustments: "sirreeffamoota waliigalaa",
    salesTrend: "Tartiiba Gurgurtaa",
    salesTrendDescription: "Gurgurtaa xumurame guyyaa guyyaan foddaa filatame keessatti.",
    to: "hanga",
    topMedicines: "Qorichoota Olaanaa",
    topMedicinesDescription: "Qorichoota galiin isaanii foddaa kana keessatti olaanaa ta'e.",
    medicine: "Qoricha",
    revenue: "Galii",
    noMedicinePerformance: "Raawwiin qorichaa hin jiru",
    noMedicinePerformanceDescription: "Gurgurtaan xumurame daangaa filatame keessatti sadarkaa kana ni guuta.",
    recentSales: "Gurgurtaa Yeroo Dhihoo",
    recentSalesDescription: "Gurgurtaa xumurame yeroo dhiyoo foddaa ripoortii keessatti hammataman.",
    saleNumber: "Lakkoofsa Gurgurtaa",
    soldBy: "Kan gurgure",
    items: "Meeshaalee",
    payment: "Kafaltii",
    total: "Waliigala",
    noRecentSales: "Gurgurtaan yeroo dhiyoo hin jiru",
    noRecentSalesDescription: "Yeroo dameen daldala POS xumurame galmeessu tarreen gurgurtaa yeroo dhiyoo ni mul'ata.",
    paymentMix: "Wal makaa kafaltii",
    paymentMixDescription: "Raabsa gurgurtaa karaa kaffaltii irratti hundaa'e.",
    inventoryPressure: "Dhiibbaa Kuusaa",
    inventoryPressureDescription: "Qorichoota xiyyeeffannoo abbaa qabeenyaa dhihoo barbaadan.",
    lowAndExpiry: "Gadi aanaa + xumuramuu",
    nextExpiry: "Xumuramuu itti aanu",
    notAvailable: "Hin jiru",
    noLowStockMedicines: "Qorichi kuusaan isaa gadi bu'e hin jiru",
    noLowStockPressureDescription: "Yeroo kuusaan damee daangaa gadi bu'u dhiibbaan kuusaa gadi aanaa asitti mul'ata.",
    adjustmentReasons: "Sababoota Sirreeffamaa",
    adjustmentReasonsDescription: "Maaliif kuusaan ala waraabbii stock-in fi gurgurtaa idilee irraa alatti jijjiirame.",
    events: "taateewwan",
    noAdjustmentsRecorded: "Sirreeffamni hin galmoofne",
    noAdjustmentsRecordedDescription: "Sirreeffamoonni kuusaa harkaatiin yeroo filatame keessatti asitti mul'atu.",
    recentLossEvents: "Taateewwan Badiinsaa Yeroo Dhihoo",
    recentLossDescription: "Taateewwan dhabamuu yookaan hatamuu shakkaman yeroo dhiyoo.",
    batch: "Baachii",
    noRecentLossEvents: "Taateewwan badiinsaa yeroo dhiyoo hin jiran",
    noRecentLossEventsDescription: "Sirreeffamoonni dhabamuu yookaan hatamuu shakkaman yeroo filatame keessatti asitti mul'atu.",
    mobileMoney: "Maallaqa moobaayilaa",
    bankTransfer: "Dabarsa baankii",
    card: "Kaardii",
    cash: "Liqii",
    reasonMap: {
      damage: "miidhaa",
      expired: "xumurame",
      count_correction: "sirreeffama lakkoofsaa",
      return_to_supplier: "gara dhiyeessaatti deebisuu",
      lost: "dhabama",
      theft_suspected: "hatamuu shakkame",
      other: "kan biraa",
    },
  },
} as const;
