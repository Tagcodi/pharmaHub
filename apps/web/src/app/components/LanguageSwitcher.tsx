"use client";

import { useI18n } from "../i18n/I18nProvider";

type LanguageSwitcherProps = {
  compact?: boolean;
  className?: string;
};

export function LanguageSwitcher({
  compact = false,
  className,
}: LanguageSwitcherProps) {
  const { locale, setLocale, t, localeLabels, supportedLocales } = useI18n();

  return (
    <label
      className={[
        "flex items-center gap-2 rounded-lg border border-outline/10 bg-surface-low px-3",
        compact ? "h-9" : "h-11",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <span className="text-[0.7rem] font-bold uppercase tracking-[0.08em] text-outline">
        {t("language.label")}
      </span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as (typeof supportedLocales)[number])}
        className="min-w-[120px] bg-transparent text-sm font-semibold text-on-surface focus:outline-none"
        aria-label={t("language.label")}
      >
        {supportedLocales.map((value) => (
          <option key={value} value={value}>
            {localeLabels[value]}
          </option>
        ))}
      </select>
    </label>
  );
}
