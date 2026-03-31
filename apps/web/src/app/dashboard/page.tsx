"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "../components/AppShell";
import {
  fetchJson,
  formatError,
  TOKEN_KEY,
  type SessionResponse,
} from "../lib/api";

/* ── Mock data (real data when API endpoints are ready) ─────────────── */

const CHART_DATA = [
  { day: "MON", value: 28500 },
  { day: "TUE", value: 34200 },
  { day: "WED", value: 38900 },
  { day: "THU", value: 52000 }, // today
  { day: "FRI", value: 41000 },
  { day: "SAT", value: 35500 },
  { day: "SUN", value: 19000 },
];

const EXPIRY_ITEMS = [
  { name: "Amoxicillin 500mg",       batch: "#B4492-AX",  stock: 124,  expiry: "Oct 12, 2024", status: "CRITICAL"  },
  { name: "Metformin Hydrochloride",  batch: "#B8820-MH",  stock: 85,   expiry: "Nov 05, 2024", status: "WARNING"   },
  { name: "Paracetamol 500mg BP",     batch: "#P1103-BP",  stock: 450,  expiry: "Dec 20, 2024", status: "WARNING"   },
  { name: "Lisinopril 10mg Tabs",     batch: "#L9931-LT",  stock: 32,   expiry: "Jan 14, 2025", status: "NORMAL"    },
  { name: "Atorvastatin 20mg",        batch: "#A5520-AT",  stock: 18,   expiry: "Feb 02, 2025", status: "NORMAL"    },
];

const ACTIVITY_ITEMS = [
  {
    type: "sale",
    title: "Sale Completed",
    desc: "Pharmacist Hana T. processed transaction #44021 for ETB 1,200.00",
    time: "2m ago",
    color: "#004253",
  },
  {
    type: "inventory",
    title: "Inventory Update",
    desc: "Abebe K. adjusted stock levels for 'Amoxicillin' batch #B4492",
    time: "15m ago",
    color: "#6e3900",
  },
  {
    type: "login",
    title: "Staff Login",
    desc: "Shift start for Dawit M. at Main Counter",
    time: "1h ago",
    color: "#40484c",
  },
  {
    type: "void",
    title: "Void Transaction",
    desc: "Manager approval required: Transaction #44002 voided by Hana T.",
    time: "3h ago",
    color: "#93000a",
  },
  {
    type: "sync",
    title: "System Sync",
    desc: "Full database reconciliation completed successfully",
    time: "5h ago",
    color: "#40484c",
  },
];

/* ── Page ───────────────────────────────────────────────────────────── */

export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSession() {
    const token = window.localStorage.getItem(TOKEN_KEY);
    if (!token) { router.replace("/login"); return; }
    try {
      const data = await fetchJson<SessionResponse>("/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSession(data);
    } catch (err) {
      void formatError(err);
      window.localStorage.removeItem(TOKEN_KEY);
      router.replace("/login");
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) return <LoadingScreen />;
  if (!session) return null;

  const maxChart = Math.max(...CHART_DATA.map((d) => d.value));
  const todayIdx = 3; // THU

  return (
    <AppShell session={session}>
      <div className="px-8 py-8 max-w-[1200px] mx-auto w-full">

        {/* ── Top stats ─────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-5 mb-7">
          {/* Total Sales */}
          <TopStatCard
            label="Total Sales Today"
            main="ETB 42,850.00"
            mainSize="2.4rem"
            sub={
              <span className="text-on-secondary-container text-xs font-semibold flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 9V3M3 6l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                +12.4% vs yesterday
              </span>
            }
            icon={
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-outline/40">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" strokeLinecap="round" />
              </svg>
            }
          />

          {/* Critical Alerts */}
          <TopStatCard
            label="Critical Alerts"
            main="08"
            mainColor="#93000a"
            mainSize="2.75rem"
            sub={
              <div className="flex gap-2 flex-wrap">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-error-container text-on-error-container text-[0.65rem] font-bold">
                  5 Low Stock
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed-variant text-[0.65rem] font-bold">
                  3 Near Expiry
                </span>
              </div>
            }
            icon={
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-outline/40">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" strokeLinecap="round" />
                <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
              </svg>
            }
          />

          {/* Pending Sync */}
          <TopStatCard
            label="Pending Local Sync"
            main="142 Items"
            mainSize="2.2rem"
            sub={
              <span className="text-outline text-xs flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                Last sync 4 mins ago
              </span>
            }
            icon={
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-outline/40">
                <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" strokeLinecap="round" />
              </svg>
            }
          />
        </div>

        {/* ── Two column ────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">

          {/* Left column */}
          <div className="space-y-6">

            {/* Sales trend chart */}
            <div
              className="bg-surface-lowest rounded-lg p-7"
              style={{ boxShadow: "0 4px 16px rgba(0,66,83,0.06)" }}
            >
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-[1.1rem] font-bold text-on-surface">Weekly Sales Trend</h2>
                  <p className="text-on-surface-variant text-sm mt-0.5">Revenue performance over the last 7 days</p>
                </div>
                <div className="flex gap-1">
                  {["Weekly", "Monthly"].map((label, i) => (
                    <button
                      key={label}
                      className={[
                        "px-3 py-1.5 rounded text-xs font-semibold transition-colors",
                        i === 0
                          ? "bg-surface-high text-on-surface"
                          : "text-on-surface-variant hover:bg-surface-low",
                      ].join(" ")}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bar chart */}
              <div className="flex items-end gap-3 h-[180px]">
                {CHART_DATA.map((bar, i) => {
                  const pct = (bar.value / maxChart) * 100;
                  const isToday = i === todayIdx;
                  return (
                    <div key={bar.day} className="flex-1 flex flex-col items-center gap-2">
                      <div className="w-full flex flex-col justify-end" style={{ height: "152px" }}>
                        <div
                          className="w-full rounded-t"
                          style={{
                            height: `${pct}%`,
                            background: isToday
                              ? "linear-gradient(180deg, #004253, #005b71)"
                              : "rgba(0,66,83,0.15)",
                            transition: "height 0.3s",
                          }}
                        />
                      </div>
                      <span
                        className={[
                          "text-[0.65rem] font-bold tracking-wider uppercase",
                          isToday ? "text-primary" : "text-outline/60",
                        ].join(" ")}
                      >
                        {bar.day}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* High Risk Expiry */}
            <div
              className="bg-surface-lowest rounded-lg p-7"
              style={{ boxShadow: "0 4px 16px rgba(0,66,83,0.06)" }}
            >
              <div className="mb-5">
                <h2 className="text-[1.1rem] font-bold text-on-surface">High Risk Expiry</h2>
                <p className="text-on-surface-variant text-sm mt-0.5">Top 5 items requiring immediate attention</p>
              </div>

              <table className="w-full text-left">
                <thead>
                  <tr className="text-[0.65rem] font-bold tracking-[0.08em] uppercase text-outline">
                    <th className="pb-3">Medication Name</th>
                    <th className="pb-3">Batch ID</th>
                    <th className="pb-3 text-right">Stock</th>
                    <th className="pb-3 text-right">Expiry</th>
                    <th className="pb-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-high">
                  {EXPIRY_ITEMS.map((item) => (
                    <tr key={item.batch} className="group">
                      <td className="py-3.5 text-on-surface font-semibold text-sm">{item.name}</td>
                      <td className="py-3.5">
                        <code className="text-xs text-on-surface-variant bg-surface-low px-1.5 py-0.5 rounded font-mono">
                          {item.batch}
                        </code>
                      </td>
                      <td className="py-3.5 text-right text-on-surface text-sm font-medium">
                        {item.stock}
                      </td>
                      <td className="py-3.5 text-right text-sm">
                        <span className={item.status === "CRITICAL" ? "text-on-error-container font-semibold" : item.status === "WARNING" ? "text-on-tertiary-fixed-variant font-semibold" : "text-on-surface-variant"}>
                          {item.expiry}
                        </span>
                      </td>
                      <td className="py-3.5 text-right">
                        <ExpiryChip status={item.status as "CRITICAL" | "WARNING" | "NORMAL"} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right column: Recent Activity */}
          <div
            className="bg-surface-lowest rounded-lg p-6 flex flex-col"
            style={{ boxShadow: "0 4px 16px rgba(0,66,83,0.06)" }}
          >
            <div className="mb-5">
              <h2 className="text-[1.05rem] font-bold text-on-surface">Recent Activity</h2>
              <p className="text-on-surface-variant text-xs mt-0.5">Real-time store operations</p>
            </div>

            <div className="flex-1 space-y-4">
              {ACTIVITY_ITEMS.map((item) => (
                <div key={item.title + item.time} className="flex gap-3">
                  <div
                    className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center mt-0.5 text-white text-[0.6rem] font-black"
                    style={{ background: item.color }}
                  >
                    {item.title[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-on-surface text-xs font-semibold">{item.title}</p>
                      <span className="text-outline text-[0.65rem] shrink-0">{item.time}</span>
                    </div>
                    <p className="text-on-surface-variant text-[0.72rem] leading-relaxed mt-0.5">
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4" style={{ borderTop: "1px solid rgba(0,66,83,0.07)" }}>
              <Link
                href="/audit"
                className="w-full flex items-center justify-center h-9 rounded text-on-surface text-xs font-semibold hover:bg-surface-low transition-colors"
                style={{ border: "1px solid rgba(0,66,83,0.12)" }}
              >
                View Full Audit Log
              </Link>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 flex items-center justify-between text-[0.65rem] text-outline/50 tracking-wide uppercase">
          <span>Active Terminal: POS-ETH-01 · Server: ADDIS_PRIMARY_NODE</span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-on-secondary-container" />
            System Secure &amp; Encrypted
          </span>
        </div>
      </div>
    </AppShell>
  );
}

/* ── Sub-components ─────────────────────────────────────────────────── */

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-full border-4 border-surface-high border-t-primary animate-spin-loader" />
        <p className="text-on-surface-variant text-sm font-medium">Loading dashboard…</p>
      </div>
    </div>
  );
}

function TopStatCard({
  label,
  main,
  mainSize = "2.75rem",
  mainColor,
  sub,
  icon,
}: {
  label: string;
  main: string;
  mainSize?: string;
  mainColor?: string;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className="bg-surface-lowest rounded-lg p-6 flex flex-col gap-3"
      style={{ boxShadow: "0 4px 16px rgba(0,66,83,0.06)" }}
    >
      <div className="flex items-start justify-between">
        <p className="text-[0.7rem] font-bold tracking-[0.08em] uppercase text-outline">{label}</p>
        {icon}
      </div>
      <p
        className="font-bold text-on-surface leading-none tracking-[-0.04em]"
        style={{ fontSize: mainSize, color: mainColor }}
      >
        {main}
      </p>
      {sub}
    </div>
  );
}

function ExpiryChip({ status }: { status: "CRITICAL" | "WARNING" | "NORMAL" }) {
  const styles = {
    CRITICAL: "bg-error-container text-on-error-container",
    WARNING:  "bg-tertiary-fixed text-on-tertiary-fixed-variant",
    NORMAL:   "bg-surface-high text-on-surface-variant",
  };
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-full text-[0.65rem] font-bold tracking-wide uppercase ${styles[status]}`}>
      {status}
    </span>
  );
}
