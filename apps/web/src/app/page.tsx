"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "./i18n/I18nProvider";
import {
  fetchJson,
  TOKEN_KEY,
  type SetupStatus,
  type SessionResponse,
} from "./lib/api";

export default function HomePage() {
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    void checkAndRedirect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkAndRedirect() {
    try {
      const status = await fetchJson<SetupStatus>("/auth/setup-status");

      if (!status.isSetupComplete) {
        router.replace("/setup");
        return;
      }

      const token = window.localStorage.getItem(TOKEN_KEY);

      if (!token) {
        router.replace("/login");
        return;
      }

      try {
        await fetchJson<SessionResponse>("/auth/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        router.replace("/dashboard");
      } catch {
        window.localStorage.removeItem(TOKEN_KEY);
        router.replace("/login");
      }
    } catch {
      router.replace("/login");
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-10 h-10 rounded-full border-4 border-surface-high border-t-primary animate-spin-loader"
          role="status"
          aria-label="Loading"
        />
        <p className="text-on-surface-variant text-sm font-medium tracking-wide">
          {t("common.loading.pharmahub")}
        </p>
      </div>
    </div>
  );
}
