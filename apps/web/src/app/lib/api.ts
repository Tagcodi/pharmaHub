export const TOKEN_KEY = "pharmahub.accessToken";

export type SetupStatus = {
  isBootstrapped: boolean;
};

export type SessionResponse = {
  accessToken?: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    role: string;
    isActive: boolean;
    lastLoginAt?: string | null;
  };
  pharmacy: {
    id: string;
    name: string;
    slug: string;
  };
  branch: {
    id: string;
    name: string;
    code: string;
  } | null;
};

export function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
}

export async function fetchJson<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const raw = (await response.json().catch(() => null)) as {
    message?: string | string[];
  } | null;

  if (!response.ok) {
    const msg = Array.isArray(raw?.message)
      ? raw?.message.join(", ")
      : raw?.message;
    throw new Error(msg ?? "Request failed.");
  }

  return raw as T;
}

export function formatError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
