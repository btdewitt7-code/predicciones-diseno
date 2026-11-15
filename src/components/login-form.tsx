"use client";

import { useState } from "react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "No se pudo entrar");
        setLoading(false);
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Error de conexión");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-[11px] uppercase tracking-wide text-mist-500">Correo</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-white placeholder:text-mist-500 focus:border-mint-500/50 focus:outline-none"
          placeholder="tu@correo.com"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-[11px] uppercase tracking-wide text-mist-500">Contraseña</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-white placeholder:text-mist-500 focus:border-mint-500/50 focus:outline-none"
          placeholder="••••••"
        />
      </label>

      {error ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-400">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg border border-mint-500/40 bg-mint-500/15 px-3 py-2 text-sm font-semibold text-mint-400 transition hover:bg-mint-500/25 disabled:opacity-60"
      >
        {loading ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
