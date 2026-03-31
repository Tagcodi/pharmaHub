"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  fetchJson,
  formatError,
  TOKEN_KEY,
  type SessionResponse,
} from "../lib/api";

type MedicineRecord = {
  id: string;
  name: string;
  genericName: string | null;
  brandName: string | null;
  sku: string | null;
  form: string | null;
  strength: string | null;
  category: string | null;
  unit: string | null;
  isActive: boolean;
  createdAt: string;
};

const initialForm = {
  name: "",
  genericName: "",
  brandName: "",
  sku: "",
  form: "",
  strength: "",
  category: "",
  unit: "",
};

export default function MedicinesPage() {
  const router = useRouter();
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [medicines, setMedicines] = useState<MedicineRecord[]>([]);
  const [form, setForm] = useState(initialForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
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

      if (sessionData.user.role === "CASHIER") {
        router.replace("/dashboard");
        return;
      }

      const medicinesData = await fetchJson<MedicineRecord[]>("/medicines", {
        headers: { Authorization: `Bearer ${token}` },
      });

      setSession(sessionData);
      setMedicines(medicinesData);
    } catch (err) {
      window.localStorage.removeItem(TOKEN_KEY);
      setError(formatError(err));
      router.replace("/login");
    } finally {
      setIsLoading(false);
    }
  }

  async function reloadMedicines() {
    const token = window.localStorage.getItem(TOKEN_KEY);

    if (!token) {
      router.replace("/login");
      return;
    }

    const medicinesData = await fetchJson<MedicineRecord[]>("/medicines", {
      headers: { Authorization: `Bearer ${token}` },
    });

    setMedicines(medicinesData);
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
      await fetchJson("/medicines", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });

      setForm(initialForm);
      setSuccessMsg("Medicine added to the catalog.");
      await reloadMedicines();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setIsSubmitting(false);
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
            aria-label="Loading medicines"
          />
          <p className="text-on-surface-variant text-sm font-medium">
            Loading medicine catalog…
          </p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const initials = session.user.fullName
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  const activeCount = medicines.filter((medicine) => medicine.isActive).length;
  const categoryCount = new Set(
    medicines
      .map((medicine) => medicine.category)
      .filter((category): category is string => Boolean(category))
  ).size;
  const skuCount = medicines.filter((medicine) => Boolean(medicine.sku)).length;

  return (
    <div className="min-h-screen bg-surface-low flex flex-col">
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-8 h-16"
        style={{
          background: "rgba(247,249,251,0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 1px 0 rgba(0,66,83,0.06)",
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-8 h-8 rounded-[4px] flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
          >
            <span className="text-white text-xs font-black">P</span>
          </div>
          <div>
            <span className="text-on-surface font-bold text-sm">
              {session.pharmacy.name}
            </span>
            <span className="ml-2 text-outline text-xs">
              /{session.pharmacy.slug}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-on-surface-variant text-sm font-semibold hover:text-on-surface transition-colors"
          >
            Back to dashboard
          </Link>
          <button
            onClick={signOut}
            title="Sign out"
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold cursor-pointer"
            style={{ background: "linear-gradient(135deg, #004253, #005b71)" }}
          >
            {initials}
          </button>
        </div>
      </header>

      <main className="flex-1 px-6 md:px-10 py-10 max-w-7xl mx-auto w-full">
        <div className="mb-10">
          <p className="text-[0.75rem] font-bold tracking-[0.08em] uppercase text-outline mb-2">
            Inventory Foundation
          </p>
          <h1 className="text-[2.75rem] font-bold text-on-surface tracking-[-0.04em] leading-none">
            Build your medicine catalog.
          </h1>
          <p className="mt-2 text-on-surface-variant text-base">
            Add medicines before stock batches, sales, and expiry tracking.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Catalog Size" value={String(medicines.length)} note="Registered medicines" />
          <StatCard label="Active" value={String(activeCount)} note="Sellable entries" />
          <StatCard label="Categories" value={String(categoryCount)} note="Named groups" />
          <StatCard label="With SKU" value={String(skuCount)} note="Trackable stock codes" />
        </div>

        <div className="grid lg:grid-cols-[1fr_380px] gap-6">
          <section
            className="rounded-lg bg-surface-lowest p-8"
            style={{ boxShadow: "0 12px 40px rgba(0,66,83,0.08)" }}
          >
            <div className="flex items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-[1.1rem] font-bold text-on-surface">
                  Medicine catalog
                </h2>
                <p className="text-on-surface-variant text-sm mt-1">
                  This list becomes the source for stock batches and sales.
                </p>
              </div>
              <div className="px-3 py-1.5 rounded-full bg-surface-low text-outline text-xs font-bold tracking-widest uppercase">
                Owner + Pharmacist
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

            <div className="overflow-hidden rounded-lg border border-transparent">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-surface-low text-outline text-[0.7rem] uppercase tracking-[0.08em]">
                    <th className="px-4 py-3 font-bold">Medicine</th>
                    <th className="px-4 py-3 font-bold">Strength / form</th>
                    <th className="px-4 py-3 font-bold">Category</th>
                    <th className="px-4 py-3 font-bold">SKU</th>
                    <th className="px-4 py-3 font-bold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {medicines.map((medicine, index) => (
                    <tr
                      key={medicine.id}
                      className={index % 2 === 0 ? "bg-surface-lowest" : "bg-surface"}
                    >
                      <td className="px-4 py-4 align-top">
                        <p className="text-on-surface font-semibold">{medicine.name}</p>
                        <p className="text-on-surface-variant text-sm mt-1">
                          {medicine.genericName ?? medicine.brandName ?? "No secondary name"}
                        </p>
                      </td>
                      <td className="px-4 py-4 align-top text-on-surface-variant text-sm">
                        <p>{medicine.strength ?? "—"}</p>
                        <p className="mt-1">{medicine.form ?? "—"}</p>
                      </td>
                      <td className="px-4 py-4 align-top text-on-surface-variant text-sm">
                        {medicine.category ?? "Uncategorized"}
                      </td>
                      <td className="px-4 py-4 align-top text-on-surface-variant text-sm">
                        {medicine.sku ?? "—"}
                      </td>
                      <td className="px-4 py-4 align-top">
                        <StatusChip isActive={medicine.isActive} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section
            className="rounded-lg bg-surface-lowest p-6"
            style={{ boxShadow: "0 4px 16px rgba(0,66,83,0.06)" }}
          >
            <h3 className="text-[1rem] font-bold text-on-surface">
              Add medicine
            </h3>
            <p className="text-on-surface-variant text-sm mt-1 mb-6">
              Start with the core identifiers you need for stock-in and counter search.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <FormField
                id="name"
                label="Display name"
                placeholder="Paracetamol"
                required
                value={form.name}
                onChange={field("name")}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  id="genericName"
                  label="Generic name"
                  placeholder="Acetaminophen"
                  value={form.genericName}
                  onChange={field("genericName")}
                />
                <FormField
                  id="brandName"
                  label="Brand name"
                  placeholder="Panadol"
                  value={form.brandName}
                  onChange={field("brandName")}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  id="strength"
                  label="Strength"
                  placeholder="500 mg"
                  value={form.strength}
                  onChange={field("strength")}
                />
                <FormField
                  id="form"
                  label="Form"
                  placeholder="Tablet"
                  value={form.form}
                  onChange={field("form")}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  id="category"
                  label="Category"
                  placeholder="Pain relief"
                  value={form.category}
                  onChange={field("category")}
                />
                <FormField
                  id="unit"
                  label="Unit"
                  placeholder="Tablet"
                  value={form.unit}
                  onChange={field("unit")}
                />
              </div>

              <FormField
                id="sku"
                label="SKU"
                placeholder="MED-001"
                value={form.sku}
                onChange={field("sku")}
              />

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
                {isSubmitting ? "Adding medicine…" : "Add Medicine"}
              </button>
            </form>
          </section>
        </div>
      </main>
    </div>
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
  value,
  onChange,
}: {
  id: string;
  label: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
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
        value={value}
        onChange={onChange}
        className="h-11 px-4 rounded-lg bg-surface-lowest text-on-surface text-sm placeholder:text-outline/60 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow"
        style={{ boxShadow: "0 1px 4px rgba(0,66,83,0.06)" }}
      />
    </div>
  );
}
