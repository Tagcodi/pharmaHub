function compactToken(value: string, maxLength: number) {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");

  return normalized.slice(0, maxLength);
}

export function normalizeIdentifierInput(value?: string | null) {
  const normalized = value
    ?.trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized ? normalized : null;
}

export function buildSkuBase(input: {
  name: string;
  strength?: string | null;
  form?: string | null;
}) {
  const parts = [
    compactToken(input.name, 6),
    input.strength ? compactToken(input.strength, 6) : "",
    input.form ? compactToken(input.form, 4) : "",
  ].filter(Boolean);

  return parts.join("-") || "MED";
}

export function buildBatchBase(input: {
  medicineName: string;
  receivedAt: Date;
}) {
  const dateKey = [
    input.receivedAt.getFullYear(),
    `${input.receivedAt.getMonth() + 1}`.padStart(2, "0"),
    `${input.receivedAt.getDate()}`.padStart(2, "0"),
  ].join("");

  return `${compactToken(input.medicineName, 4) || "BATCH"}-${dateKey}`;
}

export function appendIdentifierSequence(base: string, sequence: number) {
  return `${base}-${String(sequence).padStart(3, "0")}`;
}
