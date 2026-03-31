export const APP_NAME = "PharmaHub";

export const USER_ROLES = ["OWNER", "PHARMACIST", "CASHIER"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const MOVEMENT_TYPES = [
  "STOCK_IN",
  "SALE",
  "RETURN",
  "DAMAGE",
  "EXPIRED",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT"
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const ADJUSTMENT_REASONS = [
  "DAMAGE",
  "EXPIRED",
  "COUNT_CORRECTION",
  "RETURN_TO_SUPPLIER",
  "LOST",
  "THEFT_SUSPECTED",
  "OTHER"
] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];
