"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type SetupStatus = {
  isBootstrapped: boolean;
};

type SessionResponse = {
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

type AuthMode = "bootstrap" | "login";

const tokenStorageKey = "pharmahub.accessToken";

const initialBootstrapForm = {
  pharmacyName: "",
  pharmacySlug: "",
  branchName: "Main Branch",
  branchAddress: "",
  ownerFullName: "",
  ownerEmail: "",
  ownerPassword: ""
};

const initialLoginForm = {
  pharmacySlug: "",
  email: "",
  password: ""
};

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

export default function HomePage() {
  const apiBaseUrl = useMemo(
    () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000",
    []
  );

  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [mode, setMode] = useState<AuthMode>("bootstrap");
  const [bootstrapForm, setBootstrapForm] = useState(initialBootstrapForm);
  const [loginForm, setLoginForm] = useState(initialLoginForm);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void initializePage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function initializePage() {
    setIsLoading(true);
    setError(null);

    try {
      const status = await getSetupStatus();
      setSetupStatus(status);
      setMode(status.isBootstrapped ? "login" : "bootstrap");

      const storedToken = window.localStorage.getItem(tokenStorageKey);
      if (!storedToken) {
        setSession(null);
        return;
      }

      const currentSession = await fetchJson<SessionResponse>("/auth/me", {
        headers: {
          Authorization: `Bearer ${storedToken}`
        }
      });

      setSession(currentSession);
    } catch (caughtError) {
      setError(formatErrorMessage(caughtError));
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function getSetupStatus() {
    return fetchJson<SetupStatus>("/auth/setup-status");
  }

  async function fetchJson<T>(path: string, init?: RequestInit) {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {})
      }
    });

    const raw = (await response.json().catch(() => null)) as
      | { message?: string | string[] }
      | null;

    if (!response.ok) {
      const messageFromApi = Array.isArray(raw?.message) ? raw?.message.join(", ") : raw?.message;
      throw new Error(messageFromApi ?? "Request failed.");
    }

    return raw as T;
  }

  async function handleBootstrap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const result = await fetchJson<SessionResponse & { accessToken: string }>("/auth/bootstrap", {
        method: "POST",
        body: JSON.stringify(bootstrapForm)
      });

      window.localStorage.setItem(tokenStorageKey, result.accessToken);
      setSession(result);
      setSetupStatus({ isBootstrapped: true });
      setMode("login");
      setLoginForm({
        pharmacySlug: result.pharmacy.slug,
        email: result.user.email,
        password: ""
      });
      setMessage("Pharmacy bootstrapped successfully. Owner session is active.");
    } catch (caughtError) {
      setError(formatErrorMessage(caughtError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const result = await fetchJson<SessionResponse & { accessToken: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(loginForm)
      });

      window.localStorage.setItem(tokenStorageKey, result.accessToken);
      setSession(result);
      setMessage("Login successful.");
    } catch (caughtError) {
      setError(formatErrorMessage(caughtError));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function refreshSession() {
    const storedToken = window.localStorage.getItem(tokenStorageKey);

    if (!storedToken) {
      setError("No saved session token was found.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const currentSession = await fetchJson<SessionResponse>("/auth/me", {
        headers: {
          Authorization: `Bearer ${storedToken}`
        }
      });

      setSession(currentSession);
      setMessage("Session refreshed successfully.");
    } catch (caughtError) {
      setError(formatErrorMessage(caughtError));
    } finally {
      setIsSubmitting(false);
    }
  }

  function clearSession() {
    window.localStorage.removeItem(tokenStorageKey);
    setSession(null);
    setMessage("Stored session cleared.");
  }

  return (
    <main className="auth-page">
      <section className="auth-hero">
        <div className="eyebrow">PharmaHub Auth Foundation</div>
        <h1>Bootstrap the first pharmacy owner, then sign into the desktop app.</h1>
        <p className="hero-copy">
          This screen is wired to the real Nest API foundation. It supports first-time pharmacy
          setup, JWT login, and session inspection for the PharmaHub MVP.
        </p>
        <div className="status-strip">
          <span className="status-pill">API: {apiBaseUrl}</span>
          <span className="status-pill">
            Setup: {setupStatus ? (setupStatus.isBootstrapped ? "Bootstrapped" : "Not bootstrapped") : "Checking"}
          </span>
          <span className="status-pill">Session: {session ? "Active" : "Not signed in"}</span>
        </div>
      </section>

      <section className="auth-grid">
        <div className="panel auth-panel">
          <div className="panel-header">
            <h2>{mode === "bootstrap" ? "Bootstrap Pharmacy" : "Login"}</h2>
            <p>
              {mode === "bootstrap"
                ? "Create the first pharmacy owner and default branch."
                : "Sign into an existing pharmacy workspace."}
            </p>
          </div>

          <div className="mode-switch">
            <button
              className={mode === "bootstrap" ? "mode-button is-active" : "mode-button"}
              disabled={!!setupStatus?.isBootstrapped}
              onClick={() => setMode("bootstrap")}
              type="button"
            >
              Bootstrap
            </button>
            <button
              className={mode === "login" ? "mode-button is-active" : "mode-button"}
              onClick={() => setMode("login")}
              type="button"
            >
              Login
            </button>
          </div>

          {isLoading ? <p className="muted-copy">Loading setup state...</p> : null}

          {!isLoading && mode === "bootstrap" ? (
            <form className="auth-form" onSubmit={handleBootstrap}>
              <label>
                <span>Pharmacy name</span>
                <input
                  onChange={(event) =>
                    setBootstrapForm((current) => ({
                      ...current,
                      pharmacyName: event.target.value
                    }))
                  }
                  placeholder="PharmaHub Addis"
                  required
                  value={bootstrapForm.pharmacyName}
                />
              </label>

              <label>
                <span>Pharmacy slug</span>
                <input
                  onChange={(event) =>
                    setBootstrapForm((current) => ({
                      ...current,
                      pharmacySlug: event.target.value
                    }))
                  }
                  placeholder="pharmahub-addis"
                  value={bootstrapForm.pharmacySlug}
                />
              </label>

              <div className="form-row">
                <label>
                  <span>Branch name</span>
                  <input
                    onChange={(event) =>
                      setBootstrapForm((current) => ({
                        ...current,
                        branchName: event.target.value
                      }))
                    }
                    placeholder="Main Branch"
                    value={bootstrapForm.branchName}
                  />
                </label>

                <label>
                  <span>Branch address</span>
                  <input
                    onChange={(event) =>
                      setBootstrapForm((current) => ({
                        ...current,
                        branchAddress: event.target.value
                      }))
                    }
                    placeholder="Addis Ababa"
                    value={bootstrapForm.branchAddress}
                  />
                </label>
              </div>

              <div className="form-row">
                <label>
                  <span>Owner full name</span>
                  <input
                    onChange={(event) =>
                      setBootstrapForm((current) => ({
                        ...current,
                        ownerFullName: event.target.value
                      }))
                    }
                    placeholder="Abel Tadesse"
                    required
                    value={bootstrapForm.ownerFullName}
                  />
                </label>

                <label>
                  <span>Owner email</span>
                  <input
                    onChange={(event) =>
                      setBootstrapForm((current) => ({
                        ...current,
                        ownerEmail: event.target.value
                      }))
                    }
                    placeholder="owner@pharmahub.et"
                    required
                    type="email"
                    value={bootstrapForm.ownerEmail}
                  />
                </label>
              </div>

              <label>
                <span>Owner password</span>
                <input
                  minLength={8}
                  onChange={(event) =>
                    setBootstrapForm((current) => ({
                      ...current,
                      ownerPassword: event.target.value
                    }))
                  }
                  placeholder="At least 8 characters"
                  required
                  type="password"
                  value={bootstrapForm.ownerPassword}
                />
              </label>

              <button className="primary-button" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Creating..." : "Create Pharmacy Owner"}
              </button>
            </form>
          ) : null}

          {!isLoading && mode === "login" ? (
            <form className="auth-form" onSubmit={handleLogin}>
              <label>
                <span>Pharmacy slug</span>
                <input
                  onChange={(event) =>
                    setLoginForm((current) => ({
                      ...current,
                      pharmacySlug: event.target.value
                    }))
                  }
                  placeholder="pharmahub-addis"
                  required
                  value={loginForm.pharmacySlug}
                />
              </label>

              <label>
                <span>Email</span>
                <input
                  onChange={(event) =>
                    setLoginForm((current) => ({
                      ...current,
                      email: event.target.value
                    }))
                  }
                  placeholder="owner@pharmahub.et"
                  required
                  type="email"
                  value={loginForm.email}
                />
              </label>

              <label>
                <span>Password</span>
                <input
                  minLength={8}
                  onChange={(event) =>
                    setLoginForm((current) => ({
                      ...current,
                      password: event.target.value
                    }))
                  }
                  placeholder="Your password"
                  required
                  type="password"
                  value={loginForm.password}
                />
              </label>

              <button className="primary-button" disabled={isSubmitting} type="submit">
                {isSubmitting ? "Signing in..." : "Sign In"}
              </button>
            </form>
          ) : null}

          {message ? <p className="feedback success">{message}</p> : null}
          {error ? <p className="feedback error">{error}</p> : null}
        </div>

        <div className="panel info-panel">
          <div className="panel-header">
            <h2>Current Session</h2>
            <p>Use this panel to confirm the JWT session and tenant context returned by the API.</p>
          </div>

          {session ? (
            <>
              <div className="session-card">
                <div className="session-group">
                  <span className="session-label">User</span>
                  <strong>{session.user.fullName}</strong>
                  <span>{session.user.email}</span>
                  <span>Role: {session.user.role}</span>
                </div>

                <div className="session-group">
                  <span className="session-label">Pharmacy</span>
                  <strong>{session.pharmacy.name}</strong>
                  <span>Slug: {session.pharmacy.slug}</span>
                </div>

                <div className="session-group">
                  <span className="session-label">Branch</span>
                  <strong>{session.branch?.name ?? "No branch"}</strong>
                  <span>{session.branch ? `Code: ${session.branch.code}` : "Not assigned"}</span>
                </div>

                <div className="session-actions">
                  <button className="secondary-button" onClick={() => void refreshSession()} type="button">
                    Refresh Session
                  </button>
                  <button className="ghost-button" onClick={clearSession} type="button">
                    Clear Local Session
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <p>No authenticated session yet.</p>
              <p>
                Bootstrap the first owner or sign in with an existing pharmacy slug, email, and
                password.
              </p>
            </div>
          )}

          <div className="notes-card">
            <h3>What this auth foundation includes</h3>
            <ul>
              <li>First-time pharmacy bootstrap with a default `MAIN` branch</li>
              <li>JWT login using `pharmacySlug + email + password`</li>
              <li>Protected session endpoint for the current user</li>
              <li>Owner-only user management groundwork in the API</li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
