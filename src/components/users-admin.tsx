"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type AdminUser = {
  id: number;
  email: string;
  name: string | null;
  isAdmin: boolean;
  createdAt: string;
  plays: number;
};

const inputClass =
  "w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-white placeholder:text-mist-500 focus:border-mint-500/50 focus:outline-none";

const labelClass = "block space-y-1";
const labelText = "text-[11px] uppercase tracking-wide text-mist-500";

function today(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function initial(user: AdminUser) {
  const source = user.name?.trim() || user.email;
  return source.slice(0, 1).toUpperCase();
}

export function UsersAdmin({
  users,
  currentUserId,
}: {
  users: AdminUser[];
  currentUserId: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [draft, setDraft] = useState({
    email: "",
    name: "",
    password: "",
    isAdmin: false,
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [edit, setEdit] = useState({
    email: "",
    name: "",
    password: "",
    isAdmin: false,
  });

  const request = async (
    url: string,
    method: "POST" | "PATCH" | "DELETE",
    body?: unknown,
  ): Promise<boolean> => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "No se pudo completar");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Error de conexión");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const created = await request("/api/admin/users", "POST", draft);
    if (created) {
      setDraft({ email: "", name: "", password: "", isAdmin: false });
      setNotice("Usuario creado");
    }
  };

  const startEdit = (user: AdminUser) => {
    setEditingId(user.id);
    setEdit({
      email: user.email,
      name: user.name ?? "",
      password: "",
      isAdmin: user.isAdmin,
    });
    setError(null);
    setNotice(null);
  };

  const saveEdit = async (event: React.FormEvent, user: AdminUser) => {
    event.preventDefault();
    if (busy) return;
    const payload: Record<string, unknown> = {
      email: edit.email,
      name: edit.name,
      isAdmin: edit.isAdmin,
    };
    if (edit.password.length > 0) payload.password = edit.password;

    const saved = await request(`/api/admin/users/${user.id}`, "PATCH", payload);
    if (saved) {
      setEditingId(null);
      setNotice("Usuario actualizado");
    }
  };

  const remove = async (user: AdminUser) => {
    if (busy) return;
    const label = user.name ? `${user.name} (${user.email})` : user.email;
    if (
      !window.confirm(
        `¿Borrar a ${label}?\n\nTambién se borrarán sus ${user.plays} jugadas guardadas. Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }
    const deleted = await request(`/api/admin/users/${user.id}`, "DELETE");
    if (deleted) setNotice("Usuario borrado");
  };

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="card space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-white">Nuevo usuario</h2>
          <span className="text-[11px] text-mist-500">La cuenta queda activa al crearla</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className={labelClass}>
            <span className={labelText}>Correo</span>
            <input
              type="email"
              required
              autoComplete="off"
              value={draft.email}
              onChange={(event) => setDraft({ ...draft, email: event.target.value })}
              className={inputClass}
              placeholder="correo@dominio.com"
            />
          </label>

          <label className={labelClass}>
            <span className={labelText}>Nombre</span>
            <input
              type="text"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              className={inputClass}
              placeholder="Opcional"
            />
          </label>

          <label className={labelClass}>
            <span className={labelText}>Contraseña</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={draft.password}
              onChange={(event) => setDraft({ ...draft, password: event.target.value })}
              className={inputClass}
              placeholder="Mínimo 6 caracteres"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-mist-300">
            <input
              type="checkbox"
              checked={draft.isAdmin}
              onChange={(event) => setDraft({ ...draft, isAdmin: event.target.checked })}
              className="size-4 rounded border-ink-700 bg-ink-850 accent-mint-500"
            />
            Administrador
          </label>

          <button
            type="submit"
            disabled={busy}
            className="rounded-lg border border-mint-500/40 bg-mint-500/15 px-3 py-2 text-xs font-semibold text-mint-300 transition hover:bg-mint-500/25 disabled:opacity-60"
          >
            {busy ? "Guardando…" : "Crear usuario"}
          </button>
        </div>
      </form>

      {error ? (
        <p className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-400">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-win-500/30 bg-win-500/10 px-3 py-2 text-xs text-win-400">
          {notice}
        </p>
      ) : null}

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-ink-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">Cuentas</h2>
          <span className="text-[11px] text-mist-500">
            {users.length} {users.length === 1 ? "usuario" : "usuarios"}
          </span>
        </div>

        <div className="divide-y divide-ink-800">
          {users.map((user) => {
            const isSelf = user.id === currentUserId;
            const isEditing = editingId === user.id;

            return (
              <div key={user.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-mint-500/15 text-xs font-semibold text-mint-300 ring-1 ring-mint-500/30">
                    {initial(user)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-white">
                        {user.name || user.email}
                      </span>
                      {user.isAdmin ? (
                        <span className="rounded-md border border-mint-500/30 bg-mint-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-mint-300">
                          Admin
                        </span>
                      ) : null}
                      {isSelf ? (
                        <span className="rounded-md border border-ink-700 bg-ink-850 px-1.5 py-0.5 text-[10px] text-mist-400">
                          Tú
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-[11px] text-mist-500">
                      {user.email} · {user.plays} jugadas · desde {today(user.createdAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => (isEditing ? setEditingId(null) : startEdit(user))}
                      className="rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-[11px] text-mist-300 transition hover:text-white"
                    >
                      {isEditing ? "Cerrar" : "Editar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(user)}
                      disabled={busy || isSelf}
                      title={isSelf ? "No puedes borrar tu propio usuario" : "Borrar usuario"}
                      className="rounded-lg border border-rose-400/25 bg-rose-400/10 px-2.5 py-1.5 text-[11px] text-rose-400 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Borrar
                    </button>
                  </div>
                </div>

                {isEditing ? (
                  <form
                    onSubmit={(event) => saveEdit(event, user)}
                    className="mt-3 grid gap-3 rounded-xl border border-ink-800 bg-ink-900/60 p-3 sm:grid-cols-4"
                  >
                    <label className={labelClass}>
                      <span className={labelText}>Correo</span>
                      <input
                        type="email"
                        required
                        value={edit.email}
                        onChange={(event) => setEdit({ ...edit, email: event.target.value })}
                        className={inputClass}
                      />
                    </label>

                    <label className={labelClass}>
                      <span className={labelText}>Nombre</span>
                      <input
                        type="text"
                        value={edit.name}
                        onChange={(event) => setEdit({ ...edit, name: event.target.value })}
                        className={inputClass}
                        placeholder="Opcional"
                      />
                    </label>

                    <label className={labelClass}>
                      <span className={labelText}>Nueva contraseña</span>
                      <input
                        type="password"
                        minLength={6}
                        autoComplete="new-password"
                        value={edit.password}
                        onChange={(event) => setEdit({ ...edit, password: event.target.value })}
                        className={inputClass}
                        placeholder="Dejar vacío = no cambiar"
                      />
                    </label>

                    <div className="flex flex-col justify-end gap-2">
                      <label className="flex items-center gap-2 text-xs text-mist-300">
                        <input
                          type="checkbox"
                          checked={edit.isAdmin}
                          onChange={(event) =>
                            setEdit({ ...edit, isAdmin: event.target.checked })
                          }
                          className="size-4 rounded border-ink-700 bg-ink-850 accent-mint-500"
                        />
                        Administrador
                      </label>
                      <button
                        type="submit"
                        disabled={busy}
                        className="rounded-lg border border-mint-500/40 bg-mint-500/15 px-3 py-2 text-xs font-semibold text-mint-300 transition hover:bg-mint-500/25 disabled:opacity-60"
                      >
                        {busy ? "Guardando…" : "Guardar cambios"}
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-mist-500">
        Al borrar una cuenta se eliminan también sus sesiones y sus jugadas guardadas. No puedes
        borrar tu propio usuario y siempre debe quedar al menos un administrador.
      </p>
    </div>
  );
}
