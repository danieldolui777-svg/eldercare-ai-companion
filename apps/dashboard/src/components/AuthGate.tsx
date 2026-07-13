"use client";
import { useEffect, useState } from "react";
import { getToken, clearToken, login } from "@/lib/api";

/**
 * Gates the whole dashboard behind a caregiver login. Shows the login form when
 * there is no valid session; renders the app once authenticated. A 401 from any
 * API call clears the token and brings the form back (via the "auth-changed" event).
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null); // null = still checking

  useEffect(() => {
    const sync = () => setAuthed(!!getToken());
    sync();
    window.addEventListener("auth-changed", sync);
    return () => window.removeEventListener("auth-changed", sync);
  }, []);

  if (authed === null) {
    return <div className="p-8 text-gray-400 text-sm">Chargement…</div>;
  }
  if (!authed) return <LoginForm />;
  return <>{children}</>;
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email.trim(), password);
      // login() stores the token and fires "auth-changed" → AuthGate re-renders.
    } catch (err: any) {
      setError(err?.message ?? "Connexion impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form
        onSubmit={submit}
        className="bg-white border border-gray-200 rounded-xl shadow-sm p-8 w-full max-w-sm flex flex-col gap-4"
      >
        <div>
          <h1 className="text-xl font-bold text-gray-900">Eldercare</h1>
          <p className="text-sm text-gray-500 mt-1">Espace soignant — connexion</p>
        </div>
        <label className="text-sm font-medium text-gray-700">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          Mot de passe
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-2 rounded-lg bg-blue-600 text-white text-sm font-medium py-2.5 hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Connexion…" : "Se connecter"}
        </button>
      </form>
    </div>
  );
}

/** Logs out and returns to the login form. */
export function logout() {
  clearToken();
}
