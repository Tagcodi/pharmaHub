import type { Request } from "express";
import type { UserRole } from "@pharmahub/shared";

export interface AuthenticatedUser {
  userId: string;
  pharmacyId: string;
  branchId: string | null;
  role: UserRole;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
