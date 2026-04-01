export type AppLocale = "en" | "am" | "om";

export function resolveLocale(value?: string | string[]) {
  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = raw?.toLowerCase().trim() ?? "en";

  if (normalized.startsWith("am")) {
    return "am" as const;
  }

  if (normalized.startsWith("om")) {
    return "om" as const;
  }

  return "en" as const;
}

export function getIntlLocale(locale: AppLocale) {
  if (locale === "am") {
    return "am-ET";
  }

  if (locale === "om") {
    return "om-ET";
  }

  return "en-US";
}
