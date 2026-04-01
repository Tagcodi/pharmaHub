import type { Locale } from "./messages";

export function getIntlLocale(locale: Locale) {
  if (locale === "am") {
    return "am-ET";
  }

  if (locale === "om") {
    return "om-ET";
  }

  return "en-US";
}

export function formatNumber(value: number, locale: Locale) {
  return value.toLocaleString(getIntlLocale(locale));
}

export function formatCurrency(value: number, locale: Locale) {
  return value.toLocaleString(getIntlLocale(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatCompactNumber(value: number, locale: Locale) {
  if (value === 0) {
    return "0";
  }

  return new Intl.NumberFormat(getIntlLocale(locale), {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatDate(
  value: string | Date,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  }
) {
  return new Intl.DateTimeFormat(getIntlLocale(locale), options).format(
    typeof value === "string" ? new Date(value) : value
  );
}

export function formatDateLong(value: string | Date, locale: Locale) {
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatDateTime(value: string | Date, locale: Locale) {
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatRelativeTime(value: string | Date, locale: Locale) {
  const target = typeof value === "string" ? new Date(value) : value;
  const diffMs = target.getTime() - Date.now();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const formatter = new Intl.RelativeTimeFormat(getIntlLocale(locale), {
    numeric: "auto",
  });

  if (Math.abs(diffMs) < minute) {
    return formatter.format(0, "minute");
  }

  if (Math.abs(diffMs) < hour) {
    return formatter.format(Math.round(diffMs / minute), "minute");
  }

  if (Math.abs(diffMs) < day) {
    return formatter.format(Math.round(diffMs / hour), "hour");
  }

  return formatter.format(Math.round(diffMs / day), "day");
}
